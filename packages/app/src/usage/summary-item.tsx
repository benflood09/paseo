import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  SidebarPopoverRoot,
  SidebarPopoverSurface,
  useSidebarPopoverAnchor,
} from "@/components/sidebar/sidebar-popover";
import { useIsCompactFormFactor } from "@/constants/layout";
import { usageCopy } from "./copy";
import { UsageControls } from "./controls";
import { useUsagePreferences, type UsageDisplay } from "./display";
import { useSummaryHostId } from "./hosts";
import type { UsagePreferences } from "./preferences";
import { useHostUsage } from "./queries";
import { UsageSourceIcon } from "./source-icon";
import { resolveUsageSummary, type UsageSummaryItem } from "./summary";
import type { UsageReportEntry } from "./types";
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
  // The compact sheet has its own title row, so the controls join it there.
  const isCompact = useIsCompactFormFactor();
  const controls = useMemo(
    () => <UsageControls view={view} display={display} onRefresh={refresh} />,
    [display, refresh, view],
  );
  if (items.length === 0) return null;
  return (
    <SidebarPopoverRoot open={open} onOpenChange={setOpen}>
      <SummaryTrigger items={items} onPress={openPopover} />
      <SidebarPopoverSurface
        section="footer"
        title={usageCopy.title}
        sheetTrailing={isCompact ? controls : null}
        testID="sidebar-usage-summary-popover"
      >
        <View style={styles.expanded} testID="usage-expanded">
          {isCompact ? null : <PopoverTitleRow controls={controls} />}
          <UsageBody serverId={serverId} view={view} display={display} onRefresh={refresh} />
        </View>
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

/** The popover's title row; on compact the sheet header plays this part. */
function PopoverTitleRow({ controls }: { controls: ReactNode }) {
  return (
    <View style={styles.titleRow}>
      <Text style={styles.title}>{usageCopy.title}</Text>
      {controls}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    // A wrapping row packs its lines at the top; center them in the 28px row instead.
    alignContent: "center",
    columnGap: theme.spacing[3],
    rowGap: theme.spacing[1],
    // Same row geometry and leading rail as Add project and the footer icons.
    minHeight: 28,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1.5],
    borderRadius: theme.borderRadius.lg,
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[4],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
}));
