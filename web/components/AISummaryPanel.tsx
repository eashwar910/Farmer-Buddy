'use client';

import { useCallback, useEffect, useState } from 'react';

import { getSupabaseClient } from '@/lib/supabase';

interface ChunkSummary {
  id: string;
  chunk_index: number;
  started_at: string | null;
  ended_at: string | null;
  summary: string | null;
  processing_status: string | null;
  employee?: { id: string; name: string };
}

interface ParsedSummary {
  executive_summary?: string;
  timeline?: { time_estimate: string; activity: string }[];
  notable_events?: { description: string; significance: string }[];
  safety_compliance?: { concerns: string[]; positive_observations: string[] };
  overall_assessment?: string;
  note?: string;
}

interface AISummaryPanelProps {
  shiftId: string;
}

export default function AISummaryPanel({ shiftId }: AISummaryPanelProps) {
  const [chunks, setChunks] = useState<ChunkSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchSummaries = useCallback(async () => {
    const supabase = getSupabaseClient();

    // Get recordings for the shift
    const { data: recordings } = await supabase
      .from('recordings')
      .select('id, employee_id')
      .eq('shift_id', shiftId);

    if (!recordings || recordings.length === 0) {
      setChunks([]);
      setLoading(false);
      return;
    }

    const recordingIds = recordings.map((r: { id: string }) => r.id);

    // Get employees
    const employeeIds = [...new Set(recordings.map((r: { employee_id: string }) => r.employee_id))];
    const { data: employees } = await supabase
      .from('users')
      .select('id, name')
      .in('id', employeeIds);

    const employeeMap: Record<string, { id: string; name: string }> = {};
    (employees ?? []).forEach((e: { id: string; name: string }) => {
      employeeMap[e.id] = e;
    });

    // Get all chunks (pending/processing/completed/failed) to match mobile app view
    const { data: chunkData } = await supabase
      .from('recording_chunks')
      .select('id, chunk_index, started_at, ended_at, summary, processing_status, recording_id')
      .in('recording_id', recordingIds)
      .order('started_at', { ascending: false });

    if (chunkData) {
      const enriched = chunkData.map((c: ChunkSummary & { recording_id: string }) => {
        const rec = recordings.find((r: { id: string; employee_id: string }) => r.id === c.recording_id);
        return {
          ...c,
          employee: rec ? employeeMap[rec.employee_id] : undefined,
        };
      });
      setChunks(enriched);
    }

    setLoading(false);
  }, [shiftId]);

  useEffect(() => {
    if (!shiftId) return;
    fetchSummaries();

    const supabase = getSupabaseClient();
    const channel = supabase
      .channel(`ai-summaries-${shiftId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recording_chunks',
        },
        () => fetchSummaries(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [shiftId, fetchSummaries]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-20 bg-fb-card rounded-xl border border-fb-border animate-pulse" />
        ))}
      </div>
    );
  }

  if (chunks.length === 0) {
    return (
      <div className="bg-fb-card rounded-xl border border-fb-border p-6 text-center">
        <p className="text-fb-subtext text-sm">No recordings yet.</p>
        <p className="text-fb-subtext/50 text-xs mt-1">
          Chunks appear here once employees start streaming.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
      {chunks.map((chunk) => (
        <SummaryCard
          key={chunk.id}
          chunk={chunk}
          expanded={expanded === chunk.id}
          onToggle={() => setExpanded(expanded === chunk.id ? null : chunk.id)}
        />
      ))}
    </div>
  );
}

function SummaryCard({
  chunk,
  expanded,
  onToggle,
}: {
  chunk: ChunkSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isCompleted = chunk.processing_status === 'completed';
  const isProcessing = chunk.processing_status === 'processing';
  const isFailed = chunk.processing_status === 'failed';
  const parsed = isCompleted ? parseSummary(chunk.summary) : null;

  const timeLabel = chunk.started_at
    ? new Date(chunk.started_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : `Chunk ${chunk.chunk_index + 1}`;

  const statusBadge = isCompleted ? null : isProcessing ? (
    <span className="text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-full px-2 py-0.5">
      Processing…
    </span>
  ) : isFailed ? (
    <span className="text-xs text-fb-alert bg-fb-alert/10 border border-fb-alert/20 rounded-full px-2 py-0.5">
      Failed
    </span>
  ) : (
    <span className="text-xs text-fb-subtext bg-fb-card border border-fb-border rounded-full px-2 py-0.5">
      Pending
    </span>
  );

  return (
    <div className={`bg-fb-card border rounded-xl overflow-hidden ${isFailed ? 'border-fb-alert/30 opacity-70' : 'border-fb-border'}`}>
      {/* Header */}
      <button
        onClick={isCompleted ? onToggle : undefined}
        className={`w-full flex items-center justify-between p-4 text-left transition-colors ${isCompleted ? 'hover:bg-white/5 cursor-pointer' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isCompleted ? 'bg-fb-accent/15 border border-fb-accent/30' :
            isProcessing ? 'bg-amber-400/10 border border-amber-400/20' :
            isFailed ? 'bg-fb-alert/10 border border-fb-alert/20' :
            'bg-fb-border/30 border border-fb-border'
          }`}>
            {isProcessing ? (
              <div className="w-3 h-3 border border-amber-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-xs font-bold text-fb-accent">AI</span>
            )}
          </div>
          <div className="min-w-0">
            <div className="text-fb-text text-sm font-semibold flex items-center gap-2 flex-wrap">
              {chunk.employee?.name ?? 'Employee'} — {timeLabel}
              {statusBadge}
            </div>
            <div className="text-fb-subtext text-xs mt-0.5 line-clamp-1">
              {isCompleted
                ? (parsed?.executive_summary ?? 'Summary ready')
                : isProcessing
                ? 'AI is processing this recording…'
                : isFailed
                ? 'AI processing failed for this chunk'
                : 'Summary will be generated automatically'}
            </div>
          </div>
        </div>
        {isCompleted && (
          <span className="text-fb-subtext text-lg ml-3 flex-shrink-0">{expanded ? '∧' : '∨'}</span>
        )}
      </button>

      {/* Expanded content */}
      {expanded && parsed && (
        <div className="px-4 pb-4 space-y-4 border-t border-fb-border pt-4">
          {parsed.executive_summary && (
            <Section title="Executive Summary" icon="📋">
              <p className="text-fb-subtext text-sm leading-relaxed">{parsed.executive_summary}</p>
            </Section>
          )}

          {parsed.timeline && parsed.timeline.length > 0 && (
            <Section title="Timeline" icon="⏱">
              <div className="space-y-2">
                {parsed.timeline.map((item, i) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <span className="text-fb-accent font-mono text-xs whitespace-nowrap mt-0.5">
                      {item.time_estimate}
                    </span>
                    <span className="text-fb-subtext">{item.activity}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {parsed.notable_events && parsed.notable_events.length > 0 && (
            <Section title="Notable Events" icon="⚠️">
              <div className="space-y-2">
                {parsed.notable_events.map((ev, i) => (
                  <div key={i} className="bg-fb-warn/5 border border-fb-warn/20 rounded-lg p-3 text-sm">
                    <p className="text-fb-text">{ev.description}</p>
                    {ev.significance && (
                      <p className="text-fb-subtext text-xs mt-1">{ev.significance}</p>
                    )}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {parsed.safety_compliance && (
            <Section title="Safety & Compliance" icon="🛡">
              <div className="space-y-2">
                {parsed.safety_compliance.concerns?.map((c, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="text-fb-alert mt-0.5">✕</span>
                    <span className="text-fb-subtext">{c}</span>
                  </div>
                ))}
                {parsed.safety_compliance.positive_observations?.map((p, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="text-fb-accent mt-0.5">✓</span>
                    <span className="text-fb-subtext">{p}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {parsed.overall_assessment && (
            <Section title="Overall Assessment" icon="📊">
              <p className="text-fb-subtext text-sm leading-relaxed">{parsed.overall_assessment}</p>
            </Section>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs font-bold text-fb-subtext uppercase tracking-wider mb-2 flex items-center gap-1.5">
        <span>{icon}</span>
        {title}
      </h4>
      {children}
    </div>
  );
}

function parseSummary(raw: string | null): ParsedSummary | null {
  if (!raw) return null;
  try {
    // Strip markdown fences if present
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    const parsed = JSON.parse(cleaned);
    // Handle double-stringified
    if (typeof parsed === 'string') return JSON.parse(parsed);
    return parsed as ParsedSummary;
  } catch {
    // Return raw text as executive summary
    return { executive_summary: raw };
  }
}
