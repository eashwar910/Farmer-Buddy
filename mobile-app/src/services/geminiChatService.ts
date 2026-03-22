import { GEMINI_API_KEY } from '@env';

// Primary model
const MODELS_TO_TRY = ['gemini-2.5-flash'];

export interface ChatMessage {
  id: string;
  text: string;
  sender: 'user' | 'bot';
  attachments?: MediaAttachment[];
}

export interface MediaAttachment {
  /** Raw base64 string (no data-url prefix) */
  base64: string;
  mimeType: string;
  /** Display name shown in the UI */
  name?: string;
  /** Duration in seconds for audio clips */
  durationSeconds?: number;
}

export interface LocationWeatherContext {
  locationName?: string;
  temp?: number;
  condition?: string;
  humidity?: number;
  windSpeed?: number;
  uvIndex?: number;
}

const SYSTEM_PROMPT = `You are an expert agronomist assistant. You help farmers and agricultural workers with crop management, disease identification, soil health, and best farming practices. Provide practical, accurate, and easy-to-understand advice. If context from a farm database or knowledge base is provided, use it to accurately answer questions. When the user's location and weather data are provided, factor them into your advice (e.g. current temperature, humidity, UV index, wind speed, and local conditions). When the user sends an image, carefully analyse it and incorporate your observations into your answer. When the user sends audio, first transcribe what was said, then answer the question. When the user sends a document, read its content and use it to inform your reply.`;

export const sendAgronomistMessage = async (
  messageStr: string,
  history: ChatMessage[],
  qdrantContext?: string,
  locationContext?: LocationWeatherContext,
  attachments?: MediaAttachment[]
): Promise<string> => {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured.');
  }

  // ── Build the system preamble (plain text part) ────────────────────────────
  let preamble = `${SYSTEM_PROMPT}\n\n`;

  if (locationContext) {
    preamble += `FARMER LOCATION & CURRENT WEATHER:\n`;
    if (locationContext.locationName) preamble += `- Location: ${locationContext.locationName}\n`;
    if (locationContext.temp !== undefined) preamble += `- Temperature: ${locationContext.temp}°C\n`;
    if (locationContext.condition) preamble += `- Condition: ${locationContext.condition}\n`;
    if (locationContext.humidity !== undefined) preamble += `- Humidity: ${locationContext.humidity}%\n`;
    if (locationContext.windSpeed !== undefined) preamble += `- Wind Speed: ${locationContext.windSpeed} km/h\n`;
    if (locationContext.uvIndex !== undefined) preamble += `- UV Index: ${locationContext.uvIndex}\n`;
    preamble += `Use this contextual data to tailor your agricultural advice appropriately.\n\n`;
  }

  if (qdrantContext) {
    preamble += `CONTEXT FROM KNOWLEDGE BASE:\n${qdrantContext}\n\n`;
  }

  // ── Build chat history as plain text ──────────────────────────────────────
  let historyText = 'CHAT HISTORY:\n';
  history.forEach((msg) => {
    historyText += `${msg.sender === 'user' ? 'Farmer' : 'Agronomist'}: ${msg.text}\n`;
  });
  historyText += `Farmer: ${messageStr}\nAgronomist:`;

  // ── Compose Gemini content parts ──────────────────────────────────────────
  // Gemini REST API: contents[].parts[] can mix text + inlineData
  const parts: any[] = [{ text: preamble + historyText }];

  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      if (att.mimeType.startsWith('image/') || att.mimeType === 'application/pdf' || att.mimeType.startsWith('audio/')) {
        // Images, PDFs, audio → inlineData
        parts.push({
          inlineData: {
            mimeType: att.mimeType,
            data: att.base64,
          },
        });
      } else {
        // Plain text docs, CSV, etc. → decode base64 and prepend as text
        try {
          const decoded = Buffer.from(att.base64, 'base64').toString('utf-8');
          parts.unshift({ text: `FILE CONTENT (${att.name ?? att.mimeType}):\n${decoded}\n\n` });
        } catch {
          // If decode fails, skip attachment silently
        }
      }
    }
  }

  let lastError: any;

  for (const model of MODELS_TO_TRY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
      }

      const data = await response.json();

      if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
        return data.candidates[0].content.parts[0].text;
      } else {
        throw new Error(`Unexpected response format from Gemini API (${model}).`);
      }
    } catch (error: any) {
      console.warn(`[Gemini Chat Fallback] Model ${model} failed:`, error.message);
      lastError = error;
    }
  }

  console.error('All Gemini chat fallback models failed.');
  throw lastError;
};
