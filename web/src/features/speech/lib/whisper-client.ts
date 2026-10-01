import { WHISPER_CACHE_KEY_FRAGMENT, WHISPER_CACHE_NAME, WHISPER_CACHE_VERIFICATION_FILES } from "./whisper-config";
import type { WhisperRequest, WhisperResponse } from "./whisper-protocol";

type Pending = {
  resolve: (value: WhisperResponse) => void;
  reject: (error: Error) => void;
  onProgress?: (event: Extract<WhisperResponse, { type: "progress" }>) => void;
  signal?: AbortSignal;
  abort?: () => void;
};

class WhisperClient {
  private worker: Worker | null = null;
  private readonly pending = new Map<string, Pending>();

  private getWorker() {
    if (!this.worker) {
      const worker = new Worker(new URL("./whisper.worker.ts", import.meta.url), { type: "module", name: "conversy-whisper" });
      worker.onmessage = (event: MessageEvent<WhisperResponse>) => {
        const response = event.data;
        const pending = this.pending.get(response.requestId);
        if (!pending) return;
        if (response.type === "progress") {
          pending.onProgress?.(response);
          return;
        }
        this.pending.delete(response.requestId);
        pending.signal?.removeEventListener("abort", pending.abort!);
        if (response.type === "error") pending.reject(new Error(response.code));
        else pending.resolve(response);
      };
      worker.onerror = (event) => {
        this.rejectAll(new Error(event.message || "WHISPER_WORKER_FAILED"));
        worker.terminate();
        if (this.worker === worker) this.worker = null;
      };
      this.worker = worker;
    }
    return this.worker;
  }

  private request(request: WhisperRequest, options: { onProgress?: Pending["onProgress"]; signal?: AbortSignal } = {}) {
    if (options.signal?.aborted) return Promise.reject(new DOMException("Aborted", "AbortError"));
    const worker = this.getWorker();
    return new Promise<WhisperResponse>((resolve, reject) => {
      const pending: Pending = { resolve, reject, ...options };
      pending.abort = () => {
        this.terminate(new DOMException("Aborted", "AbortError"));
      };
      pending.signal?.addEventListener("abort", pending.abort, { once: true });
      this.pending.set(request.requestId, pending);
      if (request.type === "transcribe") worker.postMessage(request, [request.samples.buffer]);
      else worker.postMessage(request);
    });
  }

  async prepare(onProgress?: Pending["onProgress"]) {
    const response = await this.request({ type: "prepare", requestId: crypto.randomUUID() }, { onProgress });
    if (response.type !== "ready") throw new Error("WHISPER_UNEXPECTED_RESPONSE");
  }

  async transcribe(samples: Float32Array, signal: AbortSignal, onProgress?: Pending["onProgress"]) {
    const response = await this.request({
      type: "transcribe", requestId: crypto.randomUUID(), samples, sampleRate: 16_000,
    }, { signal, onProgress });
    if (response.type !== "transcript") throw new Error("WHISPER_UNEXPECTED_RESPONSE");
    return response;
  }

  terminate(reason = new Error("WHISPER_WORKER_RESTARTED")) {
    this.worker?.terminate();
    this.worker = null;
    this.rejectAll(reason);
  }

  private rejectAll(reason: Error) {
    for (const pending of this.pending.values()) {
      pending.signal?.removeEventListener("abort", pending.abort!);
      pending.reject(reason);
    }
    this.pending.clear();
  }
}

export const whisperClient = new WhisperClient();

export async function getCachedWhisperFiles() {
  if (!("caches" in globalThis)) return [] as string[];
  const found = new Set<string>();
  const names = await caches.keys();
  if (!names.includes(WHISPER_CACHE_NAME)) return [];
  const cache = await caches.open(WHISPER_CACHE_NAME);
  for (const request of await cache.keys()) {
    const normalized = decodeURIComponent(new URL(request.url).pathname);
    if (!normalized.includes(WHISPER_CACHE_KEY_FRAGMENT)) continue;
    for (const file of WHISPER_CACHE_VERIFICATION_FILES) if (normalized.endsWith(file)) found.add(file);
  }
  return [...found];
}

export async function deleteCachedWhisperModel() {
  if (!("caches" in globalThis)) return 0;
  return await caches.delete(WHISPER_CACHE_NAME) ? 1 : 0;
}
