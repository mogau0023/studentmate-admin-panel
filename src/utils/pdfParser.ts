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
    
    // Find Y-coordinates of "Question X"
    // Note: PDF coordinates start from bottom-left. viewport.height - y gives top-down Y.
    const questionLocations: { number: number, y: number }[] = [];
    
    textContent.items.forEach((item: any) => {
      const str = item.str.trim();
      // Match "Question 1", "Q1", "Question 1:", etc.
      const match = str.match(/^(?:Question|Q)\s*(\d+)/i);
      if (match) {
        // Transform[5] is the y-coordinate in PDF space (bottom-up)
        // Convert to canvas space (top-down)
        // item.transform is [scaleX, skewY, skewX, scaleY, x, y]
        const pdfY = item.transform[5]; 
        const canvasY = viewport.height - (pdfY * viewport.scale); // Approximate conversion
        questionLocations.push({ 
          number: parseInt(match[1]), 
          y: canvasY 
        });
      }
    });

    // Sort locations by Y position (top to bottom)
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
            imageBlob: blob
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
