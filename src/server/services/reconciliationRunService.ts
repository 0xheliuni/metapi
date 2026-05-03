import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { buildReconciliationFacts } from './reconciliationFactBuilderService.js';
import { insertAndGetById } from '../db/insertHelpers.js';
import { matchReconciliationFacts } from './reconciliationMatcherService.js';
import { resolveReconciliationWindow } from './reconciliationWindowService.js';

type RunRow = typeof schema.reconciliationRuns.$inferSelect;

function parseSummary(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function toRunView(row: RunRow) {
  return {
    ...row,
    summary: parseSummary(row.summaryJson ?? null),
  };
}

export async function listReconciliationRuns() {
  const rows = await db.select().from(schema.reconciliationRuns)
    .orderBy(desc(schema.reconciliationRuns.id))
    .all();
  return rows.map(toRunView);
}

export async function getReconciliationRunById(id: number) {
  const row = await db.select().from(schema.reconciliationRuns)
    .where(eq(schema.reconciliationRuns.id, id))
    .get();
  return row ? toRunView(row) : null;
}

export async function getReconciliationResultsByRunId(runId: number) {
  return db.select().from(schema.reconciliationResults)
    .where(eq(schema.reconciliationResults.runId, runId))
    .all();
}

export async function createReconciliationRun(input: {
  scopeType?: unknown;
  windowStart?: unknown;
  windowEnd?: unknown;
}) {
  const window = resolveReconciliationWindow(input);
  const nowIso = new Date().toISOString();
  const created = await insertAndGetById<typeof schema.reconciliationRuns.$inferSelect>({
    table: schema.reconciliationRuns,
    idColumn: schema.reconciliationRuns.id,
    values: {
      sourceType: 'global',
      sourceId: null,
      scopeType: window.scopeType,
      windowStart: window.windowStart,
      windowEnd: window.windowEnd,
      modelScope: 'family',
      status: 'running',
      startedAt: nowIso,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    insertErrorMessage: '创建对账任务失败',
    loadErrorMessage: '加载对账任务失败',
  });

  try {
    const facts = await buildReconciliationFacts({ runId: created.id, window });
    if (facts.length > 0) {
      await db.insert(schema.reconciliationFacts).values(facts).run();
    }
    const results = matchReconciliationFacts(facts);
    if (results.length > 0) {
      await db.insert(schema.reconciliationResults).values(results.map((item) => ({
        ...item,
        runId: created.id,
        createdAt: nowIso,
        updatedAt: nowIso,
      }))).run();
    }

    const summary = {
      totalFacts: facts.length,
      totalResults: results.length,
      mismatchCount: results.filter((item) => item.status === 'mismatch').length,
      warningCount: results.filter((item) => item.status === 'warning').length,
      matchedCount: results.filter((item) => item.status === 'matched').length,
      modelFamilies: [...new Set(results.map((item) => item.modelFamily))],
    };

    await db.update(schema.reconciliationRuns).set({
      status: 'succeeded',
      summaryJson: JSON.stringify(summary),
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.reconciliationRuns.id, created.id)).run();

    return getReconciliationRunById(created.id);
  } catch (error) {
    await db.update(schema.reconciliationRuns).set({
      status: 'failed',
      errorMessage: (error as Error)?.message || '对账执行失败',
      finishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(schema.reconciliationRuns.id, created.id)).run();
    throw error;
  }
}
