import WeatherWidget from '@/components/WeatherWidget';
import { SectionHeader } from '../SectionHeader';
import { EmptyState } from '../EmptyState';
import { StatCard } from '../StatCard';
import type { Employee, Shift } from '../types';

export function OverviewTab({
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
