import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

const TYPES = ['assets', 'fields', 'herds', 'incidents', 'documents', 'visits'] as const;

type SearchType = (typeof TYPES)[number];

export default async function FarmGlobalSearchPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string | string[] }> }) {
  const params = await searchParams;
  const q = (params.q ?? '').trim();
  const selectedTypes = Array.isArray(params.type) ? params.type : params.type ? [params.type] : [...TYPES];
  const normalizedTypes = selectedTypes.filter((type): type is SearchType => TYPES.includes(type as SearchType));

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const likePattern = `%${q.replace(/[%_]/g, '')}%`;

  const [assets, fields, herds, incidents, documents, visits] = q.length >= 2
    ? await Promise.all([
        normalizedTypes.includes('assets')
          ? supabase.from('farm_assets').select('id,name,asset_code,status').eq('workshop_account_id', profile.workshop_account_id).or(`name.ilike.${likePattern},asset_code.ilike.${likePattern}`).limit(20)
          : Promise.resolve({ data: [] }),
        normalizedTypes.includes('fields')
          ? supabase.from('crop_fields').select('id,name,field_code,status').eq('workshop_account_id', profile.workshop_account_id).or(`name.ilike.${likePattern},field_code.ilike.${likePattern}`).limit(20)
          : Promise.resolve({ data: [] }),
        normalizedTypes.includes('herds')
          ? supabase.from('livestock_herds').select('id,name,herd_code,species').eq('workshop_account_id', profile.workshop_account_id).or(`name.ilike.${likePattern},herd_code.ilike.${likePattern},species.ilike.${likePattern}`).limit(20)
          : Promise.resolve({ data: [] }),
        normalizedTypes.includes('incidents')
          ? supabase.from('farm_incidents').select('id,incident_number,title,status,severity').eq('workshop_account_id', profile.workshop_account_id).or(`title.ilike.${likePattern},incident_number.ilike.${likePattern}`).limit(20)
          : Promise.resolve({ data: [] }),
        normalizedTypes.includes('documents')
          ? supabase.from('farm_documents').select('id,document_number,title,status').eq('workshop_account_id', profile.workshop_account_id).or(`title.ilike.${likePattern},document_number.ilike.${likePattern}`).limit(20)
          : Promise.resolve({ data: [] }),
        normalizedTypes.includes('visits')
          ? supabase.from('farm_visits').select('id,visitor_name,purpose,checked_in_at,checked_out_at').eq('workshop_account_id', profile.workshop_account_id).or(`visitor_name.ilike.${likePattern},purpose.ilike.${likePattern}`).limit(20)
          : Promise.resolve({ data: [] })
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const total = (assets.data?.length ?? 0) + (fields.data?.length ?? 0) + (herds.data?.length ?? 0) + (incidents.data?.length ?? 0) + (documents.data?.length ?? 0) + (visits.data?.length ?? 0);

  return (
    <section className="space-y-5">
      <Card className="rounded-2xl border border-emerald-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-emerald-950">Global farm search</h1>
        <p className="mt-1 text-sm text-gray-600">Search across assets, fields, herds, incidents, documents, and visits.</p>
        <form className="mt-3 grid gap-3 sm:grid-cols-3" action="/farm/search">
          <input name="q" defaultValue={q} placeholder="Search by name, code, number..." className="sm:col-span-2 rounded-lg border px-3 py-2" />
          <button className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Search</button>
          <div className="sm:col-span-3 grid gap-2 sm:grid-cols-3">
            {TYPES.map((type) => (
              <label key={type} className="text-sm text-gray-700">
                <input type="checkbox" name="type" value={type} defaultChecked={normalizedTypes.includes(type)} className="mr-2" />
                {type}
              </label>
            ))}
          </div>
        </form>
      </Card>

      {q.length < 2 ? <p className="text-sm text-gray-500">Enter at least 2 characters to search.</p> : <p className="text-sm text-gray-600">{total} result(s) found.</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        <ResultCard title="Assets" items={(assets.data ?? []).map((a) => ({ id: a.id, title: `${a.name} (${a.asset_code})`, subtitle: a.status, href: `/farm/assets/${a.id}` }))} />
        <ResultCard title="Fields" items={(fields.data ?? []).map((f) => ({ id: f.id, title: `${f.name} (${f.field_code ?? 'no code'})`, subtitle: f.status, href: '/farm/crops' }))} />
        <ResultCard title="Herds" items={(herds.data ?? []).map((h) => ({ id: h.id, title: `${h.name} (${h.herd_code ?? 'no code'})`, subtitle: h.species, href: '/farm/livestock' }))} />
        <ResultCard title="Incidents" items={(incidents.data ?? []).map((i) => ({ id: i.id, title: `${i.incident_number} · ${i.title}`, subtitle: `${i.status} · ${i.severity}`, href: '/farm/incidents' }))} />
        <ResultCard title="Documents" items={(documents.data ?? []).map((d) => ({ id: d.id, title: `${d.document_number} · ${d.title}`, subtitle: d.status, href: `/farm/documents/${d.id}` }))} />
        <ResultCard title="Visits" items={(visits.data ?? []).map((v) => ({ id: v.id, title: v.visitor_name, subtitle: `${v.purpose}${v.checked_out_at ? ' · checked out' : ' · checked in'}`, href: '/farm/visitors' }))} />
      </div>
    </section>
  );
}

function ResultCard({ title, items }: { title: string; items: Array<{ id: string; title: string; subtitle: string; href: string }> }) {
  return (
    <Card className="rounded-2xl border bg-white p-4">
      <h2 className="font-semibold text-emerald-950">{title}</h2>
      <div className="mt-2 space-y-2">
        {items.length ? (
          items.map((item) => (
            <Link key={item.id} href={item.href} className="block rounded-lg border border-emerald-100 px-3 py-2 hover:bg-emerald-50">
              <p className="text-sm font-medium text-emerald-900">{item.title}</p>
              <p className="text-xs text-gray-600">{item.subtitle}</p>
            </Link>
          ))
        ) : (
          <p className="text-sm text-gray-500">No matches.</p>
        )}
      </div>
    </Card>
  );
}
