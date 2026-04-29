export type UserRole = 'manager' | 'employee' | 'gardener';

export type ShiftStatus = 'active' | 'ended';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Shift {
  id: string;
  manager_id: string;
  status: ShiftStatus;
  started_at: string;
  ended_at: string | null;
}

export interface Recording {
  id: string;
  shift_id: string;
  employee_id: string;
  egress_id: string | null;
  chunk_index: number;
  storage_url: string | null;
  status: 'recording' | 'completed' | 'failed';
  started_at: string;
  ended_at: string | null;
  summary: string | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed' | null;
}

export interface ShiftReport {
  employee_id: string;
  report_url: string;
}

export interface IoTReading {
  id: string;
  name: string;
  type: string;
  unit: string;
  reading: string;
  notes: string;
  category: string;
}

export interface IrrigationSchedule {
  frequency: string;
  time: string;
  duration: string;
  overnightAllowed: boolean;
  irrigationType: string;
}
