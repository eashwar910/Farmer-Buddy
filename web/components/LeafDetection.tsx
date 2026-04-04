'use client';

import { useRef, useState } from 'react';

const DECISION_THRESHOLD = 0.6;

interface Prediction {
  label: string;
  confidence: number;
}

interface DetectionResult {
  disease_name: string;
  confidence: number;
  status: 'Healthy' | 'Diseased' | 'Uncertain';
  description: string;
  all_observations: { label: string; likelihood: string }[];
}

function decideDiseaseStatus(label: string, score: number): 'Healthy' | 'Diseased' | 'Uncertain' {
  const lower = label.toLowerCase();
  const isHealthy = lower.includes('healthy') || lower.includes('normal');
  if (isHealthy && score >= DECISION_THRESHOLD) return 'Healthy';
  if (isHealthy) return 'Uncertain';
  if (score >= DECISION_THRESHOLD) return 'Diseased';
  return 'Uncertain';
}

function buildDescription(label: string, status: string, confidence: number): string {
  if (status === 'Healthy')
    return `The plant appears healthy with ${Math.round(confidence * 100)}% confidence. No visible signs of disease detected.`;
  if (status === 'Diseased')
    return `Detected: ${label} with ${Math.round(confidence * 100)}% confidence. Consult an agronomist for treatment options.`;
  return `Results are inconclusive (${Math.round(confidence * 100)}% confidence). Consider taking a clearer photo or consulting an agronomist.`;
}

export default function LeafDetection() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setError(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      setImageUrl(dataUrl);
      setImageBase64(dataUrl); // full data URL includes mime type
    };
    reader.readAsDataURL(file);
  };

  const handleAnalyze = async () => {
    if (!imageBase64) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/leaf-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || 'Analysis failed');
      }

      const data = await res.json();
      const predictions: Prediction[] = data.predictions ?? [];

      if (predictions.length === 0) {
        throw new Error('No predictions returned. Try a clearer image.');
      }

      const top = predictions[0];
      const status = decideDiseaseStatus(top.label, top.confidence);
      const description = buildDescription(top.label, status, top.confidence);

      setResult({
        disease_name: top.label,
        confidence: top.confidence,
        status,
        description,
        all_observations: predictions.map((p) => ({
          label: p.label,
          likelihood: `${Math.round(p.confidence * 100)}%`,
        })),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setImageUrl(null);
    setImageBase64(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const statusColor = {
    Healthy: 'text-fb-accent border-fb-accent/30 bg-fb-accent/10',
    Diseased: 'text-fb-red border-fb-red/30 bg-fb-red/10',
    Uncertain: 'text-fb-yellow border-fb-yellow/30 bg-fb-yellow/10',
  };

  return (
    <div className="space-y-4">
      {/* Upload area */}
      {!imageUrl ? (
        <label className="block cursor-pointer">
          <div className="border-2 border-dashed border-fb-border hover:border-fb-accent/50 rounded-xl p-8 text-center transition-colors group">
            <div className="text-4xl mb-3">🌿</div>
            <p className="text-fb-text font-semibold text-sm">Upload a leaf image</p>
            <p className="text-fb-subtext text-xs mt-1">PNG, JPG or WEBP — click to browse</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>
      ) : (
        <div className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Leaf to analyze"
            className="w-full max-h-64 object-contain rounded-xl bg-black border border-fb-border"
          />
          <button
            onClick={handleReset}
            className="absolute top-2 right-2 bg-fb-card/90 border border-fb-border rounded-lg px-2 py-1 text-xs text-fb-subtext hover:text-fb-text transition-colors"
          >
            Change
          </button>
        </div>
      )}

      {/* Analyze button */}
      {imageBase64 && !result && (
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full bg-fb-accent hover:bg-fb-accent/90 disabled:opacity-60 disabled:cursor-not-allowed text-fb-bg font-bold py-3 rounded-xl text-sm transition-colors"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <LoadingSpinner size={16} />
              Analysing leaf…
            </span>
          ) : (
            '🔬 Analyse Leaf'
          )}
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="bg-fb-red/10 border border-fb-red/30 rounded-xl p-4">
          <p className="text-fb-red text-sm">{error}</p>
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="space-y-3">
          {/* Status badge */}
          <div
            className={`flex items-center gap-3 rounded-xl border p-4 ${
              statusColor[result.status]
            }`}
          >
            <span className="text-2xl">
              {result.status === 'Healthy' ? '✅' : result.status === 'Diseased' ? '🚨' : '⚠️'}
            </span>
            <div>
              <div className="font-bold text-base">{result.status}</div>
              <div className="text-xs opacity-75 mt-0.5">{result.disease_name}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xl font-bold">
                {Math.round(result.confidence * 100)}%
              </div>
              <div className="text-xs opacity-60">confidence</div>
            </div>
          </div>

          {/* Description */}
          <p className="text-fb-subtext text-sm leading-relaxed">{result.description}</p>

          {/* All predictions */}
          {result.all_observations.length > 1 && (
            <div className="bg-fb-card border border-fb-border rounded-xl p-3">
              <h4 className="text-xs font-bold text-fb-subtext uppercase tracking-wider mb-2">
                All Observations
              </h4>
              <div className="space-y-2">
                {result.all_observations.slice(0, 5).map((obs, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-fb-subtext truncate max-w-[70%]">{obs.label}</span>
                    <span className="text-fb-text font-semibold ml-2">{obs.likelihood}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleReset}
            className="w-full border border-fb-border hover:border-fb-accent/50 rounded-xl py-2.5 text-sm text-fb-subtext hover:text-fb-text transition-colors"
          >
            Analyse Another Image
          </button>
        </div>
      )}
    </div>
  );
}

function LoadingSpinner({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
