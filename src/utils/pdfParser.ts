import * as pdfjsLib from 'pdfjs-dist';

// Set the worker source to a local file in the public folder
// This ensures the worker version matches the installed library and avoids CDN issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;

export interface ExtractedQuestion {
  number: number;
  text: string;
  marks: number;
  answerText?: string;
  subQuestions?: { number: string; text: string; marks: number }[];
}

export const parsePdf = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    // Add a newline after each item to preserve some structure, or just join with space
    const pageText = textContent.items.map((item: any) => item.str).join(' ');
    fullText += pageText + '\n\n'; // Double newline between pages
  }

  return fullText;
};

export const extractQuestionsFromText = (text: string): ExtractedQuestion[] => {
  const questions: ExtractedQuestion[] = [];
  
  // 1. Split into Questions and Memo sections if possible
  // Common delimiters for Memo
  const memoSplitRegex = /(?:Memorandum|Memo|Solutions|Marking Guideline)/i;
  const splitMatch = memoSplitRegex.exec(text);
  
  let questionsText = text;
  let answersText = '';

  if (splitMatch) {
    questionsText = text.substring(0, splitMatch.index);
    answersText = text.substring(splitMatch.index);
  }

  // Helper to parse content (questions or answers)
  const parseContent = (content: string) => {
    // Normalize text: replace multiple spaces/newlines with single space
    const normalized = content.replace(/\s+/g, ' ');
    // Regex to find "Question X" or "Q X"
    const regex = /(?:Question|Q)\s*(\d+)[\s.:]*(.*?)(?=(?:Question|Q)\s*\d+|$)/gi;
    const items: { number: number; text: string; marks: number }[] = [];
    
    let match;
    while ((match = regex.exec(normalized)) !== null) {
      const number = parseInt(match[1]);
      const body = match[2].trim();
      
      // Try to extract marks (e.g., "[10]", "(5)")
      const marksMatch = body.match(/[\[\(](\d+)[\]\)]\s*$/) || body.match(/Total\s*:\s*(\d+)/i);
      const marks = marksMatch ? parseInt(marksMatch[1]) : 0;

      items.push({ number, text: body, marks });
    }
    return items;
  };

  const questionItems = parseContent(questionsText);
  const answerItems = parseContent(answersText);

  // Merge answers into questions
  questionItems.forEach(q => {
    const matchingAnswer = answerItems.find(a => a.number === q.number);
    questions.push({
      number: q.number,
      text: q.text,
      marks: q.marks,
      answerText: matchingAnswer ? matchingAnswer.text : undefined,
      subQuestions: []
    });
  });

  return questions;
};
