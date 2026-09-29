import { useMemo, type Ref } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import type { ShortcutKey } from "@/utils/format-shortcut";
import type { SidebarRowIcon } from "./sidebar-header-row";

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** An icon-sized sidebar footer button with a tooltip. */
export function SidebarButton({
  icon,
  label,
  onPress,
  testID,
  shortcutKeys,
  iconSize = ICON_SIZE.md,
  buttonRef,
}: {
  icon: SidebarRowIcon;
  label: string;
  onPress: () => void;
  testID?: string;
  shortcutKeys?: ShortcutKey[][] | null;
  iconSize?: number;
  buttonRef?: Ref<View>;
}) {
  const ThemedIcon = useMemo(() => withUnistyles(icon), [icon]);
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          ref={buttonRef}
          style={styles.button}
          testID={testID}
          nativeID={testID}
          collapsable={false}
          accessible
          accessibilityLabel={label}
          accessibilityRole="button"
          onPress={onPress}
        >
          {({ hovered }) => (
            <ThemedIcon
              size={iconSize}
              uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
            />
          )}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipText}>{label}</Text>
          {shortcutKeys ? <Shortcut chord={shortcutKeys} /> : null}
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  button: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
}));
