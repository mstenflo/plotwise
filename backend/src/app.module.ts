import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'node:path';
import { HealthController } from './health.controller';
import { PlannerModule } from './planner/planner.module';

const resolveSslConfig = (config: ConfigService) => {
  const dbSsl = config.get<string>('DB_SSL', 'false') === 'true';
  if (!dbSsl) {
    return false;
  }

  const rejectUnauthorized =
    config.get<string>('DB_SSL_REJECT_UNAUTHORIZED') !== undefined
      ? config.get<string>('DB_SSL_REJECT_UNAUTHORIZED', 'true') === 'true'
      : config.get<string>('NODE_ENV', 'development') === 'production';

  return { rejectUnauthorized };
};

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>('DATABASE_URL'),
        host: config.get<string>('DATABASE_URL') ? undefined : config.get<string>('DB_HOST', 'localhost'),
        port: config.get<string>('DATABASE_URL') ? undefined : Number(config.get<string>('DB_PORT', '5432')),
        username: config.get<string>('DATABASE_URL') ? undefined : config.get<string>('DB_USER', 'postgres'),
        password: config.get<string>('DATABASE_URL') ? undefined : config.get<string>('DB_PASSWORD', 'postgres'),
        database: config.get<string>('DATABASE_URL') ? undefined : config.get<string>('DB_NAME', 'plotwise'),
        ssl: resolveSslConfig(config),
        autoLoadEntities: true,
        synchronize: config.get<string>('TYPEORM_SYNCHRONIZE', 'false') === 'true',
        migrationsRun: config.get<string>('TYPEORM_MIGRATIONS_RUN', 'false') === 'true',
        migrations: [join(__dirname, 'database/migrations/*{.ts,.js}')],
      }),
    }),
    PlannerModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
