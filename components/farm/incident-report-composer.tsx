'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { reportFarmIncident } from '@/lib/actions/farm';
import { enqueue, payloadToFormData, readQueue, serializeFormData, writeQueue, type OfflineQueueItem } from '@/components/farm/offline-queue';
import { MediaCaptureFields } from '@/components/farm/media-capture-fields';

const ACTION_TYPE = 'incident-report';

export type SelectOption = { id: string; label: string };

const INCIDENT_TEMPLATES: Record<string, { title: string; incidentClass: string; incidentType: string; severity: string; description: string }> = {
  safety_near_miss: {
    title: 'Safety near miss',
    incidentClass: 'safety',
    incidentType: 'safety',
    severity: 'medium',
    description: 'Near miss captured during operations. Immediate controls applied.'
  },
  equipment_breakdown: {
    title: 'Equipment breakdown',
    incidentClass: 'utility_failure',
    incidentType: 'equipment',
    severity: 'high',
    description: 'Critical equipment unavailable. Containment and reroute initiated.'
  }
};

export function IncidentReportComposer({ members, areas, animals, assets, initialTemplate }: { members: SelectOption[]; areas: SelectOption[]; animals: SelectOption[]; assets: SelectOption[]; initialTemplate?: string }) {
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const template = INCIDENT_TEMPLATES[initialTemplate ?? ''] ?? INCIDENT_TEMPLATES.safety_near_miss;

  useEffect(() => {
    setQueue(readQueue(ACTION_TYPE));
  }, []);

  const latest = useMemo(() => queue.slice(0, 4), [queue]);

  async function submitNow(formData: FormData) {
    const mediaPath = String(formData.get('incidentMediaPath') ?? '').trim();
    const mediaNote = String(formData.get('incidentMediaNote') ?? '').trim();
    const description = String(formData.get('description') ?? '').trim();
    formData.set('description', [description, mediaPath ? `Media: ${mediaPath}` : '', mediaNote ? `Media note: ${mediaNote}` : ''].filter(Boolean).join('\n'));
    await reportFarmIncident(formData);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(() => {
      void (async () => {
        const payload = serializeFormData(formData);
        if (!navigator.onLine) {
          enqueue(ACTION_TYPE, payload, 'Offline');
          setQueue(readQueue(ACTION_TYPE));
          setStatus('Incident queued offline.');
          return;
        }

        try {
          await submitNow(formData);
          form.reset();
          setStatus('Incident submitted.');
        } catch {
          enqueue(ACTION_TYPE, payload, 'Submit failed');
          setQueue(readQueue(ACTION_TYPE));
          setStatus('Submit failed; queued for retry.');
        }
      })();
    });
  }

  function retry(item: OfflineQueueItem) {
    startTransition(() => {
      void (async () => {
        try {
          await submitNow(payloadToFormData(item.payload));
          const next = readQueue(ACTION_TYPE).filter((entry) => entry.id !== item.id);
          writeQueue(ACTION_TYPE, next);
          setQueue(next);
        } catch {
          setStatus('Retry failed.');
        }
      })();
    });
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleSubmit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <input name="title" defaultValue={template.title} placeholder="Incident title" className="rounded-lg border px-3 py-2" required />
        <input name="occurredAt" type="datetime-local" className="rounded-lg border px-3 py-2" required />
        <select name="incidentClass" defaultValue={template.incidentClass} className="rounded-lg border px-3 py-2">
          <option value="safety">Safety</option><option value="security_theft">Security/Theft</option><option value="animal_health">Animal health</option><option value="crop_health">Crop health</option><option value="utility_failure">Utility failure</option><option value="environmental">Environmental</option><option value="quality">Quality</option><option value="visitor">Visitor</option><option value="vehicle_accident">Vehicle/accident</option>
        </select>
        <select name="incidentType" defaultValue={template.incidentType} className="rounded-lg border px-3 py-2"><option value="safety">Safety</option><option value="biosecurity">Biosecurity</option><option value="equipment">Equipment</option><option value="environment">Environment</option><option value="security">Security</option><option value="other">Other</option></select>
        <select name="severity" defaultValue={template.severity} className="rounded-lg border px-3 py-2"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
        <select name="ownerProfileId" className="rounded-lg border px-3 py-2"><option value="">Assign owner</option>{members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}</select>
        <select name="locationAreaId" className="rounded-lg border px-3 py-2"><option value="">Location area (optional)</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.label}</option>)}</select>
        <input name="rootCauseCategory" placeholder="Root cause category (optional)" className="rounded-lg border px-3 py-2" />
        <label className="inline-flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" name="escalationRequired" />Escalation required</label>
        <textarea name="description" defaultValue={template.description} className="sm:col-span-2 min-h-24 rounded-lg border px-3 py-2" placeholder="Describe incident context and immediate actions" required />
        <MediaCaptureFields namePrefix="incident" className="sm:col-span-2" />
        <select multiple name="impactedProfileIds" className="sm:col-span-2 rounded-lg border px-3 py-2">
          {members.map((member) => <option key={member.id} value={member.id}>{member.label}</option>)}
        </select>
        <select multiple name="impactedAnimalIds" className="sm:col-span-2 rounded-lg border px-3 py-2">
          {animals.map((animal) => <option key={animal.id} value={animal.id}>{animal.label}</option>)}
        </select>
        <select multiple name="impactedAssetIds" className="sm:col-span-2 rounded-lg border px-3 py-2">
          {assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
        </select>
        <button disabled={isPending} className="sm:col-span-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{isPending ? 'Submitting…' : 'Submit incident'}</button>
      </form>
      {status ? <p className="text-xs text-gray-600">{status}</p> : null}
      {latest.length ? <div className="space-y-1"><p className="text-xs font-semibold text-amber-800">Queued incidents ({queue.length})</p>{latest.map((item) => <div key={item.id} className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs"><span>{String(item.payload.title ?? 'Incident')} • {new Date(item.createdAt).toLocaleTimeString()}</span><button type="button" onClick={() => retry(item)} className="rounded border border-amber-300 px-2 py-0.5">Retry</button></div>)}</div> : null}
    </div>
  );
}

export const incidentTemplates = Object.keys(INCIDENT_TEMPLATES);
