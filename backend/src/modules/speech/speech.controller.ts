import {
  BadRequestException,
  Controller,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  Body,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SpeechService } from './speech.service.js';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024;

interface UploadedAudio {
  buffer: Buffer;
  size: number;
}

@Controller('speech')
export class SpeechController {
  constructor(private readonly speech: SpeechService) {}

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } }))
  transcribe(@UploadedFile() file: UploadedAudio | undefined) {
    if (!file) throw new BadRequestException({ code: 'AUDIO_MISSING', message: 'Adjunta una grabación de audio.' });
    if (file.size > MAX_AUDIO_BYTES) {
      throw new PayloadTooLargeException({ code: 'AUDIO_TOO_LARGE', message: 'El audio supera el límite de 10 MB.' });
    }
    return this.speech.transcribe(file.buffer);
  }

  @Post('assess')
  @UseInterceptors(FileInterceptor('audio', { limits: { fileSize: MAX_AUDIO_BYTES, files: 1 } }))
  assess(
    @UploadedFile() file: UploadedAudio | undefined,
    @Body('transcript') transcript: string,
    @Body('targetMessageId') targetMessageId: string,
  ) {
    if (!file) throw new BadRequestException({ code: 'AUDIO_MISSING', message: 'Adjunta una grabación de audio.' });
    if (file.size > MAX_AUDIO_BYTES) {
      throw new PayloadTooLargeException({ code: 'AUDIO_TOO_LARGE', message: 'El audio supera el límite de 10 MB.' });
    }
    if (typeof transcript !== 'string' || transcript.trim().length === 0 || transcript.length > 4_000) {
      throw new BadRequestException({ code: 'TRANSCRIPT_INVALID', message: 'La transcripción no es válida.' });
    }
    if (typeof targetMessageId !== 'string' || targetMessageId.trim().length === 0 || targetMessageId.length > 80) {
      throw new BadRequestException({ code: 'MESSAGE_ID_INVALID', message: 'El identificador del mensaje no es válido.' });
    }
    return this.speech.assess(file.buffer, transcript.trim(), targetMessageId);
  }

  @Post('synthesize')
  async synthesize(@Body() body: unknown, @Res({ passthrough: true }) response: { setHeader: (name: string, value: string) => unknown }) {
    const text = typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>).text
      : undefined;
    if (typeof text !== 'string' || !text.trim() || text.length > 2_000) {
      throw new BadRequestException({ code: 'TTS_TEXT_INVALID', message: 'El texto para sintetizar no es válido.' });
    }
    const result = await this.speech.synthesize(text.trim());
    response.setHeader('Cache-Control', 'no-store, private');
    return new StreamableFile(result.audio, { type: result.contentType, disposition: 'inline' });
  }
}
