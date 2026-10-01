import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { TutorService } from '../tutor/tutor.service.js';
import type { PronunciationAssessment, PronunciationIssue, SpeechTranscription } from './speech.types.js';

interface WavMetadata {
  durationMs: number;
}

interface AzureRecognition {
  RecognitionStatus?: string;
  DisplayText?: string;
  NBest?: Array<{
    Display?: string;
    Words?: Array<{
      Word?: string;
      PronunciationAssessment?: { AccuracyScore?: number; ErrorType?: string };
      Phonemes?: Array<{ Phoneme?: string; PronunciationAssessment?: { AccuracyScore?: number } }>;
    }>;
  }>;
}

const MAX_WAV_MS = 60_000;
const MAX_PRONUNCIATION_MS = 30_000;
const WAV_SAMPLE_RATE = 16_000;
const WAV_BYTES_PER_SECOND = WAV_SAMPLE_RATE * 2;

@Injectable()
export class SpeechService {
  constructor(private readonly tutor: TutorService) {}

  async synthesize(text: string): Promise<{ audio: Buffer; contentType: string }> {
    const provider = (process.env.SPEECH_TTS_PROVIDER ?? 'browser').trim().toLowerCase();
    if (provider === 'local') {
      const endpoint = process.env.SPEECH_TTS_URL?.trim();
      const model = process.env.SPEECH_TTS_MODEL?.trim();
      if (!endpoint || !model) {
        throw new ServiceUnavailableException({ code: 'TTS_PROVIDER_NOT_CONFIGURED', message: 'Configura un endpoint local OpenAI compatible para texto a voz.' });
      }
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = process.env.SPEECH_TTS_API_KEY?.trim();
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await this.request(endpoint, JSON.stringify({
        model,
        input: text,
        voice: process.env.SPEECH_TTS_VOICE?.trim() || 'alloy',
        response_format: 'wav',
      }), Number(process.env.SPEECH_TTS_TIMEOUT_MS ?? 60_000), headers);
      return { audio: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? 'audio/wav' };
    }
    if (provider === 'azure') {
      const config = azureConfig();
      const endpoint = process.env.AZURE_SPEECH_TTS_URL?.trim();
      if (!endpoint) {
        throw new ServiceUnavailableException({ code: 'TTS_PROVIDER_NOT_CONFIGURED', message: 'Configura AZURE_SPEECH_TTS_URL en backend/.env.local.' });
      }
      const locale = process.env.AZURE_SPEECH_LOCALE?.trim() || 'en-US';
      const voice = process.env.AZURE_SPEECH_TTS_VOICE?.trim() || 'en-US-JennyNeural';
      const xmlText = escapeXml(text);
      const ssml = `<speak version="1.0" xml:lang="${escapeXml(locale)}"><voice xml:lang="${escapeXml(locale)}" name="${escapeXml(voice)}">${xmlText}</voice></speak>`;
      const response = await this.request(endpoint, ssml, Number(process.env.SPEECH_TTS_TIMEOUT_MS ?? 60_000), {
        'Content-Type': 'application/ssml+xml',
        'Ocp-Apim-Subscription-Key': config.key,
        'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
        'User-Agent': 'Conversy',
      });
      return { audio: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? 'audio/mpeg' };
    }
    if (provider === 'browser') {
      throw new ServiceUnavailableException({ code: 'TTS_PROVIDER_NOT_CONFIGURED', message: 'Usa la síntesis de voz del navegador.' });
    }
    throw new ServiceUnavailableException({ code: 'TTS_PROVIDER_NOT_CONFIGURED', message: 'Configura SPEECH_TTS_PROVIDER como browser, local o azure.' });
  }

  async transcribe(buffer: Buffer): Promise<SpeechTranscription> {
    const wav = parsePcmWav(buffer, MAX_WAV_MS);
    const provider = (process.env.SPEECH_STT_PROVIDER ?? 'local').trim().toLowerCase();
    let text: string;

    if (provider === 'local') {
      text = await this.transcribeLocal(buffer);
    } else if (provider === 'azure') {
      text = await this.transcribeAzure(buffer);
    } else {
      throw new ServiceUnavailableException({
        code: 'SPEECH_PROVIDER_NOT_CONFIGURED',
        message: 'Configura SPEECH_STT_PROVIDER como local o azure.',
      });
    }

    const normalized = normalizeTranscript(text);
    if (!normalized) {
      throw new BadGatewayException({
        code: 'SPEECH_NO_TRANSCRIPT',
        message: 'No pude reconocer palabras en esta grabación. Prueba a grabarla otra vez.',
      });
    }

    return { text: normalized, durationMs: wav.durationMs, language: 'en' };
  }

  async assess(buffer: Buffer, transcript: string, targetMessageId: string): Promise<PronunciationAssessment> {
    const wav = parsePcmWav(buffer, MAX_PRONUNCIATION_MS);
    if ((process.env.SPEECH_PRONUNCIATION_PROVIDER ?? 'disabled').trim().toLowerCase() !== 'azure') {
      throw new ServiceUnavailableException({
        code: 'PRONUNCIATION_PROVIDER_NOT_CONFIGURED',
        message: 'El análisis de pronunciación no está configurado. La conversación puede continuar sin él.',
      });
    }

    const result = await this.assessAzure(buffer);
    const recognized = result.NBest?.[0]?.Display ?? result.DisplayText ?? '';
    const alignment = transcriptSimilarity(transcript, recognized);
    const issues = alignment >= 0.75 ? extractPronunciationIssues(result) : [];
    if (!issues.length) return { targetMessageId, issues: [], tutorMessage: null };

    let tutorMessage: string;
    try {
      tutorMessage = await this.tutor.explainPronunciation(issues[0]!, transcript);
    } catch {
      tutorMessage = `El análisis detectó una posible dificultad al pronunciar “${issues[0]!.word}”. No pude preparar la explicación ahora; puedes volver a preguntarme en el tutor.`;
    }

    return { targetMessageId, issues, tutorMessage, durationMs: wav.durationMs };
  }

  private async transcribeLocal(buffer: Buffer): Promise<string> {
    const endpoint = process.env.SPEECH_STT_URL?.trim();
    const model = process.env.SPEECH_STT_MODEL?.trim();
    if (!endpoint || !model) {
      throw new ServiceUnavailableException({
        code: 'SPEECH_PROVIDER_NOT_CONFIGURED',
        message: 'Configura un servidor local de transcripción y SPEECH_STT_MODEL en backend/.env.local.',
      });
    }

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: 'audio/wav' }), 'message.wav');
    form.append('model', model);
    form.append('language', 'en');
    const payload = await this.requestJson(endpoint, form, Number(process.env.SPEECH_STT_TIMEOUT_MS ?? 60_000));
    const record = asRecord(payload);
    return typeof record.text === 'string' ? record.text : '';
  }

  private async transcribeAzure(buffer: Buffer): Promise<string> {
    const config = azureConfig();
    const url = azureRecognitionUrl(config.endpoint, config.locale);
    const response = await this.request(url, new Blob([new Uint8Array(buffer)], { type: 'audio/wav' }), Number(process.env.SPEECH_STT_TIMEOUT_MS ?? 60_000), {
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      'Ocp-Apim-Subscription-Key': config.key,
      Accept: 'application/json',
    });
    const payload = await response.json() as AzureRecognition;
    if (payload.RecognitionStatus && payload.RecognitionStatus !== 'Success') return '';
    return payload.DisplayText ?? payload.NBest?.[0]?.Display ?? '';
  }

  private async assessAzure(buffer: Buffer): Promise<AzureRecognition> {
    const config = azureConfig();
    const url = azureRecognitionUrl(config.endpoint, config.locale);
    const assessment = Buffer.from(JSON.stringify({
      GradingSystem: 'HundredMark',
      Granularity: 'Phoneme',
      Dimension: 'Comprehensive',
      EnableProsodyAssessment: 'False',
    })).toString('base64');
    return await this.request(url, new Blob([new Uint8Array(buffer)], { type: 'audio/wav' }), Number(process.env.SPEECH_STT_TIMEOUT_MS ?? 60_000), {
      'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000',
      'Ocp-Apim-Subscription-Key': config.key,
      Accept: 'application/json',
      'Pronunciation-Assessment': assessment,
    }).then((response) => response.json() as Promise<AzureRecognition>);
  }

  private async requestJson(url: string, body: FormData, timeoutMs: number): Promise<unknown> {
    const headers: Record<string, string> = {};
    const token = process.env.SPEECH_STT_API_KEY?.trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await this.request(url, body, timeoutMs, headers);
    return response.json().catch(() => null) as Promise<unknown>;
  }

  private async request(url: string, body: BodyInit, timeoutMs: number, headers: Record<string, string>) {
    let endpoint: URL;
    try {
      endpoint = new URL(url);
      if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:') throw new Error('invalid protocol');
    } catch {
      throw new ServiceUnavailableException({ code: 'SPEECH_PROVIDER_CONFIG_INVALID', message: 'La URL del proveedor de voz no es válida.' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(endpoint, { method: 'POST', headers, body, signal: controller.signal });
      if (!response.ok) {
        const providerDetail = await response.text().catch(() => '');
        throw new BadGatewayException({
          code: 'SPEECH_PROVIDER_ERROR',
          message: providerDetail.slice(0, 240) || `El proveedor de voz respondió HTTP ${response.status}.`,
        });
      }
      return response;
    } catch (error) {
      if (error instanceof BadGatewayException || error instanceof ServiceUnavailableException) throw error;
      if (controller.signal.aborted) {
        throw new GatewayTimeoutException({ code: 'SPEECH_PROVIDER_TIMEOUT', message: 'El procesamiento de voz tardó demasiado.' });
      }
      throw new ServiceUnavailableException({ code: 'SPEECH_PROVIDER_UNAVAILABLE', message: 'No se pudo conectar con el proveedor de voz.' });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parsePcmWav(buffer: Buffer, maxDurationMs: number): WavMetadata {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new BadRequestException({ code: 'AUDIO_FORMAT_INVALID', message: 'El audio debe convertirse a WAV PCM antes de enviarlo.' });
  }

  let offset = 12;
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let format = 0;
  let dataOffset = -1;
  let dataLength = 0;
  while (offset + 8 <= buffer.length) {
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > buffer.length) break;
    const chunk = buffer.toString('ascii', offset, offset + 4);
    if (chunk === 'fmt ' && size >= 16) {
      format = buffer.readUInt16LE(start);
      channels = buffer.readUInt16LE(start + 2);
      sampleRate = buffer.readUInt32LE(start + 4);
      bitsPerSample = buffer.readUInt16LE(start + 14);
    } else if (chunk === 'data') {
      dataOffset = start;
      dataLength = size;
    }
    offset = start + size + (size % 2);
  }

  if (format !== 1 || channels !== 1 || sampleRate !== WAV_SAMPLE_RATE || bitsPerSample !== 16 || dataOffset < 0 || dataLength === 0) {
    throw new BadRequestException({ code: 'AUDIO_FORMAT_INVALID', message: 'El audio debe ser PCM mono de 16 kHz y 16 bits.' });
  }
  const durationMs = Math.round(dataLength / WAV_BYTES_PER_SECOND * 1000);
  if (durationMs > maxDurationMs) {
    throw new BadRequestException({ code: 'AUDIO_TOO_LONG', message: `La grabación supera el máximo de ${Math.round(maxDurationMs / 1000)} segundos.` });
  }
  return { durationMs };
}

function azureConfig() {
  const endpoint = process.env.AZURE_SPEECH_ENDPOINT?.trim().replace(/\/$/, '');
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  const locale = process.env.AZURE_SPEECH_LOCALE?.trim() || 'en-US';
  if (!endpoint || !key) {
    throw new ServiceUnavailableException({
      code: 'PRONUNCIATION_PROVIDER_NOT_CONFIGURED',
      message: 'Configura endpoint y clave de Azure Speech en backend/.env.local para enviar audio al proveedor.',
    });
  }
  return { endpoint, key, locale };
}

function azureRecognitionUrl(endpoint: string, locale: string): string {
  const url = new URL('/stt/speech/recognition/conversation/cognitiveservices/v1', endpoint);
  url.searchParams.set('language', locale);
  url.searchParams.set('format', 'detailed');
  return url.toString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeTranscript(value: string): string {
  return value
    .replace(/<asr_text>/giu, ' ')
    .replace(/<\/?(?:s|eot|audio|text)[^>]*>/giu, ' ')
    .replace(/^\s*language\s+[a-z-]+\s*/iu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/gu, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character]!);
}

function extractPronunciationIssues(result: AzureRecognition): PronunciationIssue[] {
  const words = result.NBest?.[0]?.Words ?? [];
  return words.flatMap((entry): PronunciationIssue[] => {
    const word = entry.Word?.trim();
    const score = entry.PronunciationAssessment?.AccuracyScore;
    if (!word || typeof score !== 'number' || score >= 60 || entry.PronunciationAssessment?.ErrorType !== 'Mispronunciation') return [];
    const phoneme = entry.Phonemes?.flatMap((item) => {
      const symbol = item.Phoneme?.trim();
      const phonemeScore = item.PronunciationAssessment?.AccuracyScore;
      return symbol && typeof phonemeScore === 'number' && phonemeScore < 60 ? [{ symbol, score: phonemeScore }] : [];
    }).sort((a, b) => a.score - b.score)[0];
    return [{ word, ...(phoneme ? { phoneme: phoneme.symbol } : {}), score }];
  }).slice(0, 1);
}

function transcriptSimilarity(left: string, right: string): number {
  const tokenize = (value: string) => value.toLowerCase().match(/[a-z']+/gu) ?? [];
  const a = tokenize(left);
  const b = tokenize(right);
  if (!a.length || !b.length) return 0;
  if (a.length * b.length > 250_000) return 0;
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0]!;
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j]!;
      previous[j] = Math.min(previous[j]! + 1, previous[j - 1]! + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return 1 - previous[b.length]! / Math.max(a.length, b.length);
}
