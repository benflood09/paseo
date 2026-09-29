import { describe, expect, it } from "vitest";
import {
  buildLegacyPluginSurfaceRedirectRoute,
  buildPluginSurfaceRoute,
  parsePluginSurfaceRoute,
} from "./routes";

describe("buildPluginSurfaceRoute", () => {
  it("keeps direct surfaces and sidebar contributions in separate route namespaces", () => {
    expect(buildPluginSurfaceRoute("host/one", "review", { kind: "surface", id: "overview" })).toBe(
      "/h/host%2Fone/plugin/review/surface/overview",
    );
    expect(buildPluginSurfaceRoute("host/one", "review", { kind: "sidebar", id: "overview" })).toBe(
      "/h/host%2Fone/plugin/review/sidebar/overview",
    );
  });

  it("redirects legacy plugin surface URLs to their sidebar contribution identity", () => {
    expect(buildLegacyPluginSurfaceRedirectRoute("host/one", "review", "overview/item")).toBe(
      "/h/host%2Fone/plugin/review/sidebar/overview%2Fitem",
    );
  });
});

describe("parsePluginSurfaceRoute", () => {
  it("reads both route namespaces back from the paths buildPluginSurfaceRoute produces", () => {
    expect(
      parsePluginSurfaceRoute(
        buildPluginSurfaceRoute("host/one", "review", { kind: "surface", id: "overview" }),
      ),
    ).toEqual({
      serverId: "host/one",
      pluginId: "review",
      identity: { kind: "surface", id: "overview" },
    });
    expect(parsePluginSurfaceRoute("/h/local/plugin/review/sidebar/item")).toEqual({
      serverId: "local",
      pluginId: "review",
      identity: { kind: "sidebar", id: "item" },
    });
  });

  it("ignores routes that are not plugin screens", () => {
    expect(parsePluginSurfaceRoute("/h/local/workspace/abc")).toBeNull();
    expect(parsePluginSurfaceRoute("/h/local/plugin/review/settings/general")).toBeNull();
  });
});
