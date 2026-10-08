import { spawn } from "node:child_process";
import { isAbsolute, join } from "node:path";

export type CompletionDecision = {
  action: "continue" | "allow" | "wait" | "incomplete";
  reason: string;
};
export type CompletionEvaluator = (request: {
  session_id: string;
  event_id: string;
  owner: "native" | "paseo";
  cwd?: string;
}) => Promise<CompletionDecision>;

/** One bounded, credential-free child per evaluation; never launch a shell. */
export function configuredCompletionEvaluator(): CompletionEvaluator | undefined {
  const executable = process.env.SOMA_COMPLETION_EVALUATOR;
  if (!executable || !isAbsolute(executable)) return undefined;
  return async (request) => {
    const result = await runCompletionCommand(executable, "evaluate", request, request.cwd ? completionHome(request.cwd) : undefined);
    if (!result || !["continue", "allow", "wait", "incomplete"].includes(String(result.action)) ||
        typeof result.reason !== "string") throw new Error("Invalid completion decision");
    return result as CompletionDecision;
  };
}

export function completionHome(cwd: string): string {
  return process.env.SOMA_COMPLETION_HOME ?? join(cwd, ".soma", "task-completion");
}

export function runCompletionCommand(
  executable: string,
  operation: "evaluate" | "hook",
  request: Record<string, unknown>,
  home?: string,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const env: NodeJS.ProcessEnv = {};
    for (const key of ["PATH", "HOME", "SOMA_COMPLETION_HOME"]) {
      if (process.env[key]) env[key] = process.env[key];
    }
    if (home) env.SOMA_COMPLETION_HOME = home;
    const child = spawn(executable, [operation], { env, stdio: ["pipe", "pipe", "ignore"] });
    let output = "";
    let settled = false;
    const fail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      reject(new Error("Completion evaluator failed"));
    };
    const timer = setTimeout(fail, 5000);
    child.on("error", fail);
    child.stdin.on("error", fail);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      if (output.length > 65536) fail();
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) { fail(); return; }
      clearTimeout(timer);
      settled = true;
      try { resolve(JSON.parse(output)); } catch { reject(new Error("Invalid completion response")); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}
