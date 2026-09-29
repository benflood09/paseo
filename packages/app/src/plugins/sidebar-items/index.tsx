import type {
  PluginHostProps,
  PluginOpenScreenInput,
  PluginPopoverProps,
  PluginScreenLocation,
  PluginSidebarItemProps,
} from "@getpaseo/plugin/client";
import type { PluginTheme } from "@getpaseo/plugin";
import { router, useGlobalSearchParams, usePathname } from "expo-router";
import { useCallback, useMemo, useState, type ComponentType, type RefObject } from "react";
import { type View } from "react-native";
import { withUnistyles } from "react-native-unistyles";
import {
  SidebarPopoverRoot,
  SidebarPopoverSurface,
  useSidebarPopoverAnchor,
} from "@/components/sidebar/sidebar-popover";
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
  type PluginEnvironment,
} from "../popover";
import { buildPluginSurfaceRoute, hostIdFromPathname } from "../routes";
import type { PluginSidebarGroup, PluginSidebarTarget } from "../sidebar-groups";
import { currentPluginScreen, parsePluginOpenScreenInput } from "../surface-contribution";
import { SurfaceErrorBoundary } from "../surface-error-boundary";
import { toPluginTheme } from "../theme";
import type { PluginSidebarSection } from "../types";
import { SidebarItemFrameContext, type SidebarItemFrame } from "./frame";
import { resolvePluginPlatform } from "../platform";

export { SidebarRow, SidebarSeparator } from "./kit";

type PopoverContent = ComponentType<PluginPopoverProps>;

const pluginThemeMapping = (theme: Theme) => ({ theme: toPluginTheme(theme) });

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

function renderNothing() {
  return null;
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
  const routeParams = useGlobalSearchParams();
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
        <SidebarPopoverRoot open={popoverOpen} onOpenChange={handleOpenChange}>
          <SidebarItemContent
            group={group}
            plugin={plugin}
            item={item}
            section={section}
            theme={theme}
            currentScreen={currentPluginScreen(plugin, pathname, routeParams)}
            environment={environment}
            popover={popover}
            showPopover={showPopover}
            fallbackAnchorRef={fallbackAnchorRef}
            onBeforeNavigate={onBeforeNavigate}
          />
        </SidebarPopoverRoot>
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
  currentScreen: PluginScreenLocation | null;
  environment: PluginEnvironment;
  popover: PopoverContent | null;
  showPopover: (content: PopoverContent | null) => void;
  fallbackAnchorRef: RefObject<View | null>;
  onBeforeNavigate?: () => void;
}) {
  const { anchorTo, offerAnchor, releaseAnchor, anchorToFallback } =
    useSidebarPopoverAnchor("PluginSidebarItem");
  const hosts = useHosts();
  const compact = useIsCompactFormFactor();
  const hostLabel =
    hosts.find((host) => host.serverId === plugin.serverId)?.label ?? plugin.serverId;

  const hostProps = useMemo<PluginHostProps>(
    () => ({
      theme,
      host: { id: plugin.serverId, label: hostLabel },
      layout: { compact, platform: resolvePluginPlatform() },
    }),
    [compact, hostLabel, plugin.serverId, theme],
  );
  const openScreen = useCallback(
    (input: PluginOpenScreenInput) => {
      const { screenId, params } = parsePluginOpenScreenInput(plugin, input);
      rememberPluginContributionHost(group.key, plugin.serverId);
      showPopover(null);
      onBeforeNavigate?.();
      router.push(
        buildPluginSurfaceRoute(
          plugin.serverId,
          plugin.id,
          { kind: "surface", id: screenId },
          params,
        ),
      );
    },
    [group.key, onBeforeNavigate, plugin, showPopover],
  );
  const openPopover = useCallback(
    (Content: PopoverContent) => {
      anchorToFallback(fallbackAnchorRef);
      showPopover(Content);
    },
    [anchorToFallback, fallbackAnchorRef, showPopover],
  );
  const close = useCallback(() => showPopover(null), [showPopover]);
  const frame = useMemo<SidebarItemFrame>(
    () => ({
      section,
      title: item.title,
      testID:
        section === "header"
          ? `plugin-sidebar-${plugin.id}-${item.id}`
          : `plugin-sidebar-${section}-${plugin.id}-${item.id}`,
      anchorTo,
      offerAnchor,
      releaseAnchor,
    }),
    [anchorTo, item.id, item.title, offerAnchor, plugin.id, releaseAnchor, section],
  );
  const itemProps = useMemo<PluginSidebarItemProps>(
    () => ({ ...hostProps, currentScreen, openScreen, openPopover }),
    [currentScreen, hostProps, openPopover, openScreen],
  );
  const Item = item.Component;
  const Popover = popover;
  return (
    <SidebarItemFrameContext.Provider value={frame}>
      <Item {...itemProps} />
      {Popover ? (
        <SidebarPopoverSurface
          section={section}
          title={item.title}
          testID={`${frame.testID}-popover`}
        >
          <SurfaceErrorBoundary installation={plugin} Surface={Popover}>
            <PluginEnvironmentProvider environment={environment}>
              <PluginPopoverContent>
                <Popover {...hostProps} close={close} openScreen={openScreen} />
              </PluginPopoverContent>
            </PluginEnvironmentProvider>
          </SurfaceErrorBoundary>
        </SidebarPopoverSurface>
      ) : null}
    </SidebarItemFrameContext.Provider>
  );
}
