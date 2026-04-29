'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { getSupabaseClient } from '@/lib/supabase';
import LeafDetection from '@/components/LeafDetection';
import AgronomistChat from '@/components/AgronomistChat';
import {
  OverviewTab,
  StreamsTab,
  ShiftsTab,
  FeatureTab,
} from '@/components/dashboard';
import type { Employee, Shift } from '@/components/dashboard';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

type TabKey = 'overview' | 'streams' | 'shifts' | 'leaf' | 'chat';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: '🏠' },
  { key: 'streams', label: 'Live Streams', icon: '📹' },
  { key: 'shifts', label: 'Shifts', icon: '📋' },
  { key: 'leaf', label: 'Leaf Detection', icon: '🌿' },
  { key: 'chat', label: 'Agronomist', icon: '💬' },
];

export default function ManagerDashboard() {
  const router = useRouter();
  const supabase = getSupabaseClient();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({});
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
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

    if (!profileData || profileData.role !== 'manager') {
      router.replace(profileData?.role === 'employee' ? '/employee' : '/');
      return;
    }

    setProfile(profileData);

    // Load employees and active shift in parallel
    const [empRes, activeShiftRes] = await Promise.all([
      supabase.from('users').select('id, name, email').eq('role', 'employee').order('name'),
      supabase
        .from('shifts')
        .select('id, status, started_at')
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1),
    ]);

    setEmployees((empRes.data as Employee[]) ?? []);
    const active = activeShiftRes.data?.[0] ?? null;
    setActiveShift(active);

    // Supabase Presence channel
    const presenceChannel = supabase.channel('online-users');
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const online: Record<string, boolean> = {};
        Object.values(state).forEach((presences) => {
          (presences as unknown as Array<{ user_id: string }>).forEach((p) => {
            online[p.user_id] = true;
          });
        });
        setPresenceMap(online);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await presenceChannel.track({
            user_id: user.id,
            online_at: new Date().toISOString(),
          });
        }
      });

    // Real-time: watch for shift changes
    const shiftChannel = supabase
      .channel('shift-watch')
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

    setLoading(false);

    return () => {
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(shiftChannel);
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
          <p className="text-fb-subtext text-sm">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  const onlineCount = employees.filter((e) => presenceMap[e.id]).length;

  return (
    <div className="min-h-screen bg-fb-bg">
      {/* Top nav */}
      <header className="sticky top-0 z-40 bg-fb-bg/95 backdrop-blur border-b border-fb-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">🌿</span>
            <span className="font-bold text-fb-text hidden sm:block">Farmer Buddy</span>
            <span className="text-fb-border text-sm hidden sm:block">/</span>
            <span className="text-fb-subtext text-sm">Manager Dashboard</span>
          </div>

          <div className="flex items-center gap-3">
            {activeShift && (
              <div className="hidden sm:flex items-center gap-1.5 bg-fb-accent/10 border border-fb-accent/30 rounded-full px-3 py-1">
                <div className="w-2 h-2 rounded-full bg-fb-accent animate-pulse" />
                <span className="text-fb-accent text-xs font-semibold">SHIFT ACTIVE</span>
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

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
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

        {/* Tab content */}
        {activeTab === 'overview' && (
          <OverviewTab
            employees={employees}
            presenceMap={presenceMap}
            onlineCount={onlineCount}
            activeShift={activeShift}
          />
        )}

        {activeTab === 'streams' && (
          <StreamsTab activeShift={activeShift} />
        )}

        {activeTab === 'shifts' && (
          <ShiftsTab />
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
