import * as pdfjsLib from 'pdfjs-dist';

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

export const parsePdf = async (file: File): Promise<ExtractedQuestion[]> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  
  const allQuestions: ExtractedQuestion[] = [];
  let currentQuestionNumber = 0;

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // High res for quality
    
    // 1. Get Text Content for Coordinate Analysis
    const textContent = await page.getTextContent();
    
    // Group text items by Y-coordinate (lines) to handle fragmented text
    // PDF coordinates: Y starts from bottom. We group by roughly same Y.
    const lines: { y: number, text: string, items: any[] }[] = [];
    const TOLERANCE = 5; // Vertical tolerance in PDF units

    textContent.items.forEach((item: any) => {
      // Find an existing line that matches this item's Y
      // transform[5] is Y in PDF space (bottom-up)
      const itemY = item.transform[5];
      const existingLine = lines.find(line => Math.abs(line.y - itemY) < TOLERANCE);

      if (existingLine) {
        existingLine.items.push(item);
        // We'll re-sort and join text later
      } else {
        lines.push({ y: itemY, text: '', items: [item] });
      }
    });

    // Sort lines by Y (Top to Bottom for reading order)
    // In PDF space, higher Y is higher up on page. So sort Descending.
    lines.sort((a, b) => b.y - a.y);

    const questionLocations: { number: number, y: number }[] = [];

    lines.forEach(line => {
      // Sort items in line by X (Left to Right)
      line.items.sort((a, b) => a.transform[4] - b.transform[4]);
      // Join text
      const lineText = line.items.map(i => i.str).join(' ');
      
      // Check for Question Pattern
      // Matches: "Question 1", "Q1", "Question 1:", "1." (if enabled later)
      // Added robustness: "Answer 1" for memos, and simple "1." if explicitly needed
      // 2024-05-23: Expanded regex to catch "1.1", "1.2" etc and treat them as belonging to Question 1 if Q1 not found explicitly
      // But primary goal is to find "Question 1" or "1"
      
      const lineTextTrimmed = lineText.trim();

      // Only match Explicit "Question X" or "Answer X"
      // Reverted loose numbering as per user request
      let match = lineTextTrimmed.match(/^(?:Question|Q|Answer)\s*(\d+)/i);
      
      if (match) {
        // Use the Y of the line (first item's Y)
        // Convert to canvas space (top-down)
        const pdfY = line.y;
        const canvasY = viewport.height - (pdfY * viewport.scale);
        
        // Ensure we haven't already added this question number (avoid duplicates on same page)
        if (!questionLocations.find(q => q.number === parseInt(match[1]))) {
            questionLocations.push({ 
              number: parseInt(match[1]), 
              y: canvasY 
            });
        }
      }
    });

    // Sort locations by Y position (top to bottom) within the page
    questionLocations.sort((a, b) => a.y - b.y);

    // If no questions found on this page, skip image generation (or handle continuation)
    if (questionLocations.length === 0) continue;

    // 2. Render Page to Canvas
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    if (!context) continue;

    // Render context needs to match the type expected by pdf.js
    // Casting to any to avoid strict type checking issues with pdfjs-dist types
    const renderContext: any = {
      canvasContext: context,
      viewport: viewport,
    };
    await page.render(renderContext).promise;

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
            text: `(Image Extracted from Page ${i})`,
            marks: 0, // Default, user can edit
            imageBlob: blob,
            page: i,
            coordinates: {
              yStart: startY / 2.0, // Normalize back to PDF scale (approx)
              yEnd: endY / 2.0
            }
          });
          currentQuestionNumber = q.number;
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
