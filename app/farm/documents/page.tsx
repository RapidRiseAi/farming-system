import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createFarmDocument, transitionFarmDocument } from '@/lib/actions/farm';
import { createClient } from '@/lib/supabase/server';

const DOCUMENT_STATUSES = ['active', 'expired', 'superseded', 'archived'];

export default async function FarmDocumentsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('id,workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: documents }, { data: team }] = await Promise.all([
    supabase
      .from('farm_documents')
      .select('id,document_number,title,document_type,linked_object_type,linked_object_label,effective_date,expiry_date,owner_profile_id,visibility_scope,version,status,storage_path,owner:owner_profile_id(full_name),created_at')
      .eq('workshop_account_id', profile.workshop_account_id)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('profiles').select('id,full_name').eq('workshop_account_id', profile.workshop_account_id).order('full_name', { ascending: true })
  ]);

  return (
    <section className="space-y-6">
      <Card className="rounded-2xl border border-emerald-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-emerald-950">Farm documents</h1>
        <form action={createFarmDocument} className="mt-4 grid gap-3 sm:grid-cols-2">
          <input name="title" placeholder="Document title" className="rounded-lg border px-3 py-2" required />
          <select name="documentType" className="rounded-lg border px-3 py-2">
            {['license', 'permit', 'inspection', 'contract', 'policy', 'compliance', 'sop', 'manual', 'warranty', 'insurance', 'other'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select name="linkedObjectType" className="rounded-lg border px-3 py-2">
            {['site', 'area', 'asset', 'worker', 'work_order', 'work_request', 'stock_request', 'livestock', 'incident', 'other'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <input name="linkedObjectLabel" placeholder="Linked object label" className="rounded-lg border px-3 py-2" />
          <input type="date" name="effectiveDate" className="rounded-lg border px-3 py-2" />
          <input type="date" name="expiryDate" className="rounded-lg border px-3 py-2" />
          <select name="ownerProfileId" className="rounded-lg border px-3 py-2" defaultValue={profile.id}>
            {team?.map((member) => <option key={member.id} value={member.id}>{member.full_name || 'Unnamed'}</option>)}
          </select>
          <select name="visibilityScope" className="rounded-lg border px-3 py-2">
            {['private', 'team', 'site', 'farm', 'public_link'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <input name="version" defaultValue="1.0" placeholder="Version" className="rounded-lg border px-3 py-2" />
          <input name="storagePath" placeholder="Storage path (bucket/folder/file.pdf)" className="rounded-lg border px-3 py-2" required />
          <textarea name="notes" placeholder="Notes" className="sm:col-span-2 min-h-16 rounded-lg border px-3 py-2" />
          <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Create document</button>
        </form>
      </Card>

      <div className="space-y-3">
        {(documents ?? []).map((document) => (
          <Card key={document.id} className="rounded-2xl border border-black/10 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-emerald-700">{document.document_number} • v{document.version}</p>
                <h2 className="text-base font-semibold text-black">{document.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border px-2 py-0.5 text-xs uppercase tracking-wide text-gray-700">{document.status}</span>
                <Link href={`/farm/documents/${document.id}`} className="text-xs text-emerald-700 underline">Details</Link>
              </div>
            </div>
            <p className="mt-1 text-xs text-gray-500">{document.document_type} • linked to {document.linked_object_type} {document.linked_object_label ? `(${document.linked_object_label})` : ''} • expires {document.expiry_date || 'N/A'}</p>

            <div className="mt-3 flex flex-wrap gap-2">
              {DOCUMENT_STATUSES.filter((status) => status !== document.status).map((status) => (
                <form key={status} action={transitionFarmDocument}>
                  <input type="hidden" name="documentId" value={document.id} />
                  <input type="hidden" name="nextStatus" value={status} />
                  <button className="rounded-lg border px-2 py-1 text-xs">{status}</button>
                </form>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
