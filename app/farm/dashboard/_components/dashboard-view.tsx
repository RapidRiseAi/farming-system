import Link from 'next/link';
import { Card } from '@/components/ui/card';

export type DashboardVariant = 'owner' | 'farm-manager' | 'production' | 'workshop' | 'compliance';

type DashboardMetric = {
  openTasks: number;
  openIncidents: number;
  activeAssets: number;
  spend30dCents: number;
  openMaintTasks: number;
  overdueTasks: number;
  overdueIncidents: number;
  activeReminders: number;
  expiringDocuments: number;
  workerCount: number;
  maintenanceBreakdowns24h: number;
  taskCompletions24h: number;
  medianIssueLogMinutes: number;
  criticalDocumentCoveragePct: number;
  documentExpiryCompletenessPct: number;
  overdueReminderResolutionRatePct: number;
};

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });

const variantMeta: Record<DashboardVariant, { title: string; subtitle: string; focuses: Array<keyof DashboardMetric> }> = {
  owner: {
    title: 'Owner dashboard',
    subtitle: 'Financial and operational risk indicators across the farm.',
    focuses: ['spend30dCents', 'maintenanceBreakdowns24h', 'medianIssueLogMinutes', 'criticalDocumentCoveragePct', 'documentExpiryCompletenessPct', 'overdueReminderResolutionRatePct']
  },
  'farm-manager': {
    title: 'Farm manager dashboard',
    subtitle: 'Execution control for team throughput, assets, and urgent blockers.',
    focuses: ['openTasks', 'taskCompletions24h', 'openMaintTasks', 'medianIssueLogMinutes', 'overdueTasks', 'overdueReminderResolutionRatePct']
  },
  production: {
    title: 'Production dashboard',
    subtitle: 'Day-to-day execution for tasks, livestock follow-ups, and field operations.',
    focuses: ['openTasks', 'taskCompletions24h', 'activeAssets', 'maintenanceBreakdowns24h', 'openIncidents', 'workerCount']
  },
  workshop: {
    title: 'Workshop dashboard',
    subtitle: 'Maintenance and incident response tracking for service teams.',
    focuses: ['openMaintTasks', 'maintenanceBreakdowns24h', 'taskCompletions24h', 'overdueTasks', 'overdueIncidents', 'medianIssueLogMinutes']
  },
  compliance: {
    title: 'Compliance dashboard',
    subtitle: 'Expiry, overdue incidents, and control-point exceptions.',
    focuses: ['expiringDocuments', 'criticalDocumentCoveragePct', 'documentExpiryCompletenessPct', 'overdueReminderResolutionRatePct', 'overdueIncidents', 'openIncidents']
  }
};

const metricMeta: Record<keyof DashboardMetric, { label: string; tone: string; formatter?: (value: number) => string }> = {
  openTasks: { label: 'Open tasks', tone: 'text-emerald-700' },
  openIncidents: { label: 'Open incidents', tone: 'text-amber-700' },
  activeAssets: { label: 'Active assets', tone: 'text-sky-700' },
  spend30dCents: { label: '30-day spend', tone: 'text-indigo-700', formatter: (v) => currency.format(v / 100) },
  openMaintTasks: { label: 'Open maintenance', tone: 'text-violet-700' },
  overdueTasks: { label: 'Overdue tasks', tone: 'text-rose-700' },
  overdueIncidents: { label: 'Overdue incidents (SLA)', tone: 'text-red-700' },
  activeReminders: { label: 'Open reminders', tone: 'text-orange-700' },
  expiringDocuments: { label: 'Docs expiring (30d)', tone: 'text-fuchsia-700' },
  workerCount: { label: 'Active workforce', tone: 'text-cyan-700' },
  maintenanceBreakdowns24h: { label: 'Maint/breakdowns (24h)', tone: 'text-violet-700' },
  taskCompletions24h: { label: 'Task completions (24h)', tone: 'text-emerald-700' },
  medianIssueLogMinutes: { label: 'Median issue log time (min)', tone: 'text-amber-700' },
  criticalDocumentCoveragePct: { label: 'Critical doc coverage', tone: 'text-fuchsia-700', formatter: (v) => `${v.toFixed(1)}%` },
  documentExpiryCompletenessPct: { label: 'Doc expiry completeness', tone: 'text-purple-700', formatter: (v) => `${v.toFixed(1)}%` },
  overdueReminderResolutionRatePct: { label: 'Overdue reminder resolution', tone: 'text-orange-700', formatter: (v) => `${v.toFixed(1)}%` },
};

export function FarmDashboardView({ variant, metrics }: { variant: DashboardVariant; metrics: DashboardMetric }) {
  const meta = variantMeta[variant];

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-emerald-950">{meta.title}</h1>
          <p className="text-sm text-gray-600">{meta.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(['owner', 'farm-manager', 'production', 'workshop', 'compliance'] as const).map((item) => (
            <Link key={item} href={`/farm/dashboard/${item}`} className={`rounded-full border px-3 py-1.5 ${item === variant ? 'border-emerald-700 bg-emerald-100 text-emerald-900' : 'border-emerald-200 text-emerald-800'}`}>
              {item}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {meta.focuses.map((metricKey) => {
          const label = metricMeta[metricKey];
          const value = metrics[metricKey];
          return (
            <Card key={metricKey} className="rounded-2xl border bg-white p-4">
              <p className={`text-xs uppercase tracking-wide ${label.tone}`}>{label.label}</p>
              <p className="mt-2 text-3xl font-bold text-emerald-950">{label.formatter ? label.formatter(value) : value}</p>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-2xl border border-emerald-200 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-emerald-700">Fast actions</p>
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <Link href="/farm/search" className="rounded-lg border border-emerald-300 px-3 py-1.5 text-emerald-900">Global search</Link>
          <Link href="/farm/reports" className="rounded-lg border border-emerald-300 px-3 py-1.5 text-emerald-900">Report center</Link>
          <Link href="/farm/tasks?filter=overdue" className="rounded-lg border border-emerald-300 px-3 py-1.5 text-emerald-900">Overdue tasks</Link>
          <Link href="/farm/incidents?status=reported" className="rounded-lg border border-emerald-300 px-3 py-1.5 text-emerald-900">Incident queue</Link>
          <Link href="/farm/documents" className="rounded-lg border border-emerald-300 px-3 py-1.5 text-emerald-900">Documents</Link>
        </div>
      </Card>
    </section>
  );
}
