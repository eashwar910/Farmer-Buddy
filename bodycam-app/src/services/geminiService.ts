import { GEMINI_API_KEY } from '@env';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export const analyzeFarmData = async (prompt: string): Promise<string> => {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini API key is not configured.');
  }

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 8192,
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `API request failed with status ${response.status}`);
    }

    const data = await response.json();
    
    // Extract the text content from the response
    if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
      return data.candidates[0].content.parts[0].text;
    } else {
      throw new Error('Unexpected response format from Gemini API.');
    }
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
};
