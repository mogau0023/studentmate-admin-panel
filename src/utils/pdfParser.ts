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
    
    // 1. Render Page to Canvas (Required for OCR)
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (!context) continue;

    // Render context needs to match the type expected by pdf.js
    const renderContext: any = {
      canvasContext: context,
      viewport: viewport,
    };
    await page.render(renderContext).promise;

    // 2. Run OCR using Tesseract.js
    if (onProgress) onProgress(`Scanning text on Page ${i} (OCR)...`);
    
    const result = await Tesseract.recognize(canvas, 'eng');
    const lines = (result.data as any).lines;
    
    const questionLocations: { number: number, y: number }[] = [];

    lines.forEach(line => {
      const text = line.text.trim();
      // Match "Question 1", "Q1", "Answer 1"
      // Note: Tesseract might return "Question 1" or "Question l" or "Question I" sometimes, but we stick to digits for now
      const match = text.match(/^(?:Question|Q|Answer)\s*(\d+)/i);

      if (match) {
        // line.bbox gives coordinates directly in canvas space (top-down)
        // bbox: { x0, y0, x1, y1 }
        const y = line.bbox.y0;
        
        if (!questionLocations.find(q => q.number === parseInt(match[1]))) {
            questionLocations.push({ 
              number: parseInt(match[1]), 
              y: y 
            });
        }
      }
    });

    // Sort locations by Y position (top to bottom)
    questionLocations.sort((a, b) => a.y - b.y);

    // If no questions found on this page, skip image generation (or handle continuation)
    if (questionLocations.length === 0) continue;

    // 3. Slice Canvas based on Question Locations
    for (let j = 0; j < questionLocations.length; j++) {
      const q = questionLocations[j];
      const startY = Math.max(0, q.y - 50); // Start a bit above the text to catch headers
      
      // End Y is either the start of the next question OR the bottom of the page
      let endY = viewport.height;
      if (j < questionLocations.length - 1) {
        endY = questionLocations[j + 1].y - 20; // Leave a small gap
      }

      const height = endY - startY;
      if (height <= 0) continue;

      // Create a new canvas for the sliced image
      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = viewport.width;
      sliceCanvas.height = height;
      const sliceCtx = sliceCanvas.getContext('2d');
      
      if (sliceCtx) {
        // Draw the specific slice from the full page
        sliceCtx.drawImage(
          canvas, 
          0, startY, viewport.width, height, // Source: x, y, w, h
          0, 0, viewport.width, height       // Dest: x, y, w, h
        );

        // Convert to Blob
        const blob = await new Promise<Blob | null>(resolve => 
          sliceCanvas.toBlob(resolve, 'image/jpeg', 0.85)
        );

        if (blob) {
          allQuestions.push({
            number: q.number,
            text: `(OCR Extracted from Page ${i})`,
            marks: 0, // Default, user can edit
            imageBlob: blob,
            page: i,
            coordinates: {
              yStart: startY / 2.0, // Normalize back to PDF scale (approx)
              yEnd: endY / 2.0
            }
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
