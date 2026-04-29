import LiveStreamGrid from '@/components/LiveStreamGrid';
import { EmptyState } from '../EmptyState';
import type { Shift } from '../types';

export function StreamsTab({ activeShift }: { activeShift: Shift | null }) {
  if (!activeShift) {
    return (
      <EmptyState
        message="No active shift"
        sub="Live streams appear here when a shift is running and employees are streaming."
        icon="📹"
      />
    );
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-fb-accent animate-pulse" />
        <span className="text-fb-accent text-sm font-semibold">Live — Shift Active</span>
      </div>
      <LiveStreamGrid shiftId={activeShift.id} />
    </div>
  );
}
