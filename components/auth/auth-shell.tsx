import Link from 'next/link';
import { ReactNode } from 'react';
import { AuthTransitionOverlay } from '@/components/auth/auth-transition-overlay';

function PortalOverviewPanel() {
  const items = [
    {
      title: 'Unified farm timeline',
      text: 'Track tasks, incidents and inspections in one view.'
    },
    {
      title: 'Documents and records',
      text: 'Store reports, proof photos and compliance docs.'
    },
    {
      title: 'Live team updates',
      text: 'See what every worker completed and when.'
    }
  ];

  return (
    <section className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-5 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-0 rounded-3xl opacity-25 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:30px_30px]" />
      <div className="relative mb-4 border-b border-white/15 pb-3">
        <span className="mb-2 inline-flex h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden />
        <h2 className="text-base font-semibold text-white">Portal overview</h2>
      </div>
      <div className="relative space-y-3">
        {items.map((item) => (
          <div key={item.title} className="flex gap-3 rounded-xl border border-white/10 bg-zinc-900/75 p-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-400/40 bg-red-500/10 text-red-300">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
                <path d="M4 10h12M10 4v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="text-xs text-zinc-400">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="relative mt-4 text-xs text-zinc-500">Secure access. Your data stays private.</p>
    </section>
  );
}

function TodayPanel() {
  const actions = ['Assign field tasks', 'Review expense logs', 'Track maintenance progress'];

  return (
    <section className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-zinc-900 via-zinc-950 to-black p-5 shadow-[0_16px_40px_rgba(0,0,0,0.35)]">
      <div className="pointer-events-none absolute inset-0 rounded-3xl opacity-25 [background-image:linear-gradient(to_right,rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:30px_30px]" />
      <div className="relative mb-4 border-b border-white/15 pb-3">
        <span className="mb-2 inline-flex h-1.5 w-6 rounded-full bg-emerald-600" aria-hidden />
        <h2 className="text-base font-semibold text-white">Today you can</h2>
      </div>
      <ul className="relative space-y-2">
        {actions.map((item) => (
          <li key={item} className="flex items-center justify-between rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-2 text-sm text-zinc-200">
            <span>{item}</span>
            <svg viewBox="0 0 20 20" className="h-4 w-4 text-zinc-500" fill="none" aria-hidden>
              <path d="m8 5 5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </li>
        ))}
      </ul>
      <div className="relative mt-4 rounded-xl border border-white/10 bg-zinc-800/90 px-3 py-3">
        <p className="text-sm font-semibold text-white">Support</p>
        <p className="mt-1 text-xs text-zinc-400">Need help? Contact your farm admin.</p>
      </div>
      <p className="relative mt-4 inline-flex rounded-full border border-emerald-300/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
        System online
      </p>
    </section>
  );
}

function MobilePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-2xl border border-white/15 bg-zinc-950/90 shadow-[0_10px_30px_rgba(0,0,0,0.3)] lg:hidden">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-zinc-100">{title}</summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f6f6f7] text-brand-black">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(229,231,235,0.2)_0%,rgba(246,246,247,0.85)_44%,rgba(226,232,240,0.56)_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(to_right,rgba(17,24,39,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,24,39,0.1)_1px,transparent_1px)] [background-size:34px_34px]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-multiply [background-image:radial-gradient(circle_at_1px_1px,rgba(15,23,42,0.75)_0.8px,transparent_0.8px)] [background-size:4px_4px]" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-[68%] -translate-y-1/2 rounded-full border border-slate-500/10 opacity-[0.05] sm:opacity-[0.04]" aria-hidden>
        <span className="absolute inset-0 grid place-items-center text-[220px] font-black tracking-tight text-slate-800/70">FM</span>
      </div>

      <header className="relative z-10 h-16 border-b border-black/10 bg-white/92 shadow-[0_10px_24px_rgba(15,23,42,0.06)] backdrop-blur">
        <div className="mx-auto flex h-full w-full max-w-[1340px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Farm Operations Portal</p>
            <p className="inline-flex items-center text-lg font-semibold text-gray-900">
              FarmOS
              <span className="ml-2 mt-px inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden />
            </p>
          </div>
          <nav className="flex items-center gap-5 text-sm text-gray-600">
            <Link href="#" className="underline-offset-4 hover:underline">Help</Link>
            <Link href="#" className="underline-offset-4 hover:underline">Contact</Link>
            <Link href="#" className="underline-offset-4 hover:underline">Privacy</Link>
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-[1340px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(220px,0.92fr)_minmax(0,600px)_minmax(220px,0.92fr)] lg:items-center">
          <aside className="hidden opacity-95 lg:block">
            <PortalOverviewPanel />
          </aside>

          <section className="relative mx-auto w-full max-w-[600px]">
            <div className="pointer-events-none absolute inset-x-8 -bottom-8 -top-8 rounded-[40px] bg-emerald-500/10 blur-3xl" aria-hidden />
            {children}
          </section>

          <aside className="hidden opacity-95 lg:block">
            <TodayPanel />
          </aside>
        </div>

        <div className="mt-4 space-y-3 lg:hidden">
          <MobilePanel title="Portal overview">
            <PortalOverviewPanel />
          </MobilePanel>
          <MobilePanel title="Today you can">
            <TodayPanel />
          </MobilePanel>
        </div>
      </div>
      <AuthTransitionOverlay />
    </main>
  );
}
