import 'dotenv/config';
import { DataSource } from 'typeorm';
import { CalendarTaskEntity } from '../planner/entities/calendar-task.entity';
import { PlantingEntity } from '../planner/entities/planting.entity';
import { PlannerProjectEntity } from '../planner/entities/planner-project.entity';
import { SeedCatalogEntity } from '../planner/entities/seed-catalog.entity';

const dbPort = Number(process.env.DB_PORT ?? '5432');
const dbSsl = process.env.DB_SSL === 'true';

const hasDatabaseUrl = !!process.env.DATABASE_URL;

const resolveSslConfig = () => {
  if (!dbSsl) {
    return false;
  }

  const rejectUnauthorized =
    process.env.DB_SSL_REJECT_UNAUTHORIZED !== undefined
      ? process.env.DB_SSL_REJECT_UNAUTHORIZED === 'true'
      : (process.env.NODE_ENV ?? 'development') === 'production';

  return { rejectUnauthorized };
};

export default new DataSource({
  type: 'postgres',
  url: hasDatabaseUrl ? process.env.DATABASE_URL : undefined,
  host: hasDatabaseUrl ? undefined : (process.env.DB_HOST ?? 'localhost'),
  port: hasDatabaseUrl ? undefined : dbPort,
  username: hasDatabaseUrl ? undefined : (process.env.DB_USER ?? 'postgres'),
  password: hasDatabaseUrl ? undefined : (process.env.DB_PASSWORD ?? 'postgres'),
  database: hasDatabaseUrl ? undefined : (process.env.DB_NAME ?? 'plotwise'),
  ssl: resolveSslConfig(),
  entities: [PlannerProjectEntity, SeedCatalogEntity, PlantingEntity, CalendarTaskEntity],
  migrations: ['src/database/migrations/*{.ts,.js}'],
  synchronize: false,
});
