import { GEMINI_API_KEY } from '@env';

const MODELS_TO_TRY = [
  'gemini-2.5-flash'
];

export const analyzeFarmData = async (prompt: string): Promise<string> => {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured.');
  }

  let lastError: any;

  for (const model of MODELS_TO_TRY) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
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
      console.warn(`[Gemini Fallback] Model ${model} failed:`, error.message);
      lastError = error;
      // Continue to the next model in the array
    }
  }

  // If all models failed
  console.error('All Gemini fallback models failed.');
  throw lastError;
};

