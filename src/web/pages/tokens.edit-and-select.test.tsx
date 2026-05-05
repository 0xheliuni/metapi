import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { MemoryRouter } from 'react-router-dom';
import ModernSelect from '../components/ModernSelect.js';
import { ToastProvider } from '../components/Toast.js';
import Accounts from './Accounts.js';
import { TokensPanel } from './Tokens.js';
import { installAccountsSnapshotCompat } from './testApiCompat.js';

const { apiMock } = vi.hoisted(() => ({
  apiMock: {
    getAccounts: vi.fn(),
    getAccountsSnapshot: vi.fn(),
    getSites: vi.fn(),
    getAccountTokens: vi.fn(),
    getAccountTokenValue: vi.fn(),
    getAccountTokenGroups: vi.fn(),
    syncAccountTokens: vi.fn(),
    updateAccountToken: vi.fn(),
  },
}));

vi.mock('../api.js', () => ({
  api: apiMock,
}));

function collectText(node: ReactTestInstance): string {
  const children = node.children || [];
  return children
    .map((child) => {
      if (typeof child === 'string') return child;
      return collectText(child);
    })
    .join('');
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function buildRoot() {
  return create(
    <MemoryRouter initialEntries={['/accounts?segment=tokens']}>
      <ToastProvider>
        <Accounts />
      </ToastProvider>
    </MemoryRouter>,
    {
      createNodeMock: (element) => {
        if (element.type === 'tr' || element.type === 'div') {
          return {
            scrollIntoView: () => undefined,
          };
        }
        return {};
      },
    },
  );
}

function buildTokensRoot() {
  return create(
    <MemoryRouter initialEntries={['/accounts?segment=tokens']}>
      <ToastProvider>
        <TokensPanel />
      </ToastProvider>
    </MemoryRouter>,
    {
      createNodeMock: (element) => {
        if (element.type === 'tr' || element.type === 'div') {
          return {
            scrollIntoView: () => undefined,
          };
        }
        return {};
      },
    },
  );
}

describe('Tokens edit modal and row selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installAccountsSnapshotCompat(apiMock);
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
      },
      configurable: true,
      writable: true,
    });
    apiMock.getAccounts.mockResolvedValue([
      {
        id: 1,
        username: 'session-user',
        accessToken: 'session-token',
        status: 'active',
        credentialMode: 'session',
        capabilities: { canCheckin: true, canRefreshBalance: true, proxyOnly: false },
        site: { id: 10, name: 'Session Site', platform: 'new-api', status: 'active', url: 'https://session.example.com' },
      },
    ]);
    apiMock.getSites.mockResolvedValue([
      { id: 10, name: 'Session Site', platform: 'new-api', status: 'active' },
    ]);
    apiMock.getAccountTokens.mockResolvedValue([
      {
        id: 22,
        name: 'focus-token',
        tokenMasked: 'sk-focus****',
        valueStatus: 'ready',
        enabled: true,
        isDefault: false,
        updatedAt: '2026-03-07 10:00:00',
        accountId: 1,
        account: { username: 'session-user' },
        site: { name: 'Session Site', url: 'https://session.example.com' },
      },
    ]);
    apiMock.getAccountTokenValue.mockResolvedValue({
      success: true,
      token: 'sk-focus-real',
    });
    apiMock.getAccountTokenGroups.mockResolvedValue({
      success: true,
      groups: ['default', 'vip'],
      groupRatios: { default: 1, vip: 2.5 },
    });
    apiMock.updateAccountToken.mockResolvedValue({
      success: true,
    });
    apiMock.syncAccountTokens.mockResolvedValue({
      success: true,
      synced: true,
      status: 'synced',
      created: 0,
      updated: 0,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('opens the centered edit modal when editing a token', async () => {
    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = buildRoot();
      });
      await flushMicrotasks();

      const callsBeforeEdit = apiMock.getAccountTokenGroups.mock.calls.length;
      const editButton = root.root
        .findAll((node) => node.type === 'button')
        .find((node) => collectText(node).includes('编辑'));
      expect(editButton).toBeTruthy();

      await act(async () => {
        editButton!.props.onClick({ stopPropagation: () => undefined });
      });
      await flushMicrotasks();

      const rendered = JSON.stringify(root.toJSON());
      expect(rendered).toContain('编辑令牌');
      expect(rendered).toContain('保存修改');
      expect(rendered).toContain('sk-focus-real');
      expect(rendered).toContain('基本信息');
      expect(rendered).toContain('状态设置');
      expect(rendered).toContain('分组');
      expect(rendered).toContain('手动分组倍率');
      const modals = root.root.findAll((node) => {
        const className = typeof node.props?.className === 'string' ? node.props.className : '';
        return className.includes('modal-content') && collectText(node).includes('编辑令牌');
      });
      expect(modals).toHaveLength(1);
      expect(apiMock.getAccountTokenGroups).toHaveBeenCalledWith(1);

      const saveButton = root.root
        .findAll((node) => node.type === 'button')
        .find((node) => collectText(node).includes('保存修改'));
      expect(saveButton).toBeTruthy();

      await act(async () => {
        saveButton!.props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.updateAccountToken).toHaveBeenCalledWith(22, expect.objectContaining({ group: 'default', manualGroupRatio: null }));
    } finally {
      root?.unmount();
    }
  });

  it('shows only used quota for unlimited account tokens', async () => {
    apiMock.getAccountTokens.mockResolvedValue([
      {
        id: 55,
        name: 'unlimited-token',
        tokenMasked: 'sk-unlimited****',
        valueStatus: 'ready',
        enabled: true,
        isDefault: false,
        usedQuota: 8.72,
        remainQuota: null,
        unlimitedQuota: true,
        updatedAt: '2026-03-17 10:00:00',
        accountId: 1,
        account: { username: 'session-user' },
        site: { name: 'Session Site', url: 'https://session.example.com' },
      },
    ]);

    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = buildTokensRoot();
      });
      await flushMicrotasks();

      const rendered = JSON.stringify(root.toJSON());
      const text = collectText(root.root);
      expect(rendered).toContain('额度');
      expect(rendered).toContain('分组倍率');
      expect(text).toContain('1.00x');
      expect(text).toContain('已用 ¥8.72');
      expect(text).not.toContain('剩余');
      expect(text).not.toContain('总额');
    } finally {
      root?.unmount();
    }
  });

  it('shows used remaining and total quota for limited account tokens', async () => {
    apiMock.getAccountTokens.mockResolvedValue([
      {
        id: 56,
        name: 'limited-token',
        tokenMasked: 'sk-limited****',
        valueStatus: 'ready',
        enabled: true,
        isDefault: false,
        usedQuota: 8.720478,
        remainQuota: 1.279522,
        unlimitedQuota: false,
        updatedAt: '2026-03-17 10:00:00',
        accountId: 1,
        account: { username: 'session-user' },
        site: { name: 'Session Site', url: 'https://session.example.com' },
      },
    ]);

    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = buildTokensRoot();
      });
      await flushMicrotasks();

      const text = collectText(root.root);
      expect(text).toContain('已用 ¥8.72');
      expect(text).toContain('剩余 ¥1.28');
      expect(text).toContain('总额 ¥10.00');
      const rendered = JSON.stringify(root.toJSON());
      expect(rendered).not.toContain('已用 ¥8.72 / 剩余 ¥1.28 / 总额 ¥10.00');
    } finally {
      root?.unmount();
    }
  });

  it('normalizes legacy raw quota values before display', async () => {
    apiMock.getAccountTokens.mockResolvedValue([
      {
        id: 57,
        name: 'legacy-raw-quota-token',
        tokenMasked: 'sk-raw****',
        valueStatus: 'ready',
        enabled: true,
        isDefault: false,
        usedQuota: 4360239,
        remainQuota: 639761,
        unlimitedQuota: false,
        updatedAt: '2026-03-17 10:00:00',
        accountId: 1,
        account: { username: 'session-user' },
        site: { name: 'Session Site', url: 'https://session.example.com' },
      },
    ]);

    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = buildTokensRoot();
      });
      await flushMicrotasks();

      const text = collectText(root.root);
      expect(text).toContain('已用 ¥8.72');
      expect(text).toContain('剩余 ¥1.28');
      expect(text).toContain('总额 ¥10.00');
      const rendered = JSON.stringify(root.toJSON());
      expect(rendered).not.toContain('¥4360239.00');
      expect(rendered).not.toContain('¥639761.00');
      expect(rendered).not.toContain('¥5000000.00');
    } finally {
      root?.unmount();
    }
  });

  it('shows token group ratio from account group metadata', async () => {
    apiMock.getAccountTokens.mockResolvedValue([
      {
        id: 58,
        name: 'vip-token',
        tokenMasked: 'sk-vip****',
        valueStatus: 'ready',
        enabled: true,
        isDefault: false,
        tokenGroup: 'vip',
        updatedAt: '2026-03-17 10:00:00',
        accountId: 1,
        account: { username: 'session-user' },
        site: { name: 'Session Site', url: 'https://session.example.com' },
      },
    ]);

    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = buildTokensRoot();
      });
      await flushMicrotasks();

      const text = collectText(root.root);
      expect(text).toContain('分组倍率');
      expect(text).toContain('2.50x');
      expect(apiMock.getAccountTokenGroups).toHaveBeenCalledWith(1);
    } finally {
      root?.unmount();
    }
  });

  it('prefers token groupRatio returned by the account token list', async () => {
    apiMock.getAccountTokens.mockResolvedValue([
      {
        id: 59,
        name: 'direct-ratio-token',
        tokenMasked: 'sk-direct****',
        valueStatus: 'ready',
        enabled: true,
        isDefault: false,
        tokenGroup: 'vip',
        groupRatio: 3.75,
        updatedAt: '2026-03-17 10:00:00',
        accountId: 1,
        account: { username: 'session-user' },
        site: { name: 'Session Site', url: 'https://session.example.com' },
      },
    ]);

    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = buildTokensRoot();
      });
      await flushMicrotasks();

      const text = collectText(root.root);
      expect(text).toContain('3.75x');
    } finally {
      root?.unmount();
    }
  });

  it('saves manual group ratio from the edit modal', async () => {
    apiMock.getAccountTokens.mockResolvedValue([
      {
        id: 60,
        name: 'manual-ratio-token',
        tokenMasked: 'sk-manual****',
        valueStatus: 'ready',
        enabled: true,
        isDefault: false,
        tokenGroup: 'vip',
        manualGroupRatio: 4.25,
        groupRatio: 4.25,
        updatedAt: '2026-03-17 10:00:00',
        accountId: 1,
        account: { username: 'session-user' },
        site: { name: 'Session Site', url: 'https://session.example.com' },
      },
    ]);

    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = buildTokensRoot();
      });
      await flushMicrotasks();

      const editButton = root.root
        .findAll((node) => node.type === 'button')
        .find((node) => collectText(node).includes('编辑'));
      expect(editButton).toBeTruthy();

      await act(async () => {
        editButton!.props.onClick({ stopPropagation: () => undefined });
      });
      await flushMicrotasks();

      const ratioInput = root.root
        .findAll((node) => node.type === 'input')
        .find((node) => node.props?.placeholder === '留空使用接口倍率');
      expect(ratioInput).toBeTruthy();
      expect(ratioInput!.props.value).toBe('4.25');

      await act(async () => {
        ratioInput!.props.onChange({ target: { value: '5.5' } });
      });

      const saveButton = root.root
        .findAll((node) => node.type === 'button')
        .find((node) => collectText(node).includes('保存修改'));
      expect(saveButton).toBeTruthy();

      await act(async () => {
        saveButton!.props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.updateAccountToken).toHaveBeenCalledWith(60, expect.objectContaining({
        group: 'vip',
        manualGroupRatio: '5.5',
      }));
    } finally {
      root?.unmount();
    }
  });

  it('selects a token when clicking the row body, but not when clicking an action button', async () => {
    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = buildRoot();
      });
      await flushMicrotasks();

      const tokenRow = root.root.findAll((node) => {
        if (node.type !== 'tr') return false;
        return collectText(node).includes('focus-token');
      })[0];
      expect(tokenRow).toBeTruthy();

      await act(async () => {
        tokenRow.props.onClick({
          target: { closest: () => null },
        });
      });
      await flushMicrotasks();

      expect(collectText(root.root)).toContain('已选 1 项');

      const copyButton = root.root
        .findAll((node) => node.type === 'button')
        .find((node) => collectText(node).includes('复制'));
      expect(copyButton).toBeTruthy();

      await act(async () => {
        copyButton!.props.onClick({ stopPropagation: () => undefined });
      });
      await flushMicrotasks();

      expect(collectText(root.root)).toContain('已选 1 项');
    } finally {
      root?.unmount();
    }
  });

  it('does not repeatedly refetch groups when edit-group loading fails once', async () => {
    apiMock.getAccountTokenGroups.mockRejectedValueOnce(new Error('账号会话可能已过期，请重新登录后再拉取分组'));

    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = buildRoot();
      });
      await flushMicrotasks();

      const callsBeforeEdit = apiMock.getAccountTokenGroups.mock.calls.length;
      const editButton = root.root
        .findAll((node) => node.type === 'button')
        .find((node) => collectText(node).includes('编辑'));
      expect(editButton).toBeTruthy();

      await act(async () => {
        editButton!.props.onClick({ stopPropagation: () => undefined });
      });

      await flushMicrotasks();
      await flushMicrotasks();

      expect(apiMock.getAccountTokenGroups.mock.calls.length - callsBeforeEdit).toBe(1);
    } finally {
      root?.unmount();
    }
  });

  it('uses searchable account selectors for sync and add-token flows', async () => {
    apiMock.getAccounts.mockResolvedValue([
      {
        id: 1,
        username: 'session-user',
        accessToken: 'session-token',
        status: 'active',
        credentialMode: 'session',
        capabilities: { canCheckin: true, canRefreshBalance: true, proxyOnly: false },
        site: { id: 10, name: 'Session Site', platform: 'new-api', status: 'active', url: 'https://session.example.com' },
      },
      {
        id: 2,
        username: 'codex-user',
        accessToken: 'codex-token',
        status: 'active',
        credentialMode: 'session',
        capabilities: { canCheckin: true, canRefreshBalance: true, proxyOnly: false },
        site: { id: 11, name: 'Codex Workspace', platform: 'codex', status: 'active', url: 'https://workspace.example.com' },
      },
    ]);

    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = buildTokensRoot();
      });
      await flushMicrotasks();

      const syncAccountSelect = root.root.findAllByType(ModernSelect)
        .find((node) => node.props.placeholder === '选择账号后同步站点令牌');
      expect(syncAccountSelect).toBeTruthy();
      expect(syncAccountSelect!.props.searchable).toBe(true);
      expect(syncAccountSelect!.props.searchPlaceholder).toBe('筛选账号（名称 / 站点）');
      expect(syncAccountSelect!.props.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: '2',
            label: 'codex-user @ Codex Workspace',
            description: 'Codex Workspace',
          }),
        ]),
      );

      const addButton = root.root.findAll((node) => node.type === 'button')
        .find((node) => collectText(node).includes('+ 新增令牌'));
      expect(addButton).toBeTruthy();

      await act(async () => {
        addButton!.props.onClick();
      });
      await flushMicrotasks();

      const addAccountSelect = root.root.findAllByType(ModernSelect)
        .find((node) => node.props.placeholder === '选择账号');
      expect(addAccountSelect).toBeTruthy();
      expect(addAccountSelect!.props.searchable).toBe(true);
      expect(addAccountSelect!.props.searchPlaceholder).toBe('筛选账号（名称 / 站点）');
      expect(addAccountSelect!.props.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            value: '2',
            label: 'codex-user @ Codex Workspace',
            description: 'Codex Workspace',
          }),
        ]),
      );
    } finally {
      root?.unmount();
    }
  });

  it('shows placeholder guidance and saves masked_pending tokens as ready values', async () => {
    apiMock.getAccountTokens.mockResolvedValue([
      {
        id: 33,
        name: 'masked-token',
        tokenMasked: 'sk-abc***xyz',
        valueStatus: 'masked_pending',
        enabled: false,
        isDefault: false,
        updatedAt: '2026-03-16 08:00:00',
        accountId: 1,
        account: { username: 'session-user' },
        site: { name: 'Session Site', url: 'https://session.example.com' },
      },
    ]);
    apiMock.getAccountTokenValue.mockRejectedValueOnce(new Error('当前仅保存了脱敏令牌，无法展开/复制。请在站点重新生成并同步，或手动更新为完整令牌。'));

    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = buildTokensRoot();
      });
      await flushMicrotasks();

      const rendered = JSON.stringify(root.toJSON());
      expect(rendered).toContain('待补全');
      expect(rendered).not.toContain('复制');
      expect(rendered).not.toContain('设默认');

      const editButton = root.root
        .findAll((node) => node.type === 'button')
        .find((node) => collectText(node).includes('编辑'));
      expect(editButton).toBeTruthy();

      await act(async () => {
        editButton!.props.onClick({ stopPropagation: () => undefined });
      });
      await flushMicrotasks();
      await flushMicrotasks();

      const afterOpen = JSON.stringify(root.toJSON());
      expect(afterOpen).toContain('请粘贴完整明文 token');
      expect(afterOpen).toContain('编辑令牌');

      const textarea = root.root.findAll((node) => node.type === 'textarea')[0];
      expect(textarea).toBeTruthy();

      await act(async () => {
        textarea.props.onChange({ target: { value: 'sk-complete-real-token' } });
      });
      await flushMicrotasks();

      const saveButton = root.root
        .findAll((node) => node.type === 'button')
        .find((node) => collectText(node).includes('保存修改'));
      expect(saveButton).toBeTruthy();

      await act(async () => {
        saveButton!.props.onClick();
      });
      await flushMicrotasks();

      expect(apiMock.updateAccountToken).toHaveBeenCalledWith(33, expect.objectContaining({
        token: 'sk-complete-real-token',
        enabled: true,
      }));
    } finally {
      root?.unmount();
    }
  });

  it('opens the placeholder edit modal automatically after a sync creates one pending token', async () => {
    apiMock.getAccountTokens.mockResolvedValue([
      {
        id: 44,
        name: 'masked-after-sync',
        tokenMasked: 'sk-xyz***123',
        valueStatus: 'masked_pending',
        enabled: false,
        isDefault: false,
        updatedAt: '2026-03-16 09:00:00',
        accountId: 1,
        account: { username: 'session-user' },
        site: { name: 'Session Site', url: 'https://session.example.com' },
      },
    ]);
    apiMock.syncAccountTokens.mockResolvedValueOnce({
      success: true,
      synced: true,
      status: 'synced',
      reason: 'upstream_masked_tokens',
      message: '上游返回 1 条脱敏令牌，已保存为待补全记录，请手动补全明文 token。',
      maskedPending: 1,
      pendingTokenIds: [44],
      created: 1,
      updated: 0,
    });
    apiMock.getAccountTokenValue.mockRejectedValueOnce(new Error('当前仅保存了脱敏令牌，无法展开/复制。请在站点重新生成并同步，或手动更新为完整令牌。'));

    let root!: WebTestRenderer;
    try {
      await act(async () => {
        root = buildTokensRoot();
      });
      await flushMicrotasks();

      const syncButton = root.root
        .findAll((node) => node.type === 'button')
        .find((node) => collectText(node).trim() === '同步站点令牌');
      expect(syncButton).toBeTruthy();

      await act(async () => {
        await syncButton!.props.onClick();
      });
      await flushMicrotasks();
      await flushMicrotasks();
      await flushMicrotasks();

      const rendered = JSON.stringify(root.toJSON());
      expect(rendered).toContain('编辑令牌');
      expect(rendered).toContain('请粘贴完整明文 token');
      expect(rendered).toContain('上游返回 1 条脱敏令牌');
      expect(apiMock.syncAccountTokens).toHaveBeenCalledWith(1);
      expect(apiMock.getAccountTokenGroups).toHaveBeenCalledWith(1);
    } finally {
      root?.unmount();
    }
  });
});
