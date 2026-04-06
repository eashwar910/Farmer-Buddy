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
