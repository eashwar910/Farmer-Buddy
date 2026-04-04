'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseClient } from '@/lib/supabase';
import WeatherWidget from '@/components/WeatherWidget';
import LiveStreamGrid from '@/components/LiveStreamGrid';
import AISummaryPanel from '@/components/AISummaryPanel';
import LeafDetection from '@/components/LeafDetection';
import AgronomistChat from '@/components/AgronomistChat';

interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface Employee {
  id: string;
  name: string;
  email: string;
}

interface Shift {
  id: string;
  status: 'active' | 'ended';
  started_at: string;
}

type TabKey = 'overview' | 'streams' | 'summaries' | 'leaf' | 'chat';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'overview', label: 'Overview', icon: '🏠' },
  { key: 'streams', label: 'Live Streams', icon: '📹' },
  { key: 'summaries', label: 'AI Summaries', icon: '🤖' },
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

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const init = async () => {
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
    const [empRes, shiftRes] = await Promise.all([
      supabase.from('users').select('id, name, email').eq('role', 'employee').order('name'),
      supabase
        .from('shifts')
        .select('id, status, started_at')
        .eq('status', 'active')
        .order('started_at', { ascending: false })
        .limit(1),
    ]);

    setEmployees((empRes.data as Employee[]) ?? []);
    setActiveShift(shiftRes.data?.[0] ?? null);

    // Supabase Presence channel
    const presenceChannel = supabase.channel('online-users');
    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState();
        const online: Record<string, boolean> = {};
        Object.values(state).forEach((presences) => {
          (presences as Array<{ user_id: string }>).forEach((p) => {
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
  };

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
              className="text-fb-red text-xs border border-fb-border hover:border-fb-red/50 rounded-lg px-3 py-1.5 transition-colors"
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

        {activeTab === 'summaries' && (
          <SummariesTab activeShift={activeShift} />
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
  employees,
  presenceMap,
  onlineCount,
  activeShift,
}: {
  employees: Employee[];
  presenceMap: Record<string, boolean>;
  onlineCount: number;
  activeShift: Shift | null;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left column */}
      <div className="lg:col-span-2 space-y-6">
        {/* Weather */}
        <section>
          <SectionHeader title="Weather" icon="🌤" />
          <WeatherWidget />
        </section>

        {/* Employee list */}
        <section>
          <SectionHeader
            title={`Employees (${employees.length})`}
            icon="👥"
            badge={onlineCount > 0 ? `${onlineCount} online` : undefined}
          />
          {employees.length === 0 ? (
            <EmptyState message="No employees found" sub="Employee accounts will appear here once created." />
          ) : (
            <div className="space-y-2">
              {employees.map((emp) => {
                const online = !!presenceMap[emp.id];
                return (
                  <div
                    key={emp.id}
                    className="flex items-center gap-3 bg-fb-card border border-fb-border rounded-xl p-4"
                  >
                    <div className="w-10 h-10 rounded-full bg-fb-accent/20 border border-fb-accent/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-fb-accent font-bold text-sm">
                        {emp.name?.charAt(0)?.toUpperCase() ?? '?'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-fb-text font-semibold text-sm truncate">{emp.name}</p>
                      <p className="text-fb-subtext text-xs truncate">{emp.email}</p>
                    </div>
                    <div
                      className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        online
                          ? 'bg-fb-accent/10 text-fb-accent border border-fb-accent/20'
                          : 'bg-fb-border/30 text-fb-subtext border border-fb-border'
                      }`}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${
                          online ? 'bg-fb-accent' : 'bg-fb-border'
                        }`}
                      />
                      {online ? 'Online' : 'Offline'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Right column */}
      <div className="space-y-6">
        {/* Shift status card */}
        <div
          className={`rounded-xl border p-5 ${
            activeShift
              ? 'bg-fb-accent/5 border-fb-accent/30'
              : 'bg-fb-card border-fb-border'
          }`}
        >
          <div className="flex items-center gap-2 mb-3">
            <div
              className={`w-2.5 h-2.5 rounded-full ${
                activeShift ? 'bg-fb-accent animate-pulse' : 'bg-fb-border'
              }`}
            />
            <span
              className={`text-xs font-bold tracking-wider uppercase ${
                activeShift ? 'text-fb-accent' : 'text-fb-subtext'
              }`}
            >
              {activeShift ? 'Shift Active' : 'No Active Shift'}
            </span>
          </div>
          {activeShift ? (
            <>
              <p className="text-fb-subtext text-xs">
                Started {new Date(activeShift.started_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
              <p className="text-fb-subtext/50 text-xs mt-1">
                Shift ID: {activeShift.id.slice(0, 8)}…
              </p>
            </>
          ) : (
            <p className="text-fb-subtext text-xs">
              Start a shift from the mobile app to begin monitoring.
            </p>
          )}
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard label="Employees" value={employees.length} icon="👷" />
          <StatCard label="Online Now" value={onlineCount} icon="🟢" accent />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Streams Tab ─────────────────── */

function StreamsTab({ activeShift }: { activeShift: Shift | null }) {
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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-fb-accent animate-pulse" />
        <span className="text-fb-accent text-sm font-semibold">Live — Shift Active</span>
      </div>
      <LiveStreamGrid shiftId={activeShift.id} />
    </div>
  );
}

/* ─────────────────── Summaries Tab ─────────────────── */

function SummariesTab({ activeShift }: { activeShift: Shift | null }) {
  if (!activeShift) {
    return (
      <EmptyState
        message="No active shift"
        sub="AI summaries appear here as employee video chunks are processed during an active shift."
        icon="🤖"
      />
    );
  }

  return (
    <div className="max-w-3xl">
      <p className="text-fb-subtext text-sm mb-4">
        AI-generated summaries update in real time as video chunks are processed.
      </p>
      <AISummaryPanel shiftId={activeShift.id} />
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

/* ─────────────────── Shared UI ─────────────────── */

function SectionHeader({
  title,
  icon,
  badge,
}: {
  title: string;
  icon: string;
  badge?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span>{icon}</span>
      <h3 className="text-sm font-bold text-fb-text">{title}</h3>
      {badge && (
        <span className="text-xs text-fb-accent bg-fb-accent/10 border border-fb-accent/20 rounded-full px-2 py-0.5">
          {badge}
        </span>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 text-center ${
        accent
          ? 'bg-fb-accent/5 border-fb-accent/20'
          : 'bg-fb-card border-fb-border'
      }`}
    >
      <div className="text-2xl mb-1">{icon}</div>
      <div
        className={`text-2xl font-bold ${accent ? 'text-fb-accent' : 'text-fb-text'}`}
      >
        {value}
      </div>
      <div className="text-fb-subtext text-xs mt-0.5">{label}</div>
    </div>
  );
}

function EmptyState({
  message,
  sub,
  icon = '📭',
}: {
  message: string;
  sub?: string;
  icon?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-4xl mb-4">{icon}</span>
      <p className="text-fb-text font-semibold">{message}</p>
      {sub && <p className="text-fb-subtext text-sm mt-2 max-w-sm">{sub}</p>}
    </div>
  );
}
