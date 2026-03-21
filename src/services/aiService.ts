import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../lib/firebase";

const functions = getFunctions(app, "us-central1");
const openaiProxy = httpsCallable<any, { text: string }>(functions, "openaiProxy");

export const TOPIC_TAXONOMY: Record<string, string[]> = {
  Algebra: ["Solving equations", "Simultaneous equations", "Quadratic equations", "Factoring", "Inequalities"],
  Functions: ["Linear functions", "Quadratic functions", "Exponential functions", "Trigonometric functions", "Inverse functions"],
  Calculus: ["Derivatives", "Integration", "Optimization", "Rates of change", "Limits"],
  "Number Theory": ["Sequences", "Series", "Arithmetic progressions", "Geometric progressions"],
  Geometry: ["Euclidean geometry", "Analytical geometry", "Trigonometry", "Mensuration"],
  Statistics: ["Data handling", "Probability", "Distributions", "Regression"],
  Finance: ["Simple interest", "Compound interest", "Annuities", "Depreciation"],
  Other: ["Mixed", "Word problems", "Proofs", "General"],
};

export interface GeneratedAnswer {
  answerText: string;
  confidence: "high" | "medium" | "low";
}

export interface TopicClassification {
  primaryTopic: string;
  subTopic: string;
  confidence: number;
}

// ✅ Pass URL directly — Cloud Function fetches the image server-side, no CORS
export async function generateMemorandum(
  imageUrlOrBlob: string | Blob,
  marks: number = 0,
  studyContext?: string
): Promise<GeneratedAnswer> {
  const systemPrompt = `You are a South African high school or university mathematics/science teacher writing a model answer (memorandum) for an exam question.

Your answer must:
- Show ALL working steps clearly, numbered
- Use the exact same mathematical notation and format as South African exam memos
- For ${marks} marks, provide exactly ${marks} clear mark-worthy steps or points
- Be concise but complete — every step that earns a mark must be shown
- If multiple methods exist, use the most common textbook approach
${studyContext ? `\nIMPORTANT: Mirror the style and method from this reference material:\n${studyContext}` : ""}

Respond with ONLY the model answer. No preamble, no "Here is the answer:", just the working.`;

  // If it's a URL string, pass it directly. If it's a Blob, convert to base64.
  let payload: any = {
    systemPrompt,
    userPrompt: `Please write the full memorandum answer for this ${marks}-mark question. Show all working.`,
    imageMediaType: "image/jpeg",
    maxTokens: 1500,
  };

  if (typeof imageUrlOrBlob === "string") {
    payload.imageUrl = imageUrlOrBlob;
  } else {
    payload.imageBase64 = await blobToBase64(imageUrlOrBlob);
  }

  try {
    const result = await openaiProxy(payload);
    const answerText = result.data.text;
    const confidence: GeneratedAnswer["confidence"] =
      answerText.length > 200 && marks > 0 ? "high" : answerText.length > 80 ? "medium" : "low";
    return { answerText, confidence };
  } catch (err: any) {
    console.error("generateMemorandum failed:", err?.code, err?.message, err?.details);
    throw new Error(err?.message || "Cloud Function call failed");
  }
}

export async function classifyQuestionTopic(
  imageUrlOrBlob: string | Blob,
  questionText?: string
): Promise<TopicClassification> {
  const systemPrompt = `You are a mathematics curriculum expert. Your job is to classify exam questions into topics.

Available taxonomy (JSON):
${JSON.stringify(TOPIC_TAXONOMY, null, 2)}

Respond ONLY with a valid JSON object in this exact format, no other text:
{
  "primaryTopic": "one of the main keys from the taxonomy",
  "subTopic": "one of the sub-topics under that key",
  "confidence": 0.85
}`;

  let payload: any = {
    systemPrompt,
    userPrompt: questionText
      ? `Classify this question. Extracted text hint: "${questionText}"`
      : "Classify this exam question into a topic from the taxonomy.",
    imageMediaType: "image/jpeg",
    maxTokens: 200,
  };

  if (typeof imageUrlOrBlob === "string") {
    payload.imageUrl = imageUrlOrBlob;
  } else {
    payload.imageBase64 = await blobToBase64(imageUrlOrBlob);
  }

  try {
    const result = await openaiProxy(payload);
    const cleaned = result.data.text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return {
      primaryTopic: parsed.primaryTopic || "Other",
      subTopic: parsed.subTopic || "General",
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    };
  } catch (err: any) {
    console.error("classifyQuestionTopic failed:", err?.code, err?.message, err?.details);
    return { primaryTopic: "Other", subTopic: "General", confidence: 0.3 };
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}