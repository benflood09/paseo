import { expect, test, vi } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { AgentManager } from "./agent-manager.js";
import { createTestAgentClient } from "../test-utils/fake-agent-client.js";
import { createTestLogger } from "../../test-utils/test-logger.js";
import type { CompletionDecision } from "./completion-evaluator.js";

const queue = (epoch: number, count = 0) => ({ clientId: "desktop", inputEpoch: epoch, pendingMessageCount: count, stopped: false });
const setup = async (provider: string, evaluator: (input: { session_id: string; event_id: string; owner: "native" | "paseo" }) => Promise<CompletionDecision>, holdCompletion = false) => {
  const prompts: unknown[] = [];
  let releaseCompletion = () => {};
  const client = createTestAgentClient(provider, { onStartTurn: (prompt) => prompts.push(prompt) });
  if (holdCompletion) {
    const create = client.createSession.bind(client);
    client.createSession = async (...args) => {
      const session = await create(...args);
      const subscribe = session.subscribe.bind(session);
      session.subscribe = (listener) => subscribe((event) => {
        if (event.type === "turn_completed") releaseCompletion = () => listener(event);
        else listener(event);
      });
      return session;
    };
  }
  const manager = new AgentManager({
    clients: { [provider]: client },
    completionEvaluator: evaluator, logger: createTestLogger(),
  });
  const agent = await manager.createAgent({ provider, cwd: mkdtempSync(join(tmpdir(), "completion-manager-")) }, undefined, { workspaceId: undefined });
  return { manager, agent, prompts, releaseCompletion: () => releaseCompletion() };
};

test("ACP completes -> evidence guard -> same provider session continuation; queue holds first", async () => {
  const evaluate = vi.fn().mockResolvedValueOnce({ action: "continue", reason: "SOMA_COMPLETION_CONTINUE: finish evidence" })
    .mockResolvedValue({ action: "allow", reason: "evidence verified" });
  const { manager, agent, prompts } = await setup("hermes", evaluate);
  manager.updateCompletionInputState(agent.id, queue(1, 1));
  await manager.runAgent(agent.id, "hello"); await manager.flush();
  expect(evaluate).toHaveBeenCalledTimes(0);
  manager.updateCompletionInputState(agent.id, queue(2)); await manager.flush();
  expect(prompts).toEqual(["hello", "SOMA_COMPLETION_CONTINUE: finish evidence"]);
  expect(evaluate).toHaveBeenCalledTimes(2);
  expect(evaluate.mock.calls[0][0].session_id).toBe(evaluate.mock.calls[1][0].session_id);
});

test("user cancellation while evaluator awaits wins before same-session prompt", async () => {
  let resolve!: (value: CompletionDecision) => void;
  let started!: () => void;
  const entered = new Promise<void>((r) => { started = r; });
  const evaluator = vi.fn(() => { started(); return new Promise<CompletionDecision>((r) => { resolve = r; }); });
  const { manager, agent, prompts } = await setup("hermes", evaluator);
  manager.updateCompletionInputState(agent.id, queue(1, 1));
  await manager.runAgent(agent.id, "hello"); await manager.flush();
  manager.updateCompletionInputState(agent.id, queue(2)); await entered;
  await manager.cancelAgentRun(agent.id);
  resolve({ action: "continue", reason: "SOMA_COMPLETION_CONTINUE: finish" });
  await manager.flush();
  expect(prompts).toEqual(["hello"]);
});

test("cancel idle completed turn before deferred reservation cannot restart despite absent Stop mirror", async () => {
  const evaluator = vi.fn().mockResolvedValue({ action: "continue", reason: "SOMA_COMPLETION_CONTINUE: finish" });
  const { manager, agent, prompts } = await setup("hermes", evaluator);
  manager.updateCompletionInputState(agent.id, queue(1, 1));
  await manager.runAgent(agent.id, "hello"); await manager.flush();
  // Queue mirror resumes readiness and schedules evaluation; cancel enters before that task reserves.
  manager.updateCompletionInputState(agent.id, queue(2));
  expect(await manager.cancelAgentRun(agent.id)).toEqual({ status: "not_running" });
  manager.updateCompletionInputState(agent.id, { ...queue(3), intent: "sync" });
  await manager.flush();
  expect(evaluator).toHaveBeenCalledTimes(0);
  expect(prompts).toEqual(["hello"]);
});

test("native Codex owner never enters daemon evaluator or creates continuation", async () => {
  const evaluator = vi.fn().mockResolvedValue({ action: "continue", reason: "continue" });
  const { manager, agent, prompts } = await setup("codex", evaluator);
  manager.updateCompletionInputState(agent.id, queue(1));
  await manager.runAgent(agent.id, "hello"); await manager.flush();
  expect(evaluator).toHaveBeenCalledTimes(0);
  expect(prompts).toEqual(["hello"]);
  expect(await manager.evaluateTaskCompletion({ agentId: agent.id, turnId: "unused", owner: "native" })).toEqual({ action: "allow", reason: "Native harness owns completion" });
});

test("failed user generation hook releases pending run; next send succeeds", async () => {
  const evaluator = vi.fn().mockResolvedValue({ action: "allow", reason: "done" });
  const { manager, agent, prompts } = await setup("hermes", evaluator);
  vi.stubEnv("SOMA_COMPLETION_EVALUATOR", "/nonexistent/soma-task-completion");
  try {
    await expect(manager.runAgent(agent.id, "first")).rejects.toThrow("Completion evaluator failed");
  } finally { vi.unstubAllEnvs(); }
  await manager.runAgent(agent.id, "next"); await manager.flush();
  expect(prompts).toEqual(["next"]);
});

test.runIf(Boolean(process.env.SOMA_COMPLETION_INTEGRATION_EXECUTABLE))("real core bridge advances generation on accepted ACP steer", async () => {
  const executable = process.env.SOMA_COMPLETION_INTEGRATION_EXECUTABLE!;
  const home = mkdtempSync(join(tmpdir(), "completion-steer-core-"));
  vi.stubEnv("SOMA_COMPLETION_EVALUATOR", executable);
  vi.stubEnv("SOMA_COMPLETION_HOME", home);
  try {
    const { manager, agent, releaseCompletion } = await setup("hermes", async () => ({ action: "wait", reason: "waiting" }), true);
    const running = manager.runAgent(agent.id, "sleep");
    await manager.waitForAgentRunStart(agent.id);
    const live = manager.getAgent(agent.id)!;
    if (!live.session) throw new Error("No provider session");
    const steer = vi.fn().mockResolvedValue({ status: "accepted" });
    live.session.steerActiveTurn = steer;
    expect(await manager.steerAgentRun(agent.id, "new authorized scope")).toEqual({ status: "accepted" });
    expect(steer.mock.calls[0][0]).toContain("generation=2");
    expect(steer.mock.calls[0][0]).toContain('owner:"paseo"');
    const sid = live.persistence?.sessionId ?? live.runtimeInfo?.sessionId;
    const state = spawnSync(executable, ["status"], { input: JSON.stringify({ session_id: sid }), encoding: "utf8",
      env: { PATH: process.env.PATH, HOME: process.env.HOME, SOMA_COMPLETION_HOME: home } });
    expect(state.status).toBe(0);
    expect(JSON.parse(state.stdout).generation).toBe(2);
    releaseCompletion(); await running; await manager.flush();
  } finally { vi.unstubAllEnvs(); }
});
