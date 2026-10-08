import { describe, expect, it } from "vitest";
import { CompletionAdmission } from "./completion-admission.js";

describe("completion admission", () => {
  const input = { clientId: "app", inputEpoch: 1, pendingMessageCount: 0, stopped: false };
  it("requires real completed turn and registered queue state", () => {
    const gate = new CompletionAdmission();
    expect(gate.reserve("t1")).toBeUndefined();
    gate.ended("t1", true);
    expect(gate.reserve("t1")).toBeUndefined();
    gate.update(input);
    expect(gate.reserve("t1")?.eventId).toBe("paseo:t1");
    expect(gate.reserve("t1")).toBeUndefined();
  });
  it("user queue changes invalidate in-flight evaluator before admission", () => {
    const gate = new CompletionAdmission(); gate.update(input); gate.ended("t1", true);
    const reservation = gate.reserve("t1")!;
    gate.update({ ...input, inputEpoch: 2, pendingMessageCount: 1, intent: "queue" });
    expect(gate.current(reservation.token, "t1")).toBe(false);
  });
  it("cancel wins and sync cannot clear stopped state", () => {
    const gate = new CompletionAdmission(); gate.update(input); gate.ended("t1", true);
    const reservation = gate.reserve("t1")!;
    gate.update({ ...input, inputEpoch: 2, stopped: true, intent: "stop" });
    gate.update({ ...input, inputEpoch: 3, intent: "sync" });
    expect(gate.current(reservation.token, "t1")).toBe(false);
    gate.ended("t2", true);
    expect(gate.reserve("t2")).toBeUndefined();
    gate.update({ ...input, inputEpoch: 4, intent: "message" });
    expect(gate.reserve("t2")?.eventId).toBe("paseo:t2");
  });
  it("every client queue holds completion and stale epochs are rejected", () => {
    const gate = new CompletionAdmission(); gate.update(input);
    gate.update({ ...input, clientId: "phone", pendingMessageCount: 1 }); gate.ended("t1", true);
    expect(gate.reserve("t1")).toBeUndefined();
    expect(() => gate.update({ ...input, inputEpoch: 0 })).toThrow("Stale completion input epoch");
    gate.update({ ...input, clientId: "phone", inputEpoch: 2 });
    expect(gate.reserve("t1")?.eventId).toBe("paseo:t1");
  });
  it("canceled/failed terminal events never reserve a continuation", () => {
    const gate = new CompletionAdmission(); gate.update(input); gate.ended("t1", false);
    expect(gate.latestCompleted()).toBeUndefined();
    expect(gate.reserve("t1")).toBeUndefined();
  });
  it("actual new user input clears prior Stop from other clients", () => {
    const gate = new CompletionAdmission(); gate.update(input);
    gate.update({ ...input, clientId: "phone", stopped: true, intent: "stop" });
    gate.ended("t1", true); expect(gate.reserve("t1")).toBeUndefined();
    gate.userInput(); gate.ended("t2", true);
    expect(gate.reserve("t2")?.eventId).toBe("paseo:t2");
  });
  it("idle cancellation before reservation remains stopped across sync and terminal updates", () => {
    const gate = new CompletionAdmission(); gate.update(input); gate.ended("t1", true);
    gate.stop();
    gate.update({ ...input, inputEpoch: 2, intent: "sync" });
    gate.ended("t1", true);
    expect(gate.reserve("t1")).toBeUndefined();
    gate.update({ ...input, inputEpoch: 3, intent: "message" });
    expect(gate.reserve("t1")).toBeUndefined();
    gate.userInput(); gate.ended("t2", true);
    expect(gate.reserve("t2")?.eventId).toBe("paseo:t2");
  });
});
