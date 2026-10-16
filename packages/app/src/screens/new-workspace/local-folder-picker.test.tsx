// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, test, vi } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { LocalFolderPicker } from "./local-folder-picker";

vi.mock("react-native", () => ({ View: "div", Text: "span" }));
vi.mock("@/components/ui/combobox-trigger", () => ({
  ComboboxTrigger: ({ children, onPress, disabled }: any) => (
    <button disabled={disabled} onClick={onPress}>
      {children}
    </button>
  ),
}));
vi.mock("@/components/ui/combobox", () => ({
  Combobox: ({ options, onSelect, open, emptyText }: any) =>
    open ? (
      <div>
        {emptyText}
        {options.map((option: any) => (
          <button key={option.id} onClick={() => onSelect(option.id)}>
            {option.label}
          </button>
        ))}
      </div>
    ) : null,
}));

test("Local picker browses nested existing folders, hides internals, and requires explicit Use", async () => {
  const entry = (name: string, path = name, kind = "directory") => ({
    name,
    path,
    kind,
  });
  const listDirectory = vi.fn(async (_root: string, path: string) => ({
    path,
    entries:
      path === "."
        ? [
            entry("code"),
            entry(".git"),
            entry("node_modules"),
            entry("file", "file", "file"),
          ]
        : path === "code"
        ? [entry("app", "code/app")]
        : [],
  }));
  const onSelect = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <LocalFolderPicker
        client={{ listDirectory } as unknown as DaemonClient}
        root="/venture"
        serverId="host"
        value=""
        onSelect={onSelect}
        disabled={false}
      />
    </QueryClientProvider>
  );
  fireEvent.click(screen.getByText("Choose existing workspace folder"));
  fireEvent.click(await screen.findByText("code"));
  expect(onSelect).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByText("app"));
  await waitFor(() =>
    expect(listDirectory).toHaveBeenCalledWith("/venture", "code/app")
  );
  fireEvent.click(await screen.findByText("Parent folder"));
  await screen.findByText("Use code");
  fireEvent.click(screen.getByText("Parent folder"));
  await screen.findByText("code");
  expect(screen.queryByText(".git")).toBeNull();
  expect(screen.queryByText("node_modules")).toBeNull();
  expect(screen.queryByText("file")).toBeNull();
  expect(screen.queryByText(/^Use /)).toBeNull();
  fireEvent.click(screen.getByText("code"));
  fireEvent.click(await screen.findByText("Use code"));
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("code");
});
