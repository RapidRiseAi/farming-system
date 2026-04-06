import Link from 'next/link';

const QUICK_ACTIONS = [
  { href: '/farm/tasks?template=inspection', label: 'Task template' },
  { href: '/farm/incidents?template=safety_near_miss', label: 'Incident template' },
  { href: '/farm/crops?template=treatment', label: 'Treatment template' },
  { href: '/farm/assets?template=service', label: 'Service template' }
];

export function FarmQuickActions() {
  return (
    <div className="flex flex-wrap gap-2">
      {QUICK_ACTIONS.map((action) => (
        <Link key={action.href} href={action.href} className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
          {action.label}
        </Link>
      ))}
    </div>
  );
}
