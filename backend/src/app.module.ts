import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { LlmModule } from './modules/llm/llm.module.js';
import { TutorModule } from './modules/tutor/tutor.module.js';
import { SpeechModule } from './modules/speech/speech.module.js';

@Module({
  imports: [LlmModule, ChatModule, TutorModule, SpeechModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
