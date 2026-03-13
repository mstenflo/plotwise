import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreatePlantingDto } from './dto/create-planting.dto';
import { CalendarTaskRecord, PlantingRecord } from './dto/planning.types';
import { UpsertPlantingDto } from './dto/upsert-planting.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { PlannerService } from './planner.service';
import type { GardenProject } from './models/planner.types';

@Controller('api/projects')
export class PlannerController {
  constructor(private readonly plannerService: PlannerService) {}

  @Get()
  async getProjects(): Promise<GardenProject[]> {
    return this.plannerService.listProjects();
  }

  @Get(':id')
  async getProject(@Param('id') id: string): Promise<GardenProject> {
    return this.plannerService.getProject(id);
  }

  @Get(':id/plantings')
  async getProjectPlantings(@Param('id') id: string): Promise<PlantingRecord[]> {
    return this.plannerService.listProjectPlantings(id);
  }

  @Get(':id/tasks')
  async getProjectTasks(
    @Param('id') id: string,
    @Query('bedId') bedId?: string,
    @Query('zoneId') zoneId?: string,
    @Query('completed') completed?: 'true' | 'false',
  ): Promise<CalendarTaskRecord[]> {
    return this.plannerService.listProjectTasks(id, {
      bedId,
      zoneId,
      completed: completed === undefined ? undefined : completed === 'true',
    });
  }

  @Post(':id/tasks/sync')
  async syncProjectTasks(@Param('id') id: string): Promise<{ synced: true }> {
    await this.plannerService.syncProjectTasks(id);
    return { synced: true };
  }

  @Post(':id/plantings')
  async createPlanting(
    @Param('id') id: string,
    @Body() body: CreatePlantingDto,
  ): Promise<PlantingRecord> {
    return this.plannerService.createPlanting(id, body);
  }

  @Put(':id/plantings/:bedId')
  async upsertPlantingForBed(
    @Param('id') id: string,
    @Param('bedId') bedId: string,
    @Body() body: UpsertPlantingDto,
  ): Promise<PlantingRecord> {
    return this.plannerService.upsertPlanting(id, bedId, undefined, body);
  }

  @Put(':id/plantings/:bedId/:zoneId')
  async upsertPlantingForZone(
    @Param('id') id: string,
    @Param('bedId') bedId: string,
    @Param('zoneId') zoneId: string,
    @Body() body: UpsertPlantingDto,
  ): Promise<PlantingRecord> {
    return this.plannerService.upsertPlanting(id, bedId, zoneId, { ...body, zoneId });
  }

  @Delete(':id/plantings/:bedId')
  async deletePlantingForBed(
    @Param('id') id: string,
    @Param('bedId') bedId: string,
  ): Promise<{ deleted: true }> {
    return this.plannerService.deletePlanting(id, bedId);
  }

  @Delete(':id/plantings/:bedId/:zoneId')
  async deletePlantingForZone(
    @Param('id') id: string,
    @Param('bedId') bedId: string,
    @Param('zoneId') zoneId: string,
  ): Promise<{ deleted: true }> {
    return this.plannerService.deletePlanting(id, bedId, zoneId);
  }

  @Patch(':id/tasks/:taskId')
  async updateTaskStatus(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() body: UpdateTaskStatusDto,
  ): Promise<CalendarTaskRecord> {
    return this.plannerService.updateTaskStatus(id, taskId, body.completed);
  }

  @Post()
  async createProject(@Body() body: CreateProjectDto): Promise<GardenProject> {
    return this.plannerService.createProject(body);
  }

  @Put(':id')
  async saveProject(@Param('id') id: string, @Body() body: GardenProject): Promise<GardenProject> {
    return this.plannerService.saveProject(id, body);
  }

  @Delete(':id')
  async deleteProject(@Param('id') id: string): Promise<{ deleted: true }> {
    await this.plannerService.deleteProject(id);
    return { deleted: true };
  }
}
