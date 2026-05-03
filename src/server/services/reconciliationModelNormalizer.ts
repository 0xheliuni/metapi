import { db, schema } from '../db/index.js';

export type ReconciliationModelIdentity = {
  canonical: string | null;
  family: 'claude' | 'gpt' | 'gemini' | 'other';
  matchedPattern: string | null;
};

type MappingRow = typeof schema.reconciliationModelMappings.$inferSelect;

function normalizeText(value: unknown): string {
  return String(value || '').trim();
}

function normalizeFamily(value: unknown): ReconciliationModelIdentity['family'] {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'claude' || normalized === 'gpt' || normalized === 'gemini') {
    return normalized;
  }
  return 'other';
}

function inferBuiltInModelFamily(rawValue: string): ReconciliationModelIdentity {
  const lowered = rawValue.toLowerCase();
  if (!lowered) return { canonical: null, family: 'other', matchedPattern: null };
  if (lowered.includes('claude')) {
    return { canonical: rawValue, family: 'claude', matchedPattern: null };
  }
  if (lowered.includes('gpt') || lowered.includes('o1') || lowered.includes('o3') || lowered.includes('o4')) {
    return { canonical: rawValue, family: 'gpt', matchedPattern: null };
  }
  if (lowered.includes('gemini')) {
    return { canonical: rawValue, family: 'gemini', matchedPattern: null };
  }
  return { canonical: rawValue || null, family: 'other', matchedPattern: null };
}

function matchesPattern(value: string, pattern: string): boolean {
  const normalizedPattern = pattern.toLowerCase().trim();
  if (!normalizedPattern) return false;
  if (normalizedPattern.startsWith('re:')) {
    try {
      return new RegExp(normalizedPattern.slice(3), 'i').test(value);
    } catch {
      return false;
    }
  }
  if (normalizedPattern.includes('*')) {
    const regexText = normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*');
    return new RegExp(`^${regexText}$`, 'i').test(value);
  }
  return value.toLowerCase().includes(normalizedPattern);
}

export async function listReconciliationModelMappings(): Promise<MappingRow[]> {
  const rows = await db.select().from(schema.reconciliationModelMappings).all();
  return rows
    .filter((row) => !!row.enabled)
    .sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100));
}

export async function normalizeReconciliationModel(params: {
  requested?: string | null;
  actual?: string | null;
  fallbackText?: string | null;
}): Promise<ReconciliationModelIdentity> {
  const candidates = [params.actual, params.requested, params.fallbackText]
    .map(normalizeText)
    .filter(Boolean);
  const mappings = await listReconciliationModelMappings();

  for (const candidate of candidates) {
    for (const mapping of mappings) {
      if (matchesPattern(candidate, mapping.pattern)) {
        return {
          canonical: normalizeText(mapping.modelCanonical) || candidate,
          family: normalizeFamily(mapping.modelFamily),
          matchedPattern: mapping.pattern,
        };
      }
    }
  }

  return inferBuiltInModelFamily(candidates[0] || '');
}
