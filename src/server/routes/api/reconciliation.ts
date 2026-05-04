import { FastifyInstance } from 'fastify';
import {
  createReconciliationRun,
  deleteReconciliationRunById,
  getReconciliationResultsByRunId,
  getReconciliationRunById,
  listReconciliationRuns,
} from '../../services/reconciliationRunService.js';

function parseRouteId(raw: string): number | null {
  const id = Number.parseInt(raw, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
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

  app.delete<{ Params: { id: string } }>('/api/reconciliation/runs/:id', async (request, reply) => {
    const id = parseRouteId(request.params.id);
    if (!id) return reply.code(400).send({ success: false, message: 'id 无效' });
    const deleted = await deleteReconciliationRunById(id);
    if (!deleted) return reply.code(404).send({ success: false, message: '对账任务不存在' });
    return { success: true };
  });
}
