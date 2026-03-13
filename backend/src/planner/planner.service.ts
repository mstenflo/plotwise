import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePlantingDto } from './dto/create-planting.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpsertPlantingDto } from './dto/upsert-planting.dto';
import { CalendarTaskRecord, PlantingRecord } from './dto/planning.types';
import { CalendarTaskEntity } from './entities/calendar-task.entity';
import { PlantingEntity } from './entities/planting.entity';
import { PlannerProjectEntity } from './entities/planner-project.entity';
import { BedLayout, BedPlanting, BedZone, GardenProject } from './models/planner.types';

interface TaskFilters {
  bedId?: string;
  zoneId?: string;
  completed?: boolean;
}

@Injectable()
export class PlannerService implements OnModuleInit {
  constructor(
    @InjectRepository(PlannerProjectEntity)
    private readonly projectRepository: Repository<PlannerProjectEntity>,
    @InjectRepository(PlantingEntity)
    private readonly plantingRepository: Repository<PlantingEntity>,
    @InjectRepository(CalendarTaskEntity)
    private readonly taskRepository: Repository<CalendarTaskEntity>
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.projectRepository.count();
    if (count > 0) {
      return;
    }

    const starter = this.createStarterProject();
    await this.projectRepository.save(this.toEntity(starter));
    await this.syncPlanningResources(starter);
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

  async listProjectPlantings(projectId: string): Promise<PlantingRecord[]> {
    await this.ensureProjectExists(projectId);

    const plantings = await this.plantingRepository.find({
      where: { projectId },
      order: { plantedOnIso: 'DESC' }
    });

    return plantings.map((entry) => ({ ...entry }));
  }

  async listProjectTasks(projectId: string, filters?: TaskFilters): Promise<CalendarTaskRecord[]> {
    await this.ensureProjectExists(projectId);

    const where: Record<string, string | boolean> = { projectId };
    if (filters?.bedId) {
      where.bedId = filters.bedId;
    }
    if (filters?.zoneId) {
      where.zoneId = filters.zoneId;
    }
    if (filters?.completed !== undefined) {
      where.completed = filters.completed;
    }

    const tasks = await this.taskRepository.find({
      where,
      order: { dueDateIso: 'ASC' }
    });

    return tasks.map((entry) => ({ ...entry }));
  }

  async syncProjectTasks(projectId: string): Promise<void> {
    const project = await this.getProject(projectId);
    await this.syncPlanningResources(project);
  }

  async saveProject(id: string, project: GardenProject): Promise<GardenProject> {
    const updated: GardenProject = {
      ...project,
      id,
      updatedAtIso: new Date().toISOString()
    };

    const saved = await this.projectRepository.save(this.toEntity(updated));
    await this.syncPlanningResources(updated);
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
      completedTaskIds: [],
      updatedAtIso: now,
      seeds: [],
      objects: []
    };

    const saved = await this.projectRepository.save(this.toEntity(project));
    await this.syncPlanningResources(project);
    return this.toProject(saved);
  }

  async createPlanting(projectId: string, input: CreatePlantingDto): Promise<PlantingRecord> {
    await this.ensureProjectExists(projectId);

    const entity = this.plantingRepository.create({
      id: `planting-${crypto.randomUUID().slice(0, 8)}`,
      projectId,
      bedId: input.bedId,
      zoneId: input.zoneId,
      seedId: input.seedId,
      plantedOnIso: input.plantedOnIso,
      plantCount: input.plantCount,
      expectedHarvestPounds: input.expectedHarvestPounds,
      expectedHarvestDateIso: input.expectedHarvestDateIso,
      updatedAtIso: new Date().toISOString()
    });

    const saved = await this.plantingRepository.save(entity);
    await this.upsertHarvestTaskForPlanting(saved);

    return { ...saved };
  }

  async upsertPlanting(projectId: string, bedId: string, zoneId: string | undefined, input: UpsertPlantingDto): Promise<PlantingRecord> {
    await this.ensureProjectExists(projectId);

    const existing = zoneId
      ? await this.plantingRepository.findOne({
          where: {
            projectId,
            bedId,
            zoneId,
          },
          order: { updatedAtIso: 'DESC' },
        })
      : await this.plantingRepository.findOne({
          where: {
            projectId,
            bedId,
          },
          order: { updatedAtIso: 'DESC' },
        });

    const entity = this.plantingRepository.create({
      id: existing?.id ?? `planting-${crypto.randomUUID().slice(0, 8)}`,
      projectId,
      bedId,
      zoneId,
      seedId: input.seedId,
      plantedOnIso: input.plantedOnIso,
      plantCount: input.plantCount,
      expectedHarvestPounds: input.expectedHarvestPounds,
      expectedHarvestDateIso: input.expectedHarvestDateIso,
      updatedAtIso: new Date().toISOString(),
    });

    const saved = await this.plantingRepository.save(entity);
    await this.upsertHarvestTaskForPlanting(saved);
    return { ...saved };
  }

  async deletePlanting(projectId: string, bedId: string, zoneId?: string): Promise<{ deleted: true }> {
    await this.ensureProjectExists(projectId);

    if (zoneId) {
      await this.plantingRepository.delete({ projectId, bedId, zoneId });
      await this.taskRepository.delete({
        projectId,
        bedId,
        zoneId,
        id: `task-harvest-${bedId}-${zoneId}`,
      });
      await this.taskRepository.delete({
        projectId,
        bedId,
        zoneId,
        id: `task-succession-${bedId}-${zoneId}`,
      });
      await this.taskRepository.delete({
        projectId,
        bedId,
        zoneId,
        id: `task-plan-${bedId}-${zoneId}`,
      });
      return { deleted: true };
    }

    await this.plantingRepository.delete({ projectId, bedId });
    await this.taskRepository.delete({ projectId, bedId, id: `task-harvest-${bedId}` });
    await this.taskRepository.delete({ projectId, bedId, id: `task-succession-${bedId}` });
    await this.taskRepository.delete({ projectId, bedId, id: `task-plan-${bedId}` });
    return { deleted: true };
  }

  async updateTaskStatus(projectId: string, taskId: string, completed: boolean): Promise<CalendarTaskRecord> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId, projectId }
    });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found in project ${projectId}`);
    }

    task.completed = completed;
    task.updatedAtIso = new Date().toISOString();
    const saved = await this.taskRepository.save(task);
    return { ...saved };
  }

  async deleteProject(id: string): Promise<void> {
    await this.plantingRepository.delete({ projectId: id });
    await this.taskRepository.delete({ projectId: id });

    const result = await this.projectRepository.delete({ id });
    if (!result.affected) {
      throw new NotFoundException(`Project ${id} not found`);
    }
  }

  private async ensureProjectExists(projectId: string): Promise<void> {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
      select: { id: true }
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
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
      completedTaskIds: entity.completedTaskIds,
      archivedAtIso: entity.archivedAtIso,
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
      completedTaskIds: project.completedTaskIds ?? [],
      archivedAtIso: project.archivedAtIso,
      updatedAtIso: project.updatedAtIso
    });
  }

  private async syncPlanningResources(project: GardenProject): Promise<void> {
    const existingPlantings = await this.plantingRepository.find({ where: { projectId: project.id } });
    const bedLayouts = project.objects.filter((object): object is BedLayout => object.type === 'bed');
    const nowIso = new Date().toISOString();

    const plantingSources = bedLayouts.flatMap((bed) => {
      const zones = this.resolveZonesForBed(bed);
      if (zones.length === 0 && bed.planting) {
        return [{ bed, zone: undefined as BedZone | undefined, planting: bed.planting }];
      }

      return zones
        .filter((zone) => !!zone.planting)
        .map((zone) => ({ bed, zone, planting: zone.planting as BedPlanting }));
    });

    const fromBeds = plantingSources.map(({ bed, zone, planting }) => {
      const existing = existingPlantings.find(
        (entry) =>
          entry.bedId === bed.id &&
          entry.seedId === planting.seedId &&
          (entry.zoneId ?? undefined) === (zone?.id ?? undefined)
      );

      return this.plantingRepository.create({
        id: existing?.id ?? `planting-${crypto.randomUUID().slice(0, 8)}`,
        projectId: project.id,
        bedId: bed.id,
        zoneId: zone?.id,
        seedId: planting.seedId,
        plantedOnIso: planting.plantedOnIso,
        plantCount: planting.plantCount,
        expectedHarvestPounds: planting.expectedHarvestPounds,
        expectedHarvestDateIso: planting.expectedHarvestDateIso,
        updatedAtIso: nowIso
      });
    });

    await this.plantingRepository.delete({ projectId: project.id });
    if (fromBeds.length > 0) {
      await this.plantingRepository.save(fromBeds);
    }

    const completed = new Set(project.completedTaskIds ?? []);
    const taskEntities: CalendarTaskEntity[] = [];

    for (const bed of bedLayouts) {
      const zones = this.resolveZonesForBed(bed);
      if (zones.length === 0) {
        this.pushBedLevelTasks(taskEntities, project, bed, completed, nowIso);
        continue;
      }

      for (const zone of zones) {
        if (!zone.planting) {
          const taskId = `task-plan-${bed.id}-${zone.id}`;
          taskEntities.push(this.taskRepository.create({
            id: taskId,
            projectId: project.id,
            bedId: bed.id,
            zoneId: zone.id,
            priority: 'info',
            title: `Plan planting for ${bed.name} ${zone.name}`,
            dueDateIso: nowIso,
            completed: completed.has(taskId),
            updatedAtIso: nowIso
          }));
          continue;
        }

        const planting = zone.planting;
        const harvestTaskId = `task-harvest-${bed.id}-${zone.id}`;
        taskEntities.push(this.taskRepository.create({
          id: harvestTaskId,
          projectId: project.id,
          bedId: bed.id,
          zoneId: zone.id,
          priority: 'warning',
          title: `Harvest ${bed.name} ${zone.name}`,
          dueDateIso: planting.expectedHarvestDateIso,
          completed: completed.has(harvestTaskId),
          updatedAtIso: nowIso
        }));

        const seed = project.seeds.find((seedEntry) => seedEntry.id === planting.seedId);
        if (seed?.successionFriendly) {
          const successionDate = new Date(planting.plantedOnIso);
          successionDate.setDate(successionDate.getDate() + 21);
          const successionTaskId = `task-succession-${bed.id}-${zone.id}`;

          taskEntities.push(this.taskRepository.create({
            id: successionTaskId,
            projectId: project.id,
            bedId: bed.id,
            zoneId: zone.id,
            priority: 'info',
            title: `Succession sowing for ${seed.name} (${bed.name} ${zone.name})`,
            dueDateIso: successionDate.toISOString(),
            completed: completed.has(successionTaskId),
            updatedAtIso: nowIso
          }));
        }
      }
    }

    await this.taskRepository.delete({ projectId: project.id });
    if (taskEntities.length > 0) {
      await this.taskRepository.save(taskEntities);
    }
  }

  private async upsertHarvestTaskForPlanting(planting: PlantingEntity): Promise<void> {
    const project = await this.projectRepository.findOneBy({ id: planting.projectId });
    if (!project) {
      return;
    }

    const bed = project.objects.find((object) => object.type === 'bed' && object.id === planting.bedId);
    const zone =
      bed && Array.isArray((bed as BedLayout).zones)
        ? (bed as BedLayout).zones?.find((entry) => entry.id === planting.zoneId)
        : undefined;
    const title = bed ? `Harvest ${bed.name}${zone ? ` ${zone.name}` : ''}` : 'Harvest planting';
    const taskId = planting.zoneId ? `task-harvest-${planting.bedId}-${planting.zoneId}` : `task-harvest-${planting.bedId}`;

    await this.taskRepository.save(this.taskRepository.create({
      id: taskId,
      projectId: planting.projectId,
      bedId: planting.bedId,
      zoneId: planting.zoneId,
      priority: 'warning',
      title,
      dueDateIso: planting.expectedHarvestDateIso,
      completed: false,
      plantingId: planting.id,
      updatedAtIso: new Date().toISOString()
    }));
  }

  private resolveZonesForBed(bed: BedLayout): BedZone[] {
    if (!Array.isArray(bed.zones) || bed.zones.length === 0) {
      return [];
    }

    return [...bed.zones].sort((a, b) => a.rowIndex - b.rowIndex);
  }

  private pushBedLevelTasks(
    taskEntities: CalendarTaskEntity[],
    project: GardenProject,
    bed: BedLayout,
    completed: Set<string>,
    nowIso: string,
  ): void {
    if (!bed.planting) {
      const taskId = `task-plan-${bed.id}`;
      taskEntities.push(this.taskRepository.create({
        id: taskId,
        projectId: project.id,
        bedId: bed.id,
        priority: 'info',
        title: `Plan planting for ${bed.name}`,
        dueDateIso: nowIso,
        completed: completed.has(taskId),
        updatedAtIso: nowIso
      }));
      return;
    }

    const harvestTaskId = `task-harvest-${bed.id}`;
    taskEntities.push(this.taskRepository.create({
      id: harvestTaskId,
      projectId: project.id,
      bedId: bed.id,
      priority: 'warning',
      title: `Harvest ${bed.name}`,
      dueDateIso: bed.planting.expectedHarvestDateIso,
      completed: completed.has(harvestTaskId),
      updatedAtIso: nowIso
    }));

    const seed = project.seeds.find((seedEntry) => seedEntry.id === bed.planting?.seedId);
    if (seed?.successionFriendly) {
      const successionDate = new Date(bed.planting.plantedOnIso);
      successionDate.setDate(successionDate.getDate() + 21);
      const successionTaskId = `task-succession-${bed.id}`;

      taskEntities.push(this.taskRepository.create({
        id: successionTaskId,
        projectId: project.id,
        bedId: bed.id,
        priority: 'info',
        title: `Succession sowing for ${seed.name}`,
        dueDateIso: successionDate.toISOString(),
        completed: completed.has(successionTaskId),
        updatedAtIso: nowIso
      }));
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
      completedTaskIds: [],
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
