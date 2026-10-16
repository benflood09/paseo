export interface CompletionInputState {
  clientId: string;
  inputEpoch: number;
  pendingMessageCount: number;
  stopped: boolean;
  intent?: "sync" | "message" | "stop" | "queue";
}

/** Generations invalidate evaluations before async cancellation or input admission starts. */
export class CompletionAdmission {
  private generation = 0;
  private stopped = false;
  private terminal: { turnId: string; completed: boolean } | undefined;
  private inputs = new Map<string, CompletionInputState>();
  private evaluated = new Set<string>();
  invalidate(): void { this.generation += 1; }
  stop(): void {
    this.stopped = true;
    this.invalidate();
  }
  userInput(): void {
    this.stopped = false;
    for (const [id, input] of this.inputs) this.inputs.set(id, { ...input, stopped: false });
    this.invalidate();
  }
  update(input: CompletionInputState): void {
    const previous = this.inputs.get(input.clientId);
    if (previous && input.inputEpoch <= previous.inputEpoch) {
      if (JSON.stringify(previous) === JSON.stringify(input)) return;
      throw new Error("Stale completion input epoch");
    }
    const stopped = input.intent === "message" ? false : input.intent === "stop" ? true : (previous?.stopped ?? input.stopped);
    this.inputs.set(input.clientId, { ...input, stopped });
    this.invalidate();
  }
  ended(turnId: string, completed: boolean): void {
    this.terminal = { turnId, completed };
    this.invalidate();
  }
  latestCompleted(): string | undefined { return this.terminal?.completed ? this.terminal.turnId : undefined; }
  reserve(turnId: string): { token: number; eventId: string } | undefined {
    if (this.terminal?.turnId !== turnId || !this.terminal.completed || !this.ready()) return;
    const eventId = `paseo:${turnId}`;
    if (this.evaluated.has(eventId)) return;
    this.evaluated.add(eventId);
    // Preserve bounded idempotency across all client reconnects for this manager lifetime.
    if (this.evaluated.size > 256) this.evaluated.delete(this.evaluated.values().next().value!);
    return { token: this.generation, eventId };
  }
  current(token: number, turnId: string): boolean {
    return token === this.generation && this.terminal?.turnId === turnId && this.terminal.completed && this.ready();
  }
  matches(clientId: string, inputEpoch: number): boolean {
    return this.inputs.get(clientId)?.inputEpoch === inputEpoch;
  }
  private ready(): boolean {
    return !this.stopped && this.inputs.size > 0 && [...this.inputs.values()].every((input) => !input.stopped && input.pendingMessageCount === 0);
  }
}
