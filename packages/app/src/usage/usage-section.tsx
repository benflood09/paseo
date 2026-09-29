import { RefreshCw } from "lucide-react-native";
import { useMemo } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { settingsStyles } from "@/styles/settings";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { usageCopy } from "./copy";
import type { UsageDisplay } from "./display";
import { UsageDisplayToggle } from "./display-toggle";
import { UsageList } from "./list";
import type { UsageView } from "./types";

export function UsageSection({
  serverId,
  title,
  view,
  display,
  onRefresh,
  testID,
}: {
  serverId: string;
  title: string;
  view: UsageView;
  display: UsageDisplay;
  onRefresh: () => void;
  testID?: string;
}) {
  const busy = view.kind === "loading" || (view.kind === "ready" && view.isRefreshing);

  const trailing = useMemo(
    () =>
      view.kind === "unavailable" ? null : (
        <View style={styles.trailing}>
          <UsageDisplayToggle display={display} />
          <Button
            variant="ghost"
            size="sm"
            leftIcon={RefreshCw}
            loading={busy}
            onPress={onRefresh}
            accessibilityLabel={usageCopy.refresh}
          >
            {busy ? usageCopy.refreshing : usageCopy.refresh}
          </Button>
        </View>
      ),
    [busy, display, onRefresh, view.kind],
  );

  return (
    <SettingsSection title={title} testID={testID} trailing={trailing}>
      <UsageBody serverId={serverId} view={view} display={display} onRefresh={onRefresh} />
    </SettingsSection>
  );
}

/** What a host's usage view shows: its reports, or why there are none. */
export function UsageBody({
  serverId,
  view,
  display,
  onRefresh,
}: {
  serverId: string;
  view: UsageView;
  display: UsageDisplay;
  onRefresh: () => void;
}) {
  if (view.kind === "unavailable") {
    return <UsageMessage text={view.message} />;
  }

  if (view.kind === "loading") {
    return <UsageMessage text={usageCopy.loading} />;
  }

  if (view.kind === "error") {
    return (
      <Alert size="sm" variant="error" title={usageCopy.errorTitle} description={view.message}>
        <Button variant="outline" size="sm" onPress={onRefresh}>
          {usageCopy.retry}
        </Button>
      </Alert>
    );
  }

  if (view.reports.length === 0) {
    return <UsageMessage text={usageCopy.empty} />;
  }

  return <UsageList serverId={serverId} reports={view.reports} display={display} />;
}

export function UsageMessage({ text }: { text: string }) {
  return (
    <View style={[settingsStyles.card, styles.emptyCard]}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  emptyCard: {
    padding: theme.spacing[4],
    alignItems: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));
