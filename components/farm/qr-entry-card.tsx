import Link from 'next/link';

export function QrEntryCard({ label, href }: { label: string; href: string }) {
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=132x132&data=${encodeURIComponent(href)}`;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
      <p className="text-xs font-semibold uppercase text-emerald-800">QR entry point</p>
      <p className="text-sm text-emerald-900">{label}</p>
      <img src={src} alt={`QR for ${label}`} width={132} height={132} className="mt-2 rounded border border-emerald-200 bg-white p-1" />
      <Link href={href} className="mt-2 block text-xs text-emerald-800 underline">Open destination</Link>
    </div>
  );
}
