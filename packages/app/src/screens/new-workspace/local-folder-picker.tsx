import React, { useRef, useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { Combobox } from "@/components/ui/combobox";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";

export function LocalFolderPicker({
  client,
  root,
  serverId,
  value,
  onSelect,
  disabled,
}: {
  client: DaemonClient;
  root: string;
  serverId: string;
  value: string;
  onSelect: (path: string) => void;
  disabled: boolean;
}) {
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [directory, setDirectory] = useState("");
  const listing = useQuery({
    queryKey: ["local-workspace-folders", serverId, root, directory],
    queryFn: () => client.listDirectory(root, directory || "."),
    enabled: open && !disabled,
  });
  const options = [
    ...(directory
      ? [
          {
            id: "select",
            label: `Use ${directory}`,
            kind: "directory" as const,
          },
          { id: "up", label: "Parent folder", kind: "directory" as const },
        ]
      : []),
    ...(listing.data?.entries ?? [])
      .filter(
        (entry) =>
          entry.kind === "directory" &&
          !entry.name.startsWith(".") &&
          entry.name !== "node_modules"
      )
      .map((entry) => ({
        id: `browse:${entry.path}`,
        label: entry.name,
        kind: "directory" as const,
      })),
  ];
  return (
    <View>
      <ComboboxTrigger
        ref={anchorRef}
        onPress={() => setOpen(true)}
        disabled={disabled}
        accessibilityLabel="Workspace folder"
        testID="local-workspace-folder-trigger"
      >
        <Text>{value || "Choose existing workspace folder"}</Text>
      </ComboboxTrigger>
      <Combobox
        options={listing.isFetching ? [] : options}
        value=""
        open={open}
        onOpenChange={setOpen}
        anchorRef={anchorRef}
        keepOpenOnSelect
        title={directory || "Workspace folder"}
        emptyText={
          listing.isFetching
            ? "Loading folders"
            : listing.error
            ? "Cannot list folders"
            : "No subfolders"
        }
        onSelect={(id) => {
          if (id === "select") {
            onSelect(directory);
            setOpen(false);
            return;
          }
          setDirectory(
            id === "up"
              ? directory.split("/").slice(0, -1).join("/")
              : id.slice("browse:".length)
          );
          setOpen(true);
        }}
      />
    </View>
  );
}
