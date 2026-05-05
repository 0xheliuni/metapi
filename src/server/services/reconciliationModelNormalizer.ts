import { db, schema } from '../db/index.js';

export type ReconciliationModelIdentity = {
  canonical: string | null;
  family: 'claude' | 'gpt' | 'gemini' | 'other';
  provider: 'openai' | 'anthropic' | 'google' | 'other';
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

function normalizeProvider(value: unknown): ReconciliationModelIdentity['provider'] {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === 'openai' || normalized === 'anthropic' || normalized === 'google') {
    return normalized;
  }
  return 'other';
}

function providerFromFamily(family: ReconciliationModelIdentity['family']): ReconciliationModelIdentity['provider'] {
  if (family === 'gpt') return 'openai';
  if (family === 'claude') return 'anthropic';
  if (family === 'gemini') return 'google';
  return 'other';
}

function inferBuiltInModelFamily(rawValue: string): ReconciliationModelIdentity {
  const lowered = rawValue.toLowerCase();
  if (!lowered) return { canonical: null, family: 'other', provider: 'other', matchedPattern: null };
  if (lowered.includes('claude')) {
    return { canonical: rawValue, family: 'claude', provider: 'anthropic', matchedPattern: null };
  }
  if (lowered.includes('anthropic')) {
    return { canonical: rawValue, family: 'claude', provider: 'anthropic', matchedPattern: null };
  }
  if (lowered.includes('gpt') || lowered.includes('o1') || lowered.includes('o3') || lowered.includes('o4')) {
    return { canonical: rawValue, family: 'gpt', provider: 'openai', matchedPattern: null };
  }
  if (lowered.includes('openai')) {
    return { canonical: rawValue, family: 'gpt', provider: 'openai', matchedPattern: null };
  }
  if (lowered.includes('gemini')) {
    return { canonical: rawValue, family: 'gemini', provider: 'google', matchedPattern: null };
  }
  if (lowered.includes('google')) {
    return { canonical: rawValue, family: 'gemini', provider: 'google', matchedPattern: null };
  }
  return { canonical: rawValue || null, family: 'other', provider: 'other', matchedPattern: null };
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
        const family = normalizeFamily(mapping.modelFamily);
        return {
          canonical: normalizeText(mapping.modelCanonical) || candidate,
          family,
          provider: normalizeProvider(mapping.supplierHint) || providerFromFamily(family),
          matchedPattern: mapping.pattern,
        };
      }
    }
  }

  return inferBuiltInModelFamily(candidates[0] || '');
}
