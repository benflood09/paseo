import { PluginClientStateProvider } from "@getpaseo/plugin/client/host";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { MenuSurface, type MenuSurfaceProps } from "@/components/ui/menu";
import { ToastApiProvider, type useToast } from "@/contexts/toast-context";
import type { createPluginClientStateSource } from "./client-state/source";
import { PluginSharedRuntimeBoundary } from "./runtime-boundary";
import type { InstalledPlugin } from "./types";

export interface PluginEnvironment {
  installation: InstalledPlugin;
  client: DaemonClient;
  state: ReturnType<typeof createPluginClientStateSource>;
  toast: ReturnType<typeof useToast>;
}

/**
 * The providers plugin UI runs under. Render it around a contribution and again inside every
 * surface it opens: native sheets teleport their children, so providers around the trigger alone
 * cannot reach a popover body.
 */
export function PluginEnvironmentProvider({
  environment,
  children,
}: {
  environment: PluginEnvironment;
  children: ReactNode;
}) {
  return (
    <ToastApiProvider api={environment.toast}>
      <PluginSharedRuntimeBoundary plugin={environment.installation} client={environment.client}>
        <PluginClientStateProvider source={environment.state}>{children}</PluginClientStateProvider>
      </PluginSharedRuntimeBoundary>
    </ToastApiProvider>
  );
}

type PluginPopoverSurfaceProps = Pick<
  MenuSurfaceProps,
  "children" | "pages" | "sheetTitle" | "sheetTrailing" | "side" | "align" | "offset" | "testID"
>;

/**
 * The surface every plugin popover opens in: anchored to its trigger on wide layouts, a bottom
 * sheet on compact ones when the enclosing `MenuRoot` uses `compactMode="sheet"`.
 */
export function PluginPopoverSurface(props: PluginPopoverSurfaceProps) {
  return <MenuSurface {...props} minWidth={280} maxWidth={420} maxHeight={440} scrollable />;
}

export function PluginPopoverContent({ children }: { children: ReactNode }) {
  return <View style={styles.content}>{children}</View>;
}

const styles = StyleSheet.create((theme) => ({
  content: { padding: theme.spacing[3], gap: theme.spacing[2] },
}));
