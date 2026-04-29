'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { getSupabaseClient } from '@/lib/supabase';
import WeatherWidget from '@/components/WeatherWidget';
import LeafDetection from '@/components/LeafDetection';
import AgronomistChat from '@/components/AgronomistChat';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Shift {
  id: string;
  status: 'active' | 'ended';
  started_at: string;
}

interface Recording {
  id: string;
  status: string;
  started_at: string;
}

type TabKey = 'overview' | 'leaf' | 'chat';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: '🏠' },
  { key: 'leaf', label: 'Leaf Detection', icon: '🌿' },
  { key: 'chat', label: 'Agronomist', icon: '💬' },
];

export default function EmployeeDashboard() {
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [myRecording, setMyRecording] = useState<Recording | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  const init = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace('/');
      return;
    }

    const { data: profileData } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profileData || profileData.role !== 'employee') {
      router.replace(profileData?.role === 'manager' ? '/dashboard' : '/');
      return;
    }

    setProfile(profileData);

    // Load active shift and my recording in parallel
    const [shiftRes, recRes] = await Promise.all([
      supabase
        .from('shifts')
        .select('id, status, started_at')
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1),
      supabase
        .from('recordings')
        .select('id, status, started_at')
        .eq('employee_id', user.id)
        .eq('status', 'recording')
        .limit(1),
    ]);

    setActiveShift(shiftRes.data?.[0] ?? null);
    setMyRecording(recRes.data?.[0] ?? null);

    // Realtime: watch shifts
    const shiftChannel = supabase
      .channel('employee-shift-watch')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shifts' },
        async () => {
          const { data } = await supabase
            .from('shifts')
            .select('id, status, started_at')
            .eq('status', 'active')
            .order('started_at', { ascending: false })
            .limit(1);
          setActiveShift(data?.[0] ?? null);
        },
      )
      .subscribe();

    // Realtime: watch my recordings
    const recChannel = supabase
      .channel(`employee-recordings-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'recordings',
          filter: `employee_id=eq.${user.id}`,
        },
        async () => {
          const { data } = await supabase
            .from('recordings')
            .select('id, status, started_at')
            .eq('employee_id', user.id)
            .eq('status', 'recording')
            .limit(1);
          setMyRecording(data?.[0] ?? null);
        },
      )
      .subscribe();

    setLoading(false);

    return () => {
      supabase.removeChannel(shiftChannel);
      supabase.removeChannel(recChannel);
    };
  }, [router, supabase]);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    init().then((fn) => { cleanup = fn; });
    return () => { cleanup?.(); };
  }, [init]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-fb-bg flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-fb-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-fb-subtext text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  const isStreaming = !!myRecording;

  return (
    <div className="min-h-screen bg-fb-bg">
      {/* Top nav */}
      <header className="sticky top-0 z-40 bg-fb-bg/95 backdrop-blur border-b border-fb-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🌿</span>
            <span className="font-bold text-fb-text hidden sm:block">Farmer Buddy</span>
            <span className="text-fb-border text-sm hidden sm:block">/</span>
            <span className="text-fb-subtext text-sm">Employee Dashboard</span>
          </div>

          <div className="flex items-center gap-3">
            {isStreaming && (
              <div className="hidden sm:flex items-center gap-1.5 bg-fb-alert/10 border border-fb-alert/30 rounded-full px-3 py-1">
                <div className="w-2 h-2 rounded-full bg-fb-alert animate-pulse" />
                <span className="text-fb-alert text-xs font-semibold">STREAMING</span>
              </div>
            )}
            <span className="text-fb-subtext text-sm hidden md:block">
              {profile?.name}
            </span>
            <button
              onClick={handleSignOut}
              className="text-fb-alert text-xs border border-fb-border hover:border-fb-alert/50 rounded-lg px-3 py-1.5 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto mb-6 pb-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-fb-accent/15 border border-fb-accent/30 text-fb-accent'
                  : 'text-fb-subtext hover:text-fb-text hover:bg-white/5'
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <OverviewTab
            profile={profile}
            activeShift={activeShift}
            isStreaming={isStreaming}
            myRecording={myRecording}
          />
        )}

        {activeTab === 'leaf' && (
          <FeatureTab title="Leaf Disease Detection" icon="🌿">
            <LeafDetection />
          </FeatureTab>
        )}

        {activeTab === 'chat' && (
          <FeatureTab title="Agronomist Chatbot" icon="💬">
            <AgronomistChat />
          </FeatureTab>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Overview Tab ─────────────────── */

function OverviewTab({
  profile,
  activeShift,
  isStreaming,
  myRecording,
}: {
  profile: UserProfile | null;
  activeShift: Shift | null;
  isStreaming: boolean;
  myRecording: Recording | null;
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Left */}
      <div className="space-y-6">
        {/* Welcome card */}
        <div className="bg-fb-card border border-fb-border rounded-xl p-5">
          <p className="text-fb-subtext text-sm">Welcome back,</p>
          <h1 className="text-2xl font-bold text-fb-text mt-0.5">{profile?.name ?? 'Employee'}</h1>
          <p className="text-fb-subtext text-xs mt-1">{profile?.email}</p>
        </div>

        {/* Weather */}
        <section>
          <h3 className="text-sm font-bold text-fb-text mb-3 flex items-center gap-2">
            <span>🌤</span> Weather
          </h3>
          <WeatherWidget />
        </section>
      </div>

      {/* Right */}
      <div className="space-y-6">
        {/* Shift status */}
        <section>
          <h3 className="text-sm font-bold text-fb-text mb-3 flex items-center gap-2">
            <span>📋</span> Shift Status
          </h3>
          <div
            className={`rounded-xl border p-5 ${
              activeShift
                ? 'bg-fb-accent/5 border-fb-accent/30'
                : 'bg-fb-card border-fb-border'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  activeShift ? 'bg-fb-accent animate-pulse' : 'bg-fb-border'
                }`}
              />
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  activeShift ? 'text-fb-accent' : 'text-fb-subtext'
                }`}
              >
                {activeShift ? 'Shift Active' : 'No Active Shift'}
              </span>
            </div>
            {activeShift ? (
              <p className="text-fb-subtext text-sm">
                Your shift started at{' '}
                {new Date(activeShift.started_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                . Use the mobile app to start streaming your bodycam.
              </p>
            ) : (
              <p className="text-fb-subtext text-sm">
                Your manager has not started a shift yet. You will be notified when one begins.
              </p>
            )}
          </div>
        </section>

        {/* Stream status */}
        <section>
          <h3 className="text-sm font-bold text-fb-text mb-3 flex items-center gap-2">
            <span>📹</span> Stream Status
          </h3>
          <div
            className={`rounded-xl border p-5 ${
              isStreaming
                ? 'bg-fb-alert/5 border-fb-alert/30'
                : 'bg-fb-card border-fb-border'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  isStreaming ? 'bg-fb-alert animate-pulse' : 'bg-fb-border'
                }`}
              />
              <span
                className={`text-xs font-bold uppercase tracking-wider ${
                  isStreaming ? 'text-fb-alert' : 'text-fb-subtext'
                }`}
              >
                {isStreaming ? 'Streaming Live' : 'Not Streaming'}
              </span>
            </div>
            {isStreaming ? (
              <>
                <p className="text-fb-subtext text-sm">
                  Your bodycam stream is active. Your manager can view it live from the web dashboard.
                </p>
                {myRecording?.started_at && (
                  <p className="text-fb-subtext/60 text-xs mt-2">
                    Started at{' '}
                    {new Date(myRecording.started_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                )}
                <div className="mt-3 bg-fb-bg border border-fb-border rounded-lg px-3 py-2.5">
                  <p className="text-fb-subtext text-xs">
                    💡 Managers can also view your stream at{' '}
                    <span className="text-fb-accent font-medium">farmerbuddy.site/dashboard</span>
                  </p>
                </div>
              </>
            ) : (
              <p className="text-fb-subtext text-sm">
                Streaming is done via the mobile app bodycam. Start streaming from your phone to begin your work session.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/* ─────────────────── Generic Feature Tab ─────────────────── */

function FeatureTab({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-5">
        <span className="text-xl">{icon}</span>
        <h2 className="text-lg font-bold text-fb-text">{title}</h2>
      </div>
      {children}
    </div>
  );
}
