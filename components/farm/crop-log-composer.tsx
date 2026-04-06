'use client';

import { useEffect, useState, useTransition } from 'react';
import { createCropLog } from '@/lib/actions/farm';
import { enqueue, payloadToFormData, readQueue, serializeFormData, writeQueue, type OfflineQueueItem } from '@/components/farm/offline-queue';
import { MediaCaptureFields } from '@/components/farm/media-capture-fields';

const ACTION_TYPE = 'crop-log';

const LOG_TEMPLATES: Record<string, { logType: string; noteHint: string }> = {
  treatment: { logType: 'spraying', noteHint: 'Treatment applied, dosage, weather, operator.' },
  scouting: { logType: 'scouting', noteHint: 'Pest/disease observations and risk notes.' },
  irrigation: { logType: 'irrigation', noteHint: 'Duration, volume, pressure checks.' }
};

export function CropLogComposer({ fields, initialTemplate }: { fields: Array<{ id: string; name: string }>; initialTemplate?: string }) {
  const [status, setStatus] = useState<string | null>(null);
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [isPending, startTransition] = useTransition();
  const template = LOG_TEMPLATES[initialTemplate ?? ''] ?? LOG_TEMPLATES.treatment;

  useEffect(() => {
    setQueue(readQueue(ACTION_TYPE));
  }, []);

  async function submitNow(formData: FormData) {
    const mediaPath = String(formData.get('logMediaPath') ?? '').trim();
    const mediaNote = String(formData.get('logMediaNote') ?? '').trim();
    const notes = String(formData.get('notes') ?? '').trim();
    formData.set('notes', [notes, mediaPath ? `Media: ${mediaPath}` : '', mediaNote ? `Media note: ${mediaNote}` : ''].filter(Boolean).join('\n'));
    await createCropLog(formData);
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(() => {
      void (async () => {
        const payload = serializeFormData(formData);
        if (!navigator.onLine) {
          enqueue(ACTION_TYPE, payload, 'Offline');
          setQueue(readQueue(ACTION_TYPE));
          setStatus('Saved offline.');
          return;
        }

        try {
          await submitNow(formData);
          form.reset();
          setStatus('Log saved.');
        } catch {
          enqueue(ACTION_TYPE, payload, 'Failed');
          setQueue(readQueue(ACTION_TYPE));
          setStatus('Submit failed; queued.');
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
      <form onSubmit={onSubmit} className="mt-2 grid gap-2 sm:grid-cols-4">
        <select name="fieldId" className="rounded border px-2 py-1.5">{fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select>
        <select name="logType" defaultValue={template.logType} className="rounded border px-2 py-1.5"><option value="planting">Planting</option><option value="spraying">Spraying</option><option value="fertilizing">Fertilizing</option><option value="irrigation">Irrigation</option><option value="scouting">Scouting</option><option value="harvest">Harvest</option><option value="other">Other</option></select>
        <input name="logDate" type="date" className="rounded border px-2 py-1.5" required />
        <input name="cropName" className="rounded border px-2 py-1.5" placeholder="Crop name" />
        <textarea name="notes" defaultValue={template.noteHint} className="sm:col-span-4 rounded border px-2 py-1.5" placeholder="Notes" />
        <MediaCaptureFields namePrefix="log" className="sm:col-span-4" />
        <button disabled={isPending} className="sm:col-span-4 rounded border px-2 py-1.5">{isPending ? 'Saving...' : 'Save log'}</button>
      </form>
      {status ? <p className="text-xs text-gray-600">{status}</p> : null}
      {queue.length ? <div className="space-y-1 text-xs"><p className="font-semibold text-amber-700">Queued logs ({queue.length})</p>{queue.slice(0, 4).map((item) => <div key={item.id} className="flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-2 py-1"><span>{String(item.payload.logType ?? 'log')} • {new Date(item.createdAt).toLocaleTimeString()}</span><button type="button" className="rounded border border-amber-300 px-2 py-0.5" onClick={() => retry(item)}>Retry</button></div>)}</div> : null}
    </div>
  );
}

export const cropLogTemplates = Object.keys(LOG_TEMPLATES);
