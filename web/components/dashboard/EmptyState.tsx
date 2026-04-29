export function EmptyState({
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
