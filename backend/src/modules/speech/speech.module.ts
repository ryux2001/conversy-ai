import { Module } from '@nestjs/common';
import { TutorModule } from '../tutor/tutor.module.js';
import { SpeechController } from './speech.controller.js';
import { SpeechService } from './speech.service.js';

@Module({
  imports: [TutorModule],
  controllers: [SpeechController],
  providers: [SpeechService],
  exports: [SpeechService],
})
export class SpeechModule {}
