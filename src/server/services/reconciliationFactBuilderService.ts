import { and, eq, gte, lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { normalizeReconciliationModel } from './reconciliationModelNormalizer.js';
import type { ReconciliationWindow } from './reconciliationWindowService.js';

export type BuiltReconciliationFact = typeof schema.reconciliationFacts.$inferInsert;
type BuiltReconciliationFactBase = Omit<BuiltReconciliationFact, 'factType'>;

function numberOrZero(value: unknown): number {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return 0;
  return numeric;
}

function integerOrZero(value: unknown): number {
  return Math.max(0, Math.round(numberOrZero(value)));
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function inferSnapshotText(channel: typeof schema.downstreamSiteChannels.$inferSelect): string {
  const payload = parseJsonObject(channel.rawPayload);
  return [
    channel.remoteName,
    channel.remoteGroup,
    typeof payload?.model === 'string' ? payload.model : '',
    typeof payload?.name === 'string' ? payload.name : '',
  ].filter(Boolean).join(' ');
}

export async function buildReconciliationFacts(params: {
  runId: number;
  window: ReconciliationWindow;
}): Promise<BuiltReconciliationFact[]> {
  const proxyRows = await db.select().from(schema.proxyLogs)
    .where(and(
      gte(schema.proxyLogs.createdAt, params.window.windowStart),
      lt(schema.proxyLogs.createdAt, params.window.windowEnd),
      eq(schema.proxyLogs.status, 'success'),
    ))
    .all();

  const channelRows = await db.select().from(schema.downstreamSiteChannels).all();
  const facts: BuiltReconciliationFact[] = [];

  for (const row of proxyRows) {
    const normalized = await normalizeReconciliationModel({
      requested: row.modelRequested,
      actual: row.modelActual,
    });

    const baseFact: BuiltReconciliationFactBase = {
      runId: params.runId,
      sourceType: 'global',
      sourceId: null,
      hostSiteId: null,
      downstreamSiteId: null,
      supplierSiteId: null,
      timeBucketType: params.window.scopeType,
      timeBucketStart: params.window.windowStart,
      timeBucketEnd: params.window.windowEnd,
      modelRequestedRaw: row.modelRequested,
      modelActualRaw: row.modelActual,
      modelCanonical: normalized.canonical,
      modelFamily: normalized.family,
      supplierKey: null,
      supplierConfidence: null,
      requestCount: 1,
      tokenCount: integerOrZero(row.totalTokens),
      billedQuota: null,
      costUsd: numberOrZero(row.estimatedCost),
      usageConfidence: 0.9,
      priceConfidence: row.estimatedCost ? 0.8 : 0.4,
      rawPayload: row.billingDetails,
    };

    facts.push({
      ...baseFact,
      factType: 'metapi_observed',
    });

    if (row.downstreamApiKeyId) {
      facts.push({
        ...baseFact,
        factType: 'downstream_billed',
        usageConfidence: 0.85,
      });
    }
  }

  for (const channel of channelRows) {
    const normalized = await normalizeReconciliationModel({
      fallbackText: inferSnapshotText(channel),
    });

    facts.push({
      runId: params.runId,
      factType: 'upstream_consumed',
      sourceType: 'global',
      sourceId: null,
      hostSiteId: null,
      downstreamSiteId: channel.downstreamSiteId,
      supplierSiteId: null,
      timeBucketType: params.window.scopeType,
      timeBucketStart: params.window.windowStart,
      timeBucketEnd: params.window.windowEnd,
      modelRequestedRaw: null,
      modelActualRaw: inferSnapshotText(channel),
      modelCanonical: normalized.canonical,
      modelFamily: normalized.family,
      supplierKey: channel.remoteChannelId,
      supplierConfidence: 0.4,
      requestCount: integerOrZero(channel.requestCount),
      tokenCount: null,
      billedQuota: numberOrZero(channel.rawConsumedQuota),
      costUsd: numberOrZero(channel.derivedConsumedUsd),
      usageConfidence: 0.35,
      priceConfidence: 0.35,
      rawPayload: channel.rawPayload,
    });
  }

  return facts;
}
