import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  type DownstreamSiteItem,
  type ReconciliationComparisonData,
  type ReconciliationComparisonGroup,
  type ReconciliationComparisonModelGroup,
  type ReconciliationComparisonProvider,
  type ReconciliationResultItem,
  type ReconciliationRunItem,
} from '../api.js';
import { BrandGlyph, getBrand } from '../components/BrandIcon.js';
import DeleteConfirmModal from '../components/DeleteConfirmModal.js';
import { MobileCard, MobileField } from '../components/MobileCard.js';
import ResponsiveFilterPanel from '../components/ResponsiveFilterPanel.js';
import { useToast } from '../components/Toast.js';
import { useIsMobile } from '../components/useIsMobile.js';
import { tr } from '../i18n.js';

type ScopeType = 'hour' | 'day';
type VendorGroupKey = 'openai' | 'anthropic' | 'google' | 'other';
type RunStatusFilter = 'all' | 'running' | 'succeeded' | 'failed';
type RunScopeFilter = 'all' | ScopeType;

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

const VENDOR_TO_PROVIDER: Record<VendorGroupKey, ReconciliationComparisonProvider> = {
  openai: 'openai',
  anthropic: 'anthropic',
  google: 'google',
  other: 'other',
};

const VENDOR_TO_MODEL_GROUP: Record<VendorGroupKey, ReconciliationComparisonModelGroup> = {
  openai: 'gpt',
  anthropic: 'claude',
  google: 'gemini',
  other: 'other',
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

function matchesRunSearch(run: ReconciliationRunItem, search: string): boolean {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    `#${run.id}`,
    run.status,
    run.scopeType === 'hour' ? tr('小时窗') : tr('日窗'),
    formatIso(run.windowStart),
    formatIso(run.windowEnd),
    summaryValue(run.summary, 'modelFamilies'),
  ].join(' ').toLowerCase();
  return haystack.includes(query);
}

function summarizeActiveFilters(search: string, statusFilter: RunStatusFilter, scopeFilter: RunScopeFilter): string {
  const tags: string[] = [];
  if (search.trim()) tags.push(`${tr('搜索')}=${search.trim()}`);
  if (statusFilter !== 'all') tags.push(`${tr('状态')}=${statusFilter}`);
  if (scopeFilter !== 'all') tags.push(`${tr('窗口')}=${scopeFilter === 'hour' ? tr('小时') : tr('天')}`);
  return tags.length > 0 ? tags.join('，') : tr('全部任务');
}

function ReconciliationFilterChip({
  active,
  label,
  count,
  onClick,
  icon,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button type="button" className={`filter-chip ${active ? 'active' : ''}`} onClick={onClick}>
      {icon ? <span className="filter-chip-icon">{icon}</span> : null}
      <span className="filter-chip-label">{label}</span>
      {typeof count === 'number' ? <span className="filter-chip-count">{count}</span> : null}
    </button>
  );
}

function resolveComparisonWarningLabel(code: string): string {
  if (code === 'SNAPSHOT_FALLBACK_USED') return tr('使用渠道快照');
  if (code === 'EXPLANATORY_COMPARISON_ONLY') return tr('解释性对比');
  if (code === 'DOWNSTREAM_SITE_FILTER_RECOMMENDED') return tr('建议指定下游来源');
  return code;
}

function ReconciliationComparisonTables({
  group,
  warnings,
}: {
  group: ReconciliationComparisonGroup;
  warnings: string[];
}) {
  return (
    <div className="reconciliation-comparison-panel">
      <div className="reconciliation-comparison-panel-header">
        <div>
          <div className="reconciliation-comparison-panel-title">{tr('供应商渠道对比表')}</div>
          <div className="reconciliation-comparison-panel-hint">
            {group.downstreamSiteName ? `${tr('下游来源')}：${group.downstreamSiteName}` : tr('当前未限定单一下游来源，表格仅用于解释性对比。')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className="badge badge-warning" style={{ fontSize: 11 }}>{tr('渠道快照')}</span>
          {warnings.map((warning) => (
            <span key={warning} className="badge badge-muted" style={{ fontSize: 11 }}>{resolveComparisonWarningLabel(warning)}</span>
          ))}
        </div>
      </div>

      <div className="reconciliation-comparison-metrics">
        <div className="subtle-card" style={{ padding: 12, borderRadius: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>{tr('Metapi 通道数')}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{group.metapiTotals.channelCount}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>{tr('请求')} {group.metapiTotals.requestCount} · {tr('估算')} {formatMoney(group.metapiTotals.observedCostUsd)}</div>
        </div>
        <div className="subtle-card" style={{ padding: 12, borderRadius: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 4 }}>{tr('供应商渠道数')}</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{group.supplierTotals.channelCount}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 6 }}>{tr('配额')} {formatTokenCount(group.supplierTotals.consumedQuota)} · {tr('推导')} {formatMoney(group.supplierTotals.consumedCostUsd)}</div>
        </div>
      </div>

      <div className="reconciliation-comparison-grid">
        <div className="reconciliation-comparison-card">
          <div className="reconciliation-comparison-card-title">{tr('Metapi 本地通道 / 令牌')}</div>
          <div className="reconciliation-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tr('站点 / 令牌')}</th>
                  <th>{tr('路由模型')}</th>
                  <th>{tr('请求数')}</th>
                  <th>{tr('Tokens')}</th>
                  <th>{tr('估算 USD')}</th>
                </tr>
              </thead>
              <tbody>
                {group.metapiChannels.map((channel) => (
                  <tr key={channel.key}>
                    <td>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{channel.siteName || tr('未绑定站点')}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {channel.channelId ? <span className="badge badge-info" style={{ fontSize: 11 }}>#{channel.channelId}</span> : null}
                          {channel.tokenName ? <span className="badge badge-success" style={{ fontSize: 11 }}>{channel.tokenName}</span> : <span className="badge badge-muted" style={{ fontSize: 11 }}>{tr('未绑定令牌')}</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ color: 'var(--color-text-primary)', fontWeight: 600 }}>{channel.sourceModel || tr('未命名模型')}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{channel.routeModelPattern || tr('未记录路由模式')}</div>
                      </div>
                    </td>
                    <td>{channel.requestCount}</td>
                    <td>{formatTokenCount(channel.observedTokens)}</td>
                    <td>{formatMoney(channel.observedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="reconciliation-comparison-card">
          <div className="reconciliation-comparison-card-title">{tr('下游 new-api 供应商渠道快照')}</div>
          <div className="reconciliation-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tr('供应商渠道')}</th>
                  <th>{tr('分组 / 同步')}</th>
                  <th>{tr('请求数')}</th>
                  <th>{tr('配额')}</th>
                  <th>{tr('推导 USD')}</th>
                </tr>
              </thead>
              <tbody>
                {group.supplierChannels.map((channel) => (
                  <tr key={channel.key}>
                    <td>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{channel.remoteName}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <span className="badge badge-info" style={{ fontSize: 11 }}>#{channel.remoteChannelId}</span>
                          {channel.remoteGroup ? <span className="badge badge-warning" style={{ fontSize: 11 }}>{channel.remoteGroup}</span> : <span className="badge badge-muted" style={{ fontSize: 11 }}>{tr('未分组')}</span>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{channel.notes[0] || tr('来自渠道快照')}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{channel.syncedAt ? formatIso(channel.syncedAt) : tr('未同步')}</div>
                      </div>
                    </td>
                    <td>{channel.requestCount ?? '-'}</td>
                    <td>{formatTokenCount(channel.consumedQuota)}</td>
                    <td>{formatMoney(channel.consumedCostUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SwipeableRunCard({
  run,
  selected,
  deleting,
  onSelect,
  onDelete,
}: {
  run: ReconciliationRunItem;
  selected: boolean;
  deleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const revealWidth = 88;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef<number | null>(null);
  const baseOffsetRef = useRef(0);
  const movedRef = useRef(false);

  const closeSwipe = () => {
    setDragging(false);
    setOffset(0);
    baseOffsetRef.current = 0;
    movedRef.current = false;
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    startXRef.current = event.touches[0]?.clientX ?? null;
    baseOffsetRef.current = offset;
    movedRef.current = false;
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (startXRef.current === null) return;
    const currentX = event.touches[0]?.clientX ?? startXRef.current;
    const deltaX = currentX - startXRef.current;
    const nextOffset = Math.max(-revealWidth, Math.min(0, baseOffsetRef.current + deltaX));
    if (Math.abs(deltaX) > 6) {
      movedRef.current = true;
      setDragging(true);
      event.preventDefault();
    }
    setOffset(nextOffset);
  };

  const finalizeSwipe = () => {
    startXRef.current = null;
    setDragging(false);
    const shouldReveal = offset <= -(revealWidth / 2);
    const nextOffset = shouldReveal ? -revealWidth : 0;
    setOffset(nextOffset);
    baseOffsetRef.current = nextOffset;
  };

  const handleSelect = () => {
    if (offset < 0 && !dragging) {
      closeSwipe();
      return;
    }
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }
    onSelect();
  };

  return (
    <div className={`reconciliation-swipe-row ${offset < 0 ? 'is-revealed' : ''} ${dragging ? 'is-dragging' : ''}`.trim()}>
      <div className="reconciliation-swipe-actions" aria-hidden={offset >= 0}>
        <button
          type="button"
          className="reconciliation-swipe-delete"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          disabled={deleting}
        >
          {deleting ? tr('删除中...') : tr('删除')}
        </button>
      </div>
      <div
        className="reconciliation-swipe-surface"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={finalizeSwipe}
        onTouchCancel={finalizeSwipe}
      >
        <MobileCard
          title={<>{`#${run.id} · ${run.scopeType === 'hour' ? tr('小时窗') : tr('日窗')}`}</>}
          subtitle={`${formatIso(run.windowStart)} → ${formatIso(run.windowEnd)}`}
          selected={selected}
          compact
          onSelect={handleSelect}
          headerActions={<span className={`badge ${resolveStatusBadgeClass(run.status)}`} style={{ fontSize: 11 }}>{run.status}</span>}
          footerActions={<span className="btn-link btn-link-danger">{tr('左滑删除')}</span>}
        >
          <div className="mobile-summary-grid">
            <div className="mobile-summary-metric">
              <span className="mobile-summary-metric-label">{tr('不匹配')}</span>
              <span className="mobile-summary-metric-value">{summaryValue(run.summary, 'mismatchCount')}</span>
            </div>
            <div className="mobile-summary-metric">
              <span className="mobile-summary-metric-label">{tr('警告')}</span>
              <span className="mobile-summary-metric-value">{summaryValue(run.summary, 'warningCount')}</span>
            </div>
          </div>
          <MobileField label={tr('模型族')} value={summaryValue(run.summary, 'modelFamilies')} stacked />
        </MobileCard>
      </div>
    </div>
  );
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
  const [runSearch, setRunSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<RunStatusFilter>('all');
  const [scopeFilter, setScopeFilter] = useState<RunScopeFilter>('all');
  const [filtersCollapsed, setFiltersCollapsed] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReconciliationRunItem | null>(null);
  const [deletingRunId, setDeletingRunId] = useState<number | null>(null);
  const [downstreamSites, setDownstreamSites] = useState<DownstreamSiteItem[]>([]);
  const [comparisonByVendor, setComparisonByVendor] = useState<Record<string, ReconciliationComparisonData | undefined>>({});
  const [comparisonLoadingKey, setComparisonLoadingKey] = useState<string | null>(null);

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
      const items = res.items || [];
      setRuns(items);
      const candidateId = preferredRunId ?? selectedRunId ?? null;
      const nextId = candidateId && items.some((item) => item.id === candidateId)
        ? candidateId
        : items[0]?.id ?? null;
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
    void (async () => {
      try {
        const res = await api.getDownstreamSites();
        setDownstreamSites(res.items || []);
      } catch {
        setDownstreamSites([]);
      }
    })();
  }, []);

  useEffect(() => {
    const next = defaultWindow(scopeType);
    setWindowStart(next.start);
    setWindowEnd(next.end);
  }, [scopeType]);

  const vendorGroups = useMemo(() => groupResultsByVendor(results), [results]);

  const filteredRuns = useMemo(() => runs.filter((run) => {
    if (!matchesRunSearch(run, runSearch)) return false;
    if (statusFilter !== 'all' && String(run.status || '').toLowerCase() !== statusFilter) return false;
    if (scopeFilter !== 'all' && run.scopeType !== scopeFilter) return false;
    return true;
  }), [runSearch, runs, scopeFilter, statusFilter]);

  const runCounts = useMemo(() => ({
    total: runs.length,
    running: runs.filter((run) => String(run.status || '').toLowerCase() === 'running').length,
    succeeded: runs.filter((run) => String(run.status || '').toLowerCase() === 'succeeded').length,
    failed: runs.filter((run) => String(run.status || '').toLowerCase() === 'failed').length,
    hour: runs.filter((run) => run.scopeType === 'hour').length,
    day: runs.filter((run) => run.scopeType === 'day').length,
  }), [runs]);

  const stats = useMemo(() => ({
    totalRuns: runs.length,
    latestStatus: runs[0]?.status || '-',
    mismatchCount: results.filter((item) => item.status === 'mismatch').length,
    warningCount: results.filter((item) => item.status === 'warning').length,
    vendorCount: vendorGroups.length,
  }), [results, runs, vendorGroups.length]);

  const currentWindowText = selectedRun ? `${formatIso(selectedRun.windowStart)} → ${formatIso(selectedRun.windowEnd)}` : tr('请选择左侧任务');
  const activeFilterSummary = summarizeActiveFilters(runSearch, statusFilter, scopeFilter);
  const activeFilterCount = [runSearch.trim() ? 1 : 0, statusFilter !== 'all' ? 1 : 0, scopeFilter !== 'all' ? 1 : 0].reduce((sum, current) => sum + current, 0);

  const resetRunFilters = () => {
    setRunSearch('');
    setStatusFilter('all');
    setScopeFilter('all');
  };

  async function confirmDeleteRun() {
    if (!deleteTarget) return;
    setDeletingRunId(deleteTarget.id);
    try {
      await api.deleteReconciliationRun(deleteTarget.id);
      toast.success(tr('对账任务已删除'));
      const remainingRuns = runs.filter((run) => run.id !== deleteTarget.id);
      const preferredRunId = deleteTarget.id === selectedRunId ? (remainingRuns[0]?.id ?? null) : selectedRunId;
      setDeleteTarget(null);
      await loadRuns(preferredRunId ?? null);
    } catch (error) {
      toast.error((error as Error)?.message || tr('删除对账任务失败'));
    } finally {
      setDeletingRunId(null);
    }
  }

  async function loadComparisonForVendor(group: VendorGroup) {
    if (!selectedRunId) return;
    if (comparisonByVendor[group.key]) return;
    setComparisonLoadingKey(group.key);
    try {
      const defaultDownstreamSiteId = downstreamSites[0]?.id ?? null;
      const res = await api.getReconciliationComparison(selectedRunId, {
        downstreamSiteId: defaultDownstreamSiteId,
        provider: VENDOR_TO_PROVIDER[group.key],
        modelGroup: VENDOR_TO_MODEL_GROUP[group.key],
      });
      setComparisonByVendor((current) => ({
        ...current,
        [group.key]: res.comparison,
      }));
    } catch (error) {
      toast.error((error as Error)?.message || tr('加载供应商渠道对比失败'));
    } finally {
      setComparisonLoadingKey(null);
    }
  }

  const filterPanelContent = (
    <>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div className="toolbar-search">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="9" cy="9" r="5.5" />
            <path d="m13.5 13.5 4 4" />
          </svg>
          <input
            value={runSearch}
            onChange={(event) => setRunSearch(event.target.value)}
            placeholder={tr('搜索任务号、状态、模型族或时间窗口')}
          />
        </div>
      </div>

      <div className="route-filter-row">
        <span className="route-filter-row-label">{tr('状态')}</span>
        <div className="route-filter-row-chips">
          <ReconciliationFilterChip active={statusFilter === 'all'} label={tr('全部')} count={runCounts.total} onClick={() => setStatusFilter('all')} icon={<span style={{ fontSize: 10 }}>✦</span>} />
          <ReconciliationFilterChip active={statusFilter === 'running'} label={tr('运行中')} count={runCounts.running} onClick={() => setStatusFilter(statusFilter === 'running' ? 'all' : 'running')} icon={<span style={{ fontSize: 10, color: 'var(--color-warning)' }}>●</span>} />
          <ReconciliationFilterChip active={statusFilter === 'succeeded'} label={tr('已完成')} count={runCounts.succeeded} onClick={() => setStatusFilter(statusFilter === 'succeeded' ? 'all' : 'succeeded')} icon={<span style={{ fontSize: 10, color: 'var(--color-success)' }}>●</span>} />
          <ReconciliationFilterChip active={statusFilter === 'failed'} label={tr('失败')} count={runCounts.failed} onClick={() => setStatusFilter(statusFilter === 'failed' ? 'all' : 'failed')} icon={<span style={{ fontSize: 10, color: 'var(--color-danger)' }}>●</span>} />
        </div>
      </div>

      <div className="route-filter-row">
        <span className="route-filter-row-label">{tr('窗口')}</span>
        <div className="route-filter-row-chips">
          <ReconciliationFilterChip active={scopeFilter === 'all'} label={tr('全部')} count={runCounts.total} onClick={() => setScopeFilter('all')} icon={<span style={{ fontSize: 10 }}>◎</span>} />
          <ReconciliationFilterChip active={scopeFilter === 'day'} label={tr('按天')} count={runCounts.day} onClick={() => setScopeFilter(scopeFilter === 'day' ? 'all' : 'day')} icon={<span style={{ fontSize: 10 }}>D</span>} />
          <ReconciliationFilterChip active={scopeFilter === 'hour'} label={tr('按小时')} count={runCounts.hour} onClick={() => setScopeFilter(scopeFilter === 'hour' ? 'all' : 'hour')} icon={<span style={{ fontSize: 10 }}>H</span>} />
        </div>
      </div>

      <div className="reconciliation-filter-section">
        <div className="reconciliation-filter-section-header">
          <div>
            <div className="reconciliation-filter-section-title">{tr('生成设置')}</div>
            <div className="reconciliation-filter-section-hint">{tr('保持现有对账参数，但把表单做成更清晰的筛选式布局。')}</div>
          </div>
          {activeFilterCount > 0 ? (
            <button type="button" className="btn btn-ghost" style={{ padding: '6px 10px', fontSize: 12 }} onClick={resetRunFilters}>
              {tr('重置任务筛选')}
            </button>
          ) : null}
        </div>
        <div className="reconciliation-filter-grid">
          <label className="reconciliation-filter-field">
            <span>{tr('时间粒度')}</span>
            <select value={scopeType} onChange={(e) => setScopeType(e.target.value === 'hour' ? 'hour' : 'day')}>
              <option value="day">{tr('按天')}</option>
              <option value="hour">{tr('按小时')}</option>
            </select>
          </label>
          <label className="reconciliation-filter-field">
            <span>{tr('窗口开始')}</span>
            <input type="datetime-local" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} />
          </label>
          <label className="reconciliation-filter-field">
            <span>{tr('窗口结束')}</span>
            <input type="datetime-local" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} />
          </label>
        </div>
      </div>
    </>
  );

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

      <ResponsiveFilterPanel
        isMobile={isMobile}
        mobileOpen={mobileFiltersOpen}
        onMobileOpen={() => setMobileFiltersOpen(true)}
        onMobileClose={() => setMobileFiltersOpen(false)}
        mobileTitle={tr('任务筛选与生成设置')}
        mobileContent={filterPanelContent}
        desktopContent={(
          <div className="route-filter-bar" style={{ marginBottom: 20 }}>
            <div className="toolbar" style={{ padding: 10, marginBottom: 0 }}>
              <div className="toolbar-search">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                  <circle cx="9" cy="9" r="5.5" />
                  <path d="m13.5 13.5 4 4" />
                </svg>
                <input
                  value={runSearch}
                  onChange={(event) => setRunSearch(event.target.value)}
                  placeholder={tr('搜索任务号、状态、模型族或时间窗口')}
                />
              </div>
              <button type="button" className="route-filter-bar-summary" style={{ width: 'auto', minWidth: 240, borderRadius: 12 }} onClick={() => setFiltersCollapsed((current) => !current)}>
                <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: filtersCollapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s ease' }} aria-hidden>
                  <path d="m5 7 5 6 5-6" />
                </svg>
                <span className="route-filter-bar-summary-label">{tr('筛选')}</span>
                <span className="route-filter-bar-summary-content">{activeFilterSummary}</span>
                <span className={`route-filter-bar-summary-count ${activeFilterCount > 0 ? 'has-active' : ''}`.trim()}>{activeFilterCount}</span>
              </button>
            </div>
            <div className={`anim-collapse ${filtersCollapsed ? '' : 'is-open'}`.trim()}>
              <div className="anim-collapse-inner">
                <div className="route-filter-bar-expanded">
                  {filterPanelContent}
                </div>
              </div>
            </div>
          </div>
        )}
        mobileTrigger={(
          <div className="mobile-filter-row" style={{ justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <div className="route-filter-bar-summary-content" style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{activeFilterSummary}</div>
            <button type="button" className="btn btn-ghost" style={{ border: '1px solid var(--color-border)' }} onClick={() => setMobileFiltersOpen(true)}>
              {tr('筛选与设置')}
            </button>
          </div>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(320px, 400px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        <section className="glass-card" style={{ padding: 16, borderRadius: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{tr('对账任务')}</h2>
            <button className="btn btn-ghost" style={{ border: '1px solid var(--color-border)' }} onClick={() => void loadRuns(selectedRunId)} disabled={loadingRuns}>{loadingRuns ? tr('刷新中...') : tr('刷新')}</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
              {tr('共')} <strong style={{ color: 'var(--color-text-primary)' }}>{filteredRuns.length}</strong> {tr('条可见任务')}
            </div>
            {activeFilterCount > 0 ? <span className="badge badge-info">{tr('已筛选')} {activeFilterCount}</span> : null}
          </div>
          <div className={isMobile ? 'mobile-card-list' : 'reconciliation-run-list'}>
            {runs.length <= 0 ? (
              <div style={{ color: 'var(--color-text-muted)' }}>{tr('还没有对账任务，先生成一次。')}</div>
            ) : filteredRuns.length <= 0 ? (
              <div className="subtle-card" style={{ padding: 16, borderRadius: 14, color: 'var(--color-text-muted)' }}>
                {tr('当前筛选条件下没有匹配任务，试试清空搜索词或恢复全部状态。')}
              </div>
            ) : filteredRuns.map((run) => (isMobile ? (
              <SwipeableRunCard
                key={run.id}
                run={run}
                selected={run.id === selectedRunId}
                deleting={deletingRunId === run.id}
                onSelect={() => void loadRunResults(run.id)}
                onDelete={() => setDeleteTarget(run)}
              />
            ) : (
              <div key={run.id} className={`reconciliation-run-item ${run.id === selectedRunId ? 'is-selected' : ''}`.trim()}>
                <button
                  type="button"
                  className="reconciliation-run-item-main"
                  onClick={() => void loadRunResults(run.id)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6, alignItems: 'center' }}>
                    <strong>#{run.id} · {run.scopeType === 'hour' ? tr('小时窗') : tr('日窗')}</strong>
                    <span className={`badge ${resolveStatusBadgeClass(run.status)}`} style={{ fontSize: 11 }}>{run.status}</span>
                  </div>
                  <div style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{formatIso(run.windowStart)} → {formatIso(run.windowEnd)}</div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 8, lineHeight: 1.7 }}>
                    {tr('不匹配')} {summaryValue(run.summary, 'mismatchCount')} · {tr('警告')} {summaryValue(run.summary, 'warningCount')} · {tr('模型族')} {summaryValue(run.summary, 'modelFamilies')}
                  </div>
                </button>
                <div className="reconciliation-run-item-actions">
                  <button type="button" className="btn-link btn-link-danger" onClick={() => setDeleteTarget(run)} disabled={deletingRunId === run.id}>
                    {deletingRunId === run.id ? tr('删除中...') : tr('删除')}
                  </button>
                </div>
              </div>
            )))}
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
            const comparison = comparisonByVendor[group.key];
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
                  <button
                    className="btn btn-ghost"
                    style={{ border: '1px solid var(--color-border)' }}
                    onClick={() => {
                      const nextExpanded = !expanded;
                      setExpandedKeys((current) => nextExpanded ? [...current, group.key] : current.filter((item) => item !== group.key));
                      if (nextExpanded) {
                        void loadComparisonForVendor(group);
                      }
                    }}
                  >
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
                    {comparisonLoadingKey === group.key ? (
                      <div className="subtle-card" style={{ padding: 14, borderRadius: 16, color: 'var(--color-text-muted)' }}>
                        {tr('正在加载供应商渠道对比表...')}
                      </div>
                    ) : null}
                    {comparison?.groups?.map((comparisonGroup) => (
                      <ReconciliationComparisonTables
                        key={comparisonGroup.groupKey}
                        group={comparisonGroup}
                        warnings={comparison.warnings}
                      />
                    ))}
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

      <DeleteConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteRun()}
        title={tr('删除对账任务')}
        confirmText={tr('确认删除')}
        loading={deletingRunId !== null}
        description={deleteTarget
          ? <>{tr('删除任务')} <strong>#{deleteTarget.id}</strong> {tr('后，会一并清空该次运行关联的事实与结果数据。')}</>
          : tr('确认删除当前对账任务吗？')}
      />
    </div>
  );
}
