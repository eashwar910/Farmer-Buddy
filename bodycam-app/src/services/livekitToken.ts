import { supabase } from "./supabase";

interface TokenResponse {
  token: string;
  room: string;
  identity: string;
}

export async function fetchLiveKitToken(
  shiftId: string,
): Promise<TokenResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Not authenticated");
  }

  const { data, error } = await supabase.functions.invoke(
    "generate-livekit-token",
    {
      body: { shiftId },
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  );

  if (error) {
    throw new Error(error.message || "Failed to generate token");
  }

  if (!data?.token) {
    throw new Error("No token returned");
  }

  return data as TokenResponse;
}
