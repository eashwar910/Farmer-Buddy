import { shiftFormatDate, shiftFormatTime, shiftFormatDuration } from '@/lib/format';
import type { ShiftWithCounts } from './types';

export function ShiftCard({ shift, onClick }: { shift: ShiftWithCounts; onClick: () => void }) {
  const isActive = shift.status === 'active';
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded-xl border p-4 transition-colors hover:bg-white/5 ${
        isActive ? 'border-fb-accent/30 bg-fb-accent/5' : 'border-fb-border bg-fb-card'
      }`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-bold text-fb-text text-sm">{shiftFormatDate(shift.started_at)}</p>
          <p className="text-fb-subtext text-xs mt-0.5">
            {shiftFormatTime(shift.started_at)}
            {shift.ended_at ? ` – ${shiftFormatTime(shift.ended_at)}` : ''}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
          isActive ? 'bg-fb-accent/10 text-fb-accent' : 'bg-fb-border/30 text-fb-subtext'
        }`}>
          {isActive && <div className="w-1.5 h-1.5 rounded-full bg-fb-accent animate-pulse" />}
          {isActive ? 'ACTIVE' : 'ENDED'}
        </div>
      </div>

      <div className="flex bg-fb-bg rounded-lg overflow-hidden">
        <div className="flex-1 text-center py-3">
          <p className="font-bold text-fb-text">{shiftFormatDuration(shift.started_at, shift.ended_at)}</p>
          <p className="text-fb-subtext text-xs mt-0.5">Duration</p>
        </div>
        <div className="w-px bg-fb-border" />
        <div className="flex-1 text-center py-3">
          <p className="font-bold text-fb-text">{shift.recording_count}</p>
          <p className="text-fb-subtext text-xs mt-0.5">
            Recording{shift.recording_count !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
    </button>
  );
}
