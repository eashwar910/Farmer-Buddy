import { NextRequest, NextResponse } from 'next/server';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PREAMBLE = `You are an expert agronomist AI assistant for Farmer Buddy, an agricultural workforce management platform.

Your role:
- Answer questions about crops, plant diseases, pest management, irrigation, soil health, weather impacts, harvest timing, and farm operations
- Provide practical, actionable advice grounded in real agricultural science
- If asked about something outside agriculture and farming, politely redirect to farm-related topics
- Keep responses clear and relevant for farm managers and field workers

Respond in a helpful, professional tone. Use markdown formatting where appropriate.`;

interface HistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server misconfiguration: missing GEMINI_API_KEY' }, { status: 500 });
  }

  let body: {
    message: string;
    history?: HistoryMessage[];
    imageBase64?: string | null;
    imageMimeType?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { message, history = [], imageBase64, imageMimeType } = body;

  if (!message && !imageBase64) {
    return NextResponse.json({ error: 'message or image required' }, { status: 400 });
  }

  // Build conversation history for Gemini (contents array)
  const contents: Array<{
    role: 'user' | 'model';
    parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
  }> = [];

  // Add prior history
  for (const msg of history) {
    contents.push({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.text }],
    });
  }

  // Build the current user turn
  const userParts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

  // Prepend system context on first message
  if (contents.length === 0) {
    userParts.push({ text: SYSTEM_PREAMBLE + '\n\n' + (message || '') });
  } else {
    if (message) userParts.push({ text: message });
  }

  if (imageBase64 && imageMimeType) {
    userParts.push({
      inlineData: { mimeType: imageMimeType, data: imageBase64 },
    });
    if (!message) {
      userParts.unshift({ text: 'Please analyse this image from an agricultural perspective.' });
    }
  }

  contents.push({ role: 'user', parts: userParts });

  const geminiBody = {
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
    },
  };

  try {
    const res = await fetch(
      `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      console.error('Gemini API error:', text);
      return NextResponse.json({ error: 'Gemini API request failed' }, { status: 502 });
    }

    const data = await res.json();
    const reply =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ??
      'I could not generate a response. Please try again.';

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('Chat route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
