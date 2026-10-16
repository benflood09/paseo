import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

function isStrictDescendant(root: string, directory: string): boolean {
  const child = relative(root, directory);
  return (
    child !== "" &&
    child !== ".." &&
    !child.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) &&
    !isAbsolute(child)
  );
}

// Only explicit Local creation with project membership uses this policy.
export async function validateLocalWorkspaceDirectory(
  root: string,
  directory: string
): Promise<void> {
  if (!isStrictDescendant(resolve(root), resolve(directory))) {
    throw new Error("Choose an existing subfolder of the selected project");
  }
  if (!(await stat(directory)).isDirectory()) {
    throw new Error("Workspace must be an existing directory");
  }
  const [realRoot, realDirectory] = await Promise.all([
    realpath(root),
    realpath(directory),
  ]);
  if (!isStrictDescendant(realRoot, realDirectory)) {
    throw new Error(
      "Workspace must resolve to a subfolder of the selected project"
    );
  }
}
