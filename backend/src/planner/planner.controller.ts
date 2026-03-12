import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
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
