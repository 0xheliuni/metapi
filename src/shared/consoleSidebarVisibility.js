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
];
export function createDefaultConsoleSidebarVisibility() {
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
export function createHiddenConsoleSidebarVisibility() {
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
export function normalizeConsoleSidebarVisibilityMap(input) {
    const visibility = createDefaultConsoleSidebarVisibility();
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        return visibility;
    }
    const record = input;
    for (const id of CONSOLE_SIDEBAR_ITEM_IDS) {
        if (typeof record[id] === 'boolean') {
            visibility[id] = record[id];
        }
    }
    return visibility;
}
