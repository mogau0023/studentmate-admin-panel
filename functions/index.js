const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");

admin.initializeApp();

const geminiKey = defineSecret("GEMINI_KEY");

exports.openaiProxy = onCall(
  { timeoutSeconds: 120, memory: "512MiB", secrets: [geminiKey] },
  async (request) => {
    const apiKey = geminiKey.value();

    if (!apiKey) {
      throw new HttpsError("failed-precondition", "GEMINI_KEY secret is not set.");
    }

    const { systemPrompt, userPrompt, imageUrl, imageBase64, imageMediaType, maxTokens } = request.data;

    let finalBase64 = imageBase64;
    if (imageUrl && !finalBase64) {
      const imgResponse = await fetch(imageUrl);
      if (!imgResponse.ok) {
        throw new HttpsError("internal", `Failed to fetch image: ${imgResponse.status}`);
      }
      const arrayBuffer = await imgResponse.arrayBuffer();
      finalBase64 = Buffer.from(arrayBuffer).toString("base64");
    }

    const parts = [];
    if (finalBase64) {
      parts.push({
        inlineData: {
          mimeType: imageMediaType || "image/jpeg",
          data: finalBase64,
        },
      });
    }
    parts.push({ text: userPrompt });

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts }],
        generationConfig: {
          maxOutputTokens: maxTokens || 1500,
          temperature: 0.2,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new HttpsError("internal", err.error?.message || "Gemini request failed");
    }

    const result = await response.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    return { text };
  }
);
