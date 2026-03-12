import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';
import { PlannerModule } from './planner/planner.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PlannerModule],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
