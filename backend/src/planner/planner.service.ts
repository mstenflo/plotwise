import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProjectDto } from './dto/create-project.dto';
import { PlannerProjectEntity } from './entities/planner-project.entity';
import { GardenProject } from './models/planner.types';

@Injectable()
export class PlannerService implements OnModuleInit {
  constructor(
    @InjectRepository(PlannerProjectEntity)
    private readonly projectRepository: Repository<PlannerProjectEntity>
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.projectRepository.count();
    if (count > 0) {
      return;
    }

    await this.projectRepository.save(this.toEntity(this.createStarterProject()));
  }

  async listProjects(): Promise<GardenProject[]> {
    const projects = await this.projectRepository.find({
      order: {
        updatedAtIso: 'DESC'
      }
    });

    return projects.map((project) => this.toProject(project));
  }

  async getProject(id: string): Promise<GardenProject> {
    const project = await this.projectRepository.findOneBy({ id });
    if (!project) {
      throw new NotFoundException(`Project ${id} not found`);
    }

    return this.toProject(project);
  }

  async saveProject(id: string, project: GardenProject): Promise<GardenProject> {
    const updated: GardenProject = {
      ...project,
      id,
      updatedAtIso: new Date().toISOString()
    };

    const saved = await this.projectRepository.save(this.toEntity(updated));
    return this.toProject(saved);
  }

  async createProject(input: CreateProjectDto): Promise<GardenProject> {
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

    const saved = await this.projectRepository.save(this.toEntity(project));
    return this.toProject(saved);
  }

  async deleteProject(id: string): Promise<void> {
    const result = await this.projectRepository.delete({ id });
    if (!result.affected) {
      throw new NotFoundException(`Project ${id} not found`);
    }
  }

  private toProject(entity: PlannerProjectEntity): GardenProject {
    return {
      id: entity.id,
      name: entity.name,
      season: entity.season,
      climateZone: entity.climateZone,
      lastFrostDateIso: entity.lastFrostDateIso,
      firstFrostDateIso: entity.firstFrostDateIso,
      seeds: entity.seeds,
      objects: entity.objects,
      updatedAtIso: entity.updatedAtIso
    };
  }

  private toEntity(project: GardenProject): PlannerProjectEntity {
    return this.projectRepository.create({
      id: project.id,
      name: project.name,
      season: project.season,
      climateZone: project.climateZone,
      lastFrostDateIso: project.lastFrostDateIso,
      firstFrostDateIso: project.firstFrostDateIso,
      seeds: project.seeds,
      objects: project.objects,
      updatedAtIso: project.updatedAtIso
    });
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
