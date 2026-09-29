import { RefreshCw } from "lucide-react-native";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { HostSwitcher } from "@/components/hosts/host-switcher";
import { Button } from "@/components/ui/button";
import { usageCopy } from "./copy";
import type { UsageDisplay } from "./display";
import { UsageDisplayToggle } from "./display-toggle";
import type { UsageHost } from "./model";
import type { UsageView } from "./types";

/** The hosts to choose between, and which one is shown. */
export interface UsageHostSelection {
  hosts: UsageHost[];
  serverId: string;
  onSelect: (serverId: string) => void;
}

/**
 * The controls on the right of every usage title row: the host selector when more than one host
 * is connected, the used/remaining toggle and Refresh. A host that cannot report usage keeps only
 * the selector.
 */
export function UsageControls({
  view,
  display,
  onRefresh,
  hostSelection,
}: {
  view: UsageView;
  display: UsageDisplay;
  onRefresh: () => void;
  hostSelection?: UsageHostSelection;
}) {
  const busy = view.kind === "loading" || (view.kind === "ready" && view.isRefreshing);
  return (
    <View style={styles.controls}>
      {hostSelection && hostSelection.hosts.length > 1 ? (
        <HostSwitcher
          hosts={hostSelection.hosts}
          value={hostSelection.serverId}
          onSelect={hostSelection.onSelect}
          title={usageCopy.host}
          accessibilityLabel={usageCopy.host}
          testID="usage-host-switcher"
        />
      ) : null}
      {view.kind === "unavailable" ? null : (
        <>
          <UsageDisplayToggle display={display} />
          <Button
            variant="ghost"
            size="xs"
            leftIcon={RefreshCw}
            loading={busy}
            onPress={onRefresh}
            accessibilityLabel={usageCopy.refresh}
          >
            {busy ? usageCopy.refreshing : usageCopy.refresh}
          </Button>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  controls: {
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
}));
