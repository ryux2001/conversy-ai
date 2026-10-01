/// <reference lib="webworker" />

import { env, pipeline } from "@huggingface/transformers";
import { WHISPER_MODEL_ID, WHISPER_MODEL_SOURCE, WHISPER_REVISION, WHISPER_LOCAL_BASE, WHISPER_CACHE_NAME, WHISPER_SUPPORTED_MODEL_ID } from "./whisper-config";
import type { WhisperRequest, WhisperResponse } from "./whisper-protocol";

const scope = self as DedicatedWorkerGlobalScope;
type Transcriber = (audio: Float32Array, options: {
  sampling_rate: number;
}) => Promise<{ text: string }>;
let transcriberPromise: Promise<Transcriber> | null = null;

function send(message: WhisperResponse) {
  scope.postMessage(message);
}

function getTranscriber(onProgress: (status: string, progress?: number, file?: string, loaded?: number, total?: number) => void): Promise<Transcriber> {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      if (WHISPER_MODEL_ID !== WHISPER_SUPPORTED_MODEL_ID) throw new Error("WHISPER_MODEL_UNSUPPORTED");
      const webgpuNavigator = navigator as Navigator & { gpu?: { requestAdapter: () => Promise<unknown> } };
      if (!webgpuNavigator.gpu) throw new Error("WEBGPU_UNAVAILABLE");
      const adapter = await webgpuNavigator.gpu.requestAdapter();
      if (!adapter) throw new Error("WEBGPU_ADAPTER_UNAVAILABLE");

      env.allowRemoteModels = WHISPER_MODEL_SOURCE === "hub";
      env.allowLocalModels = WHISPER_MODEL_SOURCE === "local";
      env.useBrowserCache = false;
      env.useCustomCache = WHISPER_MODEL_SOURCE === "hub";
      env.customCache = WHISPER_MODEL_SOURCE === "hub" ? await caches.open(WHISPER_CACHE_NAME) : null;
      env.useFS = false;
      env.localModelPath = WHISPER_LOCAL_BASE;

      return await pipeline("automatic-speech-recognition", WHISPER_MODEL_ID, {
        device: "webgpu",
        revision: WHISPER_REVISION,
        dtype: { encoder_model: "fp32", decoder_model_merged: "q4" },
        progress_callback: (event: unknown) => {
          const item = event as { status?: string; progress?: number; file?: string; loaded?: number; total?: number };
          onProgress(item.status ?? "downloading", item.progress, item.file, item.loaded, item.total);
        },
      }) as unknown as Transcriber;
    })().catch((error: unknown) => {
      transcriberPromise = null;
      throw error;
    });
  }
  return transcriberPromise;
}

async function handleRequest(request: WhisperRequest) {
  try {
    if (request.type === "prepare") {
      await getTranscriber((status, progress, file, loaded, total) => send({
        type: "progress", requestId: request.requestId, status, progress, file, loaded, total,
      }));
      send({ type: "ready", requestId: request.requestId });
      return;
    }

    if (request.sampleRate !== 16_000 || request.samples.length === 0) throw new Error("AUDIO_INVALID");
    const model = await getTranscriber((status, progress, file, loaded, total) => send({
      type: "progress", requestId: request.requestId, status, progress, file, loaded, total,
    }));
    const startedAt = performance.now();
    // whisper-base.en is English-only; Transformers rejects explicit language/task options for it.
    const output = await model(request.samples, { sampling_rate: request.sampleRate });
    const text = typeof output === "object" && output && "text" in output ? String(output.text).trim() : "";
    if (!text) throw new Error("NO_SPEECH_RECOGNIZED");
    send({ type: "transcript", requestId: request.requestId, text, durationMs: Math.round(performance.now() - startedAt) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "WHISPER_FAILED";
    send({ type: "error", requestId: request.requestId, code: message, message });
  }
}

let operationQueue = Promise.resolve();
scope.onmessage = (event: MessageEvent<WhisperRequest>) => {
  operationQueue = operationQueue.then(() => handleRequest(event.data));
};
