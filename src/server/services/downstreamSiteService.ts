import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { decryptAccountPassword, encryptAccountPassword } from './accountCredentialService.js';

export type DownstreamSiteRow = typeof schema.downstreamSites.$inferSelect;
export type DownstreamSiteChannelRow = typeof schema.downstreamSiteChannels.$inferSelect;

export type DownstreamSiteView = {
  id: number;
  name: string;
  hostSiteId: number;
  hostSiteName: string | null;
  hostSiteUrl: string | null;
  hostSitePlatform: string | null;
  baseUrlOverride: string | null;
  authMode: string;
  adminCredentialMasked: string;
  adminUserId: number | null;
  description: string | null;
  enabled: boolean;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  lastSyncAt: string | null;
  channelCount: number;
  totalDerivedConsumedUsd: number;
  updatedAt: string | null;
  createdAt: string | null;
};

export type NormalizedDownstreamSitePayload = {
  name: string;
  hostSiteId: number;
  baseUrlOverride: string | null;
  authMode: 'session-admin';
  adminCredential: string;
  adminUserId: number | null;
  description: string | null;
  enabled: boolean;
};

function normalizeOptionalText(input: unknown, maxLength: number): string | null {
  if (input === undefined || input === null) return null;
  const value = String(input).trim();
  if (!value) return null;
  return value.slice(0, maxLength);
}

function normalizeRequiredText(input: unknown, maxLength: number, label: string): string {
  const value = normalizeOptionalText(input, maxLength);
  if (!value) {
    throw new Error(`${label} 不能为空`);
  }
  return value;
}

function normalizePositiveIntOrNull(input: unknown): number | null {
  if (input === undefined || input === null || input === '') return null;
  const parsed = Number.parseInt(String(input), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function normalizeBoolean(input: unknown, fallback: boolean): boolean {
  if (typeof input === 'boolean') return input;
  return fallback;
}

function normalizeBaseUrlOverride(input: unknown): string | null {
  const value = normalizeOptionalText(input, 2000);
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    throw new Error('baseUrlOverride 必须是有效的 http(s) URL');
  }
}

function assertBaseUrlOverrideMatchesHostSite(hostSiteUrl: string, baseUrlOverride: string | null): void {
  if (!baseUrlOverride) return;
  let hostUrl: URL;
  let overrideUrl: URL;
  try {
    hostUrl = new URL(hostSiteUrl);
    overrideUrl = new URL(baseUrlOverride);
  } catch {
    throw new Error('baseUrlOverride 必须与宿主站点保持同源');
  }

  if (hostUrl.origin !== overrideUrl.origin) {
    throw new Error('baseUrlOverride 必须与宿主站点保持同源');
  }
}

function normalizeAuthMode(input: unknown): 'session-admin' {
  const value = String(input || '').trim().toLowerCase();
  if (!value || value === 'session-admin') return 'session-admin';
  throw new Error('当前仅支持 session-admin 认证模式');
}

function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}

export function normalizeDownstreamSitePayload(input: {
  name?: unknown;
  hostSiteId?: unknown;
  baseUrlOverride?: unknown;
  authMode?: unknown;
  adminCredential?: unknown;
  adminUserId?: unknown;
  description?: unknown;
  enabled?: unknown;
}): NormalizedDownstreamSitePayload {
  const name = normalizeRequiredText(input.name, 120, 'name');
  const hostSiteId = normalizePositiveIntOrNull(input.hostSiteId);
  if (!hostSiteId) {
    throw new Error('hostSiteId 无效');
  }
  const adminCredential = normalizeRequiredText(input.adminCredential, 4000, 'adminCredential');
  return {
    name,
    hostSiteId,
    baseUrlOverride: normalizeBaseUrlOverride(input.baseUrlOverride),
    authMode: normalizeAuthMode(input.authMode),
    adminCredential,
    adminUserId: normalizePositiveIntOrNull(input.adminUserId),
    description: normalizeOptionalText(input.description, 500),
    enabled: normalizeBoolean(input.enabled, true),
  };
}

export function toDownstreamSiteView(input: {
  row: DownstreamSiteRow;
  hostSite?: typeof schema.sites.$inferSelect | null;
  channelCount?: number;
  totalDerivedConsumedUsd?: number;
}): DownstreamSiteView {
  const { row, hostSite } = input;
  const credential = decryptAccountPassword(row.adminCredentialCipher) || '';
  return {
    id: row.id,
    name: row.name,
    hostSiteId: row.hostSiteId,
    hostSiteName: hostSite?.name || null,
    hostSiteUrl: hostSite?.url || null,
    hostSitePlatform: hostSite?.platform || null,
    baseUrlOverride: row.baseUrlOverride,
    authMode: row.authMode,
    adminCredentialMasked: maskSecret(credential),
    adminUserId: row.adminUserId ?? null,
    description: row.description ?? null,
    enabled: !!row.enabled,
    lastSyncStatus: row.lastSyncStatus ?? null,
    lastSyncMessage: row.lastSyncMessage ?? null,
    lastSyncAt: row.lastSyncAt ?? null,
    channelCount: Math.max(0, Math.trunc(input.channelCount || 0)),
    totalDerivedConsumedUsd: Number((input.totalDerivedConsumedUsd || 0).toFixed(6)),
    updatedAt: row.updatedAt ?? null,
    createdAt: row.createdAt ?? null,
  };
}

export async function listDownstreamSites(): Promise<DownstreamSiteView[]> {
  const [rows, hostSites, channelRows] = await Promise.all([
    db.select().from(schema.downstreamSites).all(),
    db.select().from(schema.sites).all(),
    db.select().from(schema.downstreamSiteChannels).all(),
  ]);

  const hostSiteById = new Map<number, typeof schema.sites.$inferSelect>();
  for (const site of hostSites) {
    hostSiteById.set(site.id, site);
  }
  const channelStatsBySiteId = new Map<number, { count: number; totalDerivedConsumedUsd: number }>();
  for (const row of channelRows) {
    const current = channelStatsBySiteId.get(row.downstreamSiteId) || { count: 0, totalDerivedConsumedUsd: 0 };
    current.count += 1;
    current.totalDerivedConsumedUsd += Number(row.derivedConsumedUsd || 0);
    channelStatsBySiteId.set(row.downstreamSiteId, current);
  }

  return rows
    .map((row) => {
      const stats = channelStatsBySiteId.get(row.id);
      return toDownstreamSiteView({
        row,
        hostSite: hostSiteById.get(row.hostSiteId) || null,
        channelCount: stats?.count || 0,
        totalDerivedConsumedUsd: stats?.totalDerivedConsumedUsd || 0,
      });
    })
    .sort((left, right) => right.id - left.id);
}

export async function getDownstreamSiteById(id: number): Promise<DownstreamSiteView | null> {
  const row = await db.select().from(schema.downstreamSites)
    .where(eq(schema.downstreamSites.id, id))
    .get();
  if (!row) return null;
  const hostSite = await db.select().from(schema.sites)
    .where(eq(schema.sites.id, row.hostSiteId))
    .get();
  const channels = await db.select().from(schema.downstreamSiteChannels)
    .where(eq(schema.downstreamSiteChannels.downstreamSiteId, id))
    .all();
  const totalDerivedConsumedUsd = channels.reduce((sum, item) => sum + Number(item.derivedConsumedUsd || 0), 0);
  return toDownstreamSiteView({
    row,
    hostSite,
    channelCount: channels.length,
    totalDerivedConsumedUsd,
  });
}

export async function listDownstreamSiteChannels(downstreamSiteId: number): Promise<DownstreamSiteChannelRow[]> {
  const rows = await db.select().from(schema.downstreamSiteChannels)
    .where(eq(schema.downstreamSiteChannels.downstreamSiteId, downstreamSiteId))
    .all();
  return rows.sort((left, right) => String(left.remoteName || '').localeCompare(String(right.remoteName || '')));
}

export async function validateDownstreamSiteHost(
  hostSiteId: number,
  baseUrlOverride?: string | null,
): Promise<typeof schema.sites.$inferSelect> {
  const hostSite = await db.select().from(schema.sites)
    .where(eq(schema.sites.id, hostSiteId))
    .get();
  if (!hostSite) {
    throw new Error('宿主站点不存在');
  }
  if (String(hostSite.platform || '').trim().toLowerCase() !== 'new-api') {
    throw new Error('当前仅支持绑定 new-api 宿主站点');
  }
  assertBaseUrlOverrideMatchesHostSite(hostSite.url, baseUrlOverride ?? null);
  return hostSite;
}

export function encryptDownstreamAdminCredential(secret: string): string {
  return encryptAccountPassword(secret);
}

export function decryptDownstreamAdminCredential(cipherText: string): string | null {
  return decryptAccountPassword(cipherText);
}
