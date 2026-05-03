import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testConnectionMock = vi.fn();
const syncMock = vi.fn();

vi.mock('../../services/downstreamSiteSyncService.js', () => ({
  testDownstreamSiteConnectionById: (...args: unknown[]) => testConnectionMock(...args),
  syncDownstreamSiteChannelsById: (...args: unknown[]) => syncMock(...args),
}));

type DbModule = typeof import('../../db/index.js');

describe('downstream sites routes', () => {
  let app: FastifyInstance;
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let closeDbConnections: DbModule['closeDbConnections'] | undefined;
  let dataDir = '';

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-downstream-sites-'));
    process.env.DATA_DIR = dataDir;

    await import('../../db/migrate.js');
    const dbModule = await import('../../db/index.js');
    const routesModule = await import('./downstreamSites.js');
    db = dbModule.db;
    schema = dbModule.schema;
    closeDbConnections = dbModule.closeDbConnections;

    app = Fastify();
    await app.register(routesModule.downstreamSitesRoutes);
  });

  beforeEach(async () => {
    testConnectionMock.mockReset();
    syncMock.mockReset();
    await db.delete(schema.downstreamSiteChannels).run();
    await db.delete(schema.downstreamSites).run();
    await db.delete(schema.sites).run();
  });

  afterAll(async () => {
    await app.close();
    if (typeof closeDbConnections === 'function') {
      await closeDbConnections();
    }
    if (dataDir) {
      rmSync(dataDir, { recursive: true, force: true });
    }
    delete process.env.DATA_DIR;
  });

  it('creates, updates, lists and deletes downstream sites', async () => {
    const hostSite = await db.insert(schema.sites).values({
      name: 'Downstream Host',
      url: 'https://downstream.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();

    const createRes = await app.inject({
      method: 'POST',
      url: '/api/downstream-sites',
      payload: {
        name: '主站消费源',
        hostSiteId: hostSite.id,
        adminCredential: 'admin-token-001',
        adminUserId: 7788,
        description: 'MVP source',
      },
    });
    expect(createRes.statusCode).toBe(200);
    const createdBody = createRes.json() as { success: boolean; item: { id: number; name: string; hostSiteId: number; adminCredentialMasked: string } };
    expect(createdBody.success).toBe(true);
    expect(createdBody.item).toMatchObject({
      name: '主站消费源',
      hostSiteId: hostSite.id,
      adminCredentialMasked: expect.any(String),
    });

    const sourceId = createdBody.item.id;

    const listRes = await app.inject({ method: 'GET', url: '/api/downstream-sites' });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.json()).toMatchObject({ success: true, items: [expect.objectContaining({ id: sourceId, name: '主站消费源' })] });

    const updateRes = await app.inject({
      method: 'PUT',
      url: `/api/downstream-sites/${sourceId}`,
      payload: {
        name: '主站消费源-更新',
        hostSiteId: hostSite.id,
        description: '',
        enabled: false,
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json()).toMatchObject({
      success: true,
      item: {
        id: sourceId,
        name: '主站消费源-更新',
        description: null,
        enabled: false,
      },
    });

    const deleteRes = await app.inject({ method: 'DELETE', url: `/api/downstream-sites/${sourceId}` });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json()).toMatchObject({ success: true });
  });

  it('tests connection and queues sync task', async () => {
    const hostSite = await db.insert(schema.sites).values({
      name: 'Downstream Host',
      url: 'https://downstream.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();
    const source = await db.insert(schema.downstreamSites).values({
      name: '主站消费源',
      hostSiteId: hostSite.id,
      authMode: 'session-admin',
      adminCredentialCipher: 'v1:iv:tag:data',
      adminUserId: 7788,
      enabled: true,
    }).returning().get();

    testConnectionMock.mockResolvedValue({ ok: true, channelCount: 2, message: '连接成功，检测到 2 个渠道' });
    syncMock.mockResolvedValue({ success: true, synced: 2 });

    const testRes = await app.inject({ method: 'POST', url: `/api/downstream-sites/${source.id}/test-connection` });
    expect(testRes.statusCode).toBe(200);
    expect(testRes.json()).toMatchObject({ success: true, ok: true, channelCount: 2 });

    const syncRes = await app.inject({ method: 'POST', url: `/api/downstream-sites/${source.id}/sync` });
    expect(syncRes.statusCode).toBe(200);
    expect(syncRes.json()).toMatchObject({ success: true, queued: true, taskId: expect.any(String) });
  });

  it('accepts same-origin baseUrlOverride and rejects cross-origin override', async () => {
    const hostSite = await db.insert(schema.sites).values({
      name: 'Downstream Host',
      url: 'https://downstream.example.com',
      platform: 'new-api',
      status: 'active',
    }).returning().get();

    const sameOriginRes = await app.inject({
      method: 'POST',
      url: '/api/downstream-sites',
      payload: {
        name: '同源覆盖',
        hostSiteId: hostSite.id,
        adminCredential: 'admin-token-001',
        baseUrlOverride: 'https://downstream.example.com/admin',
      },
    });
    expect(sameOriginRes.statusCode).toBe(200);
    expect(sameOriginRes.json()).toMatchObject({ success: true, item: { name: '同源覆盖' } });

    const crossOriginRes = await app.inject({
      method: 'POST',
      url: '/api/downstream-sites',
      payload: {
        name: '跨域覆盖',
        hostSiteId: hostSite.id,
        adminCredential: 'admin-token-002',
        baseUrlOverride: 'https://attacker.example.com/collect',
      },
    });
    expect(crossOriginRes.statusCode).toBe(400);
    expect(crossOriginRes.json()).toMatchObject({
      success: false,
      message: 'baseUrlOverride 必须与宿主站点保持同源',
    });
  });
});
