import { ShieldCheck, Clock3, Files } from 'lucide-react';

const iconMap = {
  timeline: Clock3,
  document: Files,
  status: ShieldCheck
};

export function AuthMarketingPanel({ compact = false }: { compact?: boolean }) {
  const benefits: Array<{ icon: keyof typeof iconMap; label: string }> = compact
    ? [
        { icon: 'timeline', label: 'All farm activity in one timeline' },
        { icon: 'document', label: 'Fast proof uploads and records' },
        { icon: 'status', label: 'Clear task and incident statuses' }
      ]
    : [
        { icon: 'timeline', label: 'All farm activity in one timeline' },
        { icon: 'document', label: 'Fast proof uploads and records' },
        { icon: 'status', label: 'Clear task and incident statuses' }
      ];

  return (
    <aside className="relative overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-black via-zinc-950 to-black p-6 text-white shadow-[0_25px_80px_rgba(0,0,0,0.42)] sm:p-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(5,150,105,0.18),transparent_40%),linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:100%_100%,26px_26px,26px_26px]" />
      <div className="relative space-y-6">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
            Farm operations
          </p>
          <h1 className="text-2xl font-semibold">FarmOS</h1>
          <p className="max-w-md text-sm text-zinc-300">
            Coordinate tasks, assets, incidents, workforce, and operational logs in one place.
          </p>
        </div>

        <ul className="space-y-3">
          {benefits.map((benefit) => {
            const Icon = iconMap[benefit.icon];
            return (
              <li
                key={benefit.label}
                className="flex items-start gap-2 text-sm text-zinc-200"
              >
                <span className="mt-0.5 rounded-lg border border-white/15 bg-white/5 p-1.5">
                  <Icon className="h-3.5 w-3.5 text-emerald-300" />
                </span>
                <span>{benefit.label}</span>
              </li>
            );
          })}
        </ul>

        <p className="pt-6 text-xs text-zinc-400">
          Secure access. Your data stays private.
        </p>
      </div>
    </aside>
  );
}
