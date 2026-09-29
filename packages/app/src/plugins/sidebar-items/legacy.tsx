import type { PluginSidebarContribution, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { useCallback, type ComponentType } from "react";
import { SidebarRow } from "./kit";

// COMPAT(pluginSidebarAliases): added in v0.11.0, remove after 2027-03-29
/** The header item an `addSidebarItem({ id, title, icon, surface })` call expands to. */
export function createLegacySidebarItemComponent(
  contribution: PluginSidebarContribution,
): ComponentType<PluginSidebarItemProps> {
  return function LegacySidebarItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
    const open = useCallback(() => openScreen(contribution.surface), [openScreen]);
    return (
      <SidebarRow
        icon={contribution.icon}
        active={currentScreen === contribution.surface}
        onPress={open}
      />
    );
  };
}
