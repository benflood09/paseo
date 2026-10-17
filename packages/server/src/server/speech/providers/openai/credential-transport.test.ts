import { existsSync, watch } from "node:fs";
import { readFile } from "node:fs/promises";
import { once } from "node:events";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SpawnOptionsWithoutStdio } from "node:child_process";
import pino from "pino";
import { afterEach, expect, test, vi } from "vitest";
import { CredentialTransport, ManagedSpeechTerminalError } from "./credential-transport.js";
import { OpenAISTT } from "./stt.js";
import { OpenAITTS } from "./tts.js";
import { resolveOpenAiSpeechConfig } from "./config.js";
import { getOpenAiSpeechAvailability, initializeOpenAiSpeechServices } from "./runtime.js";
import { PersistedConfigSchema } from "../../../persisted-config.js";

const directories: string[] = [];

const fixtureChildren = vi.hoisted(() => ({
  scripts: new Set<string>(),
  exited: new Set<string>(),
  closed: new Map<string, Promise<void>>(),
  allClosed: [] as Promise<void>[],
}));

// Windows cannot execute a POSIX shebang. Keep real child I/O and the fixed
// consumer arguments, but run these public script fixtures through Node.
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn(executable: string, args: readonly string[], options: SpawnOptionsWithoutStdio) {
      if (!fixtureChildren.scripts.has(executable)) return actual.spawn(executable, args, options);
      const child = actual.spawn(process.execPath, [executable, ...args], options);
      const closed = new Promise<void>((resolve) => {
        child.once("close", () => {
          fixtureChildren.exited.add(executable);
          resolve();
        });
      });
      fixtureChildren.closed.set(executable, closed);
      fixtureChildren.allClosed.push(closed);
      return child;
    },
  };
});

async function waitForFixtureExit(directory: string): Promise<void> {
  const closed = fixtureChildren.closed.get(join(directory, "launcher"));
  if (!closed) throw new Error("Fixture child was not launched");
  await closed;
}

test("direct SDK TTS normalizes Web audio with a real cancellation signal", async () => {
  const cancelled = vi.fn();
  const fetchAudio: typeof fetch = async () =>
    new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Buffer.from("PCM"));
          controller.close();
        },
        cancel: cancelled,
      }),
    );
  const tts = new OpenAITTS(
    { apiKey: "public-fixture" },
    pino({ level: "silent" }),
    undefined,
    fetchAudio,
  );
  const controller = new AbortController();
  const audio = await tts.synthesizeSpeech("public fixture", controller.signal);
  const chunks: Buffer[] = [];
  for await (const chunk of audio.stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe("PCM");
  controller.abort();
  expect(audio.stream.destroyed).toBe(true);
});
test("direct SDK TTS abort cancels an unread Web response", async () => {
  const cancelled = vi.fn();
  const fetchAudio: typeof fetch = async () =>
    new Response(new ReadableStream<Uint8Array>({ cancel: cancelled }));
  const tts = new OpenAITTS(
    { apiKey: "public-fixture" },
    pino({ level: "silent" }),
    undefined,
    fetchAudio,
  );
  const controller = new AbortController();
  const audio = await tts.synthesizeSpeech("public fixture", controller.signal);
  const closed = once(audio.stream, "close");
  controller.abort();
  await closed;
  expect(audio.stream.destroyed).toBe(true);
  expect(cancelled).toHaveBeenCalledTimes(1);
});

test("direct SDK TTS abort contains an already-errored response cancellation", async () => {
  const messages: string[] = [];
  const logger = pino(
    { level: "debug" },
    {
      write(line) {
        messages.push(JSON.parse(line).msg);
      },
    },
  );
  const cancelled = vi.fn();
  const upstreamAborted = vi.fn();
  const fetchAudio: typeof fetch = async (_input, init) => {
    const sdkSignal = init?.signal;
    if (!sdkSignal) throw new Error("Expected SDK request cancellation signal");
    return new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          sdkSignal.addEventListener(
            "abort",
            () => {
              upstreamAborted();
              controller.error(new Error("public fixture upstream aborted"));
            },
            { once: true },
          );
        },
        cancel: cancelled,
      }),
    );
  };
  const tts = new OpenAITTS({ apiKey: "public-synthetic-fixture" }, logger, undefined, fetchAudio);
  const controller = new AbortController();
  const audio = await tts.synthesizeSpeech("public fixture", controller.signal);
  const closed = once(audio.stream, "close");
  controller.abort();
  await closed;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(upstreamAborted).toHaveBeenCalledTimes(1);
  expect(cancelled).not.toHaveBeenCalled();
  expect(audio.stream.destroyed).toBe(true);
  expect(messages).toContain("Speech response cancellation failed during abort");
});

test("direct SDK TTS abort contains a rejecting response cancellation hook", async () => {
  const messages: string[] = [];
  const logger = pino(
    { level: "debug" },
    {
      write(line) {
        messages.push(JSON.parse(line).msg);
      },
    },
  );
  const cancelled = vi.fn(async () => {
    throw new Error("public fixture cancellation rejected");
  });
  const fetchAudio: typeof fetch = async () =>
    new Response(new ReadableStream<Uint8Array>({ cancel: cancelled }));
  const tts = new OpenAITTS({ apiKey: "public-synthetic-fixture" }, logger, undefined, fetchAudio);
  const controller = new AbortController();
  const audio = await tts.synthesizeSpeech("public fixture", controller.signal);
  const closed = once(audio.stream, "close");
  controller.abort();
  await closed;
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(cancelled).toHaveBeenCalledTimes(1);
  expect(audio.stream.destroyed).toBe(true);
  expect(messages).toContain("Speech response cancellation failed during abort");
});

async function barrier(directory: string, name: string) {
  const watcher = watch(directory);
  try {
    while (!existsSync(join(directory, name))) await once(watcher, "change");
  } finally {
    watcher.close();
  }
}

test("startup TTS abort releases last lease without a terminal latch", async () => {
  const transport = await fixture("withheld-ready");
  const directory = directories[directories.length - 1]!;
  const tts = new OpenAITTS({ apiKey: "managed" }, pino({ level: "silent" }), transport);
  const controller = new AbortController();
  const pending = tts.synthesizeSpeech("public fixture", controller.signal);
  const rejected = expect(pending).rejects.toThrow("Managed speech synthesis failed");
  await barrier(directory, "started");
  controller.abort();
  await rejected;
  await waitForFixtureExit(directory);
  expect(transport.terminalFailure).toBe(false);
  expect((await readFile(join(directory, "started"), "utf8")).trim().split("\n")).toHaveLength(1);
});

test("startup TTS abort preserves retained STT and shared readiness", async () => {
  const transport = await fixture("withheld-ready");
  const directory = directories[directories.length - 1]!;
  const logger = pino({ level: "silent" });
  const session = new OpenAISTT(
    { apiKey: "managed", model: "gpt-4o-transcribe" },
    logger,
    transport,
  ).createSession({ logger });
  await session.connect();
  const transcript = new Promise<string>((resolve, reject) => {
    session.on("transcript", (event) => resolve(event.transcript));
    session.on("error", reject);
  });
  session.appendPcm16(Buffer.alloc(100));
  session.commit();
  const controller = new AbortController();
  const pending = new OpenAITTS({ apiKey: "managed" }, logger, transport).synthesizeSpeech(
    "public fixture",
    controller.signal,
  );
  const rejected = expect(pending).rejects.toThrow("Managed speech synthesis failed");
  await barrier(directory, "started");
  controller.abort();
  await rejected;
  expect(transport.terminalFailure).toBe(false);
  expect(fixtureChildren.exited.has(join(directory, "launcher"))).toBe(false);
  await writeFile(join(directory, "allow-ready"), "public barrier");
  expect(await transcript).toBe("public transcript 1");
  expect((await readFile(join(directory, "started"), "utf8")).trim().split("\n")).toHaveLength(1);
  session.close();
  await waitForFixtureExit(directory);
  expect(transport.terminalFailure).toBe(false);
});

test("accepts 4.8MB canonical PCM without overflowing the validator", async () => {
  const transport = await fixture("large");
  const release = transport.acquire();
  const response = await transport.fetch("https://api.openai.com/v1/audio/speech", request);
  expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.alloc(4_800_000, 7));
  release();
});

test("rejects noncanonical base64 padding bits", async () => {
  const transport = await fixture("invalid-padding");
  const release = transport.acquire();
  await expect(transport.fetch("https://api.openai.com/v1/audio/speech", request)).rejects.toThrow(
    "closed",
  );
  expect(transport.terminalFailure).toBe(true);
  release();
});

test("SDK TTS cancellation releases only its lease and preserves STT", async () => {
  const transport = await fixture("cancel-tts");
  const logger = pino({ level: "silent" });
  const stt = new OpenAISTT({ apiKey: "public", model: "gpt-4o-transcribe" }, logger, transport);
  const session = stt.createSession({ logger });
  await session.connect();
  const tts = new OpenAITTS(
    { apiKey: "public", model: "tts-1", responseFormat: "pcm" },
    logger,
    transport,
  );
  const abort = new AbortController();
  const pending = tts.synthesizeSpeech("cancel me", abort.signal);
  const rejected = expect(pending).rejects.toThrow("Managed speech synthesis failed");
  // A second response is a deterministic barrier proving the owner is ready.
  await transport.fetch("https://api.openai.com/v1/audio/speech", request);
  abort.abort();
  await rejected;
  const transcript = new Promise<string>((resolve, reject) => {
    session.on("transcript", (event) => resolve(event.transcript));
    session.on("error", reject);
  });
  session.appendPcm16(Buffer.alloc(100));
  session.commit();
  expect(await transcript).toMatch(/^public transcript [23]$/);
  session.close();
});

test("closed SDK STT suppresses late completion and cannot reconnect", async () => {
  const transport = await fixture();
  const logger = pino({ level: "silent" });
  const stt = new OpenAISTT({ apiKey: "public" }, logger, transport);
  const session = stt.createSession({ logger });
  const transcript = vi.fn();
  const error = vi.fn();
  session.on("transcript", transcript);
  session.on("error", error);
  await session.connect();
  session.appendPcm16(Buffer.alloc(100));
  session.commit();
  session.close();
  await session.connect();
  session.appendPcm16(Buffer.alloc(100));
  session.commit();
  // Exercise the pending SDK operation's asynchronous cleanup.
  await new Promise<void>((resolve) => setTimeout(resolve, 50));
  expect(transcript).not.toHaveBeenCalled();
  expect(error).not.toHaveBeenCalled();
});

test("managed confidence survives config resolution and runtime construction", async () => {
  const fixtureTransport = await fixture();
  const active = { provider: "openai" as const, explicit: true, enabled: true };
  const providers = {
    dictationStt: active,
    voiceStt: active,
    voiceTts: active,
    voiceTurnDetection: active,
  };
  const config = resolveOpenAiSpeechConfig({
    env: { STT_CONFIDENCE_THRESHOLD: "-1.25" },
    persisted: { providers: { openai: { credentialLauncher: join(directories[0]!, "launcher") } } },
    providers,
  });
  expect(config?.stt?.confidenceThreshold).toBe(-1.25);
  const services = initializeOpenAiSpeechServices({
    providers,
    openaiConfig: config,
    logger: pino({ level: "silent" }),
    existing: {
      sttService: null,
      dictationSttService: null,
      ttsService: null,
      turnDetectionService: null,
    },
  });
  expect(services.sttService).toBeInstanceOf(OpenAISTT);
  if (!(services.sttService instanceof OpenAISTT)) throw new Error("Missing STT");
  const session = services.sttService.createSession({ logger: pino({ level: "silent" }) });
  const result = new Promise<boolean | undefined>((resolve, reject) => {
    session.on("transcript", (event) => resolve(event.isLowConfidence));
    session.on("error", reject);
  });
  await session.connect();
  session.appendPcm16(Buffer.alloc(100));
  session.commit();
  expect(await result).toBe(true);
  session.close();
  fixtureTransport.shutdown();
  services.cleanup?.();
});

test("persisted selector requires an absolute executable path", () => {
  expect(
    PersistedConfigSchema.safeParse({
      version: 1,
      providers: { openai: { credentialLauncher: "relative" } },
    }).success,
  ).toBe(false);
  expect(
    PersistedConfigSchema.safeParse({
      version: 1,
      providers: { openai: { credentialLauncher: "/approved/launcher" } },
    }).success,
  ).toBe(true);
});

test("cancelled late response does not kill another request", async () => {
  const transport = await fixture("late");
  const release = transport.acquire();
  const controller = new AbortController();
  const first = transport.fetch("https://api.openai.com/v1/audio/speech", {
    ...request,
    signal: controller.signal,
  });
  const rejected = expect(first).rejects.toThrow("cancelled");
  expect((await transport.fetch("https://api.openai.com/v1/audio/speech", request)).status).toBe(
    200,
  );
  controller.abort();
  await rejected;
  expect(
    await (await transport.fetch("https://api.openai.com/v1/audio/speech", request)).text(),
  ).toBe("PCM");
  release();
});

test("last lease ends the child context and owner shutdown forbids new leases", async () => {
  const transport = await fixture();
  let release = transport.acquire();
  expect((await transport.fetch("https://api.openai.com/v1/audio/speech", request)).status).toBe(
    200,
  );
  release();
  release = transport.acquire();
  expect((await transport.fetch("https://api.openai.com/v1/audio/speech", request)).status).toBe(
    200,
  );
  transport.shutdown();
  expect(() => transport.acquire()).toThrow("stopped");
  release();
});
const transports: CredentialTransport[] = [];
afterEach(async () => {
  transports.forEach((transport) => transport.close());
  await Promise.all(fixtureChildren.allClosed);
  await Promise.all(
    directories.map((directory) => rm(directory, { recursive: true, force: true })),
  );
  directories.length = 0;
  transports.length = 0;
  fixtureChildren.scripts.clear();
  fixtureChildren.exited.clear();
  fixtureChildren.closed.clear();
  fixtureChildren.allClosed.length = 0;
});

async function fixture(mode = "success") {
  const directory = await mkdtemp(join(tmpdir(), "paseo-speech-public-"));
  directories.push(directory);
  const launcher = join(directory, "launcher");
  await writeFile(
    launcher,
    `#!${process.execPath}
const readline = require('node:readline');
if (JSON.stringify(process.argv.slice(2)) !== JSON.stringify(['exec','paseo-speech-shared','--consumer','paseo-speech'])) process.exit(2);
const fs = require('node:fs');
const directory = ${JSON.stringify(directory)};
const ready = () => process.stdout.write(JSON.stringify({type:'ready',protocol:'paseo-speech-v1'})+'\\n');
if (${JSON.stringify(mode)} === 'withheld-ready') {
 const watcher = fs.watch(directory, () => {
  if (fs.existsSync(directory+'/allow-ready')) { watcher.close(); ready(); }
 });
 fs.appendFileSync(directory+'/started', process.pid+'\\n');
} else ready();
let count=0, held;
readline.createInterface({input:process.stdin}).on('line',line=>{
 const request=JSON.parse(line); count++;
 if (${JSON.stringify(mode)}==='late' && count===1) { held=request; return; }
 if (${JSON.stringify(mode)}==='late' && count===3) process.stdout.write(JSON.stringify({id:held.id,status:200,headers:{'content-type':'audio/pcm'},bodyBase64:'UENN'})+'\\n');
 if ('authorization' in request.headers) process.exit(3);
 const body=Buffer.from(request.bodyBase64,'base64').toString();
 if (${JSON.stringify(mode)}==='cancel-tts' && body.includes('cancel me')) return;
 if (${JSON.stringify(mode)}==='death') process.exit(4);
 if (${JSON.stringify(mode)}==='hang') return;
 if (${JSON.stringify(mode)}==='large' || ${JSON.stringify(mode)}==='invalid-padding') {
   process.stdout.write(JSON.stringify({id:request.id,status:200,headers:{'content-type':'audio/pcm'},bodyBase64:${JSON.stringify(mode)}==='large'?Buffer.alloc(4800000,7).toString('base64'):'UB=='})+'\\n'); return;
 }
 const status=${JSON.stringify(mode)}==='bad-status'?204:${JSON.stringify(mode)}==='auth'?401:200;
 const audio=request.path==='/v1/audio/speech';
 if (audio && !body.includes('tts-1')) process.exit(5);
 if (!audio && (!body.includes('gpt-4o-transcribe') || !body.includes('filename='))) process.exit(6);
 process.stdout.write(JSON.stringify({id:${JSON.stringify(mode)}==='unknown'?'unknown':request.id,status,headers:{'content-type':audio?'audio/pcm':'application/json'},bodyBase64:Buffer.from(status===401?'PRIVATE_PROVIDER_ERROR':audio?'PCM':JSON.stringify({text:'public transcript '+count,logprobs:[{token:'public',logprob:-2,bytes:[]}]})).toString('base64')})+'\\n');
});
`,
  );
  await chmod(launcher, 0o700);
  fixtureChildren.scripts.add(launcher);
  const transport = new CredentialTransport(launcher);
  transports.push(transport);
  return transport;
}

const request = {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: '{"model":"tts-1"}',
};

test("handles the exact SDK probe locally and rejects other origins", async () => {
  const transport = new CredentialTransport("/nonexistent/public-launcher");
  expect((await transport.fetch("data:,")).status).toBe(200);
  await expect(transport.fetch("data:text/plain,other")).rejects.toThrow(
    "Unsupported speech request",
  );
  await expect(transport.fetch("https://example.com/v1/audio/speech", request)).rejects.toThrow(
    "Unsupported speech request",
  );
});

test("actual SDK multipart STT and PCM TTS reuse one child across segments", async () => {
  const transport = await fixture();
  const logger = pino({ level: "silent" });
  const stt = new OpenAISTT(
    { apiKey: "public-marker", model: "gpt-4o-transcribe" },
    logger,
    transport,
  );
  const tts = new OpenAITTS(
    { apiKey: "public-marker", model: "tts-1", voice: "alloy", responseFormat: "pcm" },
    logger,
    transport,
  );
  const session = stt.createSession({ logger });
  await session.connect();
  async function segment() {
    const transcript = new Promise<string>((resolve, reject) => {
      session.on("transcript", (event) => resolve(event.transcript));
      session.on("error", reject);
    });
    session.appendPcm16(Buffer.alloc(100));
    session.commit();
    return transcript;
  }
  expect(await segment()).toBe("public transcript 1");
  const audio = await tts.synthesizeSpeech("Public fixture");
  const chunks: Buffer[] = [];
  for await (const chunk of audio.stream) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks).toString()).toBe("PCM");
  expect(await segment()).toBe("public transcript 3");
  session.close();
});

test.each(["death", "unknown", "bad-status"])(
  "fails pending request on %s without exposing child diagnostics",
  async (mode) => {
    const transport = await fixture(mode);
    const release = transport.acquire();
    await expect(
      transport.fetch("https://api.openai.com/v1/audio/speech", request),
    ).rejects.toThrow("Speech credential transport closed");
    release();
  },
);

test("redacts authentication bodies and never relaunches after auth failure", async () => {
  const transport = await fixture("auth");
  const release = transport.acquire();
  const response = await transport.fetch("https://api.openai.com/v1/audio/speech", request);
  expect(response.status).toBe(401);
  expect(await response.text()).not.toContain("PRIVATE_PROVIDER_ERROR");
  await expect(transport.fetch("https://api.openai.com/v1/audio/speech", request)).rejects.toThrow(
    "unavailable",
  );
  release();
  expect(() => transport.acquire()).toThrow(ManagedSpeechTerminalError);
  const retryRelease = transport.acquire(true);
  expect((await transport.fetch("https://api.openai.com/v1/audio/speech", request)).status).toBe(
    401,
  );
  retryRelease();
});

test("session close fails an in-flight request", async () => {
  const transport = await fixture("hang");
  const release = transport.acquire();
  const controller = new AbortController();
  const pending = transport.fetch("https://api.openai.com/v1/audio/speech", {
    ...request,
    signal: controller.signal,
  });
  controller.abort();
  await expect(pending).rejects.toThrow(/cancelled|closed/);
  release();
});

test("selector resolves without credentials and readiness does not launch", () => {
  const active = { provider: "openai" as const, explicit: true, enabled: true };
  const config = resolveOpenAiSpeechConfig({
    env: {},
    persisted: { providers: { openai: { credentialLauncher: "/missing/approved-launcher" } } },
    providers: {
      dictationStt: active,
      voiceStt: active,
      voiceTts: active,
      voiceTurnDetection: active,
    },
  });
  expect(config).toEqual({
    credentialLauncher: "/missing/approved-launcher",
    stt: { model: "gpt-4o-transcribe" },
    tts: { model: "tts-1", voice: "alloy", responseFormat: "pcm" },
  });
  expect(getOpenAiSpeechAvailability(config)).toEqual({ stt: true, tts: true, dictationStt: true });
});
