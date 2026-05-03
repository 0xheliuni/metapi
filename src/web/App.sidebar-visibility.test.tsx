import type React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestInstance, type ReactTestRenderer } from 'react-test-renderer';
import { createStorageMock } from './testLocalStorage.js';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getRuntimeSettings: vi.fn(),
    getEvents: vi.fn(),
  },
}));

vi.mock('./api.js', () => ({
  api: apiMock,
}));

vi.mock('./authSession.js', () => ({
  clearAuthSession: vi.fn(),
  hasValidAuthSession: vi.fn(() => true),
  persistAuthSession: vi.fn(),
}));

vi.mock('./components/Toast.js', () => ({
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock('./components/SearchModal.js', () => ({
  default: () => null,
}));

vi.mock('./components/NotificationPanel.js', () => ({
  default: () => null,
}));

vi.mock('./components/TooltipLayer.js', () => ({
  default: () => null,
}));

vi.mock('./components/MobileDrawer.js', () => ({
  MobileDrawer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./components/CenteredModal.js', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('./components/useAnimatedVisibility.js', () => ({
  useAnimatedVisibility: (open: boolean) => ({ shouldRender: open, isVisible: open }),
}));

vi.mock('./components/useIsMobile.js', () => ({
  useIsMobile: () => false,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    NavLink: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a>,
    Routes: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Route: ({ element }: { element: React.ReactNode }) => <div>{element}</div>,
    Navigate: () => null,
    useLocation: () => ({ pathname: '/' }),
  };
});

vi.mock('./i18n.js', () => ({
  I18nProvider: ({ children }: { children: React.ReactNode }) => children,
  useI18n: () => ({
    language: 'zh',
    toggleLanguage: vi.fn(),
    t: (text: string) => text,
  }),
}));

vi.mock('./pages/Dashboard.js', () => ({ default: () => <div>DashboardPage</div> }));
vi.mock('./pages/Sites.js', () => ({ default: () => <div>SitesPage</div> }));
vi.mock('./pages/Accounts.js', () => ({ default: () => <div>AccountsPage</div> }));
vi.mock('./pages/Tokens.js', () => ({ default: () => <div>TokensPage</div> }));
vi.mock('./pages/TokenRoutes.js', () => ({ default: () => <div>RoutesPage</div> }));
vi.mock('./pages/ProxyLogs.js', () => ({ default: () => <div>LogsPage</div> }));
vi.mock('./pages/Settings.js', () => ({ default: () => <div>SettingsPage</div> }));
vi.mock('./pages/DownstreamKeys.js', () => ({ default: () => <div>DownstreamKeysPage</div> }));
vi.mock('./pages/DownstreamSites.js', () => ({ default: () => <div>DownstreamSitesPage</div> }));
vi.mock('./pages/Reconciliation.js', () => ({ default: () => <div>ReconciliationPage</div> }));
vi.mock('./pages/ImportExport.js', () => ({ default: () => <div>ImportExportPage</div> }));
vi.mock('./pages/NotificationSettings.js', () => ({ default: () => <div>NotificationSettingsPage</div> }));
vi.mock('./pages/ProgramLogs.js', () => ({ default: () => <div>ProgramLogsPage</div> }));
vi.mock('./pages/Models.js', () => ({ default: () => <div>ModelsPage</div> }));
vi.mock('./pages/About.js', () => ({ default: () => <div>AboutPage</div> }));
vi.mock('./pages/ModelTester.js', () => ({ default: () => <div>ModelTesterPage</div> }));
vi.mock('./pages/Monitors.js', () => ({ default: () => <div>MonitorsPage</div> }));
vi.mock('./pages/OAuthManagement.js', () => ({ default: () => <div>OAuthPage</div> }));
vi.mock('./pages/SiteAnnouncements.js', () => ({ default: () => <div>SiteAnnouncementsPage</div> }));

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

describe('App console sidebar visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.getRuntimeSettings.mockResolvedValue({
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
    apiMock.getEvents.mockResolvedValue([]);
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorageMock(),
      configurable: true,
      writable: true,
    });
    globalThis.localStorage.clear();
    Object.defineProperty(globalThis, 'window', {
      value: globalThis,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(globalThis, 'document', {
      value: {
        documentElement: {
          setAttribute: vi.fn(),
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
      configurable: true,
      writable: true,
    });
    globalThis.window.addEventListener = vi.fn();
    globalThis.window.removeEventListener = vi.fn();
    globalThis.window.dispatchEvent = vi.fn(() => true);
    globalThis.window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { localStorage?: Storage }).localStorage;
    delete (globalThis as typeof globalThis & { window?: Window & typeof globalThis }).window;
    delete (globalThis as typeof globalThis & { document?: Document }).document;
  });

  it('filters console sidebar items according to runtime settings', async () => {
    const App = (await import('./App.js')).default;
    let root!: ReactTestRenderer;

    try {
      await act(async () => {
        root = create(<App />);
      });
      await flushMicrotasks();

      const sidebar = root.root.find((node) => node.type === 'aside' && String(node.props.className || '').includes('sidebar'));
      const sidebarText = collectText(sidebar);

      expect(sidebarText).toContain('仪表盘');
      expect(sidebarText).not.toContain('站点管理');
      expect(sidebarText).not.toContain('使用日志');
      expect(sidebarText).toContain('控制台');
      expect(sidebarText).toContain('设置');
      expect(apiMock.getRuntimeSettings).toHaveBeenCalled();
    } finally {
      root?.unmount();
    }
  });
});
