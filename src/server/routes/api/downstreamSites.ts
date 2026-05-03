import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../db/index.js';
import { insertAndGetById } from '../../db/insertHelpers.js';
import { parseDownstreamSitePayload } from '../../contracts/downstreamSiteRoutePayloads.js';
import {
  encryptDownstreamAdminCredential,
  getDownstreamSiteById,
  listDownstreamSiteChannels,
  listDownstreamSites,
  normalizeDownstreamSitePayload,
  validateDownstreamSiteHost,
} from '../../services/downstreamSiteService.js';
import {
  syncDownstreamSiteChannelsById,
  testDownstreamSiteConnectionById,
} from '../../services/downstreamSiteSyncService.js';
import { startBackgroundTask } from '../../services/backgroundTaskService.js';

function parseRouteId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

export async function downstreamSitesRoutes(app: FastifyInstance) {
  app.get('/api/downstream-sites', async () => {
    return {
      success: true,
      items: await listDownstreamSites(),
    };
  });

  app.get<{ Params: { id: string } }>('/api/downstream-sites/:id/channels', async (request, reply) => {
    const id = parseRouteId(request.params.id);
    if (!id) {
      return reply.code(400).send({ success: false, message: 'id 无效' });
    }
    const site = await getDownstreamSiteById(id);
    if (!site) {
      return reply.code(404).send({ success: false, message: '下游站点来源不存在' });
    }
    return {
      success: true,
      item: site,
      channels: await listDownstreamSiteChannels(id),
    };
  });

  app.post<{ Body: unknown }>('/api/downstream-sites', async (request, reply) => {
    const parsedBody = parseDownstreamSitePayload(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ success: false, message: parsedBody.error });
    }

    let normalized;
    try {
      normalized = normalizeDownstreamSitePayload(parsedBody.data);
      await validateDownstreamSiteHost(normalized.hostSiteId, normalized.baseUrlOverride);
    } catch (error) {
      return reply.code(400).send({ success: false, message: (error as Error)?.message || '参数无效' });
    }

    const nowIso = new Date().toISOString();
    const inserted = await insertAndGetById<typeof schema.downstreamSites.$inferSelect>({
      table: schema.downstreamSites,
      idColumn: schema.downstreamSites.id,
      values: {
        name: normalized.name,
        hostSiteId: normalized.hostSiteId,
        baseUrlOverride: normalized.baseUrlOverride,
        authMode: normalized.authMode,
        adminCredentialCipher: encryptDownstreamAdminCredential(normalized.adminCredential),
        adminUserId: normalized.adminUserId,
        description: normalized.description,
        enabled: normalized.enabled,
        lastSyncStatus: 'idle',
        lastSyncMessage: null,
        lastSyncAt: null,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
      insertErrorMessage: '创建失败',
      loadErrorMessage: '创建失败',
    });

    return {
      success: true,
      item: await getDownstreamSiteById(inserted.id),
    };
  });

  app.put<{ Params: { id: string }; Body: unknown }>('/api/downstream-sites/:id', async (request, reply) => {
    const id = parseRouteId(request.params.id);
    if (!id) {
      return reply.code(400).send({ success: false, message: 'id 无效' });
    }
    const existing = await db.select().from(schema.downstreamSites)
      .where(eq(schema.downstreamSites.id, id))
      .get();
    if (!existing) {
      return reply.code(404).send({ success: false, message: '下游站点来源不存在' });
    }

    const parsedBody = parseDownstreamSitePayload(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ success: false, message: parsedBody.error });
    }
    const body = parsedBody.data;
    const hasOwn = (key: string) => Object.prototype.hasOwnProperty.call(body, key);

    let normalized;
    try {
      normalized = normalizeDownstreamSitePayload({
        name: hasOwn('name') ? body.name : existing.name,
        hostSiteId: hasOwn('hostSiteId') ? body.hostSiteId : existing.hostSiteId,
        baseUrlOverride: hasOwn('baseUrlOverride') ? body.baseUrlOverride : existing.baseUrlOverride,
        authMode: hasOwn('authMode') ? body.authMode : existing.authMode,
        adminCredential: hasOwn('adminCredential')
          ? body.adminCredential
          : '',
        adminUserId: hasOwn('adminUserId') ? body.adminUserId : existing.adminUserId,
        description: hasOwn('description') ? body.description : existing.description,
        enabled: hasOwn('enabled') ? body.enabled : existing.enabled,
      });
        await validateDownstreamSiteHost(normalized.hostSiteId, normalized.baseUrlOverride);
    } catch (error) {
      if (!hasOwn('adminCredential')) {
        try {
          const fallback = normalizeDownstreamSitePayload({
            name: hasOwn('name') ? body.name : existing.name,
            hostSiteId: hasOwn('hostSiteId') ? body.hostSiteId : existing.hostSiteId,
            baseUrlOverride: hasOwn('baseUrlOverride') ? body.baseUrlOverride : existing.baseUrlOverride,
            authMode: hasOwn('authMode') ? body.authMode : existing.authMode,
            adminCredential: 'placeholder',
            adminUserId: hasOwn('adminUserId') ? body.adminUserId : existing.adminUserId,
            description: hasOwn('description') ? body.description : existing.description,
            enabled: hasOwn('enabled') ? body.enabled : existing.enabled,
          });
          normalized = fallback;
          await validateDownstreamSiteHost(normalized.hostSiteId, normalized.baseUrlOverride);
        } catch {
          return reply.code(400).send({ success: false, message: (error as Error)?.message || '参数无效' });
        }
      } else {
        return reply.code(400).send({ success: false, message: (error as Error)?.message || '参数无效' });
      }
    }

    const nextCredentialCipher = hasOwn('adminCredential')
      ? encryptDownstreamAdminCredential(normalized.adminCredential)
      : existing.adminCredentialCipher;

    await db.update(schema.downstreamSites).set({
      name: normalized.name,
      hostSiteId: normalized.hostSiteId,
      baseUrlOverride: normalized.baseUrlOverride,
      authMode: normalized.authMode,
      adminCredentialCipher: nextCredentialCipher,
      adminUserId: normalized.adminUserId,
      description: normalized.description,
      enabled: normalized.enabled,
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.downstreamSites.id, id)).run();

    return {
      success: true,
      item: await getDownstreamSiteById(id),
    };
  });

  app.delete<{ Params: { id: string } }>('/api/downstream-sites/:id', async (request, reply) => {
    const id = parseRouteId(request.params.id);
    if (!id) {
      return reply.code(400).send({ success: false, message: 'id 无效' });
    }
    const existing = await getDownstreamSiteById(id);
    if (!existing) {
      return reply.code(404).send({ success: false, message: '下游站点来源不存在' });
    }
    await db.delete(schema.downstreamSites)
      .where(eq(schema.downstreamSites.id, id))
      .run();
    return { success: true };
  });

  app.post<{ Params: { id: string } }>('/api/downstream-sites/:id/test-connection', async (request, reply) => {
    const id = parseRouteId(request.params.id);
    if (!id) {
      return reply.code(400).send({ success: false, message: 'id 无效' });
    }
    try {
      const result = await testDownstreamSiteConnectionById(id);
      return { success: true, ...result };
    } catch (error) {
      return reply.code(500).send({ success: false, message: (error as Error)?.message || '测试连接失败' });
    }
  });

  app.post<{ Params: { id: string } }>('/api/downstream-sites/:id/sync', async (request, reply) => {
    const id = parseRouteId(request.params.id);
    if (!id) {
      return reply.code(400).send({ success: false, message: 'id 无效' });
    }
    const existing = await getDownstreamSiteById(id);
    if (!existing) {
      return reply.code(404).send({ success: false, message: '下游站点来源不存在' });
    }

    const { task, reused } = startBackgroundTask(
      {
        type: 'downstream-site-sync',
        title: `同步下游站点来源 #${id}`,
        dedupeKey: `downstream-site-sync:${id}`,
        notifyOnSuccess: false,
        notifyOnFailure: false,
      },
      () => syncDownstreamSiteChannelsById(id),
    );

    return {
      success: true,
      queued: true,
      reused,
      taskId: task.id,
    };
  });
}
