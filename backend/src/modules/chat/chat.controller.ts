import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service.js';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('reply')
  reply(@Body() body: unknown) {
    return this.chatService.reply(body);
  }
}
