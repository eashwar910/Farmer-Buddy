export interface Employee {
  id: string;
  name: string;
  email: string;
}

export interface Shift {
  id: string;
  status: 'active' | 'ended';
  started_at: string;
  ended_at?: string | null;
}

export interface ShiftWithCounts {
  id: string;
  status: 'active' | 'ended';
  started_at: string;
  ended_at: string | null;
  recording_count: number;
}
