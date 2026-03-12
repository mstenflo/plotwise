import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProjectDto } from './dto/create-project.dto';
import { GardenProject } from './models/planner.types';

@Injectable()
export class PlannerService {
  private readonly projects = new Map<string, GardenProject>([[
    'project-home',
    this.createStarterProject()
  ]]);

  listProjects(): GardenProject[] {
    return [...this.projects.values()].sort((a, b) => b.updatedAtIso.localeCompare(a.updatedAtIso));
  }

  getProject(id: string): GardenProject {
    const project = this.projects.get(id);
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    return project;
  }

  saveProject(id: string, project: GardenProject): GardenProject {
    const updated: GardenProject = {
      ...project,
      id,
      updatedAtIso: new Date().toISOString()
    };

    this.projects.set(id, updated);
    return updated;
  }

  createProject(input: CreateProjectDto): GardenProject {
    const now = new Date().toISOString();
    const id = `project-${crypto.randomUUID().slice(0, 8)}`;

    const project: GardenProject = {
      id,
      name: input.name,
      season: 'spring',
      climateZone: input.climateZone,
      lastFrostDateIso: now,
      firstFrostDateIso: now,
      updatedAtIso: now,
      seeds: [],
      objects: []
    };

    this.projects.set(id, project);
    return project;
  }

  deleteProject(id: string): void {
    if (!this.projects.delete(id)) {
      throw new NotFoundException(`Project ${id} not found`);
    }
  }

  private createStarterProject(): GardenProject {
    const now = new Date().toISOString();

    return {
      id: 'project-home',
      name: 'Home Garden',
      season: 'spring',
      climateZone: '6b',
      lastFrostDateIso: '2026-04-20T00:00:00.000Z',
      firstFrostDateIso: '2026-10-15T00:00:00.000Z',
      updatedAtIso: now,
      seeds: [
        {
          id: 'seed-tomato-sungold',
          name: 'Tomato',
          variety: 'Sungold',
          lifecycle: 'annual',
          family: 'Solanaceae',
          spacingInches: 24,
          rowSpacingInches: 36,
          daysToMaturity: 65,
          matureSpreadInches: 30,
          preferredSun: 'full-sun',
          soilPhMin: 6,
          soilPhMax: 6.8,
          successionFriendly: false,
          yield: { averagePoundsPerPlant: 10 },
          notes: 'Indeterminate cherry tomato.'
        },
        {
          id: 'seed-lettuce-romaine',
          name: 'Lettuce',
          variety: 'Romaine',
          lifecycle: 'annual',
          family: 'Asteraceae',
          spacingInches: 8,
          rowSpacingInches: 12,
          daysToMaturity: 55,
          matureSpreadInches: 10,
          preferredSun: 'part-sun',
          soilPhMin: 6,
          soilPhMax: 7,
          successionFriendly: true,
          yield: { averagePoundsPerPlant: 0.5 },
          notes: 'Great for succession sowing every 2-3 weeks.'
        }
      ],
      objects: [
        {
          id: 'bed-a',
          type: 'bed',
          name: 'North Bed',
          xInches: 24,
          yInches: 24,
          widthInches: 120,
          heightInches: 48,
          rotationDeg: 0,
          rows: 4,
          sunExposure: 'full-sun',
          soil: {
            ph: 6.4,
            drainage: 'good',
            organicMatterPercent: 5
          },
          lastSeasonFamily: 'Brassicaceae'
        }
      ]
    };
  }
}
