import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";

// ✅ Ensure worker matches your installed pdfjs-dist build
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

export interface ExtractedQuestion {
  number: number;
  text: string;
  marks: number;
  answerText?: string;
  imageBlob?: Blob;
  page: number;
  coordinates: { yStart: number; yEnd: number };
  subQuestions?: { number: string; text: string; marks: number }[];
}

/**
 * WHY PDFs WERE "CHOOSY":
 * - text extraction items are not consistent across PDFs
 * - simple Y-only grouping breaks on multi-column / mixed fonts
 * - numeric fallback matched page numbers / mark allocations
 * - OCR was too heavy and ran too often
 *
 * This version:
 * - groups text into lines using adaptive Y bucket + sorts by X
 * - detects "header-like" lines using left margin + font size + patterns
 * - OCR only when text items are too few OR no headers found
 * - renders page canvas once per page and reuses it
 */

type TextItem = any;

type DetectedHeader = {
  number: number;
  yCanvas: number; // top-down
  xCanvas: number;
  confidence: number;
  source: "TEXT" | "OCR";
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * More robust patterns.
 * - Prefer explicit "Question/Q/Answer/Solution"
 * - Allow "Q.1", "Question 1:", "Question 1.1"
 * - Allow numeric header like "1)" or "1." but only if line is "header-like"
 */
function matchHeaderNumber(lineText: string): { q: number; raw?: string } | null {
  const t = normalizeSpaces(lineText);

  // Explicit headers
  const explicit =
    t.match(/^(?:Question|Q|Answer|Solution)\s*[.:)\-]*\s*(\d+)(?:\.(\d+))?/i) ||
    t.match(/^(?:Question|Q|Answer|Solution)\s+(\d+)/i) ||
    t.match(/^(?:Q)\s*[.]?\s*(\d+)/i);

  if (explicit) {
    const q = parseInt(explicit[1], 10);
    if (Number.isFinite(q)) return { q, raw: explicit[0] };
  }

  // Numeric header: "1)", "1.", "(1)", "1 -"
  const numeric = t.match(/^\(?(\d{1,3})\)?\s*([.)\-:])\s+/);
  if (numeric) {
    const q = parseInt(numeric[1], 10);
    if (Number.isFinite(q)) return { q, raw: numeric[0] };
  }

  return null;
}

function computeFontHeight(item: TextItem): number {
  // transform[3] often correlates with font size/height
  // In some PDFs it can be negative; use abs
  const h = item?.transform?.[3];
  return Math.abs(typeof h === "number" ? h : 0);
}

function computeX(item: TextItem): number {
  const x = item?.transform?.[4];
  return typeof x === "number" ? x : 0;
}

function computeY(item: TextItem): number {
  const y = item?.transform?.[5];
  return typeof y === "number" ? y : 0;
}

function pdfYToCanvasY(pdfY: number, viewport: any) {
  // pdf space is bottom-up. canvas is top-down
  return viewport.height - pdfY * viewport.scale;
}

function pdfXToCanvasX(pdfX: number, viewport: any) {
  return pdfX * viewport.scale;
}

/**
 * Group PDF text items into lines using an adaptive Y bucket.
 * - Uses median font height to decide tolerance.
 * - Sorts items within a line by X.
 */
function groupItemsIntoLines(items: TextItem[]) {
  if (!items?.length) return [];

  const heights = items
    .map(computeFontHeight)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);

  const medianH =
    heights.length === 0 ? 10 : heights[Math.floor(heights.length / 2)];
  const TOL = clamp(medianH * 0.6, 3, 10); // adaptive tolerance

  const lines: { y: number; items: TextItem[] }[] = [];

  for (const it of items) {
    const y = computeY(it);
    let line = lines.find((l) => Math.abs(l.y - y) <= TOL);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push(it);
  }

  // Sort lines top-to-bottom (descending PDF y)
  lines.sort((a, b) => b.y - a.y);

  // Sort items left-to-right and build text
  return lines.map((l) => {
    l.items.sort((a, b) => computeX(a) - computeX(b));
    const text = normalizeSpaces(l.items.map((i) => i.str).join(" "));
    const maxFont = Math.max(...l.items.map(computeFontHeight));
    const minX = Math.min(...l.items.map(computeX));
    return { pdfY: l.y, minX, maxFont, text, items: l.items };
  });
}

/**
 * Decide if a line is "header-like" to reduce false positives:
 * - left-ish (near margin)
 * - larger font than typical
 * - short-ish line OR contains header keywords
 */
function isHeaderLike(
  line: { text: string; minX: number; maxFont: number },
  stats: { medianFont: number; pageWidth: number }
) {
  const t = line.text;
  if (!t) return false;

  const leftThreshold = stats.pageWidth * 0.20; // within first 20% width
  const isLeft = line.minX <= leftThreshold;

  const hasKeyword = /^(Question|Q|Answer|Solution)\b/i.test(t);

  const isBigger = line.maxFont >= stats.medianFont * 1.15; // slightly larger than median
  const isShort = t.length <= 50;

  // Numeric-only headers are risky — require left + bigger + short
  const looksNumeric = /^\(?\d{1,3}\)?\s*([.)\-:])/.test(t);

  if (hasKeyword) return isLeft || isBigger; // keyword is strong
  if (looksNumeric) return isLeft && isBigger && isShort;

  return false;
}

async function renderPageToCanvas(page: any, viewport: any) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  if (!ctx) return null;

  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

async function canvasSliceToBlob(
  canvas: HTMLCanvasElement,
  yStart: number,
  yEnd: number
): Promise<Blob | null> {
  const height = Math.max(0, yEnd - yStart);
  if (height <= 2) return null;

  const sliceCanvas = document.createElement("canvas");
  sliceCanvas.width = canvas.width;
  sliceCanvas.height = height;
  const sliceCtx = sliceCanvas.getContext("2d");
  if (!sliceCtx) return null;

  sliceCtx.drawImage(
    canvas,
    0,
    yStart,
    canvas.width,
    height,
    0,
    0,
    canvas.width,
    height
  );

  return await new Promise<Blob | null>((resolve) =>
    sliceCanvas.toBlob(resolve, "image/jpeg", 0.85)
  );
}

export const parsePdf = async (
  file: File,
  onProgress?: (status: string) => void
): Promise<ExtractedQuestion[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const allQuestions: ExtractedQuestion[] = [];

  // Safety limits for browser/mobile
  const TEXT_SCALE = 1.6; // good quality for slicing but not too heavy
  const OCR_SCALE = 1.2; // OCR cheaper
  const MAX_OCR_PAGES = 6; // prevent freezing on huge scanned PDFs
  let ocrPagesUsed = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) onProgress(`Processing Page ${i} of ${pdf.numPages}...`);

    const page = await pdf.getPage(i);

    // We’ll prefer TEXT scale for slicing, but only render once we know we need it
    const viewportText = page.getViewport({ scale: TEXT_SCALE });

    // --- Phase 1: TEXT DETECTION ---
    let headers: DetectedHeader[] = [];
    let usedMethod: "TEXT" | "OCR" = "TEXT";

    let textItemsCount = 0;

    try {
      const textContent = await page.getTextContent();
      const items: TextItem[] = (textContent.items || []) as any[];
      textItemsCount = items.length;

      const fontHeights = items
        .map(computeFontHeight)
        .filter((h) => h > 0)
        .sort((a, b) => a - b);
      const medianFont =
        fontHeights.length === 0
          ? 10
          : fontHeights[Math.floor(fontHeights.length / 2)];

      const lines = groupItemsIntoLines(items);

      const stats = { medianFont, pageWidth: page.view?.[2] ?? 600 };

      for (const ln of lines) {
        const lineText = ln.text;
        if (!lineText) continue;

        const candidate = matchHeaderNumber(lineText);
        if (!candidate) continue;

        const headerLike = isHeaderLike(
          { text: lineText, minX: ln.minX, maxFont: ln.maxFont },
          stats
        );
        if (!headerLike) continue;

        const qNum = candidate.q;
        const yCanvas = pdfYToCanvasY(ln.pdfY, viewportText);
        const xCanvas = pdfXToCanvasX(ln.minX, viewportText);

        // Confidence scoring
        let confidence = 0.5;
        if (/^(Question|Q|Answer|Solution)\b/i.test(lineText)) confidence += 0.35;
        if (ln.maxFont >= stats.medianFont * 1.2) confidence += 0.15;
        if (ln.minX <= stats.pageWidth * 0.2) confidence += 0.10;
        confidence = clamp(confidence, 0, 1);

        // Deduplicate by question number: keep the highest confidence
        const existing = headers.find((h) => h.number === qNum);
        if (!existing || existing.confidence < confidence) {
          if (existing) headers = headers.filter((h) => h.number !== qNum);
          headers.push({
            number: qNum,
            yCanvas,
            xCanvas,
            confidence,
            source: "TEXT",
          });
        }
      }
    } catch (e) {
      console.warn(`Text extraction failed on page ${i}`, e);
    }

    // Sort headers by Y top-to-bottom
    headers.sort((a, b) => a.yCanvas - b.yCanvas);

    // --- Phase 2: OCR fallback (only if needed) ---
    const shouldOcr =
      headers.length === 0 &&
      ocrPagesUsed < MAX_OCR_PAGES &&
      // if there is some text but it’s tiny, still try OCR
      (textItemsCount < 30 || textItemsCount === 0);

    let canvasText: HTMLCanvasElement | null = null;

    if (shouldOcr) {
      usedMethod = "OCR";
      ocrPagesUsed++;

      if (onProgress)
        onProgress(
          `No reliable headers on Page ${i}. Running OCR (${ocrPagesUsed}/${MAX_OCR_PAGES})...`
        );

      const viewportOcr = page.getViewport({ scale: OCR_SCALE });
      const canvasOcr = await renderPageToCanvas(page, viewportOcr);
      if (canvasOcr) {
        try {
          const result = await Tesseract.recognize(canvasOcr, "eng", {
            logger: (m) => {
              if (onProgress && m.status) {
                const pct =
                  typeof m.progress === "number"
                    ? ` ${(m.progress * 100).toFixed(0)}%`
                    : "";
                onProgress(`OCR Page ${i}: ${m.status}${pct}`);
              }
            },
          });

          const ocrLines = (result.data as any)?.lines || [];

          for (const line of ocrLines) {
            const text = normalizeSpaces(line.text || "");
            if (!text) continue;

            const candidate = matchHeaderNumber(text);
            if (!candidate) continue;

            // OCR bounding box
            const bbox = line.bbox;
            const x0 = bbox?.x0 ?? 999999;
            const y0 = bbox?.y0 ?? 999999;
            const h = (bbox?.y1 ?? 0) - (bbox?.y0 ?? 0);

            // Header-like rules for OCR:
            // - near left margin
            // - bbox height reasonable (bigger than typical small noise)
            const isLeft = x0 <= canvasOcr.width * 0.25;
            const isTall = h >= 14; // tweakable
            const hasKeyword = /^(Question|Q|Answer|Solution)\b/i.test(text);
            const looksNumeric = /^\(?\d{1,3}\)?\s*([.)\-:])/.test(text);

            if (hasKeyword ? !(isLeft || isTall) : !(isLeft && isTall && looksNumeric))
              continue;

            // Convert OCR Y (already top-down in canvas coordinates at OCR scale)
            // Convert to TEXT canvas scale for slicing consistency:
            const yCanvasTextScale = (y0 / OCR_SCALE) * TEXT_SCALE;
            const xCanvasTextScale = (x0 / OCR_SCALE) * TEXT_SCALE;

            let confidence = 0.45;
            if (hasKeyword) confidence += 0.35;
            if (isLeft) confidence += 0.10;
            if (isTall) confidence += 0.10;
            confidence = clamp(confidence, 0, 1);

            const existing = headers.find((h2) => h2.number === candidate.q);
            if (!existing || existing.confidence < confidence) {
              if (existing) headers = headers.filter((h2) => h2.number !== candidate.q);
              headers.push({
                number: candidate.q,
                yCanvas: yCanvasTextScale,
                xCanvas: xCanvasTextScale,
                confidence,
                source: "OCR",
              });
            }
          }

          headers.sort((a, b) => a.yCanvas - b.yCanvas);
        } catch (err) {
          console.error(`OCR failed on page ${i}`, err);
        }
      }
    }

    if (headers.length === 0) {
      if (onProgress)
        onProgress(`No questions detected on Page ${i}. Skipping.`);
      continue;
    }

    // --- Phase 3: Render once (TEXT scale) and slice ---
    canvasText = await renderPageToCanvas(page, viewportText);
    if (!canvasText) continue;

    // Clean up: remove headers that are too close to each other (duplicates)
    const deduped: DetectedHeader[] = [];
    for (const h of headers) {
      const prev = deduped[deduped.length - 1];
      if (!prev) {
        deduped.push(h);
        continue;
      }
      // If two headers are within 18px vertically, keep higher confidence
      if (Math.abs(h.yCanvas - prev.yCanvas) < 18) {
        if (h.confidence > prev.confidence) {
          deduped[deduped.length - 1] = h;
        }
      } else {
        deduped.push(h);
      }
    }

    // Slice bounds
    for (let j = 0; j < deduped.length; j++) {
      const h = deduped[j];

      // Give padding above header
      const startY = clamp(h.yCanvas - 40, 0, canvasText.height);

      // End at next header minus small gap, else end of page
      let endY = canvasText.height;
      if (j < deduped.length - 1) {
        endY = clamp(deduped[j + 1].yCanvas - 16, 0, canvasText.height);
      }

      // Minimum slice height so we don't generate tiny blobs
      if (endY - startY < 40) continue;

      const blob = await canvasSliceToBlob(canvasText, startY, endY);
      if (!blob) continue;

      allQuestions.push({
        number: h.number,
        text: `(${usedMethod} detected on Page ${i})`,
        marks: 0,
        imageBlob: blob,
        page: i,
        // Store coordinates back in "pdf-ish" units if you want.
        // Here we store canvas-based but normalized by TEXT_SCALE for stability.
        coordinates: {
          yStart: startY / TEXT_SCALE,
          yEnd: endY / TEXT_SCALE,
        },
      });
    }
  }

  // Sort overall by question number then page
  allQuestions.sort((a, b) => (a.number - b.number) || (a.page - b.page));
  return allQuestions;
};

// Deprecated: kept for backward compatibility
export const extractQuestionsFromText = (_text: string): ExtractedQuestion[] => {
  return [];
};