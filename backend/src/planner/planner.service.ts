import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateProjectDto } from './dto/create-project.dto';
import { CreatePlacementDto } from './dto/create-placement.dto';
import {
  BedDetailsResponse,
  BedSummaryRecord,
  CalendarTaskRecord,
  HarvestPreviewResponse,
  PlannerWarningRecord,
  PlantingRecord,
} from './dto/planning.types';
import { PreviewHarvestDto } from './dto/preview-harvest.dto';
import { UpdateBedDetailsDto } from './dto/update-bed-details.dto';
import { UpdatePlacementDto } from './dto/update-placement.dto';
import { CalendarTaskEntity } from './entities/calendar-task.entity';
import { PlantingEntity } from './entities/planting.entity';
import { PlannerProjectEntity } from './entities/planner-project.entity';
import {
  BedLayout,
  BedPlacement,
  BedPlanting,
  BedZone,
  GardenProject,
  SeedMetadata,
} from './models/planner.types';
import {
  calculateExpectedHarvestDateIso,
  calculateExpectedHarvestPounds,
  computeBedOccupancyMetrics,
  getLegacyZonePlacement,
  getWholeBedPlacement,
  isIsoDateValid,
  normalizePlacementPoints,
  polygonAreaSqInches,
} from './planner-placement.utils';
import { SeedCatalogService } from './seed-catalog.service';

interface TaskFilters {
  bedId?: string;
  placementId?: string;
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
    private readonly taskRepository: Repository<CalendarTaskEntity>,
    private readonly seedCatalogService: SeedCatalogService,
  ) {}

  async onModuleInit(): Promise<void> {
    const count = await this.projectRepository.count();
    if (count === 0) {
      const starter = this.createStarterProject();
      await this.projectRepository.save(this.toEntity(starter));
    }

    const projects = await this.projectRepository.find();
    for (const entity of projects) {
      const project = this.toProject(entity);
      await this.ensureLegacyPlacements(project);
      await this.syncProjectTasks(project.id);
    }
  }

  async listProjects(): Promise<GardenProject[]> {
    const projects = await this.projectRepository.find({
      order: {
        updatedAtIso: 'DESC',
      },
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

  async listProjectPlantings(
    projectId: string,
    bedId?: string,
  ): Promise<PlantingRecord[]> {
    await this.ensureProjectExists(projectId);
    const where: Partial<PlantingEntity> = bedId ? { projectId, bedId } : { projectId };
    const plantings = await this.plantingRepository.find({
      where,
      order: {
        updatedAtIso: 'DESC',
      },
    });

    return plantings.map((entry) => this.toPlantingRecord(entry));
  }

  async listProjectTasks(
    projectId: string,
    filters?: TaskFilters,
  ): Promise<CalendarTaskRecord[]> {
    await this.ensureProjectExists(projectId);

    const where: Partial<CalendarTaskEntity> = { projectId };
    if (filters?.bedId) {
      where.bedId = filters.bedId;
    }
    if (filters?.placementId) {
      where.plantingId = filters.placementId;
    }
    if (filters?.completed !== undefined) {
      where.completed = filters.completed;
    }

    const tasks = await this.taskRepository.find({
      where,
      order: { dueDateIso: 'ASC' },
    });

    return tasks.map((entry) => this.toTaskRecord(entry));
  }

  async listBedSummaries(projectId: string): Promise<BedSummaryRecord[]> {
    const project = await this.getProject(projectId);
    await this.ensureLegacyPlacements(project);
    const seedCatalog = await this.seedCatalogService.listSeeds();
    const placements = await this.plantingRepository.find({
      where: { projectId },
      order: { plantedOnIso: 'ASC' },
    });
    const tasks = await this.taskRepository.find({
      where: { projectId },
      order: { dueDateIso: 'ASC' },
    });
    const beds = project.objects.filter(
      (object): object is BedLayout => object.type === 'bed',
    );

    return beds.map((bed) =>
      this.buildBedSummary(
        project,
        bed,
        placements.filter((placement) => placement.bedId === bed.id),
        tasks.filter((task) => task.bedId === bed.id),
        seedCatalog,
      ),
    );
  }

  async getBedDetails(
    projectId: string,
    bedId: string,
  ): Promise<BedDetailsResponse> {
    const project = await this.getProject(projectId);
    await this.ensureLegacyPlacements(project);
    const bed = this.requireBed(project, bedId);
    const seedCatalog = await this.seedCatalogService.listSeeds();
    const placements = await this.plantingRepository.find({
      where: { projectId, bedId },
      order: { plantedOnIso: 'ASC' },
    });
    const tasks = await this.taskRepository.find({
      where: { projectId, bedId },
      order: { dueDateIso: 'ASC' },
    });
    const summary = this.buildBedSummary(project, bed, placements, tasks, seedCatalog);

    return {
      bed,
      placements: placements.map((placement) => this.toPlantingRecord(placement)),
      summary,
      tasks: tasks.map((task) => this.toTaskRecord(task)),
      warnings: summary.warnings,
    };
  }

  async updateBedDetails(
    projectId: string,
    bedId: string,
    input: UpdateBedDetailsDto,
  ): Promise<BedDetailsResponse> {
    const project = await this.getProject(projectId);
    this.requireBed(project, bedId);

    const nextProject: GardenProject = {
      ...project,
      objects: project.objects.map((object) => {
        if (object.type !== 'bed' || object.id !== bedId) {
          return object;
        }

        return {
          ...object,
          name: input.name?.trim() ? input.name.trim() : object.name,
          rows: input.rows ?? object.rows,
          sunExposure: input.sunExposure ?? object.sunExposure,
          soil: input.soil
            ? {
                ph: input.soil.ph,
                drainage: input.soil.drainage,
                organicMatterPercent: input.soil.organicMatterPercent,
              }
            : object.soil,
          lastSeasonFamily:
            input.lastSeasonFamily !== undefined
              ? input.lastSeasonFamily
              : object.lastSeasonFamily,
        };
      }),
      updatedAtIso: new Date().toISOString(),
    };

    await this.projectRepository.save(this.toEntity(nextProject));
    await this.syncProjectTasks(projectId);
    return this.getBedDetails(projectId, bedId);
  }

  async syncProjectTasks(projectId: string): Promise<void> {
    const project = await this.getProject(projectId);
    const seedCatalog = await this.seedCatalogService.listSeeds();
    const placements = await this.plantingRepository.find({
      where: { projectId },
      order: { plantedOnIso: 'ASC' },
    });
    const existingTasks = await this.taskRepository.find({
      where: { projectId },
    });
    const existingTasksById = new Map(existingTasks.map((task) => [task.id, task]));
    const beds = project.objects.filter(
      (object): object is BedLayout => object.type === 'bed',
    );
    const bedMap = new Map(beds.map((bed) => [bed.id, bed]));
    const completedTaskIds = new Set(project.completedTaskIds ?? []);
    const tasks: CalendarTaskEntity[] = [];
    const nowIso = new Date().toISOString();

    for (const placement of placements) {
      const bed = bedMap.get(placement.bedId);
      if (!bed) {
        continue;
      }

      const seed = this.resolveSeedMetadata(project, placement.seedId, seedCatalog);
      const placementRecord = this.toPlantingRecord(placement);
      const harvestTitle = `Harvest ${seed?.name ?? placement.seedId} in ${bed.name}`;
      const successionTitle = `Succession sow ${seed?.name ?? placement.seedId} in ${bed.name}`;
      const earlyMaintenanceTitle = `Check ${seed?.name ?? placement.seedId} in ${bed.name}`;
      const midpointMaintenanceTitle = `Mid-cycle care for ${seed?.name ?? placement.seedId} in ${bed.name}`;

      tasks.push(
        this.createTaskEntity(
          existingTasksById,
          completedTaskIds,
          placementRecord,
          bed,
          {
            id: `task-harvest-${placement.id}`,
            title: harvestTitle,
            dueDateIso: placement.expectedHarvestDateIso,
            priority: 'warning',
            taskType: 'harvest',
          },
          nowIso,
        ),
      );

      if (seed?.successionFriendly) {
        const successionDate = new Date(placement.plantedOnIso);
        successionDate.setDate(successionDate.getDate() + 21);
        tasks.push(
          this.createTaskEntity(
            existingTasksById,
            completedTaskIds,
            placementRecord,
            bed,
            {
              id: `task-succession-${placement.id}`,
              title: successionTitle,
              dueDateIso: successionDate.toISOString(),
              priority: 'info',
              taskType: 'succession',
            },
            nowIso,
          ),
        );
      }

      const plantedOn = new Date(placement.plantedOnIso);
      const earlyMaintenanceDate = new Date(plantedOn);
      earlyMaintenanceDate.setDate(earlyMaintenanceDate.getDate() + 7);
      tasks.push(
        this.createTaskEntity(
          existingTasksById,
          completedTaskIds,
          placementRecord,
          bed,
          {
            id: `task-maintenance-early-${placement.id}`,
            title: earlyMaintenanceTitle,
            dueDateIso: earlyMaintenanceDate.toISOString(),
            priority: 'info',
            taskType: 'maintenance',
          },
          nowIso,
        ),
      );

      const harvestAt = new Date(placement.expectedHarvestDateIso).getTime();
      const midpointDate = new Date(
        plantedOn.getTime() + Math.max(0, harvestAt - plantedOn.getTime()) / 2,
      );
      tasks.push(
        this.createTaskEntity(
          existingTasksById,
          completedTaskIds,
          placementRecord,
          bed,
          {
            id: `task-maintenance-mid-${placement.id}`,
            title: midpointMaintenanceTitle,
            dueDateIso: midpointDate.toISOString(),
            priority: 'info',
            taskType: 'maintenance',
          },
          nowIso,
        ),
      );
    }

    await this.taskRepository.delete({ projectId });
    if (tasks.length > 0) {
      await this.taskRepository.save(tasks);
    }

    const nextCompletedTaskIds = tasks
      .filter((task) => task.completed)
      .map((task) => task.id);
    await this.projectRepository.update(
      { id: projectId },
      {
        completedTaskIds: nextCompletedTaskIds,
      },
    );
  }

  async saveProject(id: string, project: GardenProject): Promise<GardenProject> {
    const updated: GardenProject = {
      ...project,
      id,
      updatedAtIso: new Date().toISOString(),
    };

    const saved = await this.projectRepository.save(this.toEntity(updated));
    await this.ensureLegacyPlacements(updated);
    await this.syncProjectTasks(id);
    const reloaded = await this.projectRepository.findOneByOrFail({ id });
    return this.toProject(reloaded ?? saved);
  }

  async createProject(input: CreateProjectDto): Promise<GardenProject> {
    const now = new Date().toISOString();
    const id = `project-${crypto.randomUUID().slice(0, 8)}`;

    const project: GardenProject = {
      id,
      name: input.name,
      season: input.season,
      climateZone: input.climateZone,
      lastFrostDateIso: input.lastFrostDateIso,
      firstFrostDateIso: input.firstFrostDateIso,
      completedTaskIds: [],
      updatedAtIso: now,
      seeds: [],
      objects: [],
    };

    const saved = await this.projectRepository.save(this.toEntity(project));
    return this.toProject(saved);
  }

  async createPlacement(
    projectId: string,
    bedId: string,
    input: CreatePlacementDto,
  ): Promise<PlantingRecord> {
    const project = await this.getProject(projectId);
    const bed = this.requireBed(project, bedId);
    const seedCatalog = await this.seedCatalogService.listSeeds();
    const seed = this.requireSeed(project, input.seedId, seedCatalog);
    const nowIso = new Date().toISOString();
    const entity = this.plantingRepository.create({
      id: `planting-${crypto.randomUUID().slice(0, 8)}`,
      projectId,
      bedId,
      seedId: input.seedId,
      plantedOnIso: input.plantedOnIso,
      plantCount: input.plantCount,
      expectedHarvestPounds: calculateExpectedHarvestPounds(input.plantCount, seed),
      expectedHarvestDateIso: calculateExpectedHarvestDateIso(
        input.plantedOnIso,
        seed,
      ),
      colorHex: input.colorHex,
      placementMode: input.placementMode,
      polygonPoints: normalizePlacementPoints(bed, input.polygonPoints),
      updatedAtIso: nowIso,
    });

    const saved = await this.plantingRepository.save(entity);
    await this.syncProjectTasks(projectId);
    return this.toPlantingRecord(saved);
  }

  async updatePlacement(
    projectId: string,
    bedId: string,
    placementId: string,
    input: UpdatePlacementDto,
  ): Promise<PlantingRecord> {
    const project = await this.getProject(projectId);
    const bed = this.requireBed(project, bedId);
    const existing = await this.plantingRepository.findOneBy({
      id: placementId,
      projectId,
      bedId,
    });

    if (!existing) {
      throw new NotFoundException(
        `Placement ${placementId} not found in bed ${bedId}`,
      );
    }

    const seedCatalog = await this.seedCatalogService.listSeeds();
    const seed = this.requireSeed(project, input.seedId, seedCatalog);

    const saved = await this.plantingRepository.save(
      this.plantingRepository.create({
        ...existing,
        seedId: input.seedId,
        plantedOnIso: input.plantedOnIso,
        plantCount: input.plantCount,
        expectedHarvestPounds: calculateExpectedHarvestPounds(input.plantCount, seed),
        expectedHarvestDateIso: calculateExpectedHarvestDateIso(
          input.plantedOnIso,
          seed,
        ),
        colorHex: input.colorHex,
        placementMode: input.placementMode,
        polygonPoints: normalizePlacementPoints(bed, input.polygonPoints),
        updatedAtIso: new Date().toISOString(),
      }),
    );

    await this.syncProjectTasks(projectId);
    return this.toPlantingRecord(saved);
  }

  async deletePlacement(
    projectId: string,
    bedId: string,
    placementId: string,
  ): Promise<{ deleted: true }> {
    await this.ensureProjectExists(projectId);
    await this.plantingRepository.delete({
      id: placementId,
      projectId,
      bedId,
    });
    await this.syncProjectTasks(projectId);
    return { deleted: true };
  }

  async previewHarvest(
    projectId: string,
    bedId: string,
    input: PreviewHarvestDto,
  ): Promise<HarvestPreviewResponse> {
    const project = await this.getProject(projectId);
    this.requireBed(project, bedId);
    const seedCatalog = await this.seedCatalogService.listSeeds();
    const seed = this.requireSeed(project, input.seedId, seedCatalog);

    return {
      expectedHarvestDateIso: calculateExpectedHarvestDateIso(
        input.plantedOnIso,
        seed,
      ),
      expectedHarvestPounds: calculateExpectedHarvestPounds(
        input.plantCount,
        seed,
      ),
    };
  }

  async updateTaskStatus(
    projectId: string,
    taskId: string,
    completed: boolean,
  ): Promise<CalendarTaskRecord> {
    const task = await this.taskRepository.findOne({
      where: { id: taskId, projectId },
    });

    if (!task) {
      throw new NotFoundException(
        `Task ${taskId} not found in project ${projectId}`,
      );
    }

    task.completed = completed;
    task.updatedAtIso = new Date().toISOString();
    const saved = await this.taskRepository.save(task);

    const project = await this.getProject(projectId);
    const completedTaskIds = new Set(project.completedTaskIds ?? []);
    if (completed) {
      completedTaskIds.add(taskId);
    } else {
      completedTaskIds.delete(taskId);
    }
    await this.projectRepository.update(
      { id: projectId },
      { completedTaskIds: [...completedTaskIds] },
    );

    return this.toTaskRecord(saved);
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
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
  }

  private async ensureLegacyPlacements(project: GardenProject): Promise<void> {
    const existing = await this.plantingRepository.find({
      where: { projectId: project.id },
    });
    const existingByLegacyKey = new Map(
      existing.map((placement) => [
        this.buildLegacyPlacementKey(placement.bedId, placement.legacyZoneId),
        placement,
      ]),
    );
    const recordsToSave: PlantingEntity[] = [];
    const seedCatalog = await this.seedCatalogService.listSeeds();

    for (const object of project.objects) {
      if (object.type !== 'bed') {
        continue;
      }

      const bed = object;

      for (const zone of bed.zones ?? []) {
        if (!zone.planting) {
          continue;
        }

        const existingPlacement = existingByLegacyKey.get(
          this.buildLegacyPlacementKey(bed.id, zone.id),
        );
        if (existingPlacement) {
          if (
            existingPlacement.polygonPoints.length >= 3 &&
            existingPlacement.colorHex &&
            existingPlacement.placementMode
          ) {
            continue;
          }

          const legacyPlacement = this.buildPlacementFromLegacyZone(
            project,
            bed,
            zone,
            existingPlacement.id,
            seedCatalog,
          );
          recordsToSave.push(legacyPlacement);
          continue;
        }

        recordsToSave.push(
          this.buildPlacementFromLegacyZone(
            project,
            bed,
            zone,
            undefined,
            seedCatalog,
          ),
        );
      }

      if (!bed.planting) {
        continue;
      }

      const existingPlacement = existingByLegacyKey.get(
        this.buildLegacyPlacementKey(bed.id, undefined),
      );
      if (existingPlacement) {
        continue;
      }

      recordsToSave.push(
        this.buildPlacementFromLegacyBed(
          project,
          bed,
          bed.planting,
          seedCatalog,
        ),
      );
    }

    if (recordsToSave.length > 0) {
      await this.plantingRepository.save(recordsToSave);
    }
  }

  private buildPlacementFromLegacyZone(
    project: GardenProject,
    bed: BedLayout,
    zone: BedZone,
    placementId: string | undefined,
    seedCatalog: SeedMetadata[],
  ): PlantingEntity {
    const geometry = getLegacyZonePlacement(bed, zone);
    const seed = this.resolveSeedMetadata(
      project,
      zone.planting!.seedId,
      seedCatalog,
    );
    const expectedHarvestDateIso = isIsoDateValid(
      zone.planting?.expectedHarvestDateIso,
    )
      ? zone.planting!.expectedHarvestDateIso
      : seed
        ? calculateExpectedHarvestDateIso(zone.planting!.plantedOnIso, seed)
        : zone.planting!.plantedOnIso;
    const expectedHarvestPounds =
      typeof zone.planting?.expectedHarvestPounds === 'number'
        ? zone.planting.expectedHarvestPounds
        : seed
          ? calculateExpectedHarvestPounds(zone.planting!.plantCount, seed)
          : 0;

    return this.plantingRepository.create({
      id: placementId ?? `planting-${crypto.randomUUID().slice(0, 8)}`,
      projectId: project.id,
      bedId: bed.id,
      legacyZoneId: zone.id,
      seedId: zone.planting!.seedId,
      plantedOnIso: zone.planting!.plantedOnIso,
      plantCount: zone.planting!.plantCount,
      expectedHarvestPounds,
      expectedHarvestDateIso,
      colorHex: geometry.colorHex,
      placementMode: geometry.placementMode,
      polygonPoints: geometry.polygonPoints,
      updatedAtIso: new Date().toISOString(),
    });
  }

  private buildPlacementFromLegacyBed(
    project: GardenProject,
    bed: BedLayout,
    planting: BedPlanting,
    seedCatalog: SeedMetadata[],
  ): PlantingEntity {
    const geometry = getWholeBedPlacement(bed);
    const seed = this.resolveSeedMetadata(project, planting.seedId, seedCatalog);
    const expectedHarvestDateIso = isIsoDateValid(
      planting.expectedHarvestDateIso,
    )
      ? planting.expectedHarvestDateIso
      : seed
        ? calculateExpectedHarvestDateIso(planting.plantedOnIso, seed)
        : planting.plantedOnIso;
    const expectedHarvestPounds =
      typeof planting.expectedHarvestPounds === 'number'
        ? planting.expectedHarvestPounds
        : seed
          ? calculateExpectedHarvestPounds(planting.plantCount, seed)
          : 0;

    return this.plantingRepository.create({
      id: `planting-${crypto.randomUUID().slice(0, 8)}`,
      projectId: project.id,
      bedId: bed.id,
      seedId: planting.seedId,
      plantedOnIso: planting.plantedOnIso,
      plantCount: planting.plantCount,
      expectedHarvestPounds,
      expectedHarvestDateIso,
      colorHex: geometry.colorHex,
      placementMode: geometry.placementMode,
      polygonPoints: geometry.polygonPoints,
      updatedAtIso: new Date().toISOString(),
    });
  }

  private buildBedSummary(
    project: GardenProject,
    bed: BedLayout,
    placements: PlantingEntity[],
    tasks: CalendarTaskEntity[],
    seedCatalog: SeedMetadata[],
  ): BedSummaryRecord {
    const placementRecords = placements.map((placement) =>
      this.toPlantingRecord(placement),
    );
    const placementDomainRecords: BedPlacement[] = placementRecords.map((placement) => ({
      ...placement,
    }));
    const metrics = computeBedOccupancyMetrics(bed, placementDomainRecords);
    const warnings = this.buildBedWarnings(
      project,
      bed,
      placementDomainRecords,
      metrics,
      seedCatalog,
    );
    const plantsMap = new Map<
      string,
      {
        seedId: string;
        name: string;
        variety: string;
        plantCount: number;
        expectedHarvestPounds: number;
        placementCount: number;
        colorHex?: string;
        nextHarvestDateIso?: string;
      }
    >();

    for (const placement of placementDomainRecords) {
      const seed = this.resolveSeedMetadata(project, placement.seedId, seedCatalog);
      const current = plantsMap.get(placement.seedId);
      if (!current) {
        plantsMap.set(placement.seedId, {
          seedId: placement.seedId,
          name: seed?.name ?? placement.seedId,
          variety: seed?.variety ?? '',
          plantCount: placement.plantCount,
          expectedHarvestPounds: placement.expectedHarvestPounds,
          placementCount: 1,
          colorHex: placement.colorHex,
          nextHarvestDateIso: placement.expectedHarvestDateIso,
        });
        continue;
      }

      current.plantCount += placement.plantCount;
      current.expectedHarvestPounds = Number(
        (
          current.expectedHarvestPounds + placement.expectedHarvestPounds
        ).toFixed(1),
      );
      current.placementCount += 1;
      current.nextHarvestDateIso =
        current.nextHarvestDateIso &&
        current.nextHarvestDateIso < placement.expectedHarvestDateIso
          ? current.nextHarvestDateIso
          : placement.expectedHarvestDateIso;
    }

    return {
      bedId: bed.id,
      bedName: bed.name,
      currentPlants: [...plantsMap.values()].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
      nextTasks: tasks
        .filter((task) => !task.completed)
        .sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso))
        .slice(0, 3)
        .map((task) => this.toTaskRecord(task)),
      placementsCount: placementDomainRecords.length,
      occupiedAreaSqInches: metrics.occupiedAreaSqInches,
      openAreaSqInches: metrics.openAreaSqInches,
      totalAreaSqInches: metrics.totalAreaSqInches,
      warnings,
    };
  }

  private buildBedWarnings(
    project: GardenProject,
    bed: BedLayout,
    placements: BedPlacement[],
    metrics: ReturnType<typeof computeBedOccupancyMetrics>,
    seedCatalog: SeedMetadata[],
  ): PlannerWarningRecord[] {
    const warnings: PlannerWarningRecord[] = [];

    for (const placement of placements) {
      const seed = this.resolveSeedMetadata(project, placement.seedId, seedCatalog);
      if (!seed) {
        continue;
      }

      if (seed.preferredSun !== bed.sunExposure) {
        warnings.push({
          id: `sun-${placement.id}`,
          title: `${seed.name}: sunlight mismatch`,
          detail: `${seed.name} prefers ${seed.preferredSun.replace('-', ' ')}, but ${bed.name} is ${bed.sunExposure.replace('-', ' ')}.`,
          severity: 'warning',
          bedId: bed.id,
          placementId: placement.id,
        });
      }

      if (bed.soil.ph < seed.soilPhMin || bed.soil.ph > seed.soilPhMax) {
        warnings.push({
          id: `soil-${placement.id}`,
          title: `${seed.name}: soil pH risk`,
          detail: `${seed.name} prefers pH ${seed.soilPhMin}-${seed.soilPhMax}; ${bed.name} is ${bed.soil.ph}.`,
          severity: 'warning',
          bedId: bed.id,
          placementId: placement.id,
        });
      }

      if (bed.lastSeasonFamily && bed.lastSeasonFamily === seed.family) {
        warnings.push({
          id: `rotation-${placement.id}`,
          title: `${seed.name}: crop rotation conflict`,
          detail: `${bed.name} last season family was ${seed.family}.`,
          severity: 'critical',
          bedId: bed.id,
          placementId: placement.id,
        });
      }

      const placementArea =
        metrics.placementAreas.get(placement.id) ??
        polygonAreaSqInches(placement.polygonPoints);
      const recommendedArea = seed.spacingInches * seed.rowSpacingInches;
      const density = placementArea
        ? (placement.plantCount * recommendedArea) / placementArea
        : 0;
      if (density > 1) {
        warnings.push({
          id: `density-${placement.id}`,
          title: `${seed.name}: spacing exceeds recommendation`,
          detail: `Estimated density is ${(density * 100).toFixed(0)}% of the recommended spacing.`,
          severity: 'critical',
          bedId: bed.id,
          placementId: placement.id,
        });
      }
    }

    for (const [firstId, secondId] of metrics.overlapPairs) {
      const first = placements.find((placement) => placement.id === firstId);
      const second = placements.find((placement) => placement.id === secondId);
      if (!first || !second) {
        continue;
      }

      const firstSeed = this.resolveSeedMetadata(project, first.seedId, seedCatalog);
      const secondSeed = this.resolveSeedMetadata(project, second.seedId, seedCatalog);
      warnings.push({
        id: `overlap-${first.id}-${second.id}`,
        title: `Placement overlap in ${bed.name}`,
        detail: `${firstSeed?.name ?? first.seedId} overlaps ${secondSeed?.name ?? second.seedId}.`,
        severity: 'warning',
        bedId: bed.id,
      });
    }

    return warnings.sort((a, b) => a.title.localeCompare(b.title));
  }

  private createTaskEntity(
    existingTasksById: Map<string, CalendarTaskEntity>,
    completedTaskIds: Set<string>,
    placement: PlantingRecord,
    bed: BedLayout,
    input: {
      id: string;
      title: string;
      dueDateIso: string;
      priority: 'info' | 'warning' | 'critical';
      taskType: 'harvest' | 'succession' | 'maintenance';
    },
    nowIso: string,
  ): CalendarTaskEntity {
    const existingCompleted = existingTasksById.get(input.id)?.completed;
    const completed =
      existingCompleted !== undefined
        ? existingCompleted
        : completedTaskIds.has(input.id) ||
          this.resolveLegacyTaskCompletion(completedTaskIds, placement, input.taskType);

    return this.taskRepository.create({
      id: input.id,
      projectId: placement.projectId,
      bedId: bed.id,
      priority: input.priority,
      title: input.title,
      dueDateIso: input.dueDateIso,
      completed,
      plantingId: placement.id,
      taskType: input.taskType,
      updatedAtIso: nowIso,
    });
  }

  private resolveLegacyTaskCompletion(
    completedTaskIds: Set<string>,
    placement: PlantingRecord,
    taskType: 'harvest' | 'succession' | 'maintenance',
  ): boolean {
    if (taskType === 'maintenance') {
      return false;
    }

    const suffix = placement.legacyZoneId
      ? `${placement.bedId}-${placement.legacyZoneId}`
      : placement.bedId;
    return completedTaskIds.has(`task-${taskType}-${suffix}`);
  }

  private requireSeed(
    project: GardenProject,
    seedId: string,
    seedCatalog: SeedMetadata[],
  ): SeedMetadata {
    const seed = this.resolveSeedMetadata(project, seedId, seedCatalog);
    if (!seed) {
      throw new NotFoundException(`Seed ${seedId} not found`);
    }

    return seed;
  }

  private resolveSeedMetadata(
    project: GardenProject,
    seedId: string,
    seedCatalog: SeedMetadata[],
  ): SeedMetadata | undefined {
    return (
      project.seeds.find((seed) => seed.id === seedId) ??
      seedCatalog.find((seed) => seed.id === seedId)
    );
  }

  private requireBed(project: GardenProject, bedId: string): BedLayout {
    const bed = project.objects.find(
      (object): object is BedLayout => object.type === 'bed' && object.id === bedId,
    );
    if (!bed) {
      throw new NotFoundException(`Bed ${bedId} not found`);
    }

    return bed;
  }

  private buildLegacyPlacementKey(
    bedId: string,
    legacyZoneId?: string,
  ): string {
    return `${bedId}::${legacyZoneId ?? 'bed'}`;
  }

  private toPlantingRecord(entity: PlantingEntity): PlantingRecord {
    return {
      id: entity.id,
      projectId: entity.projectId,
      bedId: entity.bedId,
      seedId: entity.seedId,
      plantedOnIso: entity.plantedOnIso,
      plantCount: entity.plantCount,
      expectedHarvestPounds: entity.expectedHarvestPounds,
      expectedHarvestDateIso: entity.expectedHarvestDateIso,
      colorHex: entity.colorHex,
      placementMode: entity.placementMode,
      polygonPoints: entity.polygonPoints,
      legacyZoneId: entity.legacyZoneId,
      updatedAtIso: entity.updatedAtIso,
    };
  }

  private toTaskRecord(entity: CalendarTaskEntity): CalendarTaskRecord {
    return {
      id: entity.id,
      projectId: entity.projectId,
      bedId: entity.bedId,
      title: entity.title,
      dueDateIso: entity.dueDateIso,
      priority: entity.priority,
      completed: entity.completed,
      plantingId: entity.plantingId,
      placementId: entity.plantingId,
      taskType: entity.taskType,
      updatedAtIso: entity.updatedAtIso,
    };
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
      updatedAtIso: entity.updatedAtIso,
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
      updatedAtIso: project.updatedAtIso,
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
          notes: 'Indeterminate cherry tomato.',
          companionSeedIds: ['seed-lettuce-romaine'],
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
          notes: 'Great for succession sowing every 2-3 weeks.',
          companionSeedIds: ['seed-tomato-sungold'],
          conflictSeedIds: ['seed-blueberry-patriot'],
        },
        {
          id: 'seed-blueberry-patriot',
          name: 'Blueberry',
          variety: 'Patriot',
          lifecycle: 'perennial',
          family: 'Ericaceae',
          spacingInches: 48,
          rowSpacingInches: 72,
          daysToMaturity: 365,
          matureSpreadInches: 60,
          preferredSun: 'full-sun',
          soilPhMin: 4.5,
          soilPhMax: 5.5,
          successionFriendly: false,
          yield: { averagePoundsPerPlant: 6 },
          notes: 'Perennial shrub, acidic soil required.',
          conflictSeedIds: ['seed-lettuce-romaine'],
        },
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
            organicMatterPercent: 5,
          },
          lastSeasonFamily: 'Brassicaceae',
        },
        {
          id: 'bed-b',
          type: 'bed',
          name: 'South Bed',
          xInches: 180,
          yInches: 72,
          widthInches: 96,
          heightInches: 36,
          rotationDeg: 0,
          rows: 3,
          sunExposure: 'part-sun',
          soil: {
            ph: 6.8,
            drainage: 'moderate',
            organicMatterPercent: 4,
          },
        },
        {
          id: 'tree-pear',
          type: 'tree',
          name: 'Pear Tree',
          xInches: 360,
          yInches: 48,
          widthInches: 72,
          heightInches: 72,
          rotationDeg: 0,
          canopyDiameterInches: 120,
        },
        {
          id: 'structure-shed',
          type: 'structure',
          name: 'Tool Shed',
          xInches: 300,
          yInches: 220,
          widthInches: 84,
          heightInches: 60,
          rotationDeg: 0,
        },
      ],
    };
  }
}
