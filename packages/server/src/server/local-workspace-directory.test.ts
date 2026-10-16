import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { validateLocalWorkspaceDirectory } from "./local-workspace-directory.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

test("explicit Local accepts existing nested folder, without creating anything", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-workspace-"));
  roots.push(root);
  const child = join(root, "venture", "meaningful");
  await mkdir(child, { recursive: true });
  await expect(
    validateLocalWorkspaceDirectory(root, child)
  ).resolves.toBeUndefined();
});

test("explicit Local rejects root, parent, prefix sibling, missing folder and file", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-workspace-"));
  roots.push(root);
  const file = join(root, "file");
  await writeFile(file, "test");
  for (const directory of [
    root,
    join(root, ".."),
    `${root}-sibling`,
    join(root, "missing"),
    file,
  ]) {
    await expect(
      validateLocalWorkspaceDirectory(root, directory)
    ).rejects.toThrow();
  }
});

test("explicit Local rejects symlink escape and alias to project root", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-workspace-"));
  roots.push(root);
  const project = join(root, "project");
  const outside = join(root, "outside");
  await mkdir(project);
  await mkdir(outside);
  await symlink(outside, join(project, "escape"));
  await symlink(project, join(project, "self"));
  await expect(
    validateLocalWorkspaceDirectory(project, join(project, "escape"))
  ).rejects.toThrow("resolve");
  await expect(
    validateLocalWorkspaceDirectory(project, join(project, "self"))
  ).rejects.toThrow("resolve");
});

test("explicit Local accepts descendants when selected project root itself is a symlink", async () => {
  const root = await mkdtemp(join(tmpdir(), "local-workspace-"));
  roots.push(root);
  await mkdir(join(root, "actual", "child"), { recursive: true });
  await symlink(join(root, "actual"), join(root, "project"));
  await expect(
    validateLocalWorkspaceDirectory(
      join(root, "project"),
      join(root, "project", "child")
    )
  ).resolves.toBeUndefined();
});
