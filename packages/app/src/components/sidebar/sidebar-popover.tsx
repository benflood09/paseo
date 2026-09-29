import { useCallback, type ReactNode, type RefObject } from "react";
import type { View } from "react-native";
import { MenuRoot, useMenuContext } from "@/components/ui/menu";
import { PluginPopoverSurface } from "@/plugins/popover";
import type { SidebarSection } from "@/sidebar-nav/model";

/**
 * The popover a sidebar item opens: anchored to the item on wide layouts, a bottom sheet on
 * compact ones. Plugin items and the built-in usage summary open it the same way:
 * `SidebarPopoverRoot` around the item, `useSidebarPopoverAnchor` on the element to anchor to,
 * and `SidebarPopoverSurface` for the body.
 */
export function SidebarPopoverRoot({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <MenuRoot compactMode="sheet" open={open} onOpenChange={onOpenChange}>
      {children}
    </MenuRoot>
  );
}

function assignRef(ref: RefObject<View | null>, node: View | null) {
  Object.assign(ref, { current: node });
}

/** Attaches the popover to an element, or to `fallback` when nothing attached. */
export function useSidebarPopoverAnchor(name: string): {
  anchorRef: (node: View | null) => void;
  anchorToFallback: (fallback: RefObject<View | null>) => void;
} {
  const { triggerRef } = useMenuContext(name);
  const anchorRef = useCallback((node: View | null) => assignRef(triggerRef, node), [triggerRef]);
  const anchorToFallback = useCallback(
    (fallback: RefObject<View | null>) => {
      if (!triggerRef.current) assignRef(triggerRef, fallback.current);
    },
    [triggerRef],
  );
  return { anchorRef, anchorToFallback };
}

const PLACEMENT = {
  header: { side: "right", align: "start" },
  footer: { side: "top", align: "start" },
} as const satisfies Record<SidebarSection, { side: string; align: string }>;

export function SidebarPopoverSurface({
  section,
  title,
  sheetTrailing,
  testID,
  children,
}: {
  section: SidebarSection;
  /** The bottom sheet's title. */
  title: string;
  /** Controls on the right of the bottom sheet's title. */
  sheetTrailing?: ReactNode;
  testID: string;
  children: ReactNode;
}) {
  const placement = PLACEMENT[section];
  return (
    <PluginPopoverSurface
      sheetTitle={title}
      sheetTrailing={sheetTrailing}
      side={placement.side}
      align={placement.align}
      offset={8}
      testID={testID}
    >
      {children}
    </PluginPopoverSurface>
  );
}
