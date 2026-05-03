import type { BuiltReconciliationFact } from './reconciliationFactBuilderService.js';
import { explainReconciliationResult } from './reconciliationExplainService.js';

export type BuiltReconciliationResult = {
  sourceType: string;
  sourceId: number | null;
  hostSiteId: number | null;
  downstreamSiteId: number | null;
  timeBucketType: string;
  timeBucketStart: string;
  timeBucketEnd: string;
  modelFamily: string;
  modelCanonical: string | null;
  downstreamBilledTokens: number;
  downstreamBilledCostUsd: number;
  metapiObservedTokens: number;
  metapiObservedCostUsd: number;
  upstreamConsumedQuota: number;
  upstreamConsumedCostUsdDerived: number;
  deltaTokens: number;
  deltaCostUsd: number;
  deltaRate: number | null;
  status: 'matched' | 'warning' | 'mismatch' | 'ignored';
  confidenceScore: number;
  explanationCodes: string;
  explanationText: string;
};

function numberOrZero(value: unknown): number {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric;
}

function integerOrZero(value: unknown): number {
  return Math.max(0, Math.round(numberOrZero(value)));
}

export function matchReconciliationFacts(facts: BuiltReconciliationFact[]): BuiltReconciliationResult[] {
  const bucket = new Map<string, BuiltReconciliationResult>();

  for (const fact of facts) {
    const key = [fact.timeBucketStart, fact.timeBucketEnd, fact.modelFamily || 'other'].join('::');
    const current: BuiltReconciliationResult = bucket.get(key) || {
      sourceType: fact.sourceType ?? 'global',
      sourceId: fact.sourceId ?? null,
      hostSiteId: fact.hostSiteId ?? null,
      downstreamSiteId: fact.downstreamSiteId ?? null,
      timeBucketType: fact.timeBucketType ?? 'day',
      timeBucketStart: fact.timeBucketStart ?? '',
      timeBucketEnd: fact.timeBucketEnd ?? '',
      modelFamily: fact.modelFamily || 'other',
      modelCanonical: fact.modelCanonical || null,
      downstreamBilledTokens: 0,
      downstreamBilledCostUsd: 0,
      metapiObservedTokens: 0,
      metapiObservedCostUsd: 0,
      upstreamConsumedQuota: 0,
      upstreamConsumedCostUsdDerived: 0,
      deltaTokens: 0,
      deltaCostUsd: 0,
      deltaRate: null,
      status: 'warning',
      confidenceScore: 0,
      explanationCodes: '[]',
      explanationText: '',
    };

    if (fact.factType === 'downstream_billed') {
      current.downstreamBilledTokens += integerOrZero(fact.tokenCount);
      current.downstreamBilledCostUsd += numberOrZero(fact.costUsd);
    }
    if (fact.factType === 'metapi_observed') {
      current.metapiObservedTokens += integerOrZero(fact.tokenCount);
      current.metapiObservedCostUsd += numberOrZero(fact.costUsd);
    }
    if (fact.factType === 'upstream_consumed') {
      current.upstreamConsumedQuota += numberOrZero(fact.billedQuota);
      current.upstreamConsumedCostUsdDerived += numberOrZero(fact.costUsd);
      if (!current.downstreamSiteId && fact.downstreamSiteId) current.downstreamSiteId = fact.downstreamSiteId;
    }

    bucket.set(key, current);
  }

  return Array.from(bucket.values()).map((item) => {
    const deltaTokens = item.downstreamBilledTokens - item.metapiObservedTokens;
    const deltaCostUsd = item.downstreamBilledCostUsd - item.upstreamConsumedCostUsdDerived;
    const base = Math.max(item.downstreamBilledCostUsd, item.upstreamConsumedCostUsdDerived, 0);
    const explanation = explainReconciliationResult({
      modelFamily: item.modelFamily,
      downstreamBilledTokens: item.downstreamBilledTokens,
      metapiObservedTokens: item.metapiObservedTokens,
      upstreamConsumedQuota: item.upstreamConsumedQuota,
      deltaCostUsd,
      hasUpstreamFacts: item.upstreamConsumedQuota > 0 || item.upstreamConsumedCostUsdDerived > 0,
      usedSnapshotInference: true,
    });

    return {
      ...item,
      deltaTokens,
      deltaCostUsd: Number(deltaCostUsd.toFixed(6)),
      deltaRate: base > 0 ? Number((Math.abs(deltaCostUsd) / base).toFixed(6)) : null,
      status: explanation.status,
      confidenceScore: explanation.confidenceScore,
      explanationCodes: JSON.stringify(explanation.codes),
      explanationText: explanation.text,
    };
  });
}
