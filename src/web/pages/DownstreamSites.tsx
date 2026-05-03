import React, { useEffect, useMemo, useState } from 'react';
import { api, type DownstreamSiteChannel, type DownstreamSiteItem } from '../api.js';
import CenteredModal from '../components/CenteredModal.js';
import DeleteConfirmModal from '../components/DeleteConfirmModal.js';
import { MobileCard, MobileField } from '../components/MobileCard.js';
import ResponsiveFilterPanel from '../components/ResponsiveFilterPanel.js';
import ResponsiveBatchActionBar from '../components/ResponsiveBatchActionBar.js';
import { useToast } from '../components/Toast.js';
import ModernSelect from '../components/ModernSelect.js';
import { useIsMobile } from '../components/useIsMobile.js';
import { shouldIgnoreRowSelectionClick } from './helpers/rowSelection.js';

type DownstreamSiteForm = {
  name: string;
  hostSiteId: string;
  baseUrlOverride: string;
  adminCredential: string;
  adminUserId: string;
  description: string;
  enabled: boolean;
};

type HostSiteOption = {
  id: number;
  name: string;
  url: string;
  platform: string;
  status?: string | null;
};

type DeleteConfirmState = null | {
  mode: 'single';
  item: DownstreamSiteItem;
} | {
  mode: 'batch';
  ids: number[];
};

type ChannelViewMode = 'compact' | 'table';

function emptyForm(): DownstreamSiteForm {
  return {
    name: '',
    hostSiteId: '',
    baseUrlOverride: '',
    adminCredential: '',
    adminUserId: '',
    description: '',
    enabled: true,
  };
}

function toDateTimeText(value?: string | null): string {
  const text = String(value || '').trim();
  if (!text) return '--';
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatMoney(value?: number | null): string {
  const amount = Number(value || 0);
  return `$${amount.toFixed(amount >= 1 ? 3 : 6)}`;
}

function buildFormFromItem(item?: DownstreamSiteItem | null): DownstreamSiteForm {
  return {
    name: item?.name || '',
    hostSiteId: item?.hostSiteId ? String(item.hostSiteId) : '',
    baseUrlOverride: item?.baseUrlOverride || '',
    adminCredential: '',
    adminUserId: item?.adminUserId ? String(item.adminUserId) : '',
    description: item?.description || '',
    enabled: item?.enabled ?? true,
  };
}

function StatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span className={`badge ${enabled ? 'badge-success' : 'badge-muted'}`} style={{ fontSize: 11 }}>
      {enabled ? '启用' : '禁用'}
    </span>
  );
}

function SyncStatusBadge({ status }: { status?: string | null }) {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'succeeded') {
    return <span className="badge badge-success" style={{ fontSize: 11 }}>同步成功</span>;
  }
  if (value === 'failed') {
    return <span className="badge badge-danger" style={{ fontSize: 11 }}>同步失败</span>;
  }
  if (value === 'running') {
    return <span className="badge badge-warning" style={{ fontSize: 11 }}>同步中</span>;
  }
  return <span className="badge badge-muted" style={{ fontSize: 11 }}>未同步</span>;
}

const formInputStyle = {
  width: '100%',
  padding: '10px 14px',
  border: '1px solid var(--color-border)',
  borderRadius: 'var(--radius-sm)',
  fontSize: 13,
  outline: 'none',
  background: 'var(--color-bg)',
  color: 'var(--color-text-primary)',
} as const;

export default function DownstreamSites() {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [items, setItems] = useState<DownstreamSiteItem[]>([]);
  const [hostSites, setHostSites] = useState<HostSiteOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DownstreamSiteItem | null>(null);
  const [form, setForm] = useState<DownstreamSiteForm>(emptyForm());
  const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showMobileTools, setShowMobileTools] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState>(null);
  const [rowLoading, setRowLoading] = useState<Record<string, boolean>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [channelData, setChannelData] = useState<DownstreamSiteChannel[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');
  const [channelViewMode, setChannelViewMode] = useState<ChannelViewMode>('compact');

  const load = async () => {
    setLoading(true);
    try {
      const [siteRes, hostRes] = await Promise.all([
        api.getDownstreamSites(),
        api.getSites(),
      ]);
      setItems(Array.isArray(siteRes?.items) ? siteRes.items : []);
      const hostRows = Array.isArray(hostRes) ? hostRes : [];
      setHostSites(hostRows
        .filter((row: any) => String(row?.platform || '').trim().toLowerCase() === 'new-api')
        .map((row: any) => ({
          id: Number(row.id),
          name: String(row.name || ''),
          url: String(row.url || ''),
          platform: String(row.platform || ''),
          status: row.status,
        })));
    } catch (error: any) {
      toast.error(error?.message || '加载下游站点失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const visibleItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return items.filter((item) => {
      if (statusFilter === 'enabled' && !item.enabled) return false;
      if (statusFilter === 'disabled' && item.enabled) return false;
      if (!normalizedSearch) return true;
      const haystack = [
        item.name,
        item.hostSiteName || '',
        item.hostSiteUrl || '',
        item.description || '',
        item.adminCredentialMasked || '',
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedSearch);
    }).sort((left, right) => right.id - left.id);
  }, [items, search, statusFilter]);

  const selectedItem = useMemo(() => items.find((item) => item.id === selectedId) || null, [items, selectedId]);
  const visibleIds = useMemo(() => visibleItems.map((item) => item.id), [visibleItems]);
  const selectedVisibleCount = useMemo(() => selectedIds.filter((id) => visibleIds.includes(id)).length, [selectedIds, visibleIds]);
  const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const selectedItems = useMemo(() => visibleItems.filter((item) => selectedIds.includes(item.id)), [visibleItems, selectedIds]);
  const visibleChannels = useMemo(() => {
    const keyword = channelSearch.trim().toLowerCase();
    const rows = keyword
      ? channelData.filter((channel) => [
        channel.remoteName,
        channel.remoteChannelId,
        channel.remoteGroup || '',
        channel.remoteType == null ? '' : String(channel.remoteType),
      ].join(' ').toLowerCase().includes(keyword))
      : channelData;
    return [...rows].sort((left, right) => Number(right.derivedConsumedUsd || 0) - Number(left.derivedConsumedUsd || 0));
  }, [channelData, channelSearch]);
  const topConsumedChannel = useMemo(() => {
    return visibleChannels.reduce<DownstreamSiteChannel | null>((top, channel) => {
      if (!top) return channel;
      return Number(channel.derivedConsumedUsd || 0) > Number(top.derivedConsumedUsd || 0) ? channel : top;
    }, null);
  }, [visibleChannels]);

  useEffect(() => {
    setSelectedIds((current) => current.filter((id) => items.some((item) => item.id === id)));
    setSelectedId((current) => current && items.some((item) => item.id === current) ? current : null);
  }, [items]);

  const openCreate = () => {
    setEditingItem(null);
    setForm(emptyForm());
    setEditorOpen(true);
  };

  const openEdit = (item: DownstreamSiteItem) => {
    setEditingItem(item);
    setForm(buildFormFromItem(item));
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingItem(null);
    setForm(emptyForm());
  };

  const save = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.info('请填写来源名称');
      return;
    }
    const hostSiteId = Number.parseInt(form.hostSiteId, 10);
    if (!Number.isFinite(hostSiteId) || hostSiteId <= 0) {
      toast.info('请选择宿主站点');
      return;
    }
    if (!editingItem && !form.adminCredential.trim()) {
      toast.info('请填写管理端访问凭证');
      return;
    }
    const adminUserId = form.adminUserId.trim() ? Number(form.adminUserId.trim()) : null;
    if (!adminUserId || !Number.isFinite(adminUserId) || adminUserId <= 0) {
      toast.info('请填写管理端用户 ID（New-Api-User）');
      return;
    }

    const payload: Record<string, unknown> = {
      name,
      hostSiteId,
      baseUrlOverride: form.baseUrlOverride.trim() || null,
      adminUserId,
      description: form.description.trim() || null,
      enabled: form.enabled,
    };
    if (form.adminCredential.trim()) {
      payload.adminCredential = form.adminCredential.trim();
    }

    setSaving(true);
    try {
      if (editingItem) {
        await api.updateDownstreamSite(editingItem.id, payload);
        toast.success('下游站点来源已更新');
      } else {
        payload.authMode = 'session-admin';
        await api.createDownstreamSite(payload);
        toast.success('下游站点来源已创建');
      }
      closeEditor();
      await load();
    } catch (error: any) {
      toast.error(error?.message || '保存下游站点来源失败');
    } finally {
      setSaving(false);
    }
  };

  const withRowLoading = async (key: string, action: () => Promise<void>) => {
    setRowLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await action();
    } finally {
      setRowLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const toggleVisibleSelection = () => {
    if (allVisibleSelected) {
      setSelectedIds((current) => current.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedIds((current) => Array.from(new Set([...current, ...visibleIds])));
  };

  const toggleSiteSelection = (siteId: number, checked: boolean) => {
    setSelectedIds((current) => checked
      ? Array.from(new Set([...current, siteId]))
      : current.filter((id) => id !== siteId));
  };

  const runBatchAction = async (action: 'test' | 'sync' | 'delete') => {
    if (selectedItems.length <= 0) return;
    if (action === 'delete') {
      setDeleteConfirm({ mode: 'batch', ids: selectedItems.map((item) => item.id) });
      return;
    }

    const targets = [...selectedItems];
    await withRowLoading(`batch:${action}`, async () => {
      if (action === 'test') {
        const results = await Promise.allSettled(targets.map((item) => api.testDownstreamSiteConnection(item.id)));
        const successCount = results.filter((result) => result.status === 'fulfilled').length;
        toast.success(`已完成 ${successCount}/${targets.length} 个来源的连接测试`);
        return;
      }
      const results = await Promise.allSettled(targets.map((item) => api.syncDownstreamSite(item.id)));
      const reusedCount = results.filter((result) => result.status === 'fulfilled' && result.value?.reused).length;
      const queuedCount = results.filter((result) => result.status === 'fulfilled').length;
      toast.success(reusedCount > 0
        ? `已提交 ${queuedCount} 个同步任务，其中 ${reusedCount} 个任务已在执行中`
        : `已提交 ${queuedCount} 个同步任务`);
      await load();
    });
  };

  const openDrawer = async (item: DownstreamSiteItem) => {
    setSelectedId(item.id);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setChannelSearch('');
    setChannelViewMode('compact');
    try {
      const res = await api.getDownstreamSiteChannels(item.id);
      setChannelData(Array.isArray(res?.channels) ? res.channels : []);
    } catch (error: any) {
      toast.error(error?.message || '加载渠道快照失败');
      setChannelData([]);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleRowClick = (siteId: number, event: React.MouseEvent<HTMLTableRowElement>) => {
    if (shouldIgnoreRowSelectionClick(event.target)) return;
    const isSelected = selectedIds.includes(siteId);
    toggleSiteSelection(siteId, !isSelected);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const target = deleteConfirm;
    setDeleteConfirm(null);

    if (target.mode === 'single') {
      await withRowLoading(`delete:${target.item.id}`, async () => {
        await api.deleteDownstreamSite(target.item.id);
        toast.success('下游站点来源已删除');
        setDrawerOpen(false);
        setSelectedIds((current) => current.filter((id) => id !== target.item.id));
        await load();
      });
      return;
    }

    const results = await Promise.allSettled(target.ids.map((id) => api.deleteDownstreamSite(id)));
    const successIds = target.ids.filter((_, index) => results[index]?.status === 'fulfilled');
    const failedCount = results.length - successIds.length;
    setSelectedIds((current) => current.filter((id) => !successIds.includes(id)));
    if (successIds.length > 0) {
      toast.success(failedCount > 0 ? `批量删除完成：成功 ${successIds.length}，失败 ${failedCount}` : `批量删除完成：成功 ${successIds.length}`);
    } else {
      toast.error('批量删除失败');
    }
    await load();
  };

  const filterContent = (
    <div style={{ display: 'grid', gap: 12 }}>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="搜索名称、宿主站点、备注或凭证掩码"
        style={formInputStyle}
      />
      <ModernSelect
        value={statusFilter}
        onChange={(value) => setStatusFilter(value as 'all' | 'enabled' | 'disabled')}
        options={[
          { value: 'all', label: '全部状态' },
          { value: 'enabled', label: '仅启用' },
          { value: 'disabled', label: '仅禁用' },
        ]}
      />
      <div className="info-tip">
        这里管理的是下游消费来源，不会接管 Metapi 的站点运行时代理链路；同步得到的是远端管理端快照，用于后续核对与对账准备。
      </div>
    </div>
  );

  return (
    <div className="page-enter" style={{ display: 'grid', gap: 16 }}>
      <div className="card" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>下游站点</div>
            <div style={{ color: 'var(--color-text-muted)', fontSize: 13, lineHeight: 1.7, maxWidth: 780 }}>
              通过 new-api 管理端接口拉取渠道余额、Quota 与消费快照，作为独立的下游消费来源进行管理。它只负责远端快照采集与核对准备，不会修改宿主站点的运行时代理链路。
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!isMobile ? (
              <button className="btn btn-ghost" style={{ border: '1px solid var(--color-border)' }} onClick={() => void load()}>
                刷新列表
              </button>
            ) : null}
            <button className="btn btn-primary" onClick={openCreate}>+ 新增下游站点</button>
          </div>
        </div>
      </div>

      <ResponsiveFilterPanel
        isMobile={isMobile}
        mobileOpen={showMobileTools}
        onMobileOpen={() => setShowMobileTools(true)}
        onMobileClose={() => setShowMobileTools(false)}
        mobileTitle="筛选下游站点"
        mobileContent={filterContent}
        desktopContent={(
          <div className="card" style={{ padding: 14, display: 'grid', gap: 12 }}>
            {filterContent}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
                共 {visibleItems.length} 个来源 · 已选 {selectedIds.length} 个 · 宿主候选 {hostSites.length} 个
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button className="btn btn-ghost" style={{ border: '1px solid var(--color-border)' }} onClick={toggleVisibleSelection}>
                  {allVisibleSelected ? '取消全选' : '全选可见'}
                </button>
                <button className="btn btn-ghost" style={{ border: '1px solid var(--color-border)' }} onClick={() => void load()}>
                  刷新列表
                </button>
              </div>
            </div>
          </div>
        )}
      />

      {selectedIds.length > 0 && (
        <ResponsiveBatchActionBar
          isMobile={isMobile}
          info={`已选 ${selectedIds.length} 项`}
          desktopStyle={{ marginBottom: 0 }}
        >
          <button className="btn btn-ghost" style={{ border: '1px solid var(--color-border)' }} onClick={() => void runBatchAction('test')} disabled={!!rowLoading['batch:test'] || !!rowLoading['batch:sync']}>
            批量测试连接
          </button>
          <button className="btn btn-ghost" style={{ border: '1px solid var(--color-border)' }} onClick={() => void runBatchAction('sync')} disabled={!!rowLoading['batch:test'] || !!rowLoading['batch:sync']}>
            批量立即同步
          </button>
          <button className="btn btn-link btn-link-danger" onClick={() => setSelectedIds([])}>
            清空选择
          </button>
        </ResponsiveBatchActionBar>
      )}

      <div className="card" style={{ overflowX: 'auto' }}>
        {loading ? (
          <div className="skeleton" style={{ width: '100%', height: 220, borderRadius: 'var(--radius-sm)' }} />
        ) : items.length > 0 ? (
          isMobile ? (
            <div className="mobile-card-list">
            {visibleItems.map((item) => {
              const checked = selectedIds.includes(item.id);
              const isExpanded = selectedId === item.id;
              return (
                <MobileCard
                  key={item.id}
                  title={(
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span>{item.name}</span>
                      {item.hostSiteUrl ? (
                        <a
                          href={item.hostSiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sites-url-link"
                          style={{
                            fontSize: 12,
                            fontFamily: 'var(--font-mono)',
                            color: 'var(--color-primary)',
                            textDecoration: 'underline',
                            wordBreak: 'break-all',
                          }}
                        >
                          {item.hostSiteUrl}
                        </a>
                      ) : null}
                    </div>
                  )}
                  selected={checked}
                  onSelect={() => setSelectedIds((current) => checked ? current.filter((id) => id !== item.id) : [...current, item.id])}
                  headerActions={(
                    <input
                      type="checkbox"
                      aria-label={`选择下游站点 ${item.name || item.id}`}
                      checked={checked}
                      onChange={(event) => setSelectedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}
                    />
                  )}
                  footerActions={(
                    <>
                      <button className="btn btn-link" onClick={() => setSelectedId(isExpanded ? null : item.id)}>
                        {isExpanded ? '收起' : '详情'}
                      </button>
                      <button className="btn btn-link btn-link-primary" onClick={() => openEdit(item)}>编辑</button>
                      <button className="btn btn-link btn-link-primary" onClick={() => void openDrawer(item)}>快照</button>
                    </>
                  )}
                >
                  <MobileField label="状态" value={<StatusBadge enabled={item.enabled} />} />
                  <MobileField label="同步" value={<SyncStatusBadge status={item.lastSyncStatus} />} />
                  <MobileField label="宿主站点" value={item.hostSiteName || '--'} />
                  <MobileField label="渠道数" value={String(item.channelCount)} />
                  <MobileField label="估算消耗" value={formatMoney(item.totalDerivedConsumedUsd)} />
                  <MobileField label="上次同步" value={toDateTimeText(item.lastSyncAt)} />
                  {isExpanded ? (
                    <div className="mobile-card-extra">
                      <MobileField label="认证模式" value={item.authMode || '--'} />
                      <MobileField label="凭证摘要" value={item.adminCredentialMasked || '****'} />
                      <MobileField label="用户 ID" value={item.adminUserId == null ? '--' : String(item.adminUserId)} />
                      <MobileField label="同步说明" stacked value={item.lastSyncMessage || '--'} />
                      <MobileField label="备注" stacked value={item.description || '--'} />
                      <div className="mobile-card-actions">
                      <button className="btn btn-link btn-link-primary" onClick={() => void withRowLoading(`test:${item.id}`, async () => {
                          try {
                            const result = await api.testDownstreamSiteConnection(item.id);
                            toast.success(result.message);
                          } catch (error: any) {
                            const rawMessage = String(error?.message || '测试连接失败');
                            if (rawMessage.includes('New-Api-User header not provided')) {
                              toast.error('测试连接失败：当前下游主站要求填写管理端用户 ID（New-Api-User）');
                              return;
                            }
                            toast.error(rawMessage);
                          }
                        })}>
                          {rowLoading[`test:${item.id}`] ? '测试中...' : '测试连接'}
                        </button>
                        <button className="btn btn-link btn-link-warning" onClick={() => void withRowLoading(`sync:${item.id}`, async () => {
                          const result = await api.syncDownstreamSite(item.id);
                          toast.success(result.reused ? '同步任务已在执行中' : '同步任务已加入队列');
                          await load();
                        })}>
                          {rowLoading[`sync:${item.id}`] ? '同步中...' : '立即同步'}
                        </button>
                        <button className="btn btn-link btn-link-danger" onClick={() => setDeleteConfirm({ mode: 'single', item })}>
                          删除
                        </button>
                      </div>
                    </div>
                  ) : null}
                </MobileCard>
              );
            })}
            </div>
          ) : (
            <table className="data-table sites-table">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedIds(Array.from(new Set([...selectedIds, ...visibleIds])));
                        } else {
                          setSelectedIds((current) => current.filter((id) => !visibleIds.includes(id)));
                        }
                      }}
                    />
                  </th>
                  <th>名称</th>
                  <th>宿主站点</th>
                  <th>认证</th>
                  <th>渠道数</th>
                  <th>估算消耗</th>
                  <th>同步状态</th>
                  <th>上次同步</th>
                  <th style={{ minWidth: 240, textAlign: 'right' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item, index) => {
                  const checked = selectedIds.includes(item.id);
                  return (
                    <tr
                      key={item.id}
                      onClick={(event) => handleRowClick(item.id, event)}
                      className={`animate-slide-up stagger-${Math.min(index + 1, 5)} row-selectable ${checked ? 'row-selected' : ''}`.trim()}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => toggleSiteSelection(item.id, event.target.checked)}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <strong>{item.name}</strong>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <StatusBadge enabled={item.enabled} />
                            <SyncStatusBadge status={item.lastSyncStatus} />
                            <span className={`badge ${item.baseUrlOverride ? 'badge-warning' : 'badge-muted'}`} style={{ fontSize: 11 }}>
                              {item.baseUrlOverride ? '已覆盖 API 地址' : '跟随宿主站点'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <span>{item.hostSiteName || '--'}</span>
                          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{item.hostSiteUrl || '--'}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'grid', gap: 4 }}>
                          <span>{item.authMode}</span>
                          <span style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>{item.adminCredentialMasked || '****'}</span>
                        </div>
                      </td>
                      <td>{item.channelCount}</td>
                      <td>{formatMoney(item.totalDerivedConsumedUsd)}</td>
                      <td>{item.lastSyncMessage || item.lastSyncStatus || '--'}</td>
                      <td>{toDateTimeText(item.lastSyncAt)}</td>
                      <td className="sites-actions-cell" style={{ textAlign: 'right' }}>
                        <div className="sites-row-actions" onClick={(event) => event.stopPropagation()}>
                          <button className="btn btn-link btn-link-primary" onClick={() => openEdit(item)}>编辑</button>
                          <button className="btn btn-link btn-link-primary" onClick={() => void withRowLoading(`test:${item.id}`, async () => {
                            try {
                              const result = await api.testDownstreamSiteConnection(item.id);
                              toast.success(result.message);
                            } catch (error: any) {
                              const rawMessage = String(error?.message || '测试连接失败');
                              if (rawMessage.includes('New-Api-User header not provided')) {
                                toast.error('测试连接失败：当前下游主站要求填写管理端用户 ID（New-Api-User）');
                                return;
                              }
                              toast.error(rawMessage);
                            }
                          })}>
                            {rowLoading[`test:${item.id}`] ? '测试中...' : '测试连接'}
                          </button>
                          <button className="btn btn-link btn-link-warning" onClick={() => void withRowLoading(`sync:${item.id}`, async () => {
                            const result = await api.syncDownstreamSite(item.id);
                            toast.success(result.reused ? '同步任务已在执行中' : '同步任务已加入队列');
                            await load();
                          })}>
                            {rowLoading[`sync:${item.id}`] ? '同步中...' : '立即同步'}
                          </button>
                          <button className="btn btn-link" onClick={() => void openDrawer(item)}>快照</button>
                          <button className="btn btn-link btn-link-danger" onClick={() => setDeleteConfirm({ mode: 'single', item })}>删除</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        ) : (
          <div className="empty-state">
            <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1}
                d="M3 7h18M5 7l1 12h12l1-12M10 3h4a1 1 0 011 1v3H9V4a1 1 0 011-1z"
              />
            </svg>
            <div className="empty-state-title">暂无下游站点</div>
            <div className="empty-state-desc">点击“+ 新增下游站点”开始管理远端消费来源。</div>
          </div>
        )}
      </div>

      <CenteredModal
        open={editorOpen}
        onClose={closeEditor}
        title={<div style={{ fontSize: 14, fontWeight: 600 }}>{editingItem ? '编辑下游站点' : '新增下游站点'}</div>}
        maxWidth={860}
        bodyStyle={{
          maxHeight: isMobile ? '78vh' : '72vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
        footer={(
          <>
            <button onClick={closeEditor} className="btn btn-ghost" style={{ border: '1px solid var(--color-border)' }}>
              取消
            </button>
            <button onClick={() => void save()} disabled={saving} className="btn btn-primary">
              {saving ? <><span className="spinner spinner-sm" style={{ borderTopColor: 'white', borderColor: 'rgba(255,255,255,0.3)' }} /> 保存中...</> : editingItem ? '保存修改' : '保存来源'}
            </button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <input style={formInputStyle} value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="来源名称" />
          {hostSites.length <= 0 ? (
            <div className="alert alert-warning animate-scale-in">
              <div className="alert-title">还没有可用的宿主站点</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
                下游站点来源必须绑定一个 <strong>platform = new-api</strong> 的宿主站点。请先到“站点管理”里新增或修正一个 new-api 站点，然后再回来保存来源。
              </div>
            </div>
          ) : null}
          <ModernSelect
            value={form.hostSiteId}
            onChange={(value) => setForm((prev) => ({ ...prev, hostSiteId: value }))}
            disabled={hostSites.length <= 0}
            options={[
              { value: '', label: '选择宿主 new-api 站点' },
              ...hostSites.map((site) => ({ value: String(site.id), label: `${site.name} · ${site.url}` })),
            ]}
          />
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.7 }}>
            宿主站点必须是已存在的 new-api 站点。来源保存后，会通过其管理端接口执行连接测试与渠道快照同步。
          </div>
          <input style={formInputStyle} value={form.baseUrlOverride} onChange={(event) => setForm((prev) => ({ ...prev, baseUrlOverride: event.target.value }))} placeholder="可选：覆盖请求 Base URL（必须与宿主站点同源）" />
          <input style={formInputStyle} value={form.adminCredential} onChange={(event) => setForm((prev) => ({ ...prev, adminCredential: event.target.value }))} placeholder={editingItem ? '留空则保持现有管理凭证' : '管理端 access token / session token'} />
          <input style={formInputStyle} value={form.adminUserId} onChange={(event) => setForm((prev) => ({ ...prev, adminUserId: event.target.value }))} placeholder="必填：管理端用户 ID（New-Api-User）" />
          <textarea style={formInputStyle} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} placeholder="备注（可选）" rows={3} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)', background: 'var(--color-bg)' }}>
            <input type="checkbox" checked={form.enabled} onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))} />
            启用来源
          </label>
          <div className="info-tip">
            连接测试只验证远端管理接口是否可访问；立即同步会读取远端渠道列表与统计快照，并写入当前来源的渠道快照表。多数 new-api 主站还要求同时提供管理端用户 ID（New-Api-User）。
          </div>
        </div>
      </CenteredModal>

      <DeleteConfirmModal
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={confirmDelete}
        title="删除下游站点"
        description={deleteConfirm?.mode === 'single'
          ? <>删除来源 <strong>{deleteConfirm.item.name}</strong> 后会清空该来源的渠道快照记录。</>
          : <>删除选中的 <strong>{deleteConfirm?.ids.length || 0}</strong> 个来源后会清空对应渠道快照记录。</>}
      />

      {drawerOpen && selectedItem ? (
        <CenteredModal
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          title={<div style={{ fontSize: 14, fontWeight: 600 }}>渠道快照 · {selectedItem.name}</div>}
          maxWidth={1180}
          bodyStyle={{
            maxHeight: isMobile ? '78vh' : '76vh',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>远端渠道消费快照</div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: 12, lineHeight: 1.7, maxWidth: 760 }}>
                    这里展示的是通过 new-api 管理端接口读取到的渠道余额、Quota 与请求统计快照，仅作为下游核对参考，不会覆盖 Metapi 本地 usage 主链路。
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span className="kpi-chip">来源：{selectedItem.hostSiteName || '未命名宿主站点'}</span>
                  <span className={`kpi-chip ${selectedItem.baseUrlOverride ? 'kpi-chip-warning' : 'kpi-chip-success'}`}>
                    {selectedItem.baseUrlOverride ? '已覆盖 API 地址' : '跟随宿主站点'}
                  </span>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <div className="card" style={{ padding: 12, display: 'grid', gap: 4, background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)' }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>渠道数</div>
                  <strong style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{selectedItem.channelCount}</strong>
                </div>
                <div className="card" style={{ padding: 12, display: 'grid', gap: 4, background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)' }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>估算消耗</div>
                  <strong style={{ fontSize: 18, fontVariantNumeric: 'tabular-nums' }}>{formatMoney(selectedItem.totalDerivedConsumedUsd)}</strong>
                </div>
                <div className="card" style={{ padding: 12, display: 'grid', gap: 4, background: 'color-mix(in srgb, var(--color-surface) 88%, transparent)' }}>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>上次同步</div>
                  <strong style={{ fontSize: 15 }}>{toDateTimeText(selectedItem.lastSyncAt)}</strong>
                </div>
              </div>
            </div>
            {drawerLoading ? (
              <div className="skeleton" style={{ width: '100%', height: 180, borderRadius: 'var(--radius-sm)' }} />
            ) : visibleChannels.length > 0 ? (
              <div className="card" style={{ padding: 12, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'grid', gap: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>渠道明细</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      默认按估算消耗从高到低排序，便于优先定位高消耗渠道。
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', flex: '1 1 360px', justifyContent: 'flex-end' }}>
                    {topConsumedChannel ? (
                      <span className="kpi-chip kpi-chip-warning">
                        最高消耗：{topConsumedChannel.remoteName} · {formatMoney(topConsumedChannel.derivedConsumedUsd)}
                      </span>
                    ) : null}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4, border: '1px solid var(--color-border)', borderRadius: '999px', background: 'var(--color-surface)' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setChannelViewMode('compact')}
                        style={{
                          border: 'none',
                          padding: '6px 10px',
                          borderRadius: 999,
                          background: channelViewMode === 'compact' ? 'var(--color-primary)' : 'transparent',
                          color: channelViewMode === 'compact' ? 'white' : 'var(--color-text-secondary)',
                        }}
                      >
                        紧凑
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setChannelViewMode('table')}
                        style={{
                          border: 'none',
                          padding: '6px 10px',
                          borderRadius: 999,
                          background: channelViewMode === 'table' ? 'var(--color-primary)' : 'transparent',
                          color: channelViewMode === 'table' ? 'white' : 'var(--color-text-secondary)',
                        }}
                      >
                        表格
                      </button>
                    </div>
                    <div className="toolbar-search" style={{ maxWidth: 'unset', minWidth: 240, flex: '1 1 260px' }}>
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                      <input
                        value={channelSearch}
                        onChange={(event) => setChannelSearch(event.target.value)}
                        placeholder="搜索渠道名、ID、分组或类型"
                      />
                    </div>
                  </div>
                </div>
                <div style={{ color: 'var(--color-text-muted)', fontSize: 12 }}>
                  当前展示 {visibleChannels.length} / {channelData.length} 个渠道 · 当前视图：{channelViewMode === 'compact' ? '紧凑' : '表格'}
                </div>
                {channelViewMode === 'compact' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
                    {visibleChannels.map((channel, index) => {
                      const isTopConsumed = topConsumedChannel?.id === channel.id && Number(channel.derivedConsumedUsd || 0) > 0;
                      return (
                        <div
                          key={channel.id}
                          className="card animate-slide-up"
                          style={{
                            padding: 14,
                            display: 'grid',
                            gap: 12,
                            border: isTopConsumed ? '1px solid color-mix(in srgb, var(--color-warning) 38%, var(--color-border))' : '1px solid var(--color-border)',
                            background: isTopConsumed
                              ? 'color-mix(in srgb, var(--color-warning) 8%, var(--color-surface))'
                              : 'color-mix(in srgb, var(--color-surface) 92%, transparent)',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                            <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
                              <div style={{ fontWeight: 700, color: 'var(--color-text-primary)', lineHeight: 1.4, wordBreak: 'break-word' }}>
                                {channel.remoteName || '--'}
                              </div>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                <span className="badge badge-info" style={{ fontSize: 11 }}>#{channel.remoteChannelId || index + 1}</span>
                                {isTopConsumed ? <span className="badge badge-warning" style={{ fontSize: 11 }}>高消耗</span> : null}
                                {channel.remoteType != null ? <span className="badge badge-muted" style={{ fontSize: 11 }}>类型 {channel.remoteType}</span> : null}
                                {channel.remoteGroup ? <span className="badge badge-warning" style={{ fontSize: 11 }}>{channel.remoteGroup}</span> : <span className="badge badge-muted" style={{ fontSize: 11 }}>未分组</span>}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', display: 'grid', gap: 4 }}>
                              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>估算消耗</div>
                              <div style={{ fontWeight: 700, fontSize: 18, fontVariantNumeric: 'tabular-nums', color: isTopConsumed ? 'var(--color-warning)' : 'var(--color-text-primary)' }}>
                                {channel.derivedConsumedUsd == null ? '--' : formatMoney(channel.derivedConsumedUsd)}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 14px' }}>
                            <div style={{ display: 'grid', gap: 4 }}>
                              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>余额</div>
                              <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{channel.balance == null ? '--' : formatMoney(channel.balance)}</div>
                            </div>
                            <div style={{ display: 'grid', gap: 4 }}>
                              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>请求数</div>
                              <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{channel.requestCount == null ? '--' : channel.requestCount.toLocaleString()}</div>
                            </div>
                            <div style={{ display: 'grid', gap: 4 }}>
                              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Quota</div>
                              <div style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{channel.rawConsumedQuota == null ? '--' : channel.rawConsumedQuota.toLocaleString()}</div>
                            </div>
                            <div style={{ display: 'grid', gap: 4 }}>
                              <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>同步时间</div>
                              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{toDateTimeText(channel.syncedAt)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="data-table" style={{ width: '100%', minWidth: 980 }}>
                      <thead>
                        <tr>
                          <th>渠道</th>
                          <th>分组</th>
                          <th>余额</th>
                          <th>Quota</th>
                          <th>估算消耗</th>
                          <th>请求数</th>
                          <th>同步时间</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleChannels.map((channel, index) => {
                          const isTopConsumed = topConsumedChannel?.id === channel.id && Number(channel.derivedConsumedUsd || 0) > 0;
                          return (
                            <tr key={channel.id} style={isTopConsumed ? { background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)' } : undefined}>
                              <td style={{ minWidth: 240 }}>
                                <div style={{ display: 'grid', gap: 6 }}>
                                  <div style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{channel.remoteName || '--'}</div>
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                    <span className="badge badge-info" style={{ fontSize: 11 }}>#{channel.remoteChannelId || index + 1}</span>
                                    {isTopConsumed ? <span className="badge badge-warning" style={{ fontSize: 11 }}>高消耗</span> : null}
                                    {channel.remoteType != null ? (
                                      <span className="badge badge-muted" style={{ fontSize: 11 }}>类型 {channel.remoteType}</span>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              <td>
                                {channel.remoteGroup ? (
                                  <span className="badge badge-warning" style={{ fontSize: 11 }}>{channel.remoteGroup}</span>
                                ) : '--'}
                              </td>
                              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                {channel.balance == null ? '--' : formatMoney(channel.balance)}
                              </td>
                              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {channel.rawConsumedQuota == null ? '--' : channel.rawConsumedQuota.toLocaleString()}
                              </td>
                              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>
                                {channel.derivedConsumedUsd == null ? '--' : formatMoney(channel.derivedConsumedUsd)}
                              </td>
                              <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                {channel.requestCount == null ? '--' : channel.requestCount.toLocaleString()}
                              </td>
                              <td style={{ fontSize: 12, color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{toDateTimeText(channel.syncedAt)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state" style={{ minHeight: 220 }}>
                <svg className="empty-state-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M9 17v-6a3 3 0 016 0v6m-7 0h8m-9 0h10a2 2 0 002-2V9a2 2 0 00-2-2h-1.172a2 2 0 01-1.414-.586l-.828-.828A2 2 0 0012.172 5H11.83a2 2 0 00-1.414.586l-.828.828A2 2 0 018.172 7H7a2 2 0 00-2 2v6a2 2 0 002 2z"
                  />
                </svg>
                <div className="empty-state-title">{channelData.length > 0 ? '没有匹配的渠道' : '暂无渠道快照'}</div>
                <div className="empty-state-desc">{channelData.length > 0 ? '试试清空搜索条件，查看全部渠道快照。' : '先执行一次“立即同步”，这里才会出现渠道快照详情。'}</div>
              </div>
            )}
          </div>
        </CenteredModal>
      ) : null}
    </div>
  );
}
