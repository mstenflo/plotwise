import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Controller('api/health')
export class HealthController {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Get()
  async getHealth() {
    let database: 'up' | 'down' = 'up';
    let error: string | undefined;

    try {
      await this.dataSource.query('SELECT 1');
    } catch (dbError) {
      database = 'down';
      error = dbError instanceof Error ? dbError.message : 'Unknown DB error';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      service: 'plotwise-backend',
      database,
      error,
      timestamp: new Date().toISOString(),
    };
  }
}
