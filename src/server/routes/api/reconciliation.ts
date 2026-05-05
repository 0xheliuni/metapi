import { FastifyInstance } from 'fastify';
import {
  createReconciliationRun,
  deleteReconciliationRunById,
  getReconciliationResultsByRunId,
  getReconciliationRunById,
  listReconciliationRuns,
} from '../../services/reconciliationRunService.js';
import { getReconciliationComparison } from '../../services/reconciliationComparisonService.js';

function parseRouteId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function normalizeProviderFilter(raw: unknown): 'all' | 'openai' | 'anthropic' | 'google' | 'other' {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'openai' || value === 'anthropic' || value === 'google' || value === 'other') return value;
  return 'all';
}

function normalizeModelGroupFilter(raw: unknown): 'all' | 'gpt' | 'claude' | 'gemini' | 'other' {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'gpt' || value === 'claude' || value === 'gemini' || value === 'other') return value;
  return 'all';
}

export async function reconciliationRoutes(app: FastifyInstance) {
  app.get('/api/reconciliation/runs', async () => ({
    success: true,
    items: await listReconciliationRuns(),
  }));

  app.post<{ Body: unknown }>('/api/reconciliation/runs', async (request, reply) => {
    try {
      const body = request.body && typeof request.body === 'object'
        ? request.body as Record<string, unknown>
        : {};
      const item = await createReconciliationRun(body);
      return { success: true, item };
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: (error as Error)?.message || '创建对账任务失败',
      });
    }
  });

  app.get<{ Params: { id: string } }>('/api/reconciliation/runs/:id', async (request, reply) => {
    const id = parseRouteId(request.params.id);
    if (!id) return reply.code(400).send({ success: false, message: 'id 无效' });
    const item = await getReconciliationRunById(id);
    if (!item) return reply.code(404).send({ success: false, message: '对账任务不存在' });
    return { success: true, item };
  });

  app.get<{ Params: { id: string } }>('/api/reconciliation/runs/:id/results', async (request, reply) => {
    const id = parseRouteId(request.params.id);
    if (!id) return reply.code(400).send({ success: false, message: 'id 无效' });
    const item = await getReconciliationRunById(id);
    if (!item) return reply.code(404).send({ success: false, message: '对账任务不存在' });
    return {
      success: true,
      item,
      results: await getReconciliationResultsByRunId(id),
    };
  });

  app.get<{ Params: { id: string }; Querystring: { downstreamSiteId?: string; provider?: string; modelGroup?: string } }>('/api/reconciliation/runs/:id/comparison', async (request, reply) => {
    const id = parseRouteId(request.params.id);
    if (!id) return reply.code(400).send({ success: false, message: 'id 无效' });

    const downstreamSiteId = request.query.downstreamSiteId
      ? parseRouteId(request.query.downstreamSiteId)
      : null;
    if (request.query.downstreamSiteId && !downstreamSiteId) {
      return reply.code(400).send({ success: false, message: 'downstreamSiteId 无效' });
    }

    try {
      const item = await getReconciliationRunById(id);
      if (!item) return reply.code(404).send({ success: false, message: '对账任务不存在' });
      const comparison = await getReconciliationComparison({
        runId: id,
        downstreamSiteId,
        provider: normalizeProviderFilter(request.query.provider),
        modelGroup: normalizeModelGroupFilter(request.query.modelGroup),
      });
      return {
        success: true,
        item,
        comparison,
      };
    } catch (error) {
      return reply.code(400).send({
        success: false,
        message: (error as Error)?.message || '加载供应商渠道对比失败',
      });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/reconciliation/runs/:id', async (request, reply) => {
    const id = parseRouteId(request.params.id);
    if (!id) return reply.code(400).send({ success: false, message: 'id 无效' });
    const deleted = await deleteReconciliationRunById(id);
    if (!deleted) return reply.code(404).send({ success: false, message: '对账任务不存在' });
    return { success: true };
  });
}
