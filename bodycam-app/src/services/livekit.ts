import { LIVEKIT_URL as LIVEKIT_URL_ENV } from '@env';

// LiveKit configuration - loaded from environment variables
export const LIVEKIT_URL = LIVEKIT_URL_ENV;

// Room name is derived from the shift ID for isolation
export function getRoomName(shiftId: string): string {
  return `shift-${shiftId}`;
}
