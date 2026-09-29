import type { InstalledPlugin, PluginSidebarItemContribution, PluginSidebarSection } from "./types";

export interface PluginSidebarTarget {
  plugin: InstalledPlugin;
  item: PluginSidebarItemContribution;
}

/** One sidebar item, coalesced across every host that contributes it. */
export interface PluginSidebarGroup {
  key: string;
  pluginId: string;
  contributionId: string;
  title: string;
  targets: PluginSidebarTarget[];
}

export function groupPluginSidebarItems(
  plugins: InstalledPlugin[],
  section: PluginSidebarSection,
): PluginSidebarGroup[] {
  const groups = new Map<string, PluginSidebarGroup>();
  for (const plugin of plugins) {
    for (const item of plugin.sidebarItems[section]) {
      const key = `${plugin.id}/sidebar-${section}/${item.id}`;
      const existing = groups.get(key);
      if (existing) {
        existing.targets.push({ plugin, item });
      } else {
        groups.set(key, {
          key,
          pluginId: plugin.id,
          contributionId: item.id,
          title: item.title,
          targets: [{ plugin, item }],
        });
      }
    }
  }
  return [...groups.values()];
}
