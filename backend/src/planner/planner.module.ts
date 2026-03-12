import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlannerController } from './planner.controller';
import { PlannerProjectEntity } from './entities/planner-project.entity';
import { PlannerService } from './planner.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlannerProjectEntity])],
  controllers: [PlannerController],
  providers: [PlannerService],
  exports: [PlannerService]
})
export class PlannerModule {}
