import type {
  PluginHostProps,
  PluginPopoverProps,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { router, usePathname } from "expo-router";
import { useCallback, useMemo, useState, type ComponentType, type RefObject } from "react";
import { Platform, type View } from "react-native";
import { withUnistyles } from "react-native-unistyles";
import { MenuRoot, useMenuContext } from "@/components/ui/menu";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useToast } from "@/contexts/toast-context";
import { useHostRuntimeClient, useHosts } from "@/runtime/host-runtime";
import type { Theme } from "@/styles/theme";
import { createPluginClientStateSource } from "../client-state/source";
import {
  getPreferredPluginContributionHost,
  rememberPluginContributionHost,
} from "../contribution-host";
import {
  PluginEnvironmentProvider,
  PluginPopoverContent,
  PluginPopoverSurface,
  type PluginEnvironment,
} from "../popover";
import { buildPluginSurfaceRoute, hostIdFromPathname } from "../routes";
import type { PluginSidebarGroup, PluginSidebarTarget } from "../sidebar-groups";
import { currentPluginScreen } from "../surface-contribution";
import { SurfaceErrorBoundary } from "../surface-error-boundary";
import { toPluginTheme } from "../theme";
import type { PluginSidebarSection } from "../types";
import { SidebarItemFrameContext, type SidebarItemFrame } from "./frame";

export { SidebarButton, SidebarRow } from "./kit";

type PopoverContent = ComponentType<PluginPopoverProps>;

const pluginThemeMapping = (theme: Theme) => ({ theme: toPluginTheme(theme) });

const POPOVER_PLACEMENT = {
  header: { side: "right", align: "start" },
  footer: { side: "top", align: "start" },
} as const;

function selectTarget(
  group: PluginSidebarGroup,
  currentHostId: string | null,
): PluginSidebarTarget {
  const current = group.targets.find((target) => target.plugin.serverId === currentHostId);
  if (current) return current;
  const rememberedHostId = getPreferredPluginContributionHost(group.key);
  const remembered = group.targets.find((target) => target.plugin.serverId === rememberedHostId);
  return remembered ?? group.targets[0];
}

function resolvePlatform(): PluginHostProps["layout"]["platform"] {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

function renderNothing() {
  return null;
}

function assignRef(ref: RefObject<View | null>, node: View | null) {
  Object.assign(ref, { current: node });
}

interface PluginSidebarItemHostProps {
  group: PluginSidebarGroup;
  section: PluginSidebarSection;
  /** Anchors a popover opened by an item that renders no kit component. */
  fallbackAnchorRef: RefObject<View | null>;
  onBeforeNavigate?: () => void;
}

/**
 * One plugin sidebar item. Renders the item's `Component` from the host `selectTarget` picks,
 * inside the plugin's runtime and its own error boundary: a throwing item renders nothing.
 */
export function PluginSidebarItem(props: PluginSidebarItemHostProps) {
  return <ThemedPluginSidebarItem {...props} uniProps={pluginThemeMapping} />;
}

function PluginSidebarItemHost({
  group,
  section,
  fallbackAnchorRef,
  onBeforeNavigate,
  theme,
}: PluginSidebarItemHostProps & { theme: PluginTheme }) {
  const pathname = usePathname();
  const { plugin, item } = selectTarget(group, hostIdFromPathname(pathname));
  const client = useHostRuntimeClient(plugin.serverId);
  const toast = useToast();
  // The content outlives `open` so the surface can play its exit and native sheet teardown.
  const [popover, setPopover] = useState<PopoverContent | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const environment = useMemo<PluginEnvironment | null>(
    () =>
      client
        ? {
            installation: plugin,
            client,
            toast,
            state: createPluginClientStateSource(plugin.serverId),
          }
        : null,
    [client, plugin, toast],
  );
  const showPopover = useCallback((content: PopoverContent | null) => {
    // A function passed to a state setter is an updater, so wrap the component.
    if (content) setPopover(() => content);
    setPopoverOpen(content !== null);
  }, []);
  const handleOpenChange = useCallback((open: boolean) => {
    if (!open) setPopoverOpen(false);
  }, []);
  if (!environment) return null;
  return (
    <SurfaceErrorBoundary
      installation={plugin}
      Surface={item.Component}
      renderError={renderNothing}
    >
      <PluginEnvironmentProvider environment={environment}>
        <MenuRoot compactMode="sheet" open={popoverOpen} onOpenChange={handleOpenChange}>
          <SidebarItemContent
            group={group}
            plugin={plugin}
            item={item}
            section={section}
            theme={theme}
            currentScreen={currentPluginScreen(plugin, pathname)}
            environment={environment}
            popover={popover}
            showPopover={showPopover}
            fallbackAnchorRef={fallbackAnchorRef}
            onBeforeNavigate={onBeforeNavigate}
          />
        </MenuRoot>
      </PluginEnvironmentProvider>
    </SurfaceErrorBoundary>
  );
}

const ThemedPluginSidebarItem = withUnistyles(PluginSidebarItemHost);

function SidebarItemContent({
  group,
  plugin,
  item,
  section,
  theme,
  currentScreen,
  environment,
  popover,
  showPopover,
  fallbackAnchorRef,
  onBeforeNavigate,
}: {
  group: PluginSidebarGroup;
  plugin: PluginSidebarTarget["plugin"];
  item: PluginSidebarTarget["item"];
  section: PluginSidebarSection;
  theme: PluginTheme;
  currentScreen: string | null;
  environment: PluginEnvironment;
  popover: PopoverContent | null;
  showPopover: (content: PopoverContent | null) => void;
  fallbackAnchorRef: RefObject<View | null>;
  onBeforeNavigate?: () => void;
}) {
  const menu = useMenuContext("PluginSidebarItem");
  const hosts = useHosts();
  const compact = useIsCompactFormFactor();
  const hostLabel =
    hosts.find((host) => host.serverId === plugin.serverId)?.label ?? plugin.serverId;

  const hostProps = useMemo<PluginHostProps>(
    () => ({
      theme,
      host: { id: plugin.serverId, label: hostLabel },
      layout: { compact, platform: resolvePlatform() },
    }),
    [compact, hostLabel, plugin.serverId, theme],
  );
  const openScreen = useCallback(
    (screenId: string) => {
      if (!plugin.surfaces.some((surface) => surface.id === screenId)) {
        throw new Error(`Plugin screen is unavailable: ${screenId}`);
      }
      rememberPluginContributionHost(group.key, plugin.serverId);
      showPopover(null);
      onBeforeNavigate?.();
      router.push(
        buildPluginSurfaceRoute(plugin.serverId, plugin.id, { kind: "surface", id: screenId }),
      );
    },
    [group.key, onBeforeNavigate, plugin, showPopover],
  );
  const openPopover = useCallback(
    (Content: PopoverContent) => {
      if (!menu.triggerRef.current) assignRef(menu.triggerRef, fallbackAnchorRef.current);
      showPopover(Content);
    },
    [fallbackAnchorRef, menu.triggerRef, showPopover],
  );
  const close = useCallback(() => showPopover(null), [showPopover]);
  const anchorRef = useCallback(
    (node: View | null) => assignRef(menu.triggerRef, node),
    [menu.triggerRef],
  );
  const frame = useMemo<SidebarItemFrame>(
    () => ({
      section,
      title: item.title,
      testID:
        section === "header"
          ? `plugin-sidebar-${plugin.id}-${item.id}`
          : `plugin-sidebar-${section}-${plugin.id}-${item.id}`,
      anchorRef,
    }),
    [anchorRef, item.id, item.title, plugin.id, section],
  );
  const itemProps = useMemo<PluginSidebarItemProps>(
    () => ({ ...hostProps, currentScreen, openScreen, openPopover }),
    [currentScreen, hostProps, openPopover, openScreen],
  );
  const Item = item.Component;
  const Popover = popover;
  const placement = POPOVER_PLACEMENT[section];
  return (
    <SidebarItemFrameContext.Provider value={frame}>
      <Item {...itemProps} />
      {Popover ? (
        <PluginPopoverSurface
          sheetTitle={item.title}
          side={placement.side}
          align={placement.align}
          offset={8}
          testID={`${frame.testID}-popover`}
        >
          <SurfaceErrorBoundary installation={plugin} Surface={Popover}>
            <PluginEnvironmentProvider environment={environment}>
              <PluginPopoverContent>
                <Popover {...hostProps} close={close} openScreen={openScreen} />
              </PluginPopoverContent>
            </PluginEnvironmentProvider>
          </SurfaceErrorBoundary>
        </PluginPopoverSurface>
      ) : null}
    </SidebarItemFrameContext.Provider>
  );
}
