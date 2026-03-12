import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { PlannerService } from './planner.service';
import type { GardenProject } from './models/planner.types';

@Controller('api/projects')
export class PlannerController {
  constructor(private readonly plannerService: PlannerService) {}

  @Get()
  getProjects(): GardenProject[] {
    return this.plannerService.listProjects();
  }

  @Get(':id')
  getProject(@Param('id') id: string): GardenProject {
    return this.plannerService.getProject(id);
  }

  @Post()
  createProject(@Body() body: CreateProjectDto): GardenProject {
    return this.plannerService.createProject(body);
  }

  @Put(':id')
  saveProject(@Param('id') id: string, @Body() body: GardenProject): GardenProject {
    return this.plannerService.saveProject(id, body);
  }

  @Delete(':id')
  deleteProject(@Param('id') id: string): { deleted: true } {
    this.plannerService.deleteProject(id);
    return { deleted: true };
  }
}
