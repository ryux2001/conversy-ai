import { Body, Controller, Post } from '@nestjs/common';
import { TutorService } from './tutor.service.js';

@Controller('tutor')
export class TutorController {
  constructor(private readonly tutorService: TutorService) {}

  @Post('evaluate')
  evaluate(@Body() body: unknown) {
    return this.tutorService.evaluate(body);
  }

  @Post('reply')
  reply(@Body() body: unknown) {
    return this.tutorService.reply(body);
  }
}
