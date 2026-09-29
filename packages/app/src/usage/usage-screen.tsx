import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { HostSwitcher } from "@/components/hosts/host-switcher";
import { PageLayout } from "@/components/page-layout";
import { usageCopy } from "./copy";
import { useUsagePreferences, type UsageDisplay } from "./display";
import { useUsageScreenHost } from "./hosts";
import { useHostUsage } from "./queries";
import { UsageMessage, UsageSection } from "./usage-section";

// The screen is reachable by URL, so there may be no history to go back to.
function leaveUsage(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }
  router.replace("/");
}

export function UsageScreen() {
  const isFocused = useIsFocused();
  return (
    <PageLayout title={usageCopy.title} onBack={leaveUsage} testID="usage-screen">
      {isFocused ? <UsageScreenContent /> : null}
    </PageLayout>
  );
}

function UsageScreenContent() {
  const { serverId, connectedHosts, select } = useUsageScreenHost();
  const { display } = useUsagePreferences();
  if (!serverId) return <UsageMessage text={usageCopy.noHosts} />;
  const title = connectedHosts.find((host) => host.serverId === serverId)?.label ?? serverId;
  return (
    <>
      {connectedHosts.length > 1 ? (
        <View style={styles.hostRow}>
          <HostSwitcher
            hosts={connectedHosts}
            value={serverId}
            onSelect={select}
            title={usageCopy.host}
            accessibilityLabel={usageCopy.host}
            testID="usage-host-switcher"
          />
        </View>
      ) : null}
      <HostUsage key={serverId} serverId={serverId} title={title} display={display} />
    </>
  );
}

function HostUsage({
  serverId,
  title,
  display,
}: {
  serverId: string;
  title: string;
  display: UsageDisplay;
}) {
  const { view, refresh } = useHostUsage(serverId);
  return (
    <UsageSection
      serverId={serverId}
      title={title}
      view={view}
      display={display}
      onRefresh={refresh}
      testID={`usage-host-${serverId}`}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  hostRow: {
    flexDirection: "row",
    marginBottom: theme.spacing[4],
  },
}));
