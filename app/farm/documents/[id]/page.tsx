import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { transitionFarmDocument } from '@/lib/actions/farm';
import { createClient } from '@/lib/supabase/server';

export default async function FarmDocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/login');

  const [{ data: document }, { data: history }] = await Promise.all([
    supabase
      .from('farm_documents')
      .select('id,document_number,title,document_type,linked_object_type,linked_object_label,effective_date,expiry_date,owner:owner_profile_id(full_name),visibility_scope,version,status,storage_path,notes,created_at')
      .eq('id', id)
      .eq('workshop_account_id', profile.workshop_account_id)
      .maybeSingle(),
    supabase.from('farm_entity_history').select('id,action,payload,created_at').eq('entity_type', 'farm_document').eq('entity_id', id).eq('workshop_account_id', profile.workshop_account_id).order('created_at', { ascending: false })
  ]);

  if (!document) notFound();

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Document {document.document_number}</h1>
      <Card className="p-4">Status: {document.status} • Type: {document.document_type} • Version: {document.version}</Card>
      <Card className="p-4"><h2 className="font-semibold">Linked object</h2><p className="text-sm">{document.linked_object_type} {document.linked_object_label ? `(${document.linked_object_label})` : ''}</p></Card>
      <Card className="p-4"><h2 className="font-semibold">Lifecycle</h2><p className="text-sm">Effective: {document.effective_date || 'N/A'} • Expiry: {document.expiry_date || 'N/A'} • Visibility: {document.visibility_scope}</p></Card>
      <Card className="p-4"><h2 className="font-semibold">Owner + storage</h2><p className="text-sm">Owner: {(document as { owner?: { full_name?: string | null } }).owner?.full_name || 'N/A'} • Path: {document.storage_path}</p><p className="mt-2 text-sm text-gray-600">{document.notes || 'No notes.'}</p></Card>
      <Card className="p-4">
        <h2 className="font-semibold">Quick update</h2>
        <form action={transitionFarmDocument} className="mt-2 grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="documentId" value={document.id} />
          <select name="nextStatus" className="rounded border px-2 py-1 text-sm" defaultValue={document.status}>
            {['active', 'expired', 'superseded', 'archived'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <input name="version" defaultValue={document.version || '1.0'} placeholder="Version" className="rounded border px-2 py-1 text-sm" />
          <input type="date" name="expiryDate" defaultValue={document.expiry_date || ''} className="rounded border px-2 py-1 text-sm" />
          <button className="rounded bg-indigo-700 px-2 py-1 text-sm font-semibold text-white">Update</button>
        </form>
      </Card>
      <Card className="p-4"><h2 className="font-semibold">History timeline</h2>{history?.map((item) => <p key={item.id} className="text-sm">{new Date(item.created_at).toLocaleString()} — {item.action}</p>)}</Card>
    </section>
  );
}
