import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('App sidebar config', () => {
  it('uses 连接管理 for /accounts and removes standalone /tokens navigation item', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/web/sidebarConfig.tsx'), 'utf8');

    expect(source).toContain("{ id: 'accounts', to: '/accounts', label: '连接管理'");
    expect(source).not.toContain("{ id: 'accounts', to: '/accounts', label: '账号'");
    expect(source).not.toContain("{ to: '/tokens', label: '令牌管理'");
  });

  it('places downstream key navigation under 控制台 instead of 系统', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/web/sidebarConfig.tsx'), 'utf8');
    expect(source).toContain("id: 'console'");
    expect(source).toContain("{ id: 'downstreamKeys', to: '/downstream-keys', label: '下游密钥'");
    expect(source).toContain("id: 'system'");
  });

  it('adds standalone OAuth 管理 navigation entry', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/web/sidebarConfig.tsx'), 'utf8');
    const appSource = readFileSync(resolve(process.cwd(), 'src/web/App.tsx'), 'utf8');

    expect(source).toContain("{ id: 'oauth', to: '/oauth', label: 'OAuth 管理'");
    expect(appSource).toContain("const OAuthManagement = lazy(() => import('./pages/OAuthManagement.js'));"
    );
    expect(appSource).toContain('<Route path="/oauth" element={<OAuthManagement />} />');
  });
});
