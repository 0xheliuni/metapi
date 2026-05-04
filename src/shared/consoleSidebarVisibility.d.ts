export declare const CONSOLE_SIDEBAR_ITEM_IDS: readonly ["dashboard", "sites", "siteAnnouncements", "accounts", "oauth", "downstreamKeys", "downstreamSites", "reconciliation", "routes", "logs", "monitor"];
export type ConsoleSidebarItemId = typeof CONSOLE_SIDEBAR_ITEM_IDS[number];
export type ConsoleSidebarVisibility = Record<ConsoleSidebarItemId, boolean>;
export declare function createDefaultConsoleSidebarVisibility(): ConsoleSidebarVisibility;
export declare function createHiddenConsoleSidebarVisibility(): ConsoleSidebarVisibility;
export declare function normalizeConsoleSidebarVisibilityMap(input: unknown): ConsoleSidebarVisibility;
