import { Fragment } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { UsageCard } from "./card";
import type { UsageDisplay } from "./display";
import type { UsageReportEntry } from "./types";

export function UsageList({
  serverId,
  reports,
  display,
}: {
  serverId: string;
  reports: UsageReportEntry[];
  display: UsageDisplay;
}) {
  return (
    <View style={settingsStyles.card}>
      {reports.map((entry, index) => (
        <Fragment key={entry.id}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <UsageCard serverId={serverId} entry={entry} display={display} />
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
}));
