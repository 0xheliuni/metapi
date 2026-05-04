import React from 'react';
import {
  createDefaultConsoleSidebarVisibility,
  type ConsoleSidebarItemId,
  type ConsoleSidebarVisibility,
  normalizeConsoleSidebarVisibilityMap,
} from '../shared/consoleSidebarVisibility.js';

export type { ConsoleSidebarItemId, ConsoleSidebarVisibility } from '../shared/consoleSidebarVisibility.js';

export const CONSOLE_SIDEBAR_VISIBILITY_CHANGED_EVENT = 'metapi:console-sidebar-visibility-changed';

export type SidebarItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  id?: string;
};

export type SidebarGroup = {
  id?: string;
  label: string;
  items: SidebarItem[];
};

export const consoleSidebarItems: Array<SidebarItem & { id: ConsoleSidebarItemId }> = [
  { id: 'dashboard', to: '/', label: '仪表盘', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v2a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 12a1 1 0 011-1h4a1 1 0 011 1v7a1 1 0 01-1 1h-4a1 1 0 01-1-1v-7z" /></svg> },
  { id: 'sites', to: '/sites', label: '站点管理', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg> },
  { id: 'siteAnnouncements', to: '/site-announcements', label: '站点公告', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 8h10M7 12h10M7 16h6M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" /></svg> },
  { id: 'accounts', to: '/accounts', label: '连接管理', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
  { id: 'oauth', to: '/oauth', label: 'OAuth 管理', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 7a3 3 0 106 0 3 3 0 00-6 0zM3 17a3 3 0 106 0 3 3 0 00-6 0zM15 17a3 3 0 106 0 3 3 0 00-6 0zM6 14V10m0 0a3 3 0 113-3m-3 3a3 3 0 003 3h6" /></svg> },
  { id: 'downstreamKeys', to: '/downstream-keys', label: '下游密钥', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 7a4 4 0 11-8 0 4 4 0 018 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 21a6 6 0 0110.8-3.6M15.5 18.5l2-2m0 0l2 2m-2-2V21" /></svg> },
  { id: 'downstreamSites', to: '/downstream-sites', label: '下游站点', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 7h18M5 7l1 12h12l1-12M9 11v4m6-4v4M10 3h4a1 1 0 011 1v3H9V4a1 1 0 011-1z" /></svg> },
  { id: 'reconciliation', to: '/reconciliation', label: '对账中心', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 7h8m-8 5h16m-16 5h10m4-8l2 2 4-4" /></svg> },
  { id: 'routes', to: '/routes', label: '路由', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg> },
  { id: 'logs', to: '/logs', label: '使用日志', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg> },
  { id: 'monitor', to: '/monitor', label: '可用性监控', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 5a2 2 0 012-2h14a2 2 0 012 2v11a2 2 0 01-2 2h-5l-2.5 3-2.5-3H5a2 2 0 01-2-2V5z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 10h3l1.5-2.5L14 13l1.5-3H17" /></svg> },
];

export const sidebarGroups: SidebarGroup[] = [
  {
    id: 'console',
    label: '控制台',
    items: consoleSidebarItems,
  },
  {
    id: 'system',
    label: '系统',
    items: [
      { to: '/settings', label: '设置', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
      { to: '/events', label: '程序日志', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
      { to: '/settings/import-export', label: '导入/导出', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 7h10M7 12h6m-6 5h10M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z" /></svg> },
      { to: '/settings/notify', label: '通知设置', icon: <svg className="sidebar-item-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg> },
    ],
  },
];

export function normalizeConsoleSidebarVisibility(input: unknown): ConsoleSidebarVisibility {
  return normalizeConsoleSidebarVisibilityMap(input);
}

export function countHiddenConsoleSidebarItems(visibility: ConsoleSidebarVisibility): number {
  return consoleSidebarItems.filter((item) => visibility[item.id] === false).length;
}

export function getDefaultConsoleSidebarVisibility(): ConsoleSidebarVisibility {
  return createDefaultConsoleSidebarVisibility();
}

export function filterSidebarGroupsByConsoleVisibility(
  groups: SidebarGroup[],
  visibility: ConsoleSidebarVisibility,
): SidebarGroup[] {
  return groups.map((group) => {
    if (group.id !== 'console') {
      return group;
    }
    return {
      ...group,
      items: group.items.filter((item) => item.id === undefined || visibility[item.id as ConsoleSidebarItemId] !== false),
    };
  });
}
