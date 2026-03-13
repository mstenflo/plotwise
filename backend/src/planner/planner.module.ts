import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarTaskEntity } from './entities/calendar-task.entity';
import { PlantingEntity } from './entities/planting.entity';
import { PlannerController } from './planner.controller';
import { PlannerProjectEntity } from './entities/planner-project.entity';
import { SeedCatalogEntity } from './entities/seed-catalog.entity';
import { PlannerService } from './planner.service';
import { SeedCatalogService } from './seed-catalog.service';
import { SeedCatalogController } from './seed-catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PlannerProjectEntity, SeedCatalogEntity, PlantingEntity, CalendarTaskEntity])],
  controllers: [PlannerController, SeedCatalogController],
  providers: [PlannerService, SeedCatalogService],
  exports: [PlannerService]
})
export class PlannerModule {}
