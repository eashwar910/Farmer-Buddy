'use client';

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  imageUrl?: string;
}

const THINKING_PHRASES = [
  'Checking crop conditions…',
  'Consulting agronomist database…',
  'Analysing field data…',
  'Reviewing soil data…',
  'Processing your question…',
  'Checking weather patterns…',
  'Reviewing pest databases…',
  'Consulting disease models…',
  'Analysing irrigation data…',
  'Reviewing harvest guidelines…',
];

export default function AgronomistChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkingPhrase, setThinkingPhrase] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const clearImage = () => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed && !imageFile) return;
    if (loading) return;

    // Build user message
    const userMessage: Message = {
      role: 'user',
      text: trimmed,
      imageUrl: imagePreview ?? undefined,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    clearImage();
    setLoading(true);

    // Pick a random thinking phrase
    setThinkingPhrase(THINKING_PHRASES[Math.floor(Math.random() * THINKING_PHRASES.length)]);

    try {
      // Build history for the API (text only — images are inline)
      const history = messages
        .slice(-10) // last 10 messages for context
        .map((m) => ({ role: m.role, text: m.text }));

      let imageBase64: string | null = null;
      let imageMimeType: string | null = null;

      if (imageFile) {
        imageBase64 = await fileToBase64(imageFile);
        imageMimeType = imageFile.type;
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          history,
          imageBase64,
          imageMimeType,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Request failed');
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: data.reply ?? 'No response received.' },
      ]);
    } catch (err: unknown) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Sorry, I encountered an error: ${err instanceof Error ? err.message : 'Unknown error'}. Please try again.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[500px] bg-fb-card border border-fb-border rounded-xl overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="text-4xl mb-3">🌾</div>
            <p className="text-fb-text font-semibold text-sm">Agronomist Assistant</p>
            <p className="text-fb-subtext text-xs mt-1 max-w-xs">
              Ask about crops, diseases, pests, irrigation, soil health, weather impacts, and more.
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-fb-accent/20 border border-fb-accent/30 text-fb-text rounded-br-sm'
                  : 'bg-fb-bg border border-fb-border text-fb-text rounded-bl-sm'
              }`}
            >
              {msg.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={msg.imageUrl}
                  alt="Attached"
                  className="rounded-lg max-h-40 mb-2 object-contain"
                />
              )}
              {msg.role === 'assistant' ? (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap leading-relaxed">{msg.text}</p>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-fb-bg border border-fb-border rounded-2xl rounded-bl-sm px-4 py-3 text-sm">
              <div className="flex items-center gap-2 text-fb-subtext">
                <LoadingDots />
                <span className="text-xs">{thinkingPhrase}</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Image preview */}
      {imagePreview && (
        <div className="px-4 pb-2 flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imagePreview}
            alt="Preview"
            className="h-12 w-12 object-cover rounded-lg border border-fb-border"
          />
          <button onClick={clearImage} className="text-fb-subtext hover:text-fb-alert text-xs transition-colors">
            Remove
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-fb-border p-3 flex items-end gap-2">
        {/* Image attach */}
        <label className="flex-shrink-0 cursor-pointer text-fb-subtext hover:text-fb-accent transition-colors p-2 rounded-lg hover:bg-white/5">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
        </label>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about crops, diseases, pests…"
          rows={1}
          className="flex-1 resize-none bg-fb-bg border border-fb-border rounded-xl px-3 py-2.5 text-sm text-fb-text placeholder-fb-subtext/50 focus:outline-none focus:border-fb-accent focus:ring-1 focus:ring-fb-accent transition-colors max-h-32 overflow-y-auto"
          style={{ minHeight: '40px' }}
          disabled={loading}
        />

        <button
          onClick={handleSend}
          disabled={loading || (!input.trim() && !imageFile)}
          className="flex-shrink-0 bg-fb-accent hover:bg-fb-accent/90 disabled:opacity-40 disabled:cursor-not-allowed text-fb-bg font-bold p-2.5 rounded-xl transition-colors"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function LoadingDots() {
  return (
    <div className="flex gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-fb-subtext animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
