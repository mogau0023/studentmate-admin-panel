import * as pdfjsLib from 'pdfjs-dist';
import Tesseract from 'tesseract.js';

// Set the worker source to a local file in the public folder
// This ensures the worker version matches the installed library and avoids CDN issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

export interface ExtractedQuestion {
  number: number;
  text: string;
  marks: number;
  answerText?: string;
  imageBlob?: Blob; // New: Image representation of the question
  page: number;
  coordinates: { yStart: number; yEnd: number };
  subQuestions?: { number: string; text: string; marks: number }[];
}

export const parsePdf = async (file: File, onProgress?: (status: string) => void): Promise<ExtractedQuestion[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  const allQuestions: ExtractedQuestion[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    if (onProgress) onProgress(`Processing Page ${i} of ${pdf.numPages}...`);

    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // High res for quality
    
    // --- Phase 1: Try Text Extraction (Fast & Reliable for Digital PDFs) ---
    let questionLocations: { number: number, y: number }[] = [];
    let extractionMethod = 'Text';

    try {
      const textContent = await page.getTextContent();
      
      // Group text items by Y-coordinate (lines)
      const lines: { y: number, text: string, items: any[] }[] = [];
      const TOLERANCE = 5;

      textContent.items.forEach((item: any) => {
        const itemY = item.transform[5]; // PDF Y (bottom-up)
        const existingLine = lines.find(line => Math.abs(line.y - itemY) < TOLERANCE);
        if (existingLine) {
          existingLine.items.push(item);
        } else {
          lines.push({ y: itemY, text: '', items: [item] });
        }
      });

      // Sort lines Top-to-Bottom (descending Y in PDF space)
      lines.sort((a, b) => b.y - a.y);

      lines.forEach(line => {
        // Sort items Left-to-Right
        line.items.sort((a, b) => a.transform[4] - b.transform[4]);
        const lineText = line.items.map(i => i.str).join(' ').trim();
        
        // Match "Question 1", "Q1", "Answer 1", "Question One"
        // Also allow matching if it's not at the very start, but appears as a clear header
        // Regex Explanation:
        // (?:^|\s) -> Start of line or whitespace
        // (?:Question|Q|Answer|Solution) -> Keyword
        // [\s.:-]* -> Optional separator (space, dot, colon, dash)
        // (\d+) -> The number
        // NEW: Also check for just "1" or "2" if it's a very short line (likely a header in a memo)
        let match = lineText.match(/(?:^|\s)(?:Question|Q|Answer|Solution)[\s.:-]*(\d+)/i);
        
        // Fallback: If line is very short (e.g. "1" or "1." or "1.1"), treat as question number
        if (!match && lineText.length < 10) {
             const simpleMatch = lineText.match(/^(\d+)(?:[\.:]|$)/);
             if (simpleMatch) {
                 match = simpleMatch;
             }
        }

        if (match) {
          const pdfY = line.y;
          const canvasY = viewport.height - (pdfY * viewport.scale); // Convert to Canvas Y (top-down)
          
          if (!questionLocations.find(q => q.number === parseInt(match[1]))) {
            questionLocations.push({ number: parseInt(match[1]), y: canvasY });
          }
        }
      });
    } catch (e) {
      console.warn(`Text extraction failed for page ${i}, falling back to OCR`, e);
    }

    // --- Phase 2: Fallback to OCR (Slow but works for Scans) ---
    if (questionLocations.length === 0) {
      extractionMethod = 'OCR';
      if (onProgress) onProgress(`No text found on Page ${i}. Switching to OCR...`);
      
      // Render Page to Canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      if (context) {
        const renderContext: any = {
          canvasContext: context,
          viewport: viewport,
        };
        await page.render(renderContext).promise;

        try {
          const result = await Tesseract.recognize(canvas, 'eng');
          const ocrLines = (result.data as any).lines;
          
          ocrLines.forEach((line: any) => {
            const text = line.text.trim();
            // Same robust regex as above
            let match = text.match(/(?:^|\s)(?:Question|Q|Answer|Solution)[\s.:-]*(\d+)/i);
            
            if (!match && text.length < 10) {
                 const simpleMatch = text.match(/^(\d+)(?:[\.:]|$)/);
                 if (simpleMatch) {
                     match = simpleMatch;
                 }
            }

            if (match) {
              const y = line.bbox.y0; // OCR gives top-down Y
              if (!questionLocations.find(q => q.number === parseInt(match[1]))) {
                questionLocations.push({ number: parseInt(match[1]), y: y });
              }
            }
          });
        } catch (ocrError) {
          console.error(`OCR failed for page ${i}:`, ocrError);
          // If OCR fails, we just continue with 0 questions for this page
        }
      }
    }

    // Sort locations by Y position
    questionLocations.sort((a, b) => a.y - b.y);

    if (questionLocations.length === 0) continue;

    // --- Phase 3: Slice Images ---
    // We need the canvas for slicing regardless of how we found the locations
    // If we came from Phase 1, we haven't rendered the canvas yet.
    let canvas = document.createElement('canvas'); // Re-declare or reuse
    // Check if we need to render (if extractionMethod was Text, canvas is empty)
    if (extractionMethod === 'Text') {
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        if (context) {
             const renderContext: any = {
              canvasContext: context,
              viewport: viewport,
            };
            await page.render(renderContext).promise;
        }
    } else {
        // If OCR ran, we already rendered to a canvas, but scoping is tricky
        // For simplicity/safety, let's just re-render or structure code to share.
        // Given the loop structure, re-rendering is safest to ensure clean state, 
        // though slightly inefficient. Optimizing:
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        if (context) {
             const renderContext: any = {
              canvasContext: context,
              viewport: viewport,
            };
            await page.render(renderContext).promise;
        }
    }

    const context = canvas.getContext('2d');
    if (!context) continue;

    for (let j = 0; j < questionLocations.length; j++) {
      const q = questionLocations[j];
      const startY = Math.max(0, q.y - 50); 
      let endY = viewport.height;
      if (j < questionLocations.length - 1) {
        endY = questionLocations[j + 1].y - 20; 
      }
      const height = endY - startY;
      if (height <= 0) continue;

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = viewport.width;
      sliceCanvas.height = height;
      const sliceCtx = sliceCanvas.getContext('2d');
      
      if (sliceCtx) {
        sliceCtx.drawImage(canvas, 0, startY, viewport.width, height, 0, 0, viewport.width, height);
        const blob = await new Promise<Blob | null>(resolve => sliceCanvas.toBlob(resolve, 'image/jpeg', 0.85));

        if (blob) {
          allQuestions.push({
            number: q.number,
            text: `(${extractionMethod} Extracted from Page ${i})`,
            marks: 0,
            imageBlob: blob,
            page: i,
            coordinates: { yStart: startY / 2.0, yEnd: endY / 2.0 }
          });
        }
      }
    }
  }

  return allQuestions;
};

// Deprecated: kept for backward compatibility if needed, but parsePdf now does the heavy lifting
export const extractQuestionsFromText = (text: string): ExtractedQuestion[] => {
    return [];
};
