import 'dotenv/config';
import { DataSource } from 'typeorm';
import { getDatabaseConnectionConfig } from './database-connection.config';
import { CalendarTaskEntity } from '../planner/entities/calendar-task.entity';
import { PlantingEntity } from '../planner/entities/planting.entity';
import { PlannerProjectEntity } from '../planner/entities/planner-project.entity';
import { SeedCatalogEntity } from '../planner/entities/seed-catalog.entity';

export default new DataSource({
  ...getDatabaseConnectionConfig((key, defaultValue) => process.env[key] ?? defaultValue),
  entities: [PlannerProjectEntity, SeedCatalogEntity, PlantingEntity, CalendarTaskEntity],
  migrations: ['src/database/migrations/*{.ts,.js}'],
  synchronize: false,
});
