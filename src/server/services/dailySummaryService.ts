import { and, eq, gte, lt } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { getLocalDayRangeUtc, formatLocalDateTime, getResolvedTimeZone } from './localTimeService.js';
import { getProxyLogBaseSelectFields } from './proxyLogStore.js';

export type DailySummaryMetrics = {
  localDay: string;
  generatedAtLocal: string;
  timeZone: string;
  totalAccounts: number;
  activeAccounts: number;
  lowBalanceAccounts: number;
  checkinTotal: number;
  checkinSuccess: number;
  checkinSkipped: number;
  checkinFailed: number;
  proxyTotal: number;
  proxySuccess: number;
  proxyFailed: number;
  proxyTotalTokens: number;
  todaySpend: number;
  todayReward: number;
};

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export async function collectDailySummaryMetrics(now = new Date()): Promise<DailySummaryMetrics> {
  const proxyLogBaseFields = getProxyLogBaseSelectFields();
  const { localDay, startUtc, endUtc } = getLocalDayRangeUtc(now);

  const accountRows = await db.select().from(schema.accounts)
    .innerJoin(schema.sites, eq(schema.accounts.siteId, schema.sites.id))
    .where(eq(schema.sites.status, 'active'))
    .all();
  const accounts = accountRows.map((row) => row.accounts);

  const activeAccounts = accounts.filter((account) => account.status === 'active').length;
  const lowBalanceAccounts = accounts.filter((account) => (account.balance || 0) < 1).length;

  const todayProxyRows = await db.select({
    proxy_logs: proxyLogBaseFields,
    accounts: schema.accounts,
    sites: schema.sites,
  }).from(schema.proxyLogs)
    .leftJoin(schema.accounts, eq(schema.proxyLogs.accountId, schema.accounts.id))
    .leftJoin(schema.sites, eq(schema.accounts.siteId, schema.sites.id))
    .where(and(
      gte(schema.proxyLogs.createdAt, startUtc),
      lt(schema.proxyLogs.createdAt, endUtc),
      eq(schema.sites.status, 'active'),
    ))
    .all();
  const todayProxyLogs = todayProxyRows.map((row) => row.proxy_logs);
  const proxySuccess = todayProxyLogs.filter((log) => log.status === 'success').length;
  const proxyFailed = todayProxyLogs.filter((log) => log.status === 'failed').length;
  const proxyTotalTokens = todayProxyLogs.reduce((sum, log) => sum + (log.totalTokens || 0), 0);
  const todaySpend = todayProxyLogs.reduce((sum, log) => sum + (typeof log.estimatedCost === 'number' ? log.estimatedCost : 0), 0);

  return {
    localDay,
    generatedAtLocal: formatLocalDateTime(now),
    timeZone: getResolvedTimeZone(),
    totalAccounts: accounts.length,
    activeAccounts,
    lowBalanceAccounts,
    checkinTotal: 0,
    checkinSuccess: 0,
    checkinSkipped: 0,
    checkinFailed: 0,
    proxyTotal: todayProxyLogs.length,
    proxySuccess,
    proxyFailed,
    proxyTotalTokens,
    todaySpend: round6(todaySpend),
    todayReward: 0,
  };
}

export function buildDailySummaryNotification(metrics: DailySummaryMetrics): { title: string; message: string } {
  const net = round6(metrics.todayReward - metrics.todaySpend);
  const title = `每日总结 ${metrics.localDay}`;
  const message = [
    `日期: ${metrics.localDay}`,
    `生成时间: ${metrics.generatedAtLocal} (${metrics.timeZone})`,
    '',
    `账号概览: 总计 ${metrics.totalAccounts} | 活跃 ${metrics.activeAccounts} | 低余额(<$1) ${metrics.lowBalanceAccounts}`,
    `签到统计: 总计 ${metrics.checkinTotal} | 成功 ${metrics.checkinSuccess} | 跳过 ${metrics.checkinSkipped} | 失败 ${metrics.checkinFailed}`,
    `代理统计: 总计 ${metrics.proxyTotal} | 成功 ${metrics.proxySuccess} | 失败 ${metrics.proxyFailed} | Tokens ${metrics.proxyTotalTokens.toLocaleString()}`,
    `费用统计: 支出 $${metrics.todaySpend.toFixed(6)} | 奖励 $${metrics.todayReward.toFixed(6)} | 净值 $${net.toFixed(6)}`,
  ].join('\n');
  return { title, message };
}
