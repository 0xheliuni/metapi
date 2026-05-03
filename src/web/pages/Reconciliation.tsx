import React, { useEffect, useMemo, useState } from 'react';
import { api, type ReconciliationResultItem, type ReconciliationRunItem } from '../api.js';
import { BrandGlyph, getBrand } from '../components/BrandIcon.js';
import { useToast } from '../components/Toast.js';
import { useIsMobile } from '../components/useIsMobile.js';
import { tr } from '../i18n.js';

type ScopeType = 'hour' | 'day';
type VendorGroupKey = 'openai' | 'anthropic' | 'google' | 'other';

type VendorGroup = {
  key: VendorGroupKey;
  label: string;
  brandModel: string;
  description: string;
  results: ReconciliationResultItem[];
  downstreamTokens: number;
  downstreamCostUsd: number;
  metapiTokens: number;
  metapiCostUsd: number;
  upstreamQuota: number;
  upstreamCostUsd: number;
  deltaTokens: number;
  deltaCostUsd: number;
  mismatchCount: number;
  warningCount: number;
  dominantStatus: string;
};

function formatIso(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

function toDateTimeLocalValue(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function defaultWindow(scopeType: ScopeType) {
  const end = new Date();
  const start = new Date(end);
  if (scopeType === 'hour') start.setHours(start.getHours() - 1);
  else start.setDate(start.getDate() - 1);
  return {
    start: toDateTimeLocalValue(start),
    end: toDateTimeLocalValue(end),
  };
}

function summaryValue(summary: Record<string, unknown> | null | undefined, key: string): string {
  const value = summary?.[key];
  if (Array.isArray(value)) return value.join(', ') || '-';
  if (value === undefined || value === null || value === '') return '-';
  return String(value);
}

function formatTokenCount(value: number | null | undefined): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0';
  if (Math.abs(amount) >= 1_000_000) return `${(amount / 1_000_000).toFixed(2)}M`;
  if (Math.abs(amount) >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return String(Math.round(amount));
}

function formatMoney(value: number | null | undefined): string {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '$0.000000';
  return `$${amount.toFixed(Math.abs(amount) >= 1 ? 3 : 6)}`;
}

function resolveStatusBadgeClass(status: string): string {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'matched' || normalized === 'succeeded' || normalized === 'success') return 'badge-success';
  if (normalized === 'warning' || normalized === 'running') return 'badge-warning';
  if (normalized === 'mismatch' || normalized === 'failed' || normalized === 'error') return 'badge-danger';
  return 'badge-muted';
}

function resolveVendorGroupKey(item: ReconciliationResultItem): VendorGroupKey {
  const family = String(item.modelFamily || '').toLowerCase();
  const canonical = String(item.modelCanonical || '').toLowerCase();
  const haystack = `${family} ${canonical}`;
  if (haystack.includes('gpt') || haystack.includes('openai') || haystack.includes('o1') || haystack.includes('o3') || haystack.includes('o4')) {
    return 'openai';
  }
  if (haystack.includes('claude') || haystack.includes('anthropic')) {
    return 'anthropic';
  }
  if (haystack.includes('gemini') || haystack.includes('google')) {
    return 'google';
  }
  return 'other';
}

function buildVendorMeta(key: VendorGroupKey) {
  if (key === 'openai') {
    return {
      label: 'OpenAI / GPT',
      brandModel: 'gpt-4o',
      description: '按照 OpenAI 系模型账本观察下游渠道令牌、Metapi 自监测和供应商渠道消耗之间的偏差。',
    };
  }
  if (key === 'anthropic') {
    return {
      label: 'Anthropic / Claude',
      brandModel: 'claude-3-5-sonnet',
      description: '重点看 Claude 族在下游计费、代理观测和供应商账本之间是否存在错位。',
    };
  }
  if (key === 'google') {
    return {
      label: 'Google / Gemini',
      brandModel: 'gemini-1.5-pro',
      description: '聚焦 Gemini 账本，判断供应商快照与 Metapi 自监测之间的解释性偏差。',
    };
  }
  return {
    label: 'Other / 未归类',
    brandModel: 'other',
    description: '尚未归入 OpenAI、Claude、Gemini 的模型结果，建议优先补映射或补充说明。',
  };
}

function groupResultsByVendor(results: ReconciliationResultItem[]): VendorGroup[] {
  const seed = new Map<VendorGroupKey, VendorGroup>();
  for (const item of results) {
    const key = resolveVendorGroupKey(item);
    const meta = buildVendorMeta(key);
    const current = seed.get(key) || {
      key,
      label: meta.label,
      brandModel: meta.brandModel,
      description: meta.description,
      results: [],
      downstreamTokens: 0,
      downstreamCostUsd: 0,
      metapiTokens: 0,
      metapiCostUsd: 0,
      upstreamQuota: 0,
      upstreamCostUsd: 0,
      deltaTokens: 0,
      deltaCostUsd: 0,
      mismatchCount: 0,
      warningCount: 0,
      dominantStatus: 'matched',
    };
    current.results.push(item);
    current.downstreamTokens += Number(item.downstreamBilledTokens || 0);
    current.downstreamCostUsd += Number(item.downstreamBilledCostUsd || 0);
    current.metapiTokens += Number(item.metapiObservedTokens || 0);
    current.metapiCostUsd += Number(item.metapiObservedCostUsd || 0);
    current.upstreamQuota += Number(item.upstreamConsumedQuota || 0);
    current.upstreamCostUsd += Number(item.upstreamConsumedCostUsdDerived || 0);
    current.deltaTokens += Number(item.deltaTokens || 0);
    current.deltaCostUsd += Number(item.deltaCostUsd || 0);
    if (item.status === 'mismatch') current.mismatchCount += 1;
    if (item.status === 'warning') current.warningCount += 1;
    if (item.status === 'mismatch') current.dominantStatus = 'mismatch';
    else if (current.dominantStatus !== 'mismatch' && item.status === 'warning') current.dominantStatus = 'warning';
    seed.set(key, current);
  }

  const order: VendorGroupKey[] = ['openai', 'anthropic', 'google', 'other'];
  return order
    .map((key) => seed.get(key))
    .filter((item): item is VendorGroup => Boolean(item && item.results.length > 0));
}

function LedgerMetric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="subtle-card" style={{ padding: 12, borderRadius: 14, minWidth: 0 }}>
      <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)', overflowWrap: 'anywhere' }}>{value}</div>
      {hint ? <div style={{ marginTop: 6, fontSize: 11, color: 'var(--color-text-secondary)' }}>{hint}</div> : null}
    </div>
  );
}

function LedgerBlock({ title, badgeLabel, badgeClassName, metrics }: {
  title: string;
  badgeLabel?: string;
  badgeClassName?: string;
  metrics: Array<{ label: string; value: string; hint?: string }>;
}) {
  return (
    <div className="glass-card" style={{ padding: 14, borderRadius: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
        {badgeLabel ? <span className={`badge ${badgeClassName || 'badge-muted'}`} style={{ fontSize: 11 }}>{badgeLabel}</span> : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {metrics.map((item) => <LedgerMetric key={`${title}-${item.label}`} {...item} />)}
      </div>
    </div>
  );
}

export default function Reconciliation() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [scopeType, setScopeType] = useState<ScopeType>('day');
  const [windowStart, setWindowStart] = useState(defaultWindow('day').start);
  const [windowEnd, setWindowEnd] = useState(defaultWindow('day').end);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [creating, setCreating] = useState(false);
  const [runs, setRuns] = useState<ReconciliationRunItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [selectedRun, setSelectedRun] = useState<ReconciliationRunItem | null>(null);
  const [results, setResults] = useState<ReconciliationResultItem[]>([]);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);

  async function loadRunResults(runId: number) {
    const res = await api.getReconciliationRunResults(runId);
    setSelectedRunId(runId);
    setSelectedRun(res.item);
    setResults(res.results || []);
  }

  async function loadRuns(preferredRunId?: number | null) {
    setLoadingRuns(true);
    try {
      const res = await api.getReconciliationRuns();
      setRuns(res.items || []);
      const nextId = preferredRunId ?? selectedRunId ?? res.items?.[0]?.id ?? null;
      if (nextId) {
        await loadRunResults(nextId);
      } else {
        setSelectedRunId(null);
        setSelectedRun(null);
        setResults([]);
      }
    } catch (error) {
      toast.error((error as Error)?.message || tr('加载对账任务失败'));
    } finally {
      setLoadingRuns(false);
    }
  }

  useEffect(() => {
    void loadRuns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const next = defaultWindow(scopeType);
    setWindowStart(next.start);
    setWindowEnd(next.end);
  }, [scopeType]);

  const vendorGroups = useMemo(() => groupResultsByVendor(results), [results]);

  const stats = useMemo(() => ({
    totalRuns: runs.length,
    latestStatus: runs[0]?.status || '-',
    mismatchCount: results.filter((item) => item.status === 'mismatch').length,
    warningCount: results.filter((item) => item.status === 'warning').length,
    vendorCount: vendorGroups.length,
  }), [results, runs, vendorGroups.length]);

  const currentWindowText = selectedRun ? `${formatIso(selectedRun.windowStart)} → ${formatIso(selectedRun.windowEnd)}` : tr('请选择左侧任务');

  return (
    <div className="page-shell">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 820 }}>
          <h1 className="page-title">{tr('对账中心')}</h1>
          <p className="page-subtitle">
            {tr('按模型厂商拆解下游渠道令牌、Metapi 自监测与供应商渠道消耗三本账，优先用解释性对账看清偏差来源。')}
          </p>
        </div>
        <button
          className="btn btn-primary"
          disabled={creating}
          onClick={async () => {
            setCreating(true);
            try {
              const res = await api.createReconciliationRun({
                scopeType,
                windowStart: new Date(windowStart).toISOString(),
                windowEnd: new Date(windowEnd).toISOString(),
              });
              toast.success(tr('对账任务已生成'));
              await loadRuns(res.item?.id || null);
            } catch (error) {
              toast.error((error as Error)?.message || tr('创建对账任务失败'));
            } finally {
              setCreating(false);
            }
          }}
        >
          {creating ? tr('生成中...') : tr('生成一次对账')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 20 }}>
        {[
          { label: tr('历史任务'), value: String(stats.totalRuns), hint: tr('已生成的对账运行数') },
          { label: tr('最新状态'), value: stats.latestStatus, hint: tr('当前默认展示的最新运行状态') },
          { label: tr('厂商分组'), value: String(stats.vendorCount), hint: tr('当前结果命中的模型厂商账本数') },
          { label: tr('当前不匹配'), value: String(stats.mismatchCount), hint: tr('高优先级人工复核项') },
          { label: tr('当前警告'), value: String(stats.warningCount), hint: tr('说明型偏差与快照缺口') },
        ].map((item) => (
          <div key={item.label} className="glass-card" style={{ padding: 16, borderRadius: 18 }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 8 }}>{item.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>{item.value}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{item.hint}</div>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{ padding: 16, borderRadius: 18, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>{tr('时间粒度')}</span>
            <select value={scopeType} onChange={(e) => setScopeType(e.target.value === 'hour' ? 'hour' : 'day')}>
              <option value="day">{tr('按天')}</option>
              <option value="hour">{tr('按小时')}</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>{tr('窗口开始')}</span>
            <input type="datetime-local" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
          </label>
          <label style={{ display: 'grid', gap: 6 }}>
            <span>{tr('窗口结束')}</span>
            <input type="datetime-local" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
          </label>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(320px, 400px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        <section className="glass-card" style={{ padding: 16, borderRadius: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{tr('对账任务')}</h2>
            <button className="btn btn-secondary" onClick={() => void loadRuns(selectedRunId)} disabled={loadingRuns}>{loadingRuns ? tr('刷新中...') : tr('刷新')}</button>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {runs.length <= 0 ? (
              <div style={{ color: 'var(--color-text-muted)' }}>{tr('还没有对账任务，先生成一次。')}</div>
            ) : runs.map((run) => (
              <button
                key={run.id}
                type="button"
                onClick={() => void loadRunResults(run.id)}
                style={{
                  textAlign: 'left',
                  borderRadius: 16,
                  border: run.id === selectedRunId ? '1px solid color-mix(in srgb, var(--color-primary) 56%, white)' : '1px solid var(--color-border-light)',
                  padding: 14,
                  background: run.id === selectedRunId ? 'color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-card))' : 'var(--color-bg-card)',
                  boxShadow: run.id === selectedRunId ? '0 12px 28px rgba(79, 70, 229, 0.12)' : 'none',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, alignItems: 'center' }}>
                  <strong>#{run.id} · {run.scopeType === 'hour' ? tr('小时窗') : tr('日窗')}</strong>
                  <span className={`badge ${resolveStatusBadgeClass(run.status)}`} style={{ fontSize: 11 }}>{run.status}</span>
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{formatIso(run.windowStart)} → {formatIso(run.windowEnd)}</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 8 }}>
                  {tr('不匹配')} {summaryValue(run.summary, 'mismatchCount')} · {tr('警告')} {summaryValue(run.summary, 'warningCount')} · {tr('模型族')} {summaryValue(run.summary, 'modelFamilies')}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section style={{ display: 'grid', gap: 18 }}>
          <div className="glass-card" style={{ padding: 16, borderRadius: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{tr('运行概览')}</h2>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 4 }}>{currentWindowText}</div>
              </div>
              {selectedRun ? <span className={`badge ${resolveStatusBadgeClass(selectedRun.status)}`}>{selectedRun.status}</span> : null}
            </div>
            {selectedRun ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                <LedgerMetric label={tr('模型族')} value={summaryValue(selectedRun.summary, 'modelFamilies')} hint={tr('当前运行命中的厂商 / 模型族')} />
                <LedgerMetric label={tr('facts 数')} value={summaryValue(selectedRun.summary, 'totalFacts')} hint={tr('原始对账事实条目')} />
                <LedgerMetric label={tr('results 数')} value={summaryValue(selectedRun.summary, 'totalResults')} hint={tr('聚合后的对账结果数')} />
                <LedgerMetric label={tr('不匹配')} value={summaryValue(selectedRun.summary, 'mismatchCount')} hint={tr('需要优先处理的差异')} />
              </div>
            ) : (
              <div style={{ color: 'var(--color-text-muted)' }}>{tr('请选择左侧任务查看账本。')}</div>
            )}
          </div>

          {vendorGroups.length <= 0 ? (
            <div className="glass-card" style={{ padding: 24, borderRadius: 18, color: 'var(--color-text-muted)' }}>
              {tr('当前运行暂无可展示的厂商账本。先生成一次对账，或检查窗口内是否有代理日志与供应商快照。')}
            </div>
          ) : vendorGroups.map((group) => {
            const brand = getBrand(group.brandModel);
            const expanded = expandedKeys.includes(group.key);
            return (
              <div key={group.key} className="glass-card" style={{ padding: 18, borderRadius: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'color-mix(in srgb, var(--color-primary) 8%, var(--color-bg-card))', border: '1px solid color-mix(in srgb, var(--color-primary) 16%, var(--color-border-light))', flexShrink: 0 }}>
                      <BrandGlyph brand={brand} model={group.brandModel} size={22} fallbackText={group.label} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
                        <h3 style={{ margin: 0, fontSize: 18 }}>{group.label}</h3>
                        <span className={`badge ${resolveStatusBadgeClass(group.dominantStatus)}`} style={{ fontSize: 11 }}>{group.dominantStatus}</span>
                        {group.mismatchCount > 0 ? <span className="badge badge-danger" style={{ fontSize: 11 }}>{tr('不匹配')} {group.mismatchCount}</span> : null}
                        {group.warningCount > 0 ? <span className="badge badge-warning" style={{ fontSize: 11 }}>{tr('警告')} {group.warningCount}</span> : null}
                      </div>
                      <div style={{ color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.6 }}>{group.description}</div>
                    </div>
                  </div>
                  <button className="btn btn-secondary" onClick={() => setExpandedKeys((current) => expanded ? current.filter((item) => item !== group.key) : [...current, group.key])}>
                    {expanded ? tr('收起明细') : tr('展开明细')}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 14 }}>
                  <LedgerBlock
                    title={tr('下游渠道令牌账本')}
                    badgeLabel={tr('下游')}
                    badgeClassName="badge-info"
                    metrics={[
                      { label: tr('渠道令牌'), value: formatTokenCount(group.downstreamTokens), hint: tr('下游账单 / 来源侧令牌量') },
                      { label: tr('账单金额'), value: formatMoney(group.downstreamCostUsd), hint: tr('下游可见消耗金额') },
                    ]}
                  />
                  <LedgerBlock
                    title={tr('Metapi 自监测账本')}
                    badgeLabel={tr('观测')}
                    badgeClassName="badge-success"
                    metrics={[
                      { label: tr('监测 Tokens'), value: formatTokenCount(group.metapiTokens), hint: tr('代理成功日志里的 token 观测') },
                      { label: tr('估算成本'), value: formatMoney(group.metapiCostUsd), hint: tr('基于代理观测的估算成本') },
                    ]}
                  />
                  <LedgerBlock
                    title={tr('供应商渠道账本')}
                    badgeLabel={tr('上游')}
                    badgeClassName="badge-warning"
                    metrics={[
                      { label: tr('渠道额度'), value: formatTokenCount(group.upstreamQuota), hint: tr('供应商渠道同步回来的额度 / 配额消耗') },
                      { label: tr('推导金额'), value: formatMoney(group.upstreamCostUsd), hint: tr('由快照推导出的上游金额') },
                    ]}
                  />
                  <LedgerBlock
                    title={tr('差异判断')}
                    badgeLabel={tr('解释')}
                    badgeClassName={resolveStatusBadgeClass(group.dominantStatus)}
                    metrics={[
                      { label: tr('Token 差额'), value: formatTokenCount(group.deltaTokens), hint: tr('下游账单与 Metapi 自监测的主差额') },
                      { label: tr('USD 差额'), value: formatMoney(group.deltaCostUsd), hint: tr('下游账本与上游账本的金额差额') },
                    ]}
                  />
                </div>

                {expanded ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {group.results.map((item, index) => {
                      const detailKey = `${group.key}-${item.id}-${index}`;
                      return (
                        <div key={detailKey} className="subtle-card" style={{ padding: 14, borderRadius: 16, border: '1px solid var(--color-border-light)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 10, flexWrap: 'wrap' }}>
                            <div>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                                <strong>{item.modelCanonical || item.modelFamily || tr('未命名模型')}</strong>
                                <span className={`badge ${resolveStatusBadgeClass(item.status)}`} style={{ fontSize: 11 }}>{item.status}</span>
                              </div>
                              <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                                {formatIso(item.timeBucketStart)} → {formatIso(item.timeBucketEnd)}
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                              {tr('置信度')} {Math.round(Number(item.confidenceScore || 0) * 100)}%
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 10 }}>
                            <LedgerMetric label={tr('下游渠道令牌')} value={formatTokenCount(item.downstreamBilledTokens)} />
                            <LedgerMetric label={tr('Metapi 监测')} value={formatTokenCount(item.metapiObservedTokens)} />
                            <LedgerMetric label={tr('供应商额度')} value={formatTokenCount(item.upstreamConsumedQuota)} />
                            <LedgerMetric label={tr('下游 USD')} value={formatMoney(item.downstreamBilledCostUsd)} />
                            <LedgerMetric label={tr('上游 USD')} value={formatMoney(item.upstreamConsumedCostUsdDerived)} />
                            <LedgerMetric label={tr('差异 USD')} value={formatMoney(item.deltaCostUsd)} />
                          </div>

                          <div style={{ padding: '10px 12px', borderRadius: 12, background: 'color-mix(in srgb, var(--color-primary) 4%, var(--color-bg-card))', color: 'var(--color-text-secondary)', fontSize: 13, lineHeight: 1.7 }}>
                            <strong style={{ color: 'var(--color-text-primary)' }}>{tr('差异解释：')}</strong>
                            {' '}
                            {item.explanationText || tr('暂无解释文案')}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}
