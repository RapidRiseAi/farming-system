'use client';

export function MediaCaptureFields({
  namePrefix,
  className
}: {
  namePrefix: string;
  className?: string;
}) {
  return (
    <div className={className ?? 'grid gap-2'}>
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Media-first capture</p>
      <input
        name={`${namePrefix}MediaPath`}
        placeholder="Media URL or storage path"
        className="rounded-lg border px-3 py-2 text-sm"
      />
      <input
        name={`${namePrefix}MediaNote`}
        placeholder="Media context / note"
        className="rounded-lg border px-3 py-2 text-sm"
      />
      <input
        type="file"
        name={`${namePrefix}MediaFile`}
        accept="image/*,video/*,audio/*"
        capture="environment"
        className="rounded-lg border px-3 py-2 text-xs"
      />
      <p className="text-xs text-gray-500">Attach file now, then upload to storage and paste path if needed.</p>
    </div>
  );
}
