import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast.js';
import DownstreamSites from './DownstreamSites.js';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getDownstreamSites: vi.fn(),
    getSites: vi.fn(),
    createDownstreamSite: vi.fn(),
    updateDownstreamSite: vi.fn(),
    deleteDownstreamSite: vi.fn(),
    testDownstreamSiteConnection: vi.fn(),
    syncDownstreamSite: vi.fn(),
    getDownstreamSiteChannels: vi.fn(),
  },
}));

vi.mock('../api.js', () => ({ api: apiMock }));

vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: unknown) => node,
  };
});

vi.mock('../components/ModernSelect.js', () => ({
  default: ({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ value: string; label: string }> }) => (
    <select value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  ),
}));

function collectText(node: ReactTestInstance): string {
  return (node.children || []).map((child) => {
    if (typeof child === 'string') return child;
    return collectText(child);
  }).join('');
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('DownstreamSites page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as any).document = {
      body: { style: {} },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    apiMock.getDownstreamSites.mockResolvedValue({
      success: true,
      items: [{
        id: 1,
        name: '主站消费源',
        hostSiteId: 10,
        hostSiteName: 'New API 主站',
        hostSiteUrl: 'https://downstream.example.com',
        hostSitePlatform: 'new-api',
        baseUrlOverride: null,
        authMode: 'session-admin',
        adminCredentialMasked: 'admi****0001',
        adminUserId: 7788,
        description: 'MVP source',
        enabled: true,
        lastSyncStatus: 'succeeded',
        lastSyncMessage: '已同步 2 个渠道',
        lastSyncAt: '2026-05-04T09:00:00.000Z',
        channelCount: 2,
        totalDerivedConsumedUsd: 1.24,
        updatedAt: '2026-05-04T09:00:00.000Z',
        createdAt: '2026-05-04T08:00:00.000Z',
      }],
    });
    apiMock.getSites.mockResolvedValue([
      { id: 10, name: 'New API 主站', url: 'https://downstream.example.com', platform: 'new-api', status: 'active' },
    ]);
    apiMock.createDownstreamSite.mockResolvedValue({ success: true });
    apiMock.updateDownstreamSite.mockResolvedValue({ success: true });
    apiMock.deleteDownstreamSite.mockResolvedValue({ success: true });
    apiMock.testDownstreamSiteConnection.mockResolvedValue({ success: true, ok: true, channelCount: 2, message: '连接成功，检测到 2 个渠道' });
    apiMock.syncDownstreamSite.mockResolvedValue({ success: true, queued: true, reused: false, taskId: 'task-1' });
    apiMock.getDownstreamSiteChannels.mockResolvedValue({
      success: true,
      item: { id: 1, name: '主站消费源' },
      channels: [{
        id: 1,
        downstreamSiteId: 1,
        remoteChannelId: '101',
        remoteName: '渠道 A',
        remoteType: 1,
        remoteGroup: 'default',
        balance: 2.5,
        rawConsumedQuota: 500000,
        derivedConsumedUsd: 1,
        requestCount: 3,
        rawPayload: '{}',
        syncedAt: '2026-05-04T09:00:00.000Z',
        createdAt: '2026-05-04T09:00:00.000Z',
        updatedAt: '2026-05-04T09:00:00.000Z',
      }],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (globalThis as any).document;
  });

  it('loads downstream sites and renders resource content', async () => {
    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = create(
          <MemoryRouter initialEntries={['/downstream-sites']}>
            <ToastProvider>
              <DownstreamSites />
            </ToastProvider>
          </MemoryRouter>,
        );
      });
      await flushMicrotasks();

      expect(apiMock.getDownstreamSites).toHaveBeenCalled();
      expect(apiMock.getSites).toHaveBeenCalled();
      const text = collectText(root.root);
      expect(text).toContain('下游站点');
      expect(text).toContain('主站消费源');
      expect(text).toContain('New API 主站');
      expect(text).toContain('同步成功');
    } finally {
      root?.unmount();
    }
  });

  it('selects desktop row without opening channel drawer request', async () => {
    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = create(
          <MemoryRouter initialEntries={['/downstream-sites']}>
            <ToastProvider>
              <DownstreamSites />
            </ToastProvider>
          </MemoryRouter>,
        );
      });
      await flushMicrotasks();

      const row = root.root.findAll((node) => node.type === 'tr').find((node) => collectText(node).includes('主站消费源'));
      expect(row).toBeTruthy();

      await act(async () => {
        row?.props.onClick?.({ target: { closest: () => null } });
      });

      expect(apiMock.getDownstreamSiteChannels).not.toHaveBeenCalled();
      const text = collectText(root.root);
      expect(text).toContain('已选 1 项');
    } finally {
      root?.unmount();
    }
  });

  it('confirms single delete and calls delete API', async () => {
    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = create(
          <MemoryRouter initialEntries={['/downstream-sites']}>
            <ToastProvider>
              <DownstreamSites />
            </ToastProvider>
          </MemoryRouter>,
        );
      });
      await flushMicrotasks();

      const deleteButton = root.root.findAll((node) => node.type === 'button').find((node) => collectText(node) === '删除');
      expect(deleteButton).toBeTruthy();

      await act(async () => {
        deleteButton?.props.onClick?.();
      });

      const confirmButton = root.root.findAll((node) => node.type === 'button').find((node) => collectText(node).includes('确认删除'));
      expect(confirmButton).toBeTruthy();

      await act(async () => {
        confirmButton?.props.onClick?.();
        await Promise.resolve();
      });

      expect(apiMock.deleteDownstreamSite).toHaveBeenCalledWith(1);
    } finally {
      root?.unmount();
    }
  });

  it('keeps save button clickable and relies on validation when host site is not selected', async () => {
    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = create(
          <MemoryRouter initialEntries={['/downstream-sites']}>
            <ToastProvider>
              <DownstreamSites />
            </ToastProvider>
          </MemoryRouter>,
        );
      });
      await flushMicrotasks();

      const createButton = root.root.findAll((node) => node.type === 'button').find((node) => collectText(node).includes('新增下游站点'));
      expect(createButton).toBeTruthy();

      await act(async () => {
        createButton?.props.onClick?.();
      });

      const saveButton = root.root.findAll((node) => node.type === 'button').find((node) => collectText(node).includes('保存来源'));
      expect(saveButton).toBeTruthy();
      expect(saveButton?.props.disabled).toBe(false);
    } finally {
      root?.unmount();
    }
  });

  it('requires admin user id before allowing save flow to proceed', async () => {
    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = create(
          <MemoryRouter initialEntries={['/downstream-sites']}>
            <ToastProvider>
              <DownstreamSites />
            </ToastProvider>
          </MemoryRouter>,
        );
      });
      await flushMicrotasks();

      const createButton = root.root.findAll((node) => node.type === 'button').find((node) => collectText(node).includes('新增下游站点'));
      await act(async () => {
        createButton?.props.onClick?.();
      });

      const inputs = root.root.findAll((node) => node.type === 'input');
      const nameInput = inputs.find((node) => node.props.placeholder === '来源名称');
      const credentialInput = inputs.find((node) => String(node.props.placeholder || '').includes('access token'));
      expect(nameInput).toBeTruthy();
      expect(credentialInput).toBeTruthy();

      await act(async () => {
        nameInput?.props.onChange?.({ target: { value: '新的来源' } });
        credentialInput?.props.onChange?.({ target: { value: 'admin-token-xyz' } });
      });

      const selects = root.root.findAll((node) => node.type === 'select');
      expect(selects.length).toBeGreaterThan(0);
      await act(async () => {
        selects[0]?.props.onChange?.({ target: { value: '10' } });
      });

      const saveButton = root.root.findAll((node) => node.type === 'button').find((node) => collectText(node).includes('保存来源'));
      await act(async () => {
        saveButton?.props.onClick?.();
        await Promise.resolve();
      });

      expect(apiMock.createDownstreamSite).not.toHaveBeenCalled();
    } finally {
      root?.unmount();
    }
  });
});
