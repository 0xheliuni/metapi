import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast.js';
import Settings from './Settings.js';
import { createStorageMock } from '../testLocalStorage.js';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getAuthInfo: vi.fn(),
    getRuntimeSettings: vi.fn(),
    getDownstreamApiKeys: vi.fn(),
    getRoutesLite: vi.fn(),
    getRuntimeDatabaseConfig: vi.fn(),
    getBrandList: vi.fn(),
    updateRuntimeSettings: vi.fn(),
    getModelTokenCandidates: vi.fn(),
  },
}));

vi.mock('../api.js', () => ({
  api: apiMock,
}));

vi.mock('../components/BrandIcon.js', () => ({
  BrandGlyph: () => null,
  InlineBrandIcon: () => null,
  getBrand: () => null,
  normalizeBrandIconKey: (icon: string) => icon,
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
  });
}

describe('Settings proxy transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
      writable: true,
    });
    apiMock.getAuthInfo.mockResolvedValue({ masked: 'sk-****' });
    apiMock.getRuntimeSettings.mockResolvedValue({
      checkinCron: '0 8 * * *',
      checkinScheduleMode: 'interval',
      checkinIntervalHours: 6,
      balanceRefreshCron: '0 * * * *',
      logCleanupCron: '15 4 * * *',
      logCleanupUsageLogsEnabled: true,
      logCleanupProgramLogsEnabled: true,
      logCleanupRetentionDays: 14,
      codexUpstreamWebsocketEnabled: false,
      responsesCompactFallbackToResponsesEnabled: false,
      proxySessionChannelConcurrencyLimit: 4,
      proxySessionChannelQueueWaitMs: 3200,
      routingFallbackUnitCost: 1,
      routingWeights: {},
      adminIpAllowlist: [],
      systemProxyUrl: '',
      consoleSidebarVisibility: {
        dashboard: true,
        sites: true,
        logs: false,
        monitor: true,
      },
    });
    apiMock.getDownstreamApiKeys.mockResolvedValue({ items: [] });
    apiMock.getRoutesLite.mockResolvedValue([]);
    apiMock.getBrandList.mockResolvedValue({ brands: [] });
    apiMock.getRuntimeDatabaseConfig.mockResolvedValue({
      active: { dialect: 'sqlite', connection: '(default sqlite path)', ssl: false },
      saved: null,
      restartRequired: false,
    });
    apiMock.updateRuntimeSettings.mockResolvedValue({
      success: true,
      codexUpstreamWebsocketEnabled: true,
      responsesCompactFallbackToResponsesEnabled: true,
      proxySessionChannelConcurrencyLimit: 6,
      proxySessionChannelQueueWaitMs: 4200,
      consoleSidebarVisibility: {
        dashboard: true,
        sites: false,
        logs: false,
        monitor: true,
      },
    });
    apiMock.getModelTokenCandidates.mockResolvedValue({ models: {} });
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
  });

  it('saves codex upstream websocket and session lease settings from the settings page', async () => {
    let root!: ReactTestRenderer;
    try {
      await act(async () => {
        root = create(
          <MemoryRouter>
            <ToastProvider>
              <Settings />
            </ToastProvider>
          </MemoryRouter>,
        );
      });
      await flushMicrotasks();

      const proxyTransportCard = root.root.find((node) => (
        node.type === 'div'
        && node.props['data-settings-card'] === 'proxy-transport'
      ));
      expect(collectText(proxyTransportCard)).toContain('HTTP 优先');
      expect(collectText(proxyTransportCard)).toContain('会话池 4 并发 / 3200ms');

      const websocketToggleLabel = root.root.find((node) => (
        node.type === 'label'
        && collectText(node).includes('允许 metapi 到 Codex 上游使用 WebSocket')
      ));
      const websocketToggle = websocketToggleLabel.findByType('input');
      expect(websocketToggle.props.checked).toBe(false);

      const compactFallbackToggleLabel = root.root.find((node) => (
        node.type === 'label'
        && collectText(node).includes('Compact 明确不支持时回退到普通 Responses')
      ));
      const compactFallbackToggle = compactFallbackToggleLabel.findByType('input');
      expect(compactFallbackToggle.props.checked).toBe(false);

      const concurrencyInput = root.root.find((node) => (
        node.type === 'input'
        && node.props.type === 'number'
        && node.props.value === 4
      ));
      const queueWaitInput = root.root.find((node) => (
        node.type === 'input'
        && node.props.type === 'number'
        && node.props.value === 3200
      ));

      await act(async () => {
        websocketToggle.props.onChange({ target: { checked: true } });
        compactFallbackToggle.props.onChange({ target: { checked: true } });
        concurrencyInput.props.onChange({ target: { value: '6' } });
        queueWaitInput.props.onChange({ target: { value: '4200' } });
      });

      expect(collectText(proxyTransportCard)).toContain('上游 WebSocket 已启用');
      expect(collectText(proxyTransportCard)).toContain('会话池 6 并发 / 4200ms');

      const saveButton = root.root.find((node) => (
        node.type === 'button'
        && typeof node.props.onClick === 'function'
        && collectText(node).trim() === '保存传输与并发'
      ));
      await act(async () => {
        saveButton.props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.updateRuntimeSettings).toHaveBeenCalledWith({
        codexUpstreamWebsocketEnabled: true,
        responsesCompactFallbackToResponsesEnabled: true,
        proxySessionChannelConcurrencyLimit: 6,
        proxySessionChannelQueueWaitMs: 4200,
      });
    } finally {
      root?.unmount();
    }
  });

  it('saves per-item console sidebar visibility from the settings page', async () => {
    let root!: ReactTestRenderer;
    try {
      await act(async () => {
        root = create(
          <MemoryRouter>
            <ToastProvider>
              <Settings />
            </ToastProvider>
          </MemoryRouter>,
        );
      });
      await flushMicrotasks();

      const displayPreferencesCard = root.root.find((node) => (
        node.type === 'div'
        && node.props['data-settings-card'] === 'display-preferences'
      ));
      expect(collectText(displayPreferencesCard)).toContain('已隐藏 1 个控制台菜单');

      const sitesToggleLabel = displayPreferencesCard.find((node) => (
        node.type === 'label'
        && collectText(node).includes('站点管理')
        && collectText(node).includes('/sites')
      ));
      const sitesToggle = sitesToggleLabel.findByType('input');
      expect(sitesToggle.props.checked).toBe(true);

      await act(async () => {
        sitesToggle.props.onChange({ target: { checked: false } });
      });

      const saveButton = displayPreferencesCard.find((node) => (
        node.type === 'button'
        && typeof node.props.onClick === 'function'
        && collectText(node).trim() === '保存控制台菜单可见性'
      ));

      await act(async () => {
        saveButton.props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.updateRuntimeSettings).toHaveBeenCalledWith({
        consoleSidebarVisibility: {
          dashboard: true,
          sites: false,
          siteAnnouncements: true,
          accounts: true,
          oauth: true,
          downstreamKeys: true,
          downstreamSites: true,
          reconciliation: true,
          routes: true,
          logs: false,
          monitor: true,
        },
      });
    } finally {
      root?.unmount();
    }
  });
});
