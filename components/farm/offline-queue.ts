'use client';

export type OfflinePayloadValue = string | string[];

export type OfflineQueueItem = {
  id: string;
  createdAt: string;
  actionType: string;
  payload: Record<string, OfflinePayloadValue>;
  lastError?: string;
};

const KEY_PREFIX = 'farm-offline-queue-v1:';

function keyFor(actionType: string) {
  return `${KEY_PREFIX}${actionType}`;
}

export function serializeFormData(formData: FormData): Record<string, OfflinePayloadValue> {
  const out: Record<string, OfflinePayloadValue> = {};
  for (const [key, rawValue] of formData.entries()) {
    if (rawValue instanceof File) {
      if (!rawValue.name) continue;
      const existing = out[key];
      const fileMarker = `[file:${rawValue.name}]`;
      if (Array.isArray(existing)) out[key] = [...existing, fileMarker];
      else if (typeof existing === 'string') out[key] = [existing, fileMarker];
      else out[key] = fileMarker;
      continue;
    }

    const value = String(rawValue);
    const existing = out[key];
    if (Array.isArray(existing)) out[key] = [...existing, value];
    else if (typeof existing === 'string') out[key] = [existing, value];
    else out[key] = value;
  }
  return out;
}

export function payloadToFormData(payload: Record<string, OfflinePayloadValue>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(payload)) {
    if (Array.isArray(value)) {
      for (const entry of value) formData.append(key, entry);
      continue;
    }
    formData.append(key, value);
  }
  return formData;
}

export function readQueue(actionType: string): OfflineQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(keyFor(actionType));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueueItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function writeQueue(actionType: string, items: OfflineQueueItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(keyFor(actionType), JSON.stringify(items));
}

export function enqueue(actionType: string, payload: Record<string, OfflinePayloadValue>, lastError?: string): OfflineQueueItem {
  const item: OfflineQueueItem = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    actionType,
    payload,
    lastError
  };
  const queue = readQueue(actionType);
  queue.unshift(item);
  writeQueue(actionType, queue);
  return item;
}
