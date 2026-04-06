export type SourceRecord = {
  id: string;
  type: 'task' | 'incident' | 'request' | 'document' | 'asset' | 'note' | 'telemetry' | 'other';
  label: string;
  href?: string;
};

export type AiGuardrails = {
  canAutoCommit: false;
  requiresHumanReview: true;
  exclusions: readonly string[];
};

export const FARM_ASSIST_EXCLUSIONS = [
  'No autonomous treatment decisions.',
  'No autonomous agronomy decisions.',
  'No autonomous purchasing decisions.'
] as const;

export type AiDraft<T> = {
  draft: T;
  rationale: string[];
  citations: SourceRecord[];
  guardrails: AiGuardrails;
};

export type FarmQueryFilters = {
  entityTypes: Array<'task' | 'incident' | 'request' | 'document'>;
  statuses: string[];
  priorities: Array<'low' | 'medium' | 'high' | 'urgent'>;
  dateRange?: {
    start?: string;
    end?: string;
  };
  locationTags: string[];
  searchTerms: string[];
};

export type WeeklySummaryRecord = {
  id: string;
  sourceType: SourceRecord['type'];
  title: string;
  status: string;
  happenedAt: string;
  href: string;
};

export type VoiceNoteDraft = {
  kind: 'task' | 'incident' | 'request';
  title: string;
  details: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
};

export type DocumentFieldDraft = {
  extractedFields: Record<string, string>;
  missingFields: string[];
};

export type AnomalyEvent = {
  id: string;
  sourceType: SourceRecord['type'];
  assetId?: string;
  eventType: string;
  happenedAt: string;
  failureCode?: string;
};

export type HighlightedAnomaly = {
  pattern: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  evidenceRecordIds: string[];
};

function createGuardrails(): AiGuardrails {
  return {
    canAutoCommit: false,
    requiresHumanReview: true,
    exclusions: FARM_ASSIST_EXCLUSIONS
  };
}

function requireCitations(sourceRecords: SourceRecord[]): SourceRecord[] {
  if (!sourceRecords.length) {
    throw new Error('Farm assist output must cite at least one source record.');
  }
  return sourceRecords;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function nlQueryToStructuredFilters(query: string, sourceRecords: SourceRecord[]): AiDraft<FarmQueryFilters> {
  const normalized = normalizeText(query);

  const entityTypes: FarmQueryFilters['entityTypes'] = [];
  if (normalized.includes('task')) entityTypes.push('task');
  if (normalized.includes('incident')) entityTypes.push('incident');
  if (normalized.includes('request')) entityTypes.push('request');
  if (normalized.includes('document')) entityTypes.push('document');

  const statuses = ['open', 'in_progress', 'blocked', 'closed', 'new', 'approved'].filter((status) => normalized.includes(status));

  const priorities: FarmQueryFilters['priorities'] = [];
  if (normalized.includes('urgent')) priorities.push('urgent');
  if (normalized.includes('high')) priorities.push('high');
  if (normalized.includes('medium')) priorities.push('medium');
  if (normalized.includes('low')) priorities.push('low');

  const locationTags = ['north', 'south', 'east', 'west', 'yard', 'shed', 'field'].filter((tag) => normalized.includes(tag));
  const searchTerms = query
    .split(/\s+/)
    .map((term) => term.replace(/[^a-zA-Z0-9_-]/g, '').trim())
    .filter((term) => term.length > 2);

  const dateRange: FarmQueryFilters['dateRange'] = {};
  if (normalized.includes('this week')) {
    dateRange.start = 'this_week_start';
    dateRange.end = 'this_week_end';
  }
  if (normalized.includes('last week')) {
    dateRange.start = 'last_week_start';
    dateRange.end = 'last_week_end';
  }

  return {
    draft: {
      entityTypes,
      statuses,
      priorities,
      dateRange: Object.keys(dateRange).length ? dateRange : undefined,
      locationTags,
      searchTerms
    },
    rationale: [
      'Matched query terms into entity, status, priority, and location filters.',
      'Date range placeholders require human confirmation before saving.'
    ],
    citations: requireCitations(sourceRecords),
    guardrails: createGuardrails()
  };
}

export function generateWeeklySummary(records: WeeklySummaryRecord[]): AiDraft<{ markdown: string }> {
  const citations = requireCitations(
    records.map((record) => ({
      id: record.id,
      type: record.sourceType,
      label: record.title,
      href: record.href
    }))
  );

  const byType = records.reduce<Record<string, number>>((acc, record) => {
    acc[record.sourceType] = (acc[record.sourceType] ?? 0) + 1;
    return acc;
  }, {});

  const summaryLines = Object.entries(byType).map(([kind, count]) => `- ${kind}: ${count}`);
  const recordLines = records.map((record) => `- [${record.title}](${record.href}) — ${record.status} (${record.happenedAt})`);

  return {
    draft: {
      markdown: ['## Weekly summary', ...summaryLines, '', '### Source records', ...recordLines].join('\n')
    },
    rationale: [
      'Weekly summary is derived from provided records only.',
      'Each bullet links directly to the originating record for reviewer verification.'
    ],
    citations,
    guardrails: createGuardrails()
  };
}

export function voiceNoteToDraft(note: string, sourceRecords: SourceRecord[]): AiDraft<VoiceNoteDraft> {
  const normalized = normalizeText(note);
  const kind: VoiceNoteDraft['kind'] = normalized.includes('incident')
    ? 'incident'
    : normalized.includes('request')
      ? 'request'
      : 'task';

  const priority: VoiceNoteDraft['priority'] = normalized.includes('urgent')
    ? 'urgent'
    : normalized.includes('high')
      ? 'high'
      : normalized.includes('low')
        ? 'low'
        : 'medium';

  return {
    draft: {
      kind,
      title: note.slice(0, 90).trim() || 'Voice note draft',
      details: note.trim(),
      priority
    },
    rationale: [
      'Intent classification inferred from explicit keywords in the voice note.',
      'Draft is non-final and requires human review before save.'
    ],
    citations: requireCitations(sourceRecords),
    guardrails: createGuardrails()
  };
}

export function extractDocumentFieldsDraft(documentText: string, sourceRecords: SourceRecord[]): AiDraft<DocumentFieldDraft> {
  const extractedFields: Record<string, string> = {};

  const invoiceNumber = documentText.match(/invoice\s*(no|number)?\s*[:#-]?\s*([A-Z0-9-]+)/i)?.[2];
  if (invoiceNumber) extractedFields.invoiceNumber = invoiceNumber;

  const vendor = documentText.match(/vendor\s*[:#-]?\s*([^\n]+)/i)?.[1]?.trim();
  if (vendor) extractedFields.vendor = vendor;

  const date = documentText.match(/date\s*[:#-]?\s*(\d{4}-\d{2}-\d{2})/i)?.[1];
  if (date) extractedFields.date = date;

  const amount = documentText.match(/(total|amount)\s*[:#-]?\s*\$?([0-9.,]+)/i)?.[2];
  if (amount) extractedFields.amount = amount;

  const requiredFields = ['invoiceNumber', 'vendor', 'date', 'amount'];
  const missingFields = requiredFields.filter((field) => !(field in extractedFields));

  return {
    draft: {
      extractedFields,
      missingFields
    },
    rationale: [
      'Field extraction uses deterministic patterns as a draft aid.',
      'Missing fields are intentionally surfaced for reviewer completion.'
    ],
    citations: requireCitations(sourceRecords),
    guardrails: createGuardrails()
  };
}

export function highlightRecurringAnomalies(events: AnomalyEvent[], sourceRecords: SourceRecord[]): AiDraft<{ anomalies: HighlightedAnomaly[] }> {
  const grouped = new Map<string, AnomalyEvent[]>();

  for (const event of events) {
    const key = `${event.eventType}|${event.assetId ?? 'unknown'}|${event.failureCode ?? 'none'}`;
    const bucket = grouped.get(key);
    if (bucket) {
      bucket.push(event);
    } else {
      grouped.set(key, [event]);
    }
  }

  const anomalies: HighlightedAnomaly[] = Array.from(grouped.entries())
    .filter(([, bucket]) => bucket.length >= 2)
    .map(([pattern, bucket]) => {
      const ordered = bucket.slice().sort((a, b) => a.happenedAt.localeCompare(b.happenedAt));
      return {
        pattern,
        count: bucket.length,
        firstSeenAt: ordered[0]?.happenedAt ?? '',
        lastSeenAt: ordered[ordered.length - 1]?.happenedAt ?? '',
        evidenceRecordIds: ordered.map((event) => event.id)
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    draft: { anomalies },
    rationale: [
      'Anomalies are highlighted when matching event patterns recur at least twice.',
      'Output is advisory only and excludes autonomous treatment/agronomy/purchasing decisions.'
    ],
    citations: requireCitations(sourceRecords),
    guardrails: createGuardrails()
  };
}
