'use client';

import { useCallback, useEffect, useState } from 'react';

import { getSupabaseClient } from '@/lib/supabase';
import AISummaryPanel from '@/components/AISummaryPanel';
import { shiftFormatDate, shiftFormatTime, shiftFormatDuration } from '@/lib/format';
import type { ShiftWithCounts } from './types';

export function ShiftDetailView({ shift, onBack }: { shift: ShiftWithCounts; onBack: () => void }) {
  const supabase = getSupabaseClient();
  const [employees, setEmployees] = useState<Array<{ id: string; name: string }>>([]);
  const [reports, setReports] = useState<Array<{ employee_id: string; report_url: string }>>([]);
  const [generating, setGenerating] = useState<string | null>(null);

  const fetchDetail = useCallback(async () => {
    const [{ data: recs }, { data: reportData }] = await Promise.all([
      supabase.from('recordings').select('employee_id').eq('shift_id', shift.id),
      supabase.from('shift_reports').select('employee_id, report_url').eq('shift_id', shift.id),
    ]);

    if (recs && recs.length > 0) {
      const empIds = [...new Set((recs as { employee_id: string }[]).map((r) => r.employee_id))];
      const { data: empData } = await supabase
        .from('users').select('id, name').in('id', empIds);
      setEmployees((empData ?? []) as { id: string; name: string }[]);
    }
    setReports((reportData ?? []) as { employee_id: string; report_url: string }[]);
  }, [shift.id, supabase]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleGenerateReport = async (employeeId: string) => {
    setGenerating(employeeId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/generate-shift-report`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ shiftId: shift.id, employeeId }),
        }
      );
      if (res.ok) await fetchDetail();
    } finally {
      setGenerating(null);
    }
  };

  const isEnded = shift.status === 'ended';

  return (
    <div className="max-w-3xl">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-fb-subtext hover:text-fb-text text-sm mb-5 transition-colors"
      >
        ← Back to Shifts
      </button>

      {/* Shift header */}
      <div className={`rounded-xl border p-4 mb-5 ${
        shift.status === 'active'
          ? 'border-fb-accent/30 bg-fb-accent/5'
          : 'border-fb-border bg-fb-card'
      }`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="font-bold text-fb-text">{shiftFormatDate(shift.started_at)}</p>
            <p className="text-fb-subtext text-sm mt-1">
              {shiftFormatTime(shift.started_at)}
              {shift.ended_at ? ` – ${shiftFormatTime(shift.ended_at)}` : ' – ongoing'}
            </p>
          </div>
          <div className={`rounded-full px-3 py-1 text-xs font-bold border ${
            shift.status === 'active'
              ? 'bg-fb-accent/10 text-fb-accent border-fb-accent/30'
              : 'bg-fb-border/20 text-fb-subtext border-fb-border'
          }`}>
            {shift.status === 'active' ? 'ACTIVE' : 'ENDED'}
          </div>
        </div>
        <div className="flex gap-6 mt-3 pt-3 border-t border-fb-border">
          <div>
            <p className="text-fb-text font-bold">{shiftFormatDuration(shift.started_at, shift.ended_at)}</p>
            <p className="text-fb-subtext text-xs">Duration</p>
          </div>
          <div>
            <p className="text-fb-text font-bold">{shift.recording_count}</p>
            <p className="text-fb-subtext text-xs">Recordings</p>
          </div>
        </div>
      </div>

      {/* AI Summaries */}
      <div className="mb-6">
        <h3 className="text-xs font-bold text-fb-subtext uppercase tracking-wider mb-3">AI Summaries</h3>
        <AISummaryPanel shiftId={shift.id} />
      </div>

      {/* Shift Reports — only for ended shifts with employees */}
      {isEnded && employees.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-fb-subtext uppercase tracking-wider mb-3">Shift Reports</h3>
          <div className="space-y-2">
            {employees.map((emp) => {
              const report = reports.find((r) => r.employee_id === emp.id);
              const isGen = generating === emp.id;
              return (
                <div
                  key={emp.id}
                  className="flex items-center justify-between bg-fb-card border border-fb-border rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-fb-accent/20 border border-fb-accent/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-fb-accent text-xs font-bold">
                        {emp.name?.charAt(0)?.toUpperCase() ?? '?'}
                      </span>
                    </div>
                    <span className="text-fb-text text-sm font-semibold">{emp.name}</span>
                  </div>
                  {report ? (
                    <a
                      href={report.report_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-fb-accent border border-fb-accent/30 bg-fb-accent/10 rounded-lg px-3 py-1.5 hover:bg-fb-accent/20 transition-colors"
                    >
                      View Report
                    </a>
                  ) : (
                    <button
                      onClick={() => handleGenerateReport(emp.id)}
                      disabled={!!isGen}
                      className="text-xs font-semibold text-fb-text border border-fb-border bg-fb-bg rounded-lg px-3 py-1.5 hover:bg-white/5 disabled:opacity-50 transition-colors"
                    >
                      {isGen ? 'Generating…' : 'Generate Report'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
