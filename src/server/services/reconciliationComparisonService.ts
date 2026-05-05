import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { normalizeReconciliationModel, type ReconciliationModelIdentity } from './reconciliationModelNormalizer.js';

type ProviderFilter = 'all' | 'openai' | 'anthropic' | 'google' | 'other';
type ModelGroupFilter = 'all' | 'gpt' | 'claude' | 'gemini' | 'other';
type DownstreamSiteRow = typeof schema.downstreamSites.$inferSelect;

type RouteSummary = {
  id: number;
  modelPattern: string;
};

type RouteChannelMeta = {
  channelId: number;
  routeId: number;
  accountId: number;
  tokenId: number | null;
  sourceModel: string | null;
  siteId: number;
  siteName: string;
  tokenName: string | null;
};

type DownstreamKeyMeta = {
  id: number;
  name: string;
};

type ComparisonMetapiChannel = {
  key: string;
  routeId: number | null;
  routeModelPattern: string | null;
  channelId: number | null;
  sourceModel: string | null;
  accountId: number | null;
  siteId: number | null;
  siteName: string | null;
  tokenId: number | null;
  tokenName: string | null;
  requestCount: number;
  observedTokens: number;
  observedCostUsd: number;
  downstreamApiKeyIds: number[];
};

type ComparisonSupplierChannel = {
  key: string;
  remoteChannelId: string;
  remoteName: string;
  remoteGroup: string | null;
  requestCount: number | null;
  consumedQuota: number | null;
  consumedCostUsd: number | null;
  syncedAt: string | null;
  basis: 'snapshot-fallback';
  confidence: number;
  notes: string[];
};

type ComparisonGroup = {
  groupKey: string;
  downstreamSiteId: number | null;
  downstreamSiteName: string | null;
  hostSiteId: number | null;
  hostSiteName: string | null;
  provider: Exclude<ProviderFilter, 'all'>;
  modelGroup: Exclude<ModelGroupFilter, 'all'>;
  modelCanonicalSamples: string[];
  metapiTotals: {
    requestCount: number;
    observedTokens: number;
    observedCostUsd: number;
    channelCount: number;
  };
  supplierTotals: {
    requestCount: number | null;
    consumedQuota: number | null;
    consumedCostUsd: number | null;
    channelCount: number;
  };
  metapiChannels: ComparisonMetapiChannel[];
  supplierChannels: ComparisonSupplierChannel[];
};

export type ReconciliationComparisonResponse = {
  basis: 'snapshot-fallback';
  warnings: string[];
  filters: {
    downstreamSiteId: number | null;
    provider: ProviderFilter;
    modelGroup: ModelGroupFilter;
  };
  groups: ComparisonGroup[];
};

function numberOrZero(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function pushUnique(items: string[], value: string | null | undefined) {
  const normalized = String(value || '').trim();
  if (!normalized || items.includes(normalized)) return;
  items.push(normalized);
}

function isProviderAllowed(provider: ComparisonGroup['provider'], filter: ProviderFilter): boolean {
  return filter === 'all' || provider === filter;
}

function isModelGroupAllowed(modelGroup: ComparisonGroup['modelGroup'], filter: ModelGroupFilter): boolean {
  return filter === 'all' || modelGroup === filter;
}

function buildSnapshotIdentity(channel: typeof schema.downstreamSiteChannels.$inferSelect): string {
  const payload = parseJsonObject(channel.rawPayload);
  const channelPayload = payload && typeof payload.channel === 'object' && payload.channel && !Array.isArray(payload.channel)
    ? payload.channel as Record<string, unknown>
    : null;
  return [
    channel.remoteName,
    channel.remoteGroup,
    typeof channelPayload?.name === 'string' ? channelPayload.name : '',
    typeof channelPayload?.group === 'string' ? channelPayload.group : '',
    typeof channelPayload?.models === 'string' ? channelPayload.models : '',
    typeof channelPayload?.model === 'string' ? channelPayload.model : '',
  ].filter(Boolean).join(' ');
}

async function resolveComparisonIdentity(params: {
  sourceModel?: string | null;
  routeModelPattern?: string | null;
  fallbackText?: string | null;
}): Promise<ReconciliationModelIdentity> {
  return normalizeReconciliationModel({
    actual: params.sourceModel,
    requested: params.routeModelPattern,
    fallbackText: params.fallbackText,
  });
}

function createComparisonGroup(input: {
  groupKey: string;
  downstreamSiteId: number | null;
  downstreamSiteName: string | null;
  hostSiteId: number | null;
  hostSiteName: string | null;
  provider: Exclude<ProviderFilter, 'all'>;
  modelGroup: Exclude<ModelGroupFilter, 'all'>;
}): ComparisonGroup {
  return {
    groupKey: input.groupKey,
    downstreamSiteId: input.downstreamSiteId,
    downstreamSiteName: input.downstreamSiteName,
    hostSiteId: input.hostSiteId,
    hostSiteName: input.hostSiteName,
    provider: input.provider,
    modelGroup: input.modelGroup,
    modelCanonicalSamples: [],
    metapiTotals: {
      requestCount: 0,
      observedTokens: 0,
      observedCostUsd: 0,
      channelCount: 0,
    },
    supplierTotals: {
      requestCount: 0,
      consumedQuota: 0,
      consumedCostUsd: 0,
      channelCount: 0,
    },
    metapiChannels: [],
    supplierChannels: [],
  };
}

export async function getReconciliationComparison(params: {
  runId: number;
  downstreamSiteId?: number | null;
  provider?: ProviderFilter;
  modelGroup?: ModelGroupFilter;
}): Promise<ReconciliationComparisonResponse> {
  const run = await db.select().from(schema.reconciliationRuns)
    .where(eq(schema.reconciliationRuns.id, params.runId))
    .get();
  if (!run) {
    throw new Error('对账任务不存在');
  }

  const providerFilter = params.provider ?? 'all';
  const modelGroupFilter = params.modelGroup ?? 'all';
  const downstreamSites = await db.select().from(schema.downstreamSites).all();
  const downstreamSiteIds = params.downstreamSiteId
    ? [params.downstreamSiteId]
    : downstreamSites.map((site) => site.id);

  const downstreamChannels = downstreamSiteIds.length > 0
    ? await db.select().from(schema.downstreamSiteChannels)
      .where(inArray(schema.downstreamSiteChannels.downstreamSiteId, downstreamSiteIds))
      .all()
    : [];

  const tokenRoutes: RouteSummary[] = await db.select({
    id: schema.tokenRoutes.id,
    modelPattern: schema.tokenRoutes.modelPattern,
  }).from(schema.tokenRoutes).all();
  const routeMap = new Map<number, RouteSummary>(tokenRoutes.map((route) => [route.id, route]));

  const routeChannelRows: RouteChannelMeta[] = await db.select({
    channelId: schema.routeChannels.id,
    routeId: schema.routeChannels.routeId,
    accountId: schema.routeChannels.accountId,
    tokenId: schema.routeChannels.tokenId,
    sourceModel: schema.routeChannels.sourceModel,
    siteId: schema.accounts.siteId,
    siteName: schema.sites.name,
    tokenName: schema.accountTokens.name,
  })
    .from(schema.routeChannels)
    .innerJoin(schema.accounts, eq(schema.routeChannels.accountId, schema.accounts.id))
    .innerJoin(schema.sites, eq(schema.accounts.siteId, schema.sites.id))
    .leftJoin(schema.accountTokens, eq(schema.routeChannels.tokenId, schema.accountTokens.id))
    .all();
  const routeChannelMap = new Map<number, RouteChannelMeta>(routeChannelRows.map((row) => [row.channelId, row]));

  const downstreamKeyRows: DownstreamKeyMeta[] = await db.select({
    id: schema.downstreamApiKeys.id,
    name: schema.downstreamApiKeys.name,
  }).from(schema.downstreamApiKeys).all();
  const downstreamKeyMap = new Map<number, DownstreamKeyMeta>(downstreamKeyRows.map((row) => [row.id, row]));

  const siteRows: Array<{ id: number; name: string }> = await db.select({
    id: schema.sites.id,
    name: schema.sites.name,
  }).from(schema.sites).all();
  const siteMap = new Map<number, string>(siteRows.map((row) => [row.id, row.name]));
  const downstreamSiteMap = new Map<number, DownstreamSiteRow>(downstreamSites.map((site) => [site.id, site]));

  const logRows = await db.select().from(schema.proxyLogs)
    .where(and(
      gte(schema.proxyLogs.createdAt, run.windowStart),
      lt(schema.proxyLogs.createdAt, run.windowEnd),
      eq(schema.proxyLogs.status, 'success'),
    ))
    .all();

  const groupMap = new Map<string, ComparisonGroup>();
  const warnings = new Set<string>(['SNAPSHOT_FALLBACK_USED', 'EXPLANATORY_COMPARISON_ONLY']);

  for (const row of logRows) {
    const routeChannel = row.channelId ? routeChannelMap.get(row.channelId) : null;
    const routeModelPattern = row.routeId ? routeMap.get(row.routeId)?.modelPattern || null : null;
    const identity = await resolveComparisonIdentity({
      sourceModel: row.modelActual || routeChannel?.sourceModel || null,
      routeModelPattern: row.modelRequested || routeModelPattern,
      fallbackText: routeChannel?.sourceModel || null,
    });
    const provider = identity.provider;
    const modelGroup = identity.family;
    if (!isProviderAllowed(provider, providerFilter) || !isModelGroupAllowed(modelGroup, modelGroupFilter)) {
      continue;
    }

    const downstreamSiteId = params.downstreamSiteId ?? null;
    const downstreamSite = downstreamSiteId ? downstreamSiteMap.get(downstreamSiteId) ?? null : null;
    const groupKey = [downstreamSiteId || 'all', provider, modelGroup].join('::');
    let group = groupMap.get(groupKey);
    if (!group) {
      group = createComparisonGroup({
        groupKey,
        downstreamSiteId,
        downstreamSiteName: downstreamSite?.name || null,
        hostSiteId: downstreamSite?.hostSiteId || null,
        hostSiteName: downstreamSite?.hostSiteId ? siteMap.get(downstreamSite.hostSiteId) || null : null,
        provider,
        modelGroup,
      });
      groupMap.set(groupKey, group);
    }

    pushUnique(group.modelCanonicalSamples, identity.canonical);
    group.metapiTotals.requestCount += 1;
    group.metapiTotals.observedTokens += Math.round(numberOrZero(row.totalTokens));
    group.metapiTotals.observedCostUsd += numberOrZero(row.estimatedCost);

    const channelKey = `metapi-${row.channelId || 'none'}-${routeChannel?.tokenId || 'no-token'}`;
    let metapiChannel = group.metapiChannels.find((item) => item.key === channelKey);
    if (!metapiChannel) {
      metapiChannel = {
        key: channelKey,
        routeId: row.routeId ?? null,
        routeModelPattern,
        channelId: row.channelId ?? null,
        sourceModel: routeChannel?.sourceModel || row.modelActual || row.modelRequested || null,
        accountId: row.accountId ?? routeChannel?.accountId ?? null,
        siteId: routeChannel?.siteId ?? null,
        siteName: routeChannel?.siteName ?? null,
        tokenId: routeChannel?.tokenId ?? null,
        tokenName: routeChannel?.tokenName ?? null,
        requestCount: 0,
        observedTokens: 0,
        observedCostUsd: 0,
        downstreamApiKeyIds: [],
      };
      group.metapiChannels.push(metapiChannel);
    }
    metapiChannel.requestCount += 1;
    metapiChannel.observedTokens += Math.round(numberOrZero(row.totalTokens));
    metapiChannel.observedCostUsd += numberOrZero(row.estimatedCost);
    if (row.downstreamApiKeyId && !metapiChannel.downstreamApiKeyIds.includes(row.downstreamApiKeyId)) {
      metapiChannel.downstreamApiKeyIds.push(row.downstreamApiKeyId);
    }
  }

  for (const channel of downstreamChannels) {
    const identity = await resolveComparisonIdentity({
      fallbackText: buildSnapshotIdentity(channel),
    });
    const provider = identity.provider;
    const modelGroup = identity.family;
    if (!isProviderAllowed(provider, providerFilter) || !isModelGroupAllowed(modelGroup, modelGroupFilter)) {
      continue;
    }

    const downstreamSite = downstreamSiteMap.get(channel.downstreamSiteId) ?? null;
    const groupKey = [channel.downstreamSiteId, provider, modelGroup].join('::');
    let group = groupMap.get(groupKey);
    if (!group) {
      group = createComparisonGroup({
        groupKey,
        downstreamSiteId: channel.downstreamSiteId,
        downstreamSiteName: downstreamSite?.name || null,
        hostSiteId: downstreamSite?.hostSiteId || null,
        hostSiteName: downstreamSite?.hostSiteId ? siteMap.get(downstreamSite.hostSiteId) || null : null,
        provider,
        modelGroup,
      });
      groupMap.set(groupKey, group);
    }

    pushUnique(group.modelCanonicalSamples, identity.canonical);
    group.supplierChannels.push({
      key: `supplier-${channel.downstreamSiteId}-${channel.remoteChannelId}`,
      remoteChannelId: channel.remoteChannelId,
      remoteName: channel.remoteName,
      remoteGroup: channel.remoteGroup,
      requestCount: channel.requestCount,
      consumedQuota: channel.rawConsumedQuota,
      consumedCostUsd: channel.derivedConsumedUsd,
      syncedAt: channel.syncedAt,
      basis: 'snapshot-fallback',
      confidence: 0.45,
      notes: [
        '当前展示基于已同步的 downstream channel 快照',
        '供应商金额为 quota 推导值，并非逐 token 实时报价',
      ],
    });
    group.supplierTotals.requestCount = numberOrZero(group.supplierTotals.requestCount) + numberOrZero(channel.requestCount);
    group.supplierTotals.consumedQuota = numberOrZero(group.supplierTotals.consumedQuota) + numberOrZero(channel.rawConsumedQuota);
    group.supplierTotals.consumedCostUsd = numberOrZero(group.supplierTotals.consumedCostUsd) + numberOrZero(channel.derivedConsumedUsd);
  }

  const groups = Array.from(groupMap.values())
    .map((group) => ({
      ...group,
      metapiChannels: group.metapiChannels
        .map((item) => ({
          ...item,
          downstreamApiKeyIds: item.downstreamApiKeyIds.sort((left, right) => left - right),
        }))
        .sort((left, right) => right.observedCostUsd - left.observedCostUsd),
      supplierChannels: group.supplierChannels
        .sort((left, right) => numberOrZero(right.consumedCostUsd) - numberOrZero(left.consumedCostUsd)),
      metapiTotals: {
        ...group.metapiTotals,
        observedCostUsd: Number(group.metapiTotals.observedCostUsd.toFixed(6)),
        channelCount: group.metapiChannels.length,
      },
      supplierTotals: {
        requestCount: group.supplierChannels.length > 0 ? Math.round(numberOrZero(group.supplierTotals.requestCount)) : null,
        consumedQuota: group.supplierChannels.length > 0 ? Number(numberOrZero(group.supplierTotals.consumedQuota).toFixed(6)) : null,
        consumedCostUsd: group.supplierChannels.length > 0 ? Number(numberOrZero(group.supplierTotals.consumedCostUsd).toFixed(6)) : null,
        channelCount: group.supplierChannels.length,
      },
    }))
    .filter((group) => group.metapiChannels.length > 0 || group.supplierChannels.length > 0)
    .sort((left, right) => numberOrZero(right.metapiTotals.observedCostUsd) - numberOrZero(left.metapiTotals.observedCostUsd));

  for (const group of groups) {
    if (group.downstreamSiteId === null) {
      warnings.add('DOWNSTREAM_SITE_FILTER_RECOMMENDED');
      for (const channel of group.metapiChannels) {
        if (channel.downstreamApiKeyIds.length > 0) {
          const keyNames = channel.downstreamApiKeyIds
            .map((id) => downstreamKeyMap.get(id)?.name || `#${id}`)
            .join(', ');
          if (keyNames) {
            channel.tokenName = channel.tokenName || keyNames;
          }
        }
      }
    }
  }

  return {
    basis: 'snapshot-fallback',
    warnings: Array.from(warnings.values()),
    filters: {
      downstreamSiteId: params.downstreamSiteId ?? null,
      provider: providerFilter,
      modelGroup: modelGroupFilter,
    },
    groups,
  };
}
