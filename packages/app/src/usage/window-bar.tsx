import { Check } from "lucide-react-native";
import { useMemo } from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
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

const ThemedCheck = withUnistyles(Check);
const checkedIconMapping = (theme: Theme) => ({ color: theme.colors.accentForeground });

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
  /** Accessibility label of the pin checkbox, naming the source and window. */
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

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <PinCheckbox pinned={pinned} onToggle={onTogglePin} label={pinLabel} testID={pinTestID} />
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
    </View>
  );
}

/** Pins the window to the sidebar summary. */
function PinCheckbox({
  pinned,
  onToggle,
  label,
  testID,
}: {
  pinned: boolean;
  onToggle: () => void;
  label: string;
  testID: string;
}) {
  const accessibilityState = useMemo(() => ({ checked: pinned }), [pinned]);
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
      aria-checked={pinned}
      hitSlop={6}
      style={pinned ? styles.checkboxChecked : styles.checkbox}
      testID={testID}
    >
      {pinned ? <ThemedCheck size={10} strokeWidth={3} uniProps={checkedIconMapping} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: 3,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  checkbox: {
    width: 14,
    height: 14,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    width: 14,
    height: 14,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
    justifyContent: "center",
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
