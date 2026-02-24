import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";

// ✅ Ensure worker matches your installed pdfjs-dist build
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

export interface ExtractedQuestion {
  number: number;
  text: string;
  marks: number;
  answerText?: string;

  // ✅ new: all parts (useful if you later want carousel / pagination)
  imageBlobs?: Blob[];

  // ✅ kept: single stitched image for your current UI
  imageBlob?: Blob;

  page: number; // first page it starts on
  coordinates: { yStart: number; yEnd: number };
  subQuestions?: { number: string; text: string; marks: number }[];
}

type TextItem = any;

type DetectedHeader = {
  number: number; // MAIN question number
  yCanvas: number; // top-down
  confidence: number;
  source: "TEXT" | "OCR";
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function matchHeaderNumber(lineText: string): { q: number } | null {
  const t = normalizeSpaces(lineText);

  // Match "Question 1", "Q 1", "Q.1", "Q U E S T I O N 1"
  const QUESTION_FUZZY =
    /^(?:Q(?:\s*U\s*E\s*S\s*T\s*I\s*O\s*N)?|Question|Answer|Solution)\s*[.:)\-]*\s*(\d+)/i;

  const explicit = t.match(QUESTION_FUZZY);
  if (explicit) {
    const q = parseInt(explicit[1], 10);
    if (Number.isFinite(q)) return { q };
  }

  // "1.1", "1.2", "2.3" -> treat as main question number
  const dotted = t.match(/^(\d{1,3})\.(\d{1,3})(?:\.\d{1,3})?/);
  if (dotted) {
    const q = parseInt(dotted[1], 10);
    if (Number.isFinite(q)) return { q };
  }

  // Numeric header fallback: "1)", "1."
  const numeric = t.match(/^\(?(\d{1,3})\)?\s*([.)\-:])\s+/);
  if (numeric) {
    const q = parseInt(numeric[1], 10);
    if (Number.isFinite(q)) return { q };
  }

  return null;
}

function computeFontHeight(item: TextItem): number {
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
  return viewport.height - pdfY * viewport.scale;
}

function groupItemsIntoLines(items: TextItem[]) {
  if (!items?.length) return [];

  const heights = items
    .map(computeFontHeight)
    .filter((h) => h > 0)
    .sort((a, b) => a - b);

  const medianH = heights.length ? heights[Math.floor(heights.length / 2)] : 10;
  const TOL = clamp(medianH * 0.6, 3, 10);

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

  lines.sort((a, b) => b.y - a.y);

  return lines.map((l) => {
    l.items.sort((a, b) => computeX(a) - computeX(b));
    const text = normalizeSpaces(l.items.map((i) => i.str).join(" "));
    const maxFont = Math.max(...l.items.map(computeFontHeight));
    const minX = Math.min(...l.items.map(computeX));
    return { pdfY: l.y, minX, maxFont, text };
  });
}

// ✅ be tolerant — accept if it contains Question/Q/Answer/Solution anywhere
function isHeaderLike(text: string) {
  const t = normalizeSpaces(text);
  return /(Question|Answer|Solution)\b/i.test(t) || /\bQ\b/i.test(t);
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

async function sliceToBlob(
  canvas: HTMLCanvasElement,
  yStart: number,
  yEnd: number
): Promise<Blob | null> {
  const height = Math.max(0, yEnd - yStart);
  if (height <= 4) return null;

  const sliceCanvas = document.createElement("canvas");
  sliceCanvas.width = canvas.width;
  sliceCanvas.height = height;
  const sliceCtx = sliceCanvas.getContext("2d");
  if (!sliceCtx) return null;

  sliceCtx.drawImage(canvas, 0, yStart, canvas.width, height, 0, 0, canvas.width, height);

  return await new Promise<Blob | null>((resolve) =>
    sliceCanvas.toBlob(resolve, "image/jpeg", 0.88)
  );
}

/**
 * ✅ NEW: stitch blobs into ONE tall image (so your UI can keep using imageBlob)
 */
async function stitchBlobsVertically(blobs: Blob[]): Promise<Blob | null> {
  if (!blobs.length) return null;
  if (blobs.length === 1) return blobs[0];

  const bitmaps = await Promise.all(blobs.map((b) => createImageBitmap(b)));
  const width = Math.max(...bitmaps.map((b) => b.width));
  const height = bitmaps.reduce((sum, b) => sum + b.height, 0);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let y = 0;
  for (const bmp of bitmaps) {
    ctx.drawImage(bmp, 0, y);
    y += bmp.height;
  }

  // cleanup
  bitmaps.forEach((b) => b.close?.());

  return await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.9)
  );
}

export const parsePdf = async (
  file: File,
  onProgress?: (status: string) => void
): Promise<ExtractedQuestion[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const TEXT_SCALE = 1.6;
  const OCR_SCALE = 1.2;
  const MAX_OCR_PAGES = 6;
  let ocrPagesUsed = 0;

  // ✅ collect parts by question number across pages
  const byQ = new Map<
    number,
    {
      number: number;
      parts: Blob[];
      firstPage: number;
      coords: { yStart: number; yEnd: number };
    }
  >();

  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) onProgress(`Processing Page ${i} of ${pdf.numPages}...`);

    const page = await pdf.getPage(i);
    const viewportText = page.getViewport({ scale: TEXT_SCALE });

    let headers: DetectedHeader[] = [];

    // --- TEXT DETECTION ---
    try {
      const textContent = await page.getTextContent();
      const items: TextItem[] = (textContent.items || []) as any[];
      const lines = groupItemsIntoLines(items);

      for (const ln of lines) {
        if (!ln.text) continue;
        const candidate = matchHeaderNumber(ln.text);
        if (!candidate) continue;
        if (!isHeaderLike(ln.text)) continue;

        headers.push({
          number: candidate.q,
          yCanvas: pdfYToCanvasY(ln.pdfY, viewportText),
          confidence: 0.75,
          source: "TEXT",
        });
      }
    } catch (e) {
      console.warn(`Text extraction failed on page ${i}`, e);
    }

    headers.sort((a, b) => a.yCanvas - b.yCanvas);

    // --- OCR fallback if no headers ---
    if (headers.length === 0 && ocrPagesUsed < MAX_OCR_PAGES) {
      ocrPagesUsed++;
      if (onProgress) onProgress(`OCR Page ${i}... (${ocrPagesUsed}/${MAX_OCR_PAGES})`);

      const viewportOcr = page.getViewport({ scale: OCR_SCALE });
      const canvasOcr = await renderPageToCanvas(page, viewportOcr);

      if (canvasOcr) {
        try {
          const result = await Tesseract.recognize(canvasOcr, "eng");
          const ocrLines = (result.data as any)?.lines || [];

          for (const line of ocrLines) {
            const text = normalizeSpaces(line.text || "");
            if (!text) continue;

            const candidate = matchHeaderNumber(text);
            if (!candidate) continue;
            if (!isHeaderLike(text)) continue;

            const y0 = line?.bbox?.y0 ?? 999999;

            // convert OCR scale -> TEXT scale
            const yCanvasTextScale = (y0 / OCR_SCALE) * TEXT_SCALE;

            headers.push({
              number: candidate.q,
              yCanvas: yCanvasTextScale,
              confidence: 0.6,
              source: "OCR",
            });
          }

          headers.sort((a, b) => a.yCanvas - b.yCanvas);
        } catch (err) {
          console.error(`OCR failed on page ${i}`, err);
        }
      }
    }

    if (headers.length === 0) continue;

    // --- Render once and slice ---
    const canvasText = await renderPageToCanvas(page, viewportText);
    if (!canvasText) continue;

    // dedupe close headers on same page
    const deduped: DetectedHeader[] = [];
    for (const h of headers) {
      const prev = deduped[deduped.length - 1];
      if (!prev) deduped.push(h);
      else if (Math.abs(h.yCanvas - prev.yCanvas) > 18) deduped.push(h);
    }

    for (let j = 0; j < deduped.length; j++) {
      const h = deduped[j];

      const startY = clamp(h.yCanvas - 40, 0, canvasText.height);
      let endY = canvasText.height;

      if (j < deduped.length - 1) {
        endY = clamp(deduped[j + 1].yCanvas - 16, 0, canvasText.height);
      }

      if (endY - startY < 40) continue;

      const blob = await sliceToBlob(canvasText, startY, endY);
      if (!blob) continue;

      const existing = byQ.get(h.number);
      if (!existing) {
        byQ.set(h.number, {
          number: h.number,
          parts: [blob],
          firstPage: i,
          coords: { yStart: startY / TEXT_SCALE, yEnd: endY / TEXT_SCALE },
        });
      } else {
        existing.parts.push(blob);
        // expand coords end
        existing.coords.yEnd = Math.max(existing.coords.yEnd, endY / TEXT_SCALE);
      }
    }
  }

  // ✅ finalize: stitch parts into one imageBlob, but keep parts too
  const results: ExtractedQuestion[] = [];
  for (const q of Array.from(byQ.values()).sort((a, b) => a.number - b.number)) {
    const stitched = await stitchBlobsVertically(q.parts);

    results.push({
      number: q.number,
      text: `(Merged question ${q.number})`,
      marks: 0,
      imageBlobs: q.parts,
      imageBlob: stitched ?? q.parts[0],
      page: q.firstPage,
      coordinates: q.coords,
    });
  }

  return results;
};

// Deprecated
export const extractQuestionsFromText = (_text: string): ExtractedQuestion[] => [];

export const getPageHeight = async (
  file: File,
  pageNumber: number,
  scale: number = 1.6
): Promise<number> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  return viewport.height;
};

export const renderPageToBlob = async (
  file: File,
  pageNumber: number,
  scale: number = 1.6
): Promise<Blob | null> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = await renderPageToCanvas(page, viewport);
  if (!canvas) return null;
  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
};

export const cropRectFromPdf = async (
  file: File,
  pageNumber: number,
  xStartCanvas: number,
  yStartCanvas: number,
  widthCanvas: number,
  heightCanvas: number,
  scale: number = 1.6
): Promise<Blob | null> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const sourceCanvas = await renderPageToCanvas(page, viewport);
  if (!sourceCanvas) return null;
  const x = clamp(xStartCanvas, 0, sourceCanvas.width);
  const y = clamp(yStartCanvas, 0, sourceCanvas.height);
  const w = clamp(widthCanvas, 1, sourceCanvas.width - x);
  const h = clamp(heightCanvas, 1, sourceCanvas.height - y);
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(sourceCanvas, x, y, w, h, 0, 0, w, h);
  return await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/jpeg", 0.9));
};

export const stitchBlobs = async (blobs: Blob[]): Promise<Blob | null> => {
  if (!blobs.length) return null;
  if (blobs.length === 1) return blobs[0];
  const bitmaps = await Promise.all(blobs.map((b) => createImageBitmap(b)));
  const width = Math.max(...bitmaps.map((b) => b.width));
  const height = bitmaps.reduce((sum, b) => sum + b.height, 0);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  let y = 0;
  for (const bmp of bitmaps) {
    ctx.drawImage(bmp, 0, y);
    y += bmp.height;
  }
  bitmaps.forEach((b) => b.close?.());
  return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
};
