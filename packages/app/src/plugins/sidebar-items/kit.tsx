import type { SidebarIcon, SidebarRowProps } from "@getpaseo/plugin/client/ui";
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
