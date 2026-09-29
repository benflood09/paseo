import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { InstalledPlugin } from "./types";
import { groupPluginSidebarItems } from "./sidebar-groups";

function installed(serverId: string, contributionId = "main"): InstalledPlugin {
  return {
    id: "example",
    cleanup: () => undefined,
    serverId,
    clientBundle: serverId,
    lifetime: new AbortController(),
    queryClient: new QueryClient(),
    settingsScreens: [],
    surfaces: [{ id: "surface", Component: () => null }],
    sidebarItems: {
      header: [{ id: contributionId, title: "Example", Component: () => null }],
      footer: [{ id: "status", title: "Status", Component: () => null }],
    },
    legacySidebarItems: [],
    workspacePanels: [],
    commandCenterItems: [],
    clientSlashCommands: [],
    attachmentSources: [],
    themes: [],
    timelineTransformers: [],
    timelineRenderers: [],
  };
}

describe("groupPluginSidebarItems", () => {
  it("coalesces the same plugin contribution across hosts", () => {
    const groups = groupPluginSidebarItems([installed("host-a"), installed("host-b")], "header");

    expect(groups).toHaveLength(1);
    expect(groups[0]?.targets.map((target) => target.plugin.serverId)).toEqual([
      "host-a",
      "host-b",
    ]);
  });

  it("keeps different contribution ids separate", () => {
    const groups = groupPluginSidebarItems(
      [installed("host-a", "main"), installed("host-b", "settings")],
      "header",
    );

    expect(groups.map((group) => group.key)).toEqual([
      "example/sidebar-header/main",
      "example/sidebar-header/settings",
    ]);
  });

  it("groups only the requested section", () => {
    const groups = groupPluginSidebarItems([installed("host-a")], "footer");

    expect(groups.map((group) => group.key)).toEqual(["example/sidebar-footer/status"]);
  });
});
