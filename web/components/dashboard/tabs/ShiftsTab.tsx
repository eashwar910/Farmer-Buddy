'use client';

import { useCallback, useEffect, useState } from 'react';

import { getSupabaseClient } from '@/lib/supabase';
import { ShiftCard } from '../ShiftCard';
import { ShiftDetailView } from '../ShiftDetailView';
import { EmptyState } from '../EmptyState';
import type { Shift, ShiftWithCounts } from '../types';

export function ShiftsTab() {
  const supabase = getSupabaseClient();
  const [shifts, setShifts] = useState<ShiftWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ShiftWithCounts | null>(null);

  const fetchShifts = useCallback(async () => {
    const { data: shiftData } = await supabase
      .from('shifts')
      .select('*')
      .order('started_at', { ascending: false });

    const { data: recData } = await supabase
      .from('recordings')
      .select('shift_id');

    const counts: Record<string, number> = {};
    (recData ?? []).forEach((r: { shift_id: string }) => {
      counts[r.shift_id] = (counts[r.shift_id] ?? 0) + 1;
    });

    setShifts(
      (shiftData ?? []).map((s: Shift & { ended_at?: string | null }) => ({
        ...s,
        ended_at: s.ended_at ?? null,
        recording_count: counts[s.id] ?? 0,
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchShifts();
    const channel = supabase
      .channel('shifts-tab-watch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, fetchShifts)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchShifts, supabase]);

  if (loading) {
    return (
      <div className="max-w-3xl space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 bg-fb-card rounded-xl border border-fb-border animate-pulse" />
        ))}
      </div>
    );
  }

  if (selected) {
    return (
      <ShiftDetailView
        shift={selected}
        onBack={() => setSelected(null)}
      />
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-fb-text">Shifts</h2>
        <span className="text-fb-subtext text-sm">{shifts.length} total</span>
      </div>

      {shifts.length === 0 ? (
        <EmptyState
          message="No shifts yet"
          sub="Shifts will appear here once started from the mobile app."
          icon="📋"
        />
      ) : (
        <div className="space-y-3">
          {shifts.map((shift) => (
            <ShiftCard key={shift.id} shift={shift} onClick={() => setSelected(shift)} />
          ))}
        </div>
      )}
    </div>
  );
}
