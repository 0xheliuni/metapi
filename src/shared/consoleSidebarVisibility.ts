export const CONSOLE_SIDEBAR_ITEM_IDS = [
  'dashboard',
  'sites',
  'siteAnnouncements',
  'accounts',
  'oauth',
  'downstreamKeys',
  'downstreamSites',
  'reconciliation',
  'routes',
  'logs',
  'monitor',
] as const;

export type ConsoleSidebarItemId = typeof CONSOLE_SIDEBAR_ITEM_IDS[number];

export type ConsoleSidebarVisibility = Record<ConsoleSidebarItemId, boolean>;

export function createDefaultConsoleSidebarVisibility(): ConsoleSidebarVisibility {
  return {
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
}

export function createHiddenConsoleSidebarVisibility(): ConsoleSidebarVisibility {
  return {
    dashboard: false,
    sites: false,
    siteAnnouncements: false,
    accounts: false,
    oauth: false,
    downstreamKeys: false,
    downstreamSites: false,
    reconciliation: false,
    routes: false,
    logs: false,
    monitor: false,
  };
}

export function normalizeConsoleSidebarVisibilityMap(input: unknown): ConsoleSidebarVisibility {
  const visibility = createDefaultConsoleSidebarVisibility();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return visibility;
  }

  const record = input as Record<string, unknown>;
  for (const id of CONSOLE_SIDEBAR_ITEM_IDS) {
    if (typeof record[id] === 'boolean') {
      visibility[id] = record[id];
    }
  }

  return visibility;
}
