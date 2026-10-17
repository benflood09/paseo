import type { Logger } from "pino";

import type { SpeechToTextProvider, TextToSpeechProvider } from "../../speech-provider.js";
import type { RequestedSpeechProviders } from "../../speech-types.js";
import type { TurnDetectionProvider } from "../../turn-detection-provider.js";
import { DEFAULT_OPENAI_TTS_MODEL, type OpenAiSpeechProviderConfig } from "./config.js";
import { OpenAISTT } from "./stt.js";
import { OpenAITTS } from "./tts.js";
import { CredentialTransport } from "./credential-transport.js";

interface OpenAiCredentialState {
  openaiSttApiKey: string | undefined;
  openaiTtsApiKey: string | undefined;
  openaiDictationApiKey: string | undefined;
}

export interface OpenAiSpeechAvailability {
  stt: boolean;
  tts: boolean;
  dictationStt: boolean;
}

export interface SpeechServices {
  cleanup?: () => void;
  turnDetectionService: TurnDetectionProvider | null;
  sttService: SpeechToTextProvider | null;
  ttsService: TextToSpeechProvider | null;
  dictationSttService: SpeechToTextProvider | null;
}

function resolveOpenAiCredentials(
  openaiConfig: OpenAiSpeechProviderConfig | undefined,
): OpenAiCredentialState {
  const sttApiKey = openaiConfig?.stt?.apiKey;
  return {
    openaiSttApiKey: sttApiKey,
    openaiTtsApiKey: openaiConfig?.tts?.apiKey,
    openaiDictationApiKey: sttApiKey,
  };
}

export function getOpenAiSpeechAvailability(
  openaiConfig: OpenAiSpeechProviderConfig | undefined,
): OpenAiSpeechAvailability {
  if (openaiConfig?.credentialLauncher) return { stt: true, tts: true, dictationStt: true };
  const credentials = resolveOpenAiCredentials(openaiConfig);
  return {
    stt: Boolean(credentials.openaiSttApiKey),
    tts: Boolean(credentials.openaiTtsApiKey),
    dictationStt: Boolean(credentials.openaiDictationApiKey),
  };
}

export function validateOpenAiCredentialRequirements(params: {
  providers: RequestedSpeechProviders;
  openaiConfig: OpenAiSpeechProviderConfig | undefined;
  logger: Logger;
}): void {
  const { providers, logger, openaiConfig } = params;
  if (openaiConfig?.credentialLauncher) return;
  const openAiCredentials = resolveOpenAiCredentials(openaiConfig);

  const missingOpenAiCredentialsFor: string[] = [];
  if (
    providers.voiceStt.enabled !== false &&
    providers.voiceStt.provider === "openai" &&
    !openAiCredentials.openaiSttApiKey
  ) {
    missingOpenAiCredentialsFor.push("voice.stt");
  }
  if (
    providers.voiceTts.enabled !== false &&
    providers.voiceTts.provider === "openai" &&
    !openAiCredentials.openaiTtsApiKey
  ) {
    missingOpenAiCredentialsFor.push("voice.tts");
  }
  if (
    providers.dictationStt.enabled !== false &&
    providers.dictationStt.provider === "openai" &&
    !openAiCredentials.openaiDictationApiKey
  ) {
    missingOpenAiCredentialsFor.push("dictation.stt");
  }

  if (missingOpenAiCredentialsFor.length > 0) {
    logger.warn(
      {
        requestedProviders: {
          dictationStt: providers.dictationStt.provider,
          voiceStt: providers.voiceStt.provider,
          voiceTts: providers.voiceTts.provider,
        },
        missingOpenAiCredentialsFor,
      },
      "Invalid speech configuration: OpenAI provider selected but credentials are missing — speech features will be unavailable",
    );
  }
}

function createOpenAiStt(
  apiKey: string,
  openaiConfig: OpenAiSpeechProviderConfig | undefined,
  logger: Logger,
): SpeechToTextProvider {
  const { apiKey: _sttApiKey, ...sttConfig } = openaiConfig?.stt ?? {};
  return new OpenAISTT({ apiKey, ...sttConfig }, logger);
}

function createOpenAiTts(
  apiKey: string,
  openaiConfig: OpenAiSpeechProviderConfig | undefined,
  logger: Logger,
): TextToSpeechProvider {
  const { apiKey: _ttsApiKey, ...ttsConfig } = openaiConfig?.tts ?? {};
  return new OpenAITTS(
    {
      apiKey,
      voice: "alloy",
      model: DEFAULT_OPENAI_TTS_MODEL,
      responseFormat: "pcm",
      ...ttsConfig,
    },
    logger,
  );
}

export function initializeOpenAiSpeechServices(params: {
  providers: RequestedSpeechProviders;
  openaiConfig: OpenAiSpeechProviderConfig | undefined;
  existing: SpeechServices;
  logger: Logger;
}): SpeechServices {
  const { providers, openaiConfig, existing, logger } = params;
  if (openaiConfig?.credentialLauncher) {
    const transport = new CredentialTransport(openaiConfig.credentialLauncher);
    const stt = new OpenAISTT(
      {
        apiKey: "paseo-public-speech-marker",
        model: "gpt-4o-transcribe",
        confidenceThreshold: openaiConfig.stt?.confidenceThreshold,
      },
      logger,
      transport,
    );
    const tts = new OpenAITTS(
      {
        apiKey: "paseo-public-speech-marker",
        model: "tts-1",
        voice: "alloy",
        responseFormat: "pcm",
      },
      logger,
      transport,
    );
    return {
      ...existing,
      sttService:
        providers.voiceStt.enabled !== false && providers.voiceStt.provider === "openai"
          ? stt
          : existing.sttService,
      dictationSttService:
        providers.dictationStt.enabled !== false && providers.dictationStt.provider === "openai"
          ? stt
          : existing.dictationSttService,
      ttsService:
        providers.voiceTts.enabled !== false && providers.voiceTts.provider === "openai"
          ? tts
          : existing.ttsService,
      cleanup: () => transport.shutdown(),
    };
  }
  return initializeDirectOpenAiSpeechServices(params);
}

function initializeDirectOpenAiSpeechServices(params: {
  providers: RequestedSpeechProviders;
  openaiConfig: OpenAiSpeechProviderConfig | undefined;
  existing: SpeechServices;
  logger: Logger;
}): SpeechServices {
  const { providers, openaiConfig, existing, logger } = params;
  const openAiCredentials = resolveOpenAiCredentials(openaiConfig);

  let sttService = existing.sttService;
  let ttsService = existing.ttsService;
  let dictationSttService = existing.dictationSttService;
  const turnDetectionService = existing.turnDetectionService;

  const needsOpenAiStt =
    !sttService && providers.voiceStt.enabled !== false && providers.voiceStt.provider === "openai";
  const needsOpenAiTts =
    !ttsService && providers.voiceTts.enabled !== false && providers.voiceTts.provider === "openai";
  const needsOpenAiDictation =
    !dictationSttService &&
    providers.dictationStt.enabled !== false &&
    providers.dictationStt.provider === "openai";

  const needsAnyOpenAi = needsOpenAiStt || needsOpenAiTts || needsOpenAiDictation;
  const hasAnyOpenAiCredential =
    Boolean(openAiCredentials.openaiSttApiKey) ||
    Boolean(openAiCredentials.openaiTtsApiKey) ||
    Boolean(openAiCredentials.openaiDictationApiKey);

  if (needsAnyOpenAi && hasAnyOpenAiCredential) {
    logger.info("OpenAI speech provider initialized");

    if (needsOpenAiStt && openAiCredentials.openaiSttApiKey) {
      sttService = createOpenAiStt(openAiCredentials.openaiSttApiKey, openaiConfig, logger);
    }

    if (needsOpenAiTts && openAiCredentials.openaiTtsApiKey) {
      ttsService = createOpenAiTts(openAiCredentials.openaiTtsApiKey, openaiConfig, logger);
    }

    if (needsOpenAiDictation && openAiCredentials.openaiDictationApiKey) {
      dictationSttService = createOpenAiStt(
        openAiCredentials.openaiDictationApiKey,
        openaiConfig,
        logger,
      );
    }
  } else if (needsAnyOpenAi) {
    // validateOpenAiCredentialRequirements already warned about missing credentials
  }

  return {
    turnDetectionService,
    sttService,
    ttsService,
    dictationSttService,
  };
}
