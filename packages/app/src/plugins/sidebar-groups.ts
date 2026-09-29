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

/** Header items keep the pre-footer key so users keep their remembered host. */
function rememberedHostKey(pluginId: string, section: PluginSidebarSection, itemId: string) {
  return section === "header"
    ? `${pluginId}/sidebar/${itemId}`
    : `${pluginId}/sidebar-${section}/${itemId}`;
}

export function groupPluginSidebarItems(
  plugins: InstalledPlugin[],
  section: PluginSidebarSection,
): PluginSidebarGroup[] {
  const groups = new Map<string, PluginSidebarGroup>();
  for (const plugin of plugins) {
    for (const item of plugin.sidebarItems[section]) {
      const key = rememberedHostKey(plugin.id, section, item.id);
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
