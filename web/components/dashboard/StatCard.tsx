export function StatCard({
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
      <div className={`text-2xl font-bold ${accent ? 'text-fb-accent' : 'text-fb-text'}`}>
        {value}
      </div>
      <div className="text-fb-subtext text-xs mt-0.5">{label}</div>
    </div>
  );
}
