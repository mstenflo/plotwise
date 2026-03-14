import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreatePlacementDto } from './dto/create-placement.dto';
import {
  BedDetailsResponse,
  BedSummaryRecord,
  CalendarTaskRecord,
  HarvestPreviewResponse,
  PlantingRecord,
} from './dto/planning.types';
import { PreviewHarvestDto } from './dto/preview-harvest.dto';
import { UpdateTaskStatusDto } from './dto/update-task-status.dto';
import { UpdateBedDetailsDto } from './dto/update-bed-details.dto';
import { UpdatePlacementDto } from './dto/update-placement.dto';
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
  async getProjectPlantings(
    @Param('id') id: string,
    @Query('bedId') bedId?: string,
  ): Promise<PlantingRecord[]> {
    return this.plannerService.listProjectPlantings(id, bedId);
  }

  @Get(':id/beds/summary')
  async getBedSummaries(@Param('id') id: string): Promise<BedSummaryRecord[]> {
    return this.plannerService.listBedSummaries(id);
  }

  @Get(':id/beds/:bedId')
  async getBedDetails(
    @Param('id') id: string,
    @Param('bedId') bedId: string,
  ): Promise<BedDetailsResponse> {
    return this.plannerService.getBedDetails(id, bedId);
  }

  @Put(':id/beds/:bedId')
  async updateBedDetails(
    @Param('id') id: string,
    @Param('bedId') bedId: string,
    @Body() body: UpdateBedDetailsDto,
  ): Promise<BedDetailsResponse> {
    return this.plannerService.updateBedDetails(id, bedId, body);
  }

  @Get(':id/tasks')
  async getProjectTasks(
    @Param('id') id: string,
    @Query('bedId') bedId?: string,
    @Query('placementId') placementId?: string,
    @Query('completed') completed?: 'true' | 'false',
  ): Promise<CalendarTaskRecord[]> {
    return this.plannerService.listProjectTasks(id, {
      bedId,
      placementId,
      completed: completed === undefined ? undefined : completed === 'true',
    });
  }

  @Post(':id/tasks/sync')
  async syncProjectTasks(@Param('id') id: string): Promise<{ synced: true }> {
    await this.plannerService.syncProjectTasks(id);
    return { synced: true };
  }

  @Post(':id/beds/:bedId/placements')
  async createPlacement(
    @Param('id') id: string,
    @Param('bedId') bedId: string,
    @Body() body: CreatePlacementDto,
  ): Promise<PlantingRecord> {
    return this.plannerService.createPlacement(id, bedId, body);
  }

  @Put(':id/beds/:bedId/placements/:placementId')
  async updatePlacement(
    @Param('id') id: string,
    @Param('bedId') bedId: string,
    @Param('placementId') placementId: string,
    @Body() body: UpdatePlacementDto,
  ): Promise<PlantingRecord> {
    return this.plannerService.updatePlacement(id, bedId, placementId, body);
  }

  @Delete(':id/beds/:bedId/placements/:placementId')
  async deletePlacement(
    @Param('id') id: string,
    @Param('bedId') bedId: string,
    @Param('placementId') placementId: string,
  ): Promise<{ deleted: true }> {
    return this.plannerService.deletePlacement(id, bedId, placementId);
  }

  @Post(':id/beds/:bedId/placements/preview-harvest')
  async previewHarvest(
    @Param('id') id: string,
    @Param('bedId') bedId: string,
    @Body() body: PreviewHarvestDto,
  ): Promise<HarvestPreviewResponse> {
    return this.plannerService.previewHarvest(id, bedId, body);
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
