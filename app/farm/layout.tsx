import type { ReactNode } from 'react';
import Link from 'next/link';
import { SignOutButton } from '@/components/layout/sign-out-button';

const links = [
  { href: '/farm/dashboard', label: 'Dashboard' },
  { href: '/farm/onboarding', label: 'Onboarding' },
  { href: '/farm/tasks', label: 'Tasks' },
  { href: '/farm/assets', label: 'Assets' },
  { href: '/farm/workforce', label: 'Workforce' },
  { href: '/farm/crops', label: 'Crops' },
  { href: '/farm/livestock', label: 'Livestock' },
  { href: '/farm/incidents', label: 'Incidents' },
  { href: '/farm/expenses', label: 'Expenses' }
];

export default function FarmLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white">
      <header className="sticky top-0 z-20 border-b border-emerald-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">FarmOS</p>
            <p className="text-lg font-semibold text-emerald-950">Operations Control</p>
          </div>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="rounded-full border border-emerald-200 px-3 py-1.5 font-medium text-emerald-900 hover:bg-emerald-100">
                {link.label}
              </Link>
            ))}
            <SignOutButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
