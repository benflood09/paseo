import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  SidebarPopoverRoot,
  SidebarPopoverSurface,
  useSidebarPopoverAnchor,
} from "@/components/sidebar/sidebar-popover";
import { useIsCompactFormFactor } from "@/constants/layout";
import { usageCopy } from "./copy";
import { useUsagePreferences, type UsageDisplay } from "./display";
import { UsageDisplayToggle } from "./display-toggle";
import { useSummaryHostId } from "./hosts";
import type { UsagePreferences } from "./preferences";
import { useHostUsage } from "./queries";
import { UsageSourceIcon } from "./source-icon";
import { resolveUsageSummary, type UsageSummaryItem } from "./summary";
import type { UsageReportEntry, UsageView } from "./types";
import { UsageBody } from "./usage-section";

const NO_REPORTS: UsageReportEntry[] = [];

/**
 * The sidebar footer's usage summary: each pinned window's source icon and percent. Pressing it
 * opens the expanded view. It renders nothing until a pinned window has data.
 */
export function UsageSummary() {
  const { preferences, display } = useUsagePreferences();
  const serverId = useSummaryHostId();
  // Without pins there is nothing to show, so the host is not asked for reports.
  if (!serverId || preferences.pinned.length === 0) return null;
  return (
    <HostUsageSummary
      key={serverId}
      serverId={serverId}
      preferences={preferences}
      display={display}
    />
  );
}

function HostUsageSummary({
  serverId,
  preferences,
  display,
}: {
  serverId: string;
  preferences: UsagePreferences;
  display: UsageDisplay;
}) {
  const { view, refresh } = useHostUsage(serverId);
  const reports = view.kind === "ready" ? view.reports : NO_REPORTS;
  const items = useMemo(() => resolveUsageSummary(reports, preferences), [preferences, reports]);
  const [open, setOpen] = useState(false);
  const openPopover = useCallback(() => setOpen(true), []);
  if (items.length === 0) return null;
  return (
    <SidebarPopoverRoot open={open} onOpenChange={setOpen}>
      <SummaryTrigger items={items} onPress={openPopover} />
      <SidebarPopoverSurface
        section="footer"
        title={usageCopy.title}
        testID="sidebar-usage-summary-popover"
      >
        <UsageExpandedView serverId={serverId} view={view} display={display} onRefresh={refresh} />
      </SidebarPopoverSurface>
    </SidebarPopoverRoot>
  );
}

function summaryLabel(items: readonly UsageSummaryItem[]): string {
  return `${usageCopy.summary}: ${items.map((item) => `${item.label} ${item.percentText}`).join(", ")}`;
}

function triggerStyle({ hovered }: PressableStateCallbackType & { hovered?: boolean }) {
  return hovered ? [styles.trigger, styles.triggerHovered] : styles.trigger;
}

function SummaryTrigger({
  items,
  onPress,
}: {
  items: readonly UsageSummaryItem[];
  onPress: () => void;
}) {
  const { anchorRef } = useSidebarPopoverAnchor("UsageSummary");
  return (
    <Pressable
      ref={anchorRef}
      collapsable={false}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={summaryLabel(items)}
      style={triggerStyle}
      testID="sidebar-usage-summary"
    >
      {items.map((item) => (
        <View key={item.key} style={styles.item} testID="sidebar-usage-summary-item">
          <UsageSourceIcon svg={item.icon} size={14} />
          <Text style={styles.percent} numberOfLines={1}>
            {item.percentText}
          </Text>
        </View>
      ))}
    </Pressable>
  );
}

/** The summary's popover and sheet: the host's reports with pins and the used/remaining toggle. */
function UsageExpandedView({
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
  // The compact sheet already carries the title.
  const isCompact = useIsCompactFormFactor();
  return (
    <View style={styles.expanded} testID="usage-expanded">
      <View style={isCompact ? styles.expandedHeaderCompact : styles.expandedHeader}>
        {isCompact ? null : <Text style={styles.expandedTitle}>{usageCopy.title}</Text>}
        <UsageDisplayToggle display={display} />
      </View>
      <UsageBody serverId={serverId} view={view} display={display} onRefresh={onRefresh} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    columnGap: theme.spacing[3],
    rowGap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    // Centers each 14px icon on the column of the 28px footer buttons below.
    paddingHorizontal: 7,
    borderRadius: theme.borderRadius.md,
  },
  triggerHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  percent: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  expanded: {
    padding: theme.spacing[3],
    gap: theme.spacing[3],
  },
  expandedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
  },
  expandedHeaderCompact: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  expandedTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
}));
