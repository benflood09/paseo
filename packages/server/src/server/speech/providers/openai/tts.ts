import type pino from "pino";
import { OpenAI } from "openai";
import { Readable } from "node:stream";
import { ManagedSpeechTerminalError, type CredentialTransport } from "./credential-transport.js";
import type { SpeechStreamResult, TextToSpeechProvider } from "../../speech-provider.js";

export type { SpeechStreamResult };

export interface TTSConfig {
  apiKey: string;
  baseUrl?: string;
  model?: "tts-1" | "tts-1-hd";
  voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
  responseFormat?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
}

export class OpenAITTS implements TextToSpeechProvider {
  private readonly openaiClient: OpenAI;
  private readonly config: TTSConfig;
  private readonly logger: pino.Logger;

  constructor(
    ttsConfig: TTSConfig,
    parentLogger: pino.Logger,
    private readonly transport?: CredentialTransport,
    fetch?: typeof globalThis.fetch,
  ) {
    this.config = {
      model: "tts-1",
      voice: "alloy",
      responseFormat: "pcm",
      ...ttsConfig,
    };
    this.logger = parentLogger.child({ module: "agent", provider: "openai", component: "tts" });
    this.openaiClient = new OpenAI({
      fetch: transport?.fetch ?? fetch,
      ...(transport ? { maxRetries: 0 } : {}),
      apiKey: ttsConfig.apiKey,
      ...(ttsConfig.baseUrl ? { baseURL: ttsConfig.baseUrl } : {}),
    });

    this.logger.info(
      { voice: this.config.voice, model: this.config.model, format: this.config.responseFormat },
      "TTS (OpenAI) initialized",
    );
  }

  public getConfig(): TTSConfig {
    return this.config;
  }

  public async synthesizeSpeech(text: string, signal?: AbortSignal): Promise<SpeechStreamResult> {
    if (!text || text.trim().length === 0) {
      throw new Error("Cannot synthesize empty text");
    }

    signal?.throwIfAborted();
    const startTime = Date.now();
    const release = this.transport?.acquire();

    try {
      this.logger.debug(
        { textLength: text.length, preview: text.substring(0, 50) },
        "Synthesizing speech",
      );

      const response = await this.openaiClient.audio.speech.create(
        {
          model: this.config.model!,
          voice: this.config.voice!,
          input: text,
          response_format: this.config.responseFormat as
            | "mp3"
            | "opus"
            | "aac"
            | "flac"
            | "wav"
            | "pcm",
        },
        { signal },
      );

      const body = response.body;
      if (!body) throw new Error("Missing speech response body");
      const reader = body instanceof Readable ? null : body.getReader();
      const audioStream =
        body instanceof Readable
          ? body
          : Readable.from(
              (async function* () {
                if (!reader) return;
                try {
                  while (true) {
                    const { value, done } = await reader.read();
                    if (done) return;
                    yield Buffer.from(value);
                  }
                } finally {
                  await reader.cancel();
                }
              })(),
            );
      const abort = () => {
        void reader?.cancel().catch(() => {
          this.logger.debug("Speech response cancellation failed during abort");
        });
        audioStream.destroy();
        release?.();
      };
      const cleanup = () => {
        signal?.removeEventListener("abort", abort);
        release?.();
      };
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
      if (this.transport || signal) {
        audioStream.once("close", cleanup);
        audioStream.once("end", cleanup);
        audioStream.once("error", cleanup);
      }

      const duration = Date.now() - startTime;
      this.logger.debug({ duration }, "Speech synthesis stream ready");

      return {
        stream: audioStream,
        format: this.config.responseFormat || "mp3",
      };
    } catch (error) {
      release?.();
      // Provider/SDK errors can contain credential-owner response bodies.
      // eslint-disable-next-line preserve-caught-error
      if (this.transport) {
        if (this.transport.terminalFailure) throw new ManagedSpeechTerminalError();
        // eslint-disable-next-line preserve-caught-error -- owner errors must not escape via cause
        throw new Error("Managed speech synthesis failed");
      }
      this.logger.error({ err: error }, "Speech synthesis error");
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`TTS synthesis failed: ${message}`, { cause: error });
    }
  }
}
