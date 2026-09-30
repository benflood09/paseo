import { useCallback, useMemo, type ReactElement } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react-native";
import { useAggregatedAgents, type AggregatedAgent } from "@/hooks/use-aggregated-agents";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { groupSidebarThreads, type SidebarThreadProject } from "@/hooks/sidebar-thread-projects";
import type { SidebarProjectEntry } from "@/hooks/sidebar-workspaces-view-model";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { getProviderIcon } from "@/components/provider-icons";
import { hasActiveSidebarLabelFilter, useSidebarViewStore } from "@/stores/sidebar-view-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SidebarWorkspacePlacement } from "@/hooks/sidebar-workspaces-view-model";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedPlus = withUnistyles(Plus);
const ThemedX = withUnistyles(X);
const mutedIconColor = (theme: { colors: { foregroundMuted: string } }) => ({
  color: theme.colors.foregroundMuted,
});

export function SidebarThreadList({
  projects,
  onThreadPress,
  header,
  hasActiveProjectFilter = false,
}: {
  projects: SidebarProjectEntry[];
  onThreadPress?: () => void;
  header?: ReactElement | null;
  hasActiveProjectFilter?: boolean;
}) {
  const { agents } = useAggregatedAgents();
  const hostFilters = useSidebarViewStore((state) => state.hostFilters);
  const hasActiveLabelFilter = useSidebarViewStore((state) =>
    hasActiveSidebarLabelFilter(state.labelFilter),
  );
  const groups = useMemo(
    () =>
      groupSidebarThreads({
        projects,
        agents:
          hostFilters.length > 0
            ? agents.filter((agent) => hostFilters.includes(agent.serverId))
            : agents,
        includeUnmatched: !hasActiveProjectFilter && !hasActiveLabelFilter,
      }),
    [projects, agents, hostFilters, hasActiveProjectFilter, hasActiveLabelFilter],
  );
  return (
    <ScrollView
      testID="sidebar-thread-list"
      style={styles.list}
      contentContainerStyle={styles.content}
    >
      {header}
      {groups.map((group) => (
        <SidebarThreadProjectRow
          key={group.project.viewKey}
          group={group}
          onThreadPress={onThreadPress}
        />
      ))}
    </ScrollView>
  );
}

function SidebarThreadProjectRow({
  group,
  onThreadPress,
}: {
  group: SidebarThreadProject;
  onThreadPress?: () => void;
}) {
  const { project, agents } = group;
  const collapsed = useSidebarCollapsedSectionsStore((state) =>
    state.collapsedProjectKeys.has(project.viewKey),
  );
  const toggleProjectCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.toggleProjectCollapsed,
  );
  const handleToggle = useCallback(
    () => toggleProjectCollapsed(project.viewKey),
    [project.viewKey, toggleProjectCollapsed],
  );
  const handleNewThread = useCallback(
    (workspace: SidebarWorkspacePlacement) => {
      onThreadPress?.();
      navigateToWorkspace({
        serverId: workspace.serverId,
        workspaceId: workspace.workspaceId,
        target: { kind: "draft", draftId: "new" },
      });
    },
    [onThreadPress],
  );
  return (
    <View testID={`sidebar-thread-project:${project.viewKey}`} style={styles.project}>
      <View style={styles.projectHeader}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${collapsed ? "Expand" : "Collapse"} ${project.projectName}`}
          onPress={handleToggle}
          style={styles.projectTitleButton}
        >
          {collapsed ? (
            <ThemedChevronRight size={15} uniProps={mutedIconColor} />
          ) : (
            <ThemedChevronDown size={15} uniProps={mutedIconColor} />
          )}
          <Text numberOfLines={1} style={styles.projectTitle}>
            {project.projectName}
          </Text>
          <Text style={styles.count}>{agents.length}</Text>
        </Pressable>
        {project.workspaces.length === 1 ? (
          <NewThreadWorkspaceButton
            projectName={project.projectName}
            workspace={project.workspaces[0]!}
            onCreate={handleNewThread}
          />
        ) : null}
        {project.workspaces.length > 1 && (
          <DropdownMenu>
            <DropdownMenuTrigger
              accessibilityRole="button"
              accessibilityLabel={`Choose workspace for new thread in ${project.projectName}`}
              style={styles.iconButton}
            >
              <ThemedPlus size={15} uniProps={mutedIconColor} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" width={240}>
              {project.workspaces.map((workspace) => (
                <NewThreadWorkspaceMenuItem
                  key={workspace.workspaceKey}
                  workspace={workspace}
                  onCreate={handleNewThread}
                />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </View>
      {!collapsed &&
        agents.map((agent) => (
          <SidebarThreadRow
            key={`${agent.serverId}:${agent.id}`}
            agent={agent}
            onThreadPress={onThreadPress}
          />
        ))}
    </View>
  );
}

function NewThreadWorkspaceButton({
  projectName,
  workspace,
  onCreate,
}: {
  projectName: string;
  workspace: SidebarWorkspacePlacement;
  onCreate: (workspace: SidebarWorkspacePlacement) => void;
}) {
  const handlePress = useCallback(() => onCreate(workspace), [onCreate, workspace]);
  return (
    <Pressable
      testID={`sidebar-new-thread:${workspace.workspaceKey}`}
      accessibilityRole="button"
      accessibilityLabel={`New thread in ${projectName}`}
      onPress={handlePress}
      style={styles.iconButton}
    >
      <ThemedPlus size={15} uniProps={mutedIconColor} />
    </Pressable>
  );
}

function NewThreadWorkspaceMenuItem({
  workspace,
  onCreate,
}: {
  workspace: SidebarWorkspacePlacement;
  onCreate: (workspace: SidebarWorkspacePlacement) => void;
}) {
  const handleSelect = useCallback(() => onCreate(workspace), [onCreate, workspace]);
  return (
    <DropdownMenuItem
      testID={`sidebar-new-thread:${workspace.workspaceKey}`}
      onSelect={handleSelect}
    >
      New thread in {workspace.name}
    </DropdownMenuItem>
  );
}

function SidebarThreadRow({
  agent,
  onThreadPress,
}: {
  agent: AggregatedAgent;
  onThreadPress?: () => void;
}) {
  const { archiveAgent } = useArchiveAgent();
  const selected = useSessionStore(
    (state) => state.sessions[agent.serverId]?.focusedAgentId === agent.id,
  );
  const ProviderIcon = getProviderIcon(agent.provider, agent.serverId);
  const handleOpen = useCallback(() => {
    onThreadPress?.();
    navigateToAgent({
      serverId: agent.serverId,
      agentId: agent.id,
      workspaceId: agent.workspaceId,
      pin: true,
    });
  }, [agent.id, agent.serverId, agent.workspaceId, onThreadPress]);
  const handleArchive = useCallback(() => {
    void archiveAgent({ serverId: agent.serverId, agentId: agent.id });
  }, [agent.id, agent.serverId, archiveAgent]);
  let statusStyle = styles.statusDotMuted;
  if ((agent.pendingPermissionCount ?? 0) > 0) statusStyle = styles.statusDotAmber;
  else if (agent.status === "running") statusStyle = styles.statusDotBlue;
  const title = agent.title?.trim() || "New thread";
  return (
    <View style={[styles.threadRow, selected && styles.threadRowSelected]}>
      <Pressable
        testID={`sidebar-thread:${agent.serverId}:${agent.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Open thread ${title}`}
        onPress={handleOpen}
        style={styles.threadButton}
      >
        <ProviderIcon size={13} color={styles.providerIcon.color} />
        <View style={[styles.statusDot, statusStyle]} />
        <Text numberOfLines={1} style={styles.threadTitle}>
          {title}
        </Text>
        <Text numberOfLines={1} style={styles.hostLabel}>
          {agent.serverLabel || agent.serverId}
        </Text>
      </Pressable>
      <Pressable
        testID={`sidebar-thread-archive:${agent.serverId}:${agent.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Archive thread ${title}`}
        onPress={handleArchive}
        style={styles.iconButton}
      >
        <ThemedX size={13} uniProps={mutedIconColor} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: { flex: 1 },
  content: { paddingBottom: 16 },
  project: { marginBottom: 4 },
  projectHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 34,
    paddingHorizontal: 12,
  },
  projectTitleButton: { flex: 1, flexDirection: "row", alignItems: "center", gap: 7, minWidth: 0 },
  projectTitle: { flexShrink: 1, fontSize: 13, fontWeight: "600", color: theme.colors.foreground },
  count: { fontSize: 11, color: theme.colors.foregroundMuted },
  threadRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 32,
    paddingLeft: 35,
    paddingRight: 12,
  },
  threadRowSelected: { backgroundColor: theme.colors.surface1 },
  threadButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    minHeight: 32,
  },
  threadTitle: { flexShrink: 1, fontSize: 12, color: theme.colors.foreground },
  hostLabel: { maxWidth: 60, fontSize: 10, color: theme.colors.foregroundMuted },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusDotAmber: { backgroundColor: theme.colors.palette.amber[500] },
  statusDotBlue: { backgroundColor: theme.colors.palette.blue[500] },
  statusDotMuted: { backgroundColor: theme.colors.foregroundMuted },
  providerIcon: { color: theme.colors.foregroundMuted },
  iconButton: { width: 26, height: 26, alignItems: "center", justifyContent: "center" },
}));
