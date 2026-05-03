import { fetch } from 'undici';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { decryptDownstreamAdminCredential } from './downstreamSiteService.js';
import { runWithSiteApiEndpointPool } from './siteApiEndpointService.js';
import { withSiteRecordProxyRequestInit } from './siteProxy.js';

type NewApiChannelItem = {
  remoteChannelId: string;
  remoteName: string;
  remoteType: number | null;
  remoteGroup: string | null;
  balance: number | null;
  rawConsumedQuota: number | null;
  derivedConsumedUsd: number | null;
  requestCount: number | null;
  rawPayload: string;
};

function buildAdminHeaders(accessToken: string, adminUserId?: number | null): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
  };
  if (adminUserId && Number.isFinite(adminUserId)) {
    const value = String(Math.trunc(adminUserId));
    headers['New-Api-User'] = value;
    headers['Veloera-User'] = value;
    headers['voapi-user'] = value;
    headers['User-id'] = value;
    headers['Rix-Api-User'] = value;
    headers['neo-api-user'] = value;
  }
  return headers;
}

function buildSourceBaseUrl(baseUrl: string, pathname: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${normalizedBase}${normalizedPath}`;
}

function parseNewApiItems(payload: any): any[] {
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload)) return payload;
  return [];
}

function readNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readInt(value: unknown): number | null {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeChannelItem(item: any, statPayload: any): NewApiChannelItem {
  const remoteChannelId = String(item?.id ?? item?.channel_id ?? '').trim() || `channel-${Math.random().toString(36).slice(2, 10)}`;
  const remoteName = String(item?.name ?? item?.channel_name ?? remoteChannelId).trim() || remoteChannelId;
  const rawConsumedQuota = readNumber(statPayload?.data?.quota ?? item?.used_quota);
  const derivedConsumedUsd = rawConsumedQuota === null ? null : Number((rawConsumedQuota / 500000).toFixed(6));
  return {
    remoteChannelId,
    remoteName,
    remoteType: readInt(item?.type),
    remoteGroup: typeof item?.group === 'string' && item.group.trim() ? item.group.trim() : null,
    balance: readNumber(item?.balance),
    rawConsumedQuota,
    derivedConsumedUsd,
    requestCount: readInt(statPayload?.data?.rpm),
    rawPayload: JSON.stringify({ channel: item, stat: statPayload }),
  };
}

async function fetchJsonFromHostSite(input: {
  hostSite: typeof schema.sites.$inferSelect;
  path: string;
  headers: Record<string, string>;
  baseUrlOverride?: string | null;
}): Promise<any> {
  const baseUrlOverride = (input.baseUrlOverride || '').trim();
  if (baseUrlOverride) {
    const requestUrl = buildSourceBaseUrl(baseUrlOverride, input.path);
    const response = await fetch(requestUrl, withSiteRecordProxyRequestInit(input.hostSite, {
      method: 'GET',
      headers: input.headers,
    }));
    const text = await response.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${typeof payload?.message === 'string' ? payload.message : text || 'request failed'}`);
    }
    return payload;
  }

  return runWithSiteApiEndpointPool(input.hostSite, async (target) => {
    const requestUrl = buildSourceBaseUrl(target.baseUrl, input.path);
    const response = await fetch(requestUrl, withSiteRecordProxyRequestInit(input.hostSite, {
      method: 'GET',
      headers: input.headers,
    }));
    const text = await response.text();
    let payload: any = null;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${typeof payload?.message === 'string' ? payload.message : text || 'request failed'}`);
    }
    return payload;
  });
}

export async function testDownstreamSiteConnectionById(id: number): Promise<{ ok: true; channelCount: number; message: string }> {
  const source = await db.select().from(schema.downstreamSites)
    .where(eq(schema.downstreamSites.id, id))
    .get();
  if (!source) throw new Error('下游站点来源不存在');
  const hostSite = await db.select().from(schema.sites)
    .where(eq(schema.sites.id, source.hostSiteId))
    .get();
  if (!hostSite) throw new Error('宿主站点不存在');
  const accessToken = decryptDownstreamAdminCredential(source.adminCredentialCipher);
  if (!accessToken) throw new Error('管理凭证无法解密');

  const payload = await fetchJsonFromHostSite({
    hostSite,
    path: '/api/channel?page_size=1',
    headers: buildAdminHeaders(accessToken, source.adminUserId),
    baseUrlOverride: source.baseUrlOverride,
  });
  const items = parseNewApiItems(payload);
  const total = readInt(payload?.data?.total) ?? items.length;
  return {
    ok: true,
    channelCount: total,
    message: `连接成功，检测到 ${total} 个渠道`,
  };
}

export async function syncDownstreamSiteChannelsById(id: number): Promise<{ success: true; synced: number }> {
  const source = await db.select().from(schema.downstreamSites)
    .where(eq(schema.downstreamSites.id, id))
    .get();
  if (!source) throw new Error('下游站点来源不存在');
  const hostSite = await db.select().from(schema.sites)
    .where(eq(schema.sites.id, source.hostSiteId))
    .get();
  if (!hostSite) throw new Error('宿主站点不存在');
  const accessToken = decryptDownstreamAdminCredential(source.adminCredentialCipher);
  if (!accessToken) throw new Error('管理凭证无法解密');

  const headers = buildAdminHeaders(accessToken, source.adminUserId);
  const nowIso = new Date().toISOString();

  try {
    await db.update(schema.downstreamSites).set({
      lastSyncStatus: 'running',
      lastSyncMessage: '正在同步渠道快照',
      updatedAt: nowIso,
    }).where(eq(schema.downstreamSites.id, id)).run();

    const payload = await fetchJsonFromHostSite({
      hostSite,
      path: '/api/channel?page_size=1000',
      headers,
      baseUrlOverride: source.baseUrlOverride,
    });
    const items = parseNewApiItems(payload);

    const normalizedItems: NewApiChannelItem[] = [];
    for (const item of items) {
      const channelId = readInt(item?.id);
      const statPayload = channelId
        ? await fetchJsonFromHostSite({
          hostSite,
          path: `/api/log/stat?channel=${channelId}`,
          headers,
          baseUrlOverride: source.baseUrlOverride,
        })
        : null;
      normalizedItems.push(normalizeChannelItem(item, statPayload));
    }

    await db.transaction(async (tx) => {
      await tx.delete(schema.downstreamSiteChannels)
        .where(eq(schema.downstreamSiteChannels.downstreamSiteId, id))
        .run();
      if (normalizedItems.length > 0) {
        await tx.insert(schema.downstreamSiteChannels).values(
          normalizedItems.map((item) => ({
            downstreamSiteId: id,
            remoteChannelId: item.remoteChannelId,
            remoteName: item.remoteName,
            remoteType: item.remoteType,
            remoteGroup: item.remoteGroup,
            balance: item.balance,
            rawConsumedQuota: item.rawConsumedQuota,
            derivedConsumedUsd: item.derivedConsumedUsd,
            requestCount: item.requestCount,
            rawPayload: item.rawPayload,
            syncedAt: nowIso,
            createdAt: nowIso,
            updatedAt: nowIso,
          })),
        ).run();
      }
      await tx.update(schema.downstreamSites).set({
        lastSyncStatus: 'succeeded',
        lastSyncMessage: `已同步 ${normalizedItems.length} 个渠道`,
        lastSyncAt: nowIso,
        updatedAt: nowIso,
      }).where(eq(schema.downstreamSites.id, id)).run();
    });

    return { success: true, synced: normalizedItems.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '同步失败');
    await db.update(schema.downstreamSites).set({
      lastSyncStatus: 'failed',
      lastSyncMessage: message,
      lastSyncAt: nowIso,
      updatedAt: nowIso,
    }).where(eq(schema.downstreamSites.id, id)).run();
    throw error;
  }
}
