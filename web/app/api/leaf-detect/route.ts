import { NextRequest, NextResponse } from 'next/server';

const HF_SPACE_URL =
  'https://moazx-plant-leaf-diseases-detection-using-cnn.hf.space';
const MAX_POLL_ATTEMPTS = 60;
const POLL_INTERVAL_MS = 1000;

export async function POST(request: NextRequest) {
  let body: { imageBase64: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { imageBase64 } = body;
  if (!imageBase64) {
    return NextResponse.json({ error: 'imageBase64 required' }, { status: 400 });
  }

  // The HF Space expects a data URL (data:<mime>;base64,<data>) or just base64
  // Normalise: ensure it's a proper data URL
  const dataUrl = imageBase64.startsWith('data:')
    ? imageBase64
    : `data:image/jpeg;base64,${imageBase64}`;

  try {
    // Step 1: Join the queue
    const joinRes = await fetch(`${HF_SPACE_URL}/api/queue/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [dataUrl], fn_index: 0 }),
    });

    if (!joinRes.ok) {
      // Fallback: try direct predict endpoint
      return await directPredict(dataUrl);
    }

    const joinData = await joinRes.json();
    const eventId = joinData?.event_id as string | undefined;

    if (!eventId) {
      return await directPredict(dataUrl);
    }

    // Step 2: Poll for result
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await sleep(POLL_INTERVAL_MS);

      const statusRes = await fetch(`${HF_SPACE_URL}/api/queue/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: eventId }),
      });

      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();

      if (statusData?.status === 'COMPLETE' && statusData?.data) {
        const predictions = parseHFOutput(statusData.data);
        return NextResponse.json({ predictions });
      }

      if (statusData?.status === 'ERROR' || statusData?.status === 'FAILED') {
        break;
      }
    }

    // Fallback to direct predict if queue failed
    return await directPredict(dataUrl);
  } catch (err) {
    console.error('leaf-detect route error:', err);
    return NextResponse.json(
      { error: 'Detection service unavailable. Try again.' },
      { status: 502 },
    );
  }
}

async function directPredict(dataUrl: string): Promise<NextResponse> {
  const res = await fetch(`${HF_SPACE_URL}/api/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: [dataUrl] }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `HF Space error: ${text}` }, { status: 502 });
  }

  const data = await res.json();
  const predictions = parseHFOutput(data?.data ?? data);
  return NextResponse.json({ predictions });
}

function parseHFOutput(raw: unknown): { label: string; confidence: number }[] {
  // HF Spaces output varies — try common shapes
  if (!raw) return [];

  // Shape: [{ label, confidence }]
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first && typeof first === 'object' && 'label' in first) {
      return (raw as Array<{ label: string; confidence: number }>).map((p) => ({
        label: p.label ?? '',
        confidence: typeof p.confidence === 'number' ? p.confidence : 0,
      }));
    }

    // Shape: [[label, score], ...]
    if (Array.isArray(first)) {
      return (raw as Array<[string, number]>).map(([label, confidence]) => ({
        label,
        confidence,
      }));
    }

    // Shape: [{ confidences: [{ label, confidence }] }]
    if (first && typeof first === 'object' && 'confidences' in first) {
      const confidences = (first as { confidences: Array<{ label: string; confidence: number }> }).confidences;
      return (confidences ?? []).map((c) => ({
        label: c.label ?? '',
        confidence: typeof c.confidence === 'number' ? c.confidence : 0,
      }));
    }
  }

  return [];
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
