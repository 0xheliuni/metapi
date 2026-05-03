import React, { useEffect, useMemo, useState } from 'react';
import { api, type ReconciliationResultItem, type ReconciliationRunItem } from '../api.js';
import { useToast } from '../components/Toast.js';
import { tr } from '../i18n.js';

type ScopeType = 'hour' | 'day';

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

export default function Reconciliation() {
  const toast = useToast();
  const [scopeType, setScopeType] = useState<ScopeType>('day');
  const [windowStart, setWindowStart] = useState(defaultWindow('day').start);
  const [windowEnd, setWindowEnd] = useState(defaultWindow('day').end);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [creating, setCreating] = useState(false);
  const [runs, setRuns] = useState<ReconciliationRunItem[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [selectedRun, setSelectedRun] = useState<ReconciliationRunItem | null>(null);
  const [results, setResults] = useState<ReconciliationResultItem[]>([]);

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

  const stats = useMemo(() => ({
    totalRuns: runs.length,
    latestStatus: runs[0]?.status || '-',
    mismatchCount: results.filter((item) => item.status === 'mismatch').length,
    warningCount: results.filter((item) => item.status === 'warning').length,
  }), [results, runs]);

  return (
    <div className="page-shell">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 className="page-title">{tr('对账中心')}</h1>
          <p className="page-subtitle">{tr('先按 Claude / GPT / Gemini 模型族，对比下游账本、Metapi 观测与上游快照。')}</p>
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
          { label: tr('历史任务'), value: String(stats.totalRuns) },
          { label: tr('最新状态'), value: stats.latestStatus },
          { label: tr('当前不匹配'), value: String(stats.mismatchCount) },
          { label: tr('当前警告'), value: String(stats.warningCount) },
        ].map((item) => (
          <div key={item.label} className="glass-card" style={{ padding: 16, borderRadius: 16 }}>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginBottom: 8 }}>{item.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{item.value}</div>
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

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
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
                  borderRadius: 14,
                  border: run.id === selectedRunId ? '1px solid var(--color-primary)' : '1px solid var(--color-border-light)',
                  padding: 14,
                  background: run.id === selectedRunId ? 'color-mix(in srgb, var(--color-primary) 8%, transparent)' : 'var(--color-bg-card)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                  <strong>#{run.id} · {run.scopeType}</strong>
                  <span>{run.status}</span>
                </div>
                <div style={{ color: 'var(--color-text-secondary)', fontSize: 12 }}>{formatIso(run.windowStart)} → {formatIso(run.windowEnd)}</div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 12, marginTop: 8 }}>{tr('不匹配')} {summaryValue(run.summary, 'mismatchCount')} · {tr('警告')} {summaryValue(run.summary, 'warningCount')}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="glass-card" style={{ padding: 16, borderRadius: 18, overflow: 'hidden' }}>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{tr('结果明细')}</h2>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{selectedRun ? `${formatIso(selectedRun.windowStart)} → ${formatIso(selectedRun.windowEnd)}` : tr('请选择左侧任务')}</div>
          </div>

          {selectedRun && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 16 }}>
              <div className="subtle-card" style={{ padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{tr('模型族')}</div>
                <strong>{summaryValue(selectedRun.summary, 'modelFamilies')}</strong>
              </div>
              <div className="subtle-card" style={{ padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{tr('facts 数')}</div>
                <strong>{summaryValue(selectedRun.summary, 'totalFacts')}</strong>
              </div>
              <div className="subtle-card" style={{ padding: 12, borderRadius: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{tr('results 数')}</div>
                <strong>{summaryValue(selectedRun.summary, 'totalResults')}</strong>
              </div>
            </div>
          )}

          <div style={{ overflowX: 'auto' }}>
            <table className="table-modern" style={{ width: '100%', minWidth: 980 }}>
              <thead>
                <tr>
                  <th>{tr('模型族')}</th>
                  <th>{tr('下游 Tokens')}</th>
                  <th>{tr('观测 Tokens')}</th>
                  <th>{tr('上游额度')}</th>
                  <th>{tr('下游 USD')}</th>
                  <th>{tr('上游 USD')}</th>
                  <th>{tr('差异 USD')}</th>
                  <th>{tr('状态')}</th>
                  <th>{tr('说明')}</th>
                </tr>
              </thead>
              <tbody>
                {results.length <= 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 24 }}>{tr('暂无结果')}</td>
                  </tr>
                ) : results.map((item) => (
                  <tr key={item.id}>
                    <td>{item.modelFamily}</td>
                    <td>{item.downstreamBilledTokens}</td>
                    <td>{item.metapiObservedTokens}</td>
                    <td>{item.upstreamConsumedQuota}</td>
                    <td>{item.downstreamBilledCostUsd.toFixed(6)}</td>
                    <td>{item.upstreamConsumedCostUsdDerived.toFixed(6)}</td>
                    <td>{item.deltaCostUsd.toFixed(6)}</td>
                    <td>{item.status}</td>
                    <td style={{ minWidth: 260 }}>{item.explanationText || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
