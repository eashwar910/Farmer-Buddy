import type { ReactNode } from 'react';

export function FeatureTab({
  title,
  icon,
  children,
}: {
  title: string;
  icon: string;
  children: ReactNode;
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
