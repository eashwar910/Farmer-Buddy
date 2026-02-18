// LiveKit configuration
// Update LIVEKIT_URL after deploying your LiveKit server on Digital Ocean
export const LIVEKIT_URL = 'wss://livekit.farmerbuddy.site';

// Room name is derived from the shift ID for isolation
export function getRoomName(shiftId: string): string {
  return `shift-${shiftId}`;
}
