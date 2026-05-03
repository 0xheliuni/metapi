import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';

type ConfigModule = typeof import('../../config.js');
type DbModule = typeof import('../../db/index.js');

describe('settings console sidebar visibility runtime setting', () => {
  let app: FastifyInstance;
  let config: ConfigModule['config'];
  let db: DbModule['db'];
  let schema: DbModule['schema'];
  let dataDir = '';

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'metapi-settings-console-sidebar-'));
    process.env.DATA_DIR = dataDir;

    await import('../../db/migrate.js');
    const dbModule = await import('../../db/index.js');
    const configModule = await import('../../config.js');
    const settingsRoutesModule = await import('./settings.js');

    db = dbModule.db;
    schema = dbModule.schema;
    config = configModule.config;

    app = Fastify();
    await app.register(settingsRoutesModule.settingsRoutes);
  });

  beforeEach(async () => {
    await db.delete(schema.settings).run();
    config.consoleSidebarVisibility = {
      dashboard: true,
      sites: true,
      siteAnnouncements: true,
      accounts: true,
      oauth: true,
      downstreamKeys: true,
      downstreamSites: true,
      reconciliation: true,
      routes: true,
      logs: true,
      monitor: true,
    };
  });

  afterAll(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
    delete process.env.DATA_DIR;
  });

  it('persists console sidebar visibility and returns a normalized runtime value', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings/runtime',
      payload: {
        consoleSidebarVisibility: {
          dashboard: true,
          sites: false,
          logs: false,
          monitor: false,
          unknown: true,
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as { consoleSidebarVisibility?: Record<string, boolean> };
    expect(body.consoleSidebarVisibility).toEqual({
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
      monitor: false,
    });

    const saved = await db.select().from(schema.settings).where(eq(schema.settings.key, 'console_sidebar_visibility')).get();
    expect(saved?.value).toBe(JSON.stringify(body.consoleSidebarVisibility));

    const getResponse = await app.inject({
      method: 'GET',
      url: '/api/settings/runtime',
    });
    expect(getResponse.statusCode).toBe(200);
    expect((getResponse.json() as { consoleSidebarVisibility?: Record<string, boolean> }).consoleSidebarVisibility).toEqual(body.consoleSidebarVisibility);
  });

  it('rejects invalid console sidebar visibility payloads', async () => {
    const response = await app.inject({
      method: 'PUT',
      url: '/api/settings/runtime',
      payload: {
        consoleSidebarVisibility: ['dashboard'],
      },
    });

    expect(response.statusCode).toBe(400);
    expect((response.json() as { message?: string }).message).toContain('控制台侧边栏可见性');
  });
});
