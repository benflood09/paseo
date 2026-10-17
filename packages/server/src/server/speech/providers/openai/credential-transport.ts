import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { isAbsolute } from "node:path";
import { z } from "zod";

export class ManagedSpeechTerminalError extends Error {
  constructor() {
    super("Managed speech unavailable; start a new speech session to retry");
    this.name = "ManagedSpeechTerminalError";
  }
}

const MAX_BODY = 25 * 1024 * 1024;
const MAX_LINE = Math.ceil(MAX_BODY / 3) * 4 + 4096;
const responseSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9-]{1,64}$/),
    status: z.number().int().min(200).max(599),
    headers: z
      .object({
        "content-type": z
          .string()
          .min(1)
          .max(256)
          .regex(/^[\x20-\x7e]+$/),
      })
      .strict(),
    bodyBase64: z
      .string()
      .max(Math.ceil(MAX_BODY / 3) * 4)
      .refine((value) => value.length % 4 === 0 && !/[^A-Za-z0-9+/=]/.test(value)),
  })
  .strict();
const readySchema = z
  .object({ type: z.literal("ready"), protocol: z.literal("paseo-speech-v1") })
  .strict();

interface Pending {
  path: string;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
}

/** One attached owner is retained only while speech sessions/tasks hold leases. */
export class CredentialTransport {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string, Pending>();
  private cancelled = new Set<string>();
  private leases = 0;
  private failed = false;
  private disposed = false;
  private ready: Promise<void> | null = null;
  private rejectReady: ((error: Error) => void) | null = null;

  constructor(private readonly launcher: string) {
    if (!isAbsolute(launcher)) throw new Error("Speech credential launcher must be absolute");
  }

  get terminalFailure(): boolean {
    return this.failed;
  }

  acquire(newUserSession = false): () => void {
    if (this.disposed) throw new Error("Speech credential transport stopped");
    if (newUserSession && this.leases === 0) this.failed = false;
    if (this.failed) throw new ManagedSpeechTerminalError();
    this.leases++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.leases--;
      if (this.leases === 0) this.close();
    };
  }

  close(): void {
    const child = this.child;
    this.child = null;
    this.rejectReady?.(new Error("Speech credential transport closed"));
    this.rejectReady = null;
    this.ready = null;
    for (const request of this.pending.values())
      request.reject(new Error("Speech credential transport closed"));
    this.pending.clear();
    this.cancelled.clear();
    if (child) {
      child.stdin.end();
      child.kill("SIGTERM");
      const killTimer = setTimeout(() => child.kill("SIGKILL"), 1000);
      killTimer.unref();
      child.once("close", () => clearTimeout(killTimer));
    }
  }

  shutdown(): void {
    this.disposed = true;
    this.close();
  }

  private die(): void {
    this.failed = true;
    this.close();
  }

  private start(): Promise<void> {
    if (this.disposed || this.leases === 0)
      return Promise.reject(new Error("No active speech session"));
    if (this.failed) return Promise.reject(new Error("Speech credential transport unavailable"));
    if (this.ready) return this.ready;
    const child = spawn(
      this.launcher,
      ["exec", "paseo-speech-shared", "--consumer", "paseo-speech"],
      {
        shell: false,
        stdio: ["pipe", "pipe", "pipe"],
        // Do not propagate provider credentials or coding-agent environment.
        env: { PATH: process.env.PATH, HOME: process.env.HOME, USER: process.env.USER },
      },
    );
    this.child = child;
    this.ready = new Promise<void>((resolve, reject) => {
      this.rejectReady = reject;
      let ready = false;
      let buffer = Buffer.alloc(0);
      const timer = setTimeout(() => this.die(), 15000);
      timer.unref();
      child.once("close", () => clearTimeout(timer));
      child.stdout.on("data", (chunk: Buffer) => {
        if (this.child !== child) return;
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.includes(10)) {
          const end = buffer.indexOf(10);
          if (end > MAX_LINE) {
            this.die();
            return;
          }
          const line = buffer.subarray(0, end).toString("utf8");
          buffer = buffer.subarray(end + 1);
          try {
            const value: unknown = JSON.parse(line);
            if (!ready) {
              readySchema.parse(value);
              ready = true;
              clearTimeout(timer);
              this.rejectReady = null;
              resolve();
              continue;
            }
            const response = responseSchema.parse(value);
            const pending = this.pending.get(response.id);
            if (this.cancelled.delete(response.id)) continue;
            if (!pending) throw new Error("Unknown response");
            const body = Buffer.from(response.bodyBase64, "base64");
            if (body.length > MAX_BODY || body.toString("base64") !== response.bodyBase64)
              throw new Error("Invalid body");
            if (response.status < 300) {
              const contentType = response.headers["content-type"];
              const validType =
                pending.path === "/v1/audio/transcriptions"
                  ? /^application\/json(?:; charset=utf-8)?$/i.test(contentType)
                  : /^(audio\/pcm|application\/octet-stream)$/.test(contentType);
              if (response.status !== 200 || !validType) throw new Error("Invalid speech response");
            }
            this.pending.delete(response.id);
            if (response.status >= 300) {
              // Never expose provider error bodies or headers to the SDK/logger.
              pending.resolve(
                new Response('{"error":{"message":"Speech provider request failed"}}', {
                  status: response.status,
                  headers: { "content-type": "application/json" },
                }),
              );
              if (response.status === 401 || response.status === 403) this.die();
            } else {
              pending.resolve(
                new Response(body, { status: response.status, headers: response.headers }),
              );
            }
          } catch {
            this.die();
            return;
          }
        }
        if (buffer.length > MAX_LINE) this.die();
      });
      child.stdout.once("end", () => {
        if (this.child === child) this.die();
      });
      child.stderr.resume(); // Deliberately discard untrusted diagnostic output.
      child.on("error", () => {
        if (this.child === child) this.die();
      });
      child.stdin.on("error", () => {
        if (this.child === child) this.die();
      });
      child.once("exit", () => {
        if (this.child === child) this.die();
      });
    });
    return this.ready;
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    if (request.url === "data:," && request.method === "GET") return new Response(null);
    const url = new URL(request.url);
    if (
      url.origin !== "https://api.openai.com" ||
      [url.search, url.hash, url.username, url.password].some(Boolean) ||
      request.method !== "POST" ||
      !["/v1/audio/transcriptions", "/v1/audio/speech"].includes(url.pathname)
    )
      throw new Error("Unsupported speech request");
    const contentType = request.headers.get("content-type");
    if (
      !contentType ||
      contentType.length > 256 ||
      !/^(application\/json|multipart\/form-data; boundary=[\x20-\x7e]+)$/.test(contentType)
    )
      throw new Error("Unsupported speech content type");
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > MAX_BODY) throw new Error("Speech request too large");
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
      }
    }
    if (request.signal.aborted) throw new Error("Speech request cancelled");
    let abortReady: () => void = () => {};
    const cancelledReady = new Promise<never>((_, reject) => {
      abortReady = () => reject(new Error("Speech request cancelled"));
      request.signal.addEventListener("abort", abortReady, { once: true });
      if (request.signal.aborted) abortReady();
    });
    try {
      await Promise.race([this.start(), cancelledReady]);
    } finally {
      request.signal.removeEventListener("abort", abortReady);
    }
    if (request.signal.aborted) {
      throw new Error("Speech request cancelled");
    }
    if (this.pending.size >= 8) throw new Error("Too many speech requests");
    const id = randomUUID();
    const timer = setTimeout(() => this.die(), 120000);
    timer.unref();
    const abort = () => {
      const pending = this.pending.get(id);
      if (!pending) return;
      this.pending.delete(id);
      this.cancelled.add(id);
      pending.reject(new Error("Speech request cancelled"));
      if (this.cancelled.size > 64) this.die();
    };
    request.signal.addEventListener("abort", abort, { once: true });
    try {
      return await new Promise<Response>((resolve, reject) => {
        if (!this.child || this.failed) {
          reject(new Error("Speech credential transport unavailable"));
          return;
        }
        this.pending.set(id, { resolve, reject, path: url.pathname });
        this.child.stdin.write(
          JSON.stringify({
            id,
            method: "POST",
            path: url.pathname,
            headers: { "content-type": contentType },
            bodyBase64: Buffer.concat(chunks).toString("base64"),
          }) + "\n",
        );
      });
    } finally {
      clearTimeout(timer);
      request.signal.removeEventListener("abort", abort);
    }
  };
}
