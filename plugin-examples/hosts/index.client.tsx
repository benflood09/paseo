import { useCallback } from "react";
import type { PluginClientContext, PluginSidebarItemProps } from "@getpaseo/plugin/client";
import { SidebarRow } from "@getpaseo/plugin/client/ui";
import { Hosts } from "./client/hosts";

function HostsItem({ currentScreen, openScreen }: PluginSidebarItemProps) {
  const open = useCallback(() => openScreen("main"), [openScreen]);
  return <SidebarRow icon="Server" active={currentScreen === "main"} onPress={open} />;
}

export default function contribute(client: PluginClientContext) {
  client.addScreen("main", Hosts);
  client.addSidebarHeaderItem({ id: "hosts", title: "Host agents", Component: HostsItem });
  return () => {};
}
