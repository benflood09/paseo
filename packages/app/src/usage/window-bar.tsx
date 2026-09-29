import { useMemo } from "react";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { clampPct, formatDisplayPct, formatResetLabel } from "./format";
import { displayPercent, usedPercent } from "./model";
import type { UsageDisplayAs } from "./preferences";
import { deriveTone } from "./tone";
import type { UsageTone, UsageWindow } from "./types";

function fillToneStyle(tone: UsageTone) {
  switch (tone) {
    case "ok":
      return styles.fillOk;
    case "warning":
      return styles.fillWarning;
    case "danger":
      return styles.fillDanger;
    default:
      return styles.fillDefault;
  }
}

function rowStyle(pinned: boolean) {
  return ({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => {
    if (pinned) return [styles.row, styles.rowPinned];
    return hovered ? [styles.row, styles.rowHovered] : styles.row;
  };
}

export function UsageWindowBar({
  window,
  displayAs,
  pinned,
  onTogglePin,
  pinLabel,
  pinTestID,
}: {
  window: UsageWindow;
  displayAs: UsageDisplayAs;
  pinned: boolean;
  onTogglePin: () => void;
  /** Accessibility label of the pin toggle, naming the source and window. */
  pinLabel: string;
  pinTestID: string;
}) {
  const usedPct = usedPercent(window);
  const shownPct = displayPercent(window, displayAs);
  const tone = window.tone ?? deriveTone(usedPct);

  const fillWidth = clampPct(shownPct ?? 0);
  const fillStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.fill, fillToneStyle(tone), { width: `${fillWidth}%` }],
    [fillWidth, tone],
  );

  const isAtRisk = window.runsOutAt != null && window.shortfallPct != null;
  const trailing = isAtRisk
    ? `runs out ${formatResetLabel(window.runsOutAt)?.replace("resets ", "") ?? ""}`.trim()
    : formatResetLabel(window.resetsAt);

  const accessibilityState = useMemo(() => ({ checked: pinned }), [pinned]);
  const style = useMemo(() => rowStyle(pinned), [pinned]);

  // The whole row pins the window to the sidebar summary. Pinned or not, it keeps the same
  // padding so toggling only changes the background.
  return (
    <Pressable
      onPress={onTogglePin}
      accessibilityRole="checkbox"
      accessibilityLabel={pinLabel}
      accessibilityState={accessibilityState}
      aria-checked={pinned}
      style={style}
      testID={pinTestID}
    >
      <View style={styles.labelRow}>
        <Text style={styles.label} numberOfLines={1}>
          {window.label}
        </Text>
        <Text style={styles.value}>
          {shownPct != null ? formatDisplayPct(shownPct, displayAs) : "—"}
          {trailing ? (
            <Text style={isAtRisk ? styles.atRisk : styles.reset}>{` · ${trailing}`}</Text>
          ) : null}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={fillStyle} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    gap: 3,
    // The highlight bleeds into the card padding so the label and bar stay on the card's rail.
    marginHorizontal: -theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
    borderRadius: theme.borderRadius.md,
  },
  rowPinned: {
    backgroundColor: theme.colors.surface2,
  },
  rowHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  label: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  value: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  reset: {
    color: theme.colors.foregroundMuted,
    fontWeight: theme.fontWeight.normal,
  },
  atRisk: {
    color: theme.colors.statusDanger,
    fontWeight: theme.fontWeight.normal,
  },
  track: {
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.surface3,
    overflow: "hidden",
  },
  fill: {
    height: 4,
    borderRadius: 2,
  },
  fillDefault: {
    backgroundColor: theme.colors.foregroundMuted,
  },
  fillOk: {
    backgroundColor: theme.colors.statusSuccess,
  },
  fillWarning: {
    backgroundColor: theme.colors.statusWarning,
  },
  fillDanger: {
    backgroundColor: theme.colors.statusDanger,
  },
}));
