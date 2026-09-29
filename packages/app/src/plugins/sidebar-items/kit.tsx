import type { SidebarButtonProps, SidebarIcon, SidebarRowProps } from "@getpaseo/plugin/client/ui";
import { SidebarButton as AppSidebarButton } from "@/components/sidebar/sidebar-button";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { resolvePluginIcon } from "../icons";
import { useSidebarItemFrame } from "./frame";

function resolveIcon(icon: SidebarIcon) {
  return typeof icon === "string" ? resolvePluginIcon(icon) : icon;
}

export function SidebarRow({ icon, label, onPress, active, trailing }: SidebarRowProps) {
  const frame = useSidebarItemFrame("SidebarRow");
  return (
    <SidebarHeaderRow
      icon={icon ? resolveIcon(icon) : null}
      label={label ?? frame.title}
      onPress={onPress}
      isActive={active}
      trailing={trailing}
      testID={frame.testID}
      variant={frame.section === "footer" ? "inline" : "compact"}
      rowRef={frame.anchorRef}
    />
  );
}

export function SidebarButton({ icon, label, onPress }: SidebarButtonProps) {
  const frame = useSidebarItemFrame("SidebarButton");
  return (
    <AppSidebarButton
      icon={resolveIcon(icon)}
      label={label ?? frame.title}
      onPress={onPress}
      testID={frame.testID}
      buttonRef={frame.anchorRef}
    />
  );
}
