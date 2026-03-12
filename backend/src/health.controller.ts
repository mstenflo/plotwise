import { Controller, Get } from '@nestjs/common';

@Controller('api/health')
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: 'ok',
      service: 'plotwise-backend',
      timestamp: new Date().toISOString()
    };
  }
}
