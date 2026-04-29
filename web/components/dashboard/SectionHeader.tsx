export function SectionHeader({
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
