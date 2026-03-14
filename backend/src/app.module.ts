import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { getDatabaseConnectionConfig } from './database/database-connection.config';
import { HealthController } from './health.controller';
import { PlannerModule } from './planner/planner.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const readConfigValue = (key: string, defaultValue?: string) =>
          defaultValue === undefined ? config.get<string>(key) : config.get<string>(key, defaultValue);

        return {
          ...getDatabaseConnectionConfig(readConfigValue),
          autoLoadEntities: true,
          synchronize: config.get<string>('TYPEORM_SYNCHRONIZE', 'false') === 'true',
          migrationsRun: config.get<string>('TYPEORM_MIGRATIONS_RUN', 'false') === 'true',
          migrations: [join(__dirname, 'database/migrations/*{.ts,.js}')],
        };
      },
    }),
    PlannerModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
