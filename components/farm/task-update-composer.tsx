'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { addFarmTaskUpdate } from '@/lib/actions/farm';
import { enqueue, payloadToFormData, readQueue, serializeFormData, writeQueue, type OfflineQueueItem } from '@/components/farm/offline-queue';
import { MediaCaptureFields } from '@/components/farm/media-capture-fields';

const ACTION_TYPE = 'task-update';

export function TaskUpdateComposer({ taskId }: { taskId: string }) {
  const [message, setMessage] = useState('');
  const [queue, setQueue] = useState<OfflineQueueItem[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setQueue(readQueue(ACTION_TYPE));
  }, []);

  const taskQueue = useMemo(() => queue.filter((item) => item.payload.taskId === taskId), [queue, taskId]);

  async function submitNow(formData: FormData) {
    const mediaPath = String(formData.get('updateMediaPath') ?? '').trim();
    const mediaNote = String(formData.get('updateMediaNote') ?? '').trim();
    const rawMessage = String(formData.get('message') ?? '').trim();
    const mergedMessage = [
      rawMessage,
      mediaPath ? `Media: ${mediaPath}` : '',
      mediaNote ? `Media note: ${mediaNote}` : ''
    ]
      .filter(Boolean)
      .join('\n');

    const submitData = new FormData();
    submitData.set('taskId', String(formData.get('taskId') ?? taskId));
    submitData.set('message', mergedMessage);
    await addFarmTaskUpdate(submitData);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    startTransition(() => {
      void (async () => {
        const payload = serializeFormData(formData);
        if (!navigator.onLine) {
          enqueue(ACTION_TYPE, payload, 'Offline');
          setQueue(readQueue(ACTION_TYPE));
          setStatus('Saved offline. Retry when online.');
          return;
        }

        try {
          await submitNow(formData);
          setMessage('');
          setStatus('Update posted.');
        } catch {
          enqueue(ACTION_TYPE, payload, 'Submit failed');
          setQueue(readQueue(ACTION_TYPE));
          setStatus('Submit failed. Queued for retry.');
        }
      })();
    });
  }

  function retryItem(item: OfflineQueueItem) {
    startTransition(() => {
      void (async () => {
        try {
          await submitNow(payloadToFormData(item.payload));
          const next = readQueue(ACTION_TYPE).filter((entry) => entry.id !== item.id);
          writeQueue(ACTION_TYPE, next);
          setQueue(next);
          setStatus('Queued update sent.');
        } catch {
          setStatus('Retry failed.');
        }
      })();
    });
  }

  return (
    <div className="mt-3 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input type="hidden" name="taskId" value={taskId} />
        <input
          name="message"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Add progress update..."
          className="rounded-lg border px-3 py-2 text-sm"
          required
        />
        <MediaCaptureFields namePrefix="update" />
        <button disabled={isPending} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
          {isPending ? 'Saving…' : 'Post update'}
        </button>
      </form>

      {status ? <p className="text-xs text-gray-600">{status}</p> : null}
      {taskQueue.length ? (
        <div className="space-y-1 text-xs text-amber-700">
          <p className="font-semibold">Offline queue ({taskQueue.length})</p>
          {taskQueue.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded border border-amber-200 bg-amber-50 px-2 py-1">
              <span>{new Date(item.createdAt).toLocaleString()}</span>
              <button type="button" onClick={() => retryItem(item)} className="rounded border border-amber-300 px-2 py-0.5">
                Retry
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
