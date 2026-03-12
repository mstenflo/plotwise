import { computed, inject, Injectable, signal } from '@angular/core';
import {
  BedGeometryUpdate,
  BedLayout,
  GardenProject,
  LayoutObject,
  PlannerTask,
  PlannerWarning,
  ProjectSeason
} from '../models/planner.model';
import { SeedMetadata } from '../models/seed.model';
import { formatInches } from '../models/units.model';
import { PlannerApiService } from './planner-api.service';

const STORAGE_KEY = 'plotwise.projects.v1';

@Injectable({ providedIn: 'root' })
export class PlannerStateService {
  private readonly storage = this.resolveStorage();
  private readonly plannerApi = inject(PlannerApiService);

  readonly selectedObjectId = signal<string | null>(null);
  readonly selectedSeedId = signal<string | null>(null);
  readonly activeProjectId = signal<string>('project-home');

  readonly projects = signal<GardenProject[]>(this.loadProjects());

  constructor() {
    this.loadSavedProjects();
  }

  readonly activeProject = computed(() =>
    this.projects().find((project) => project.id === this.activeProjectId()) ?? this.projects()[0]
  );

  readonly season = computed(() => this.activeProject().season);
  readonly seeds = computed(() => this.activeProject().seeds);
  readonly beds = computed(() => this.activeProject().objects.filter((obj): obj is BedLayout => obj.type === 'bed'));

  readonly selectedObject = computed(() =>
    this.activeProject().objects.find((item) => item.id === this.selectedObjectId()) ?? null
  );

  readonly selectedBed = computed(() =>
    this.beds().find((bed) => bed.id === this.selectedObjectId()) ?? null
  );

  readonly tasks = computed<PlannerTask[]>(() => {
    const items: PlannerTask[] = [];
    const completedTaskIds = new Set(this.activeProject().completedTaskIds ?? []);

    for (const bed of this.beds()) {
      if (!bed.planting) {
        items.push({
          id: `task-plan-${bed.id}`,
          title: `Plan planting for ${bed.name}`,
          dueDateIso: new Date().toISOString(),
          bedId: bed.id,
          priority: 'info',
          completed: completedTaskIds.has(`task-plan-${bed.id}`)
        });
        continue;
      }

      items.push({
        id: `task-harvest-${bed.id}`,
        title: `Harvest ${bed.name}`,
        dueDateIso: bed.planting.expectedHarvestDateIso,
        bedId: bed.id,
        priority: 'warning',
        completed: completedTaskIds.has(`task-harvest-${bed.id}`)
      });

      const seed = this.seeds().find((entry) => entry.id === bed.planting?.seedId);
      if (seed?.successionFriendly) {
        const successionDate = new Date(bed.planting.plantedOnIso);
        successionDate.setDate(successionDate.getDate() + 21);
        items.push({
          id: `task-succession-${bed.id}`,
          title: `Succession sowing for ${seed.name}`,
          dueDateIso: successionDate.toISOString(),
          bedId: bed.id,
          priority: 'info',
          completed: completedTaskIds.has(`task-succession-${bed.id}`)
        });
      }
    }

    return items.sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso));
  });

  readonly warnings = computed<PlannerWarning[]>(() => {
    const result: PlannerWarning[] = [];

    for (const bed of this.beds()) {
      if (!bed.planting) {
        continue;
      }

      const seed = this.seeds().find((entry) => entry.id === bed.planting?.seedId);
      if (!seed) {
        continue;
      }

      if (seed.preferredSun !== bed.sunExposure) {
        result.push({
          id: `sun-${bed.id}`,
          title: `${bed.name}: sunlight mismatch`,
          detail: `${seed.name} prefers ${seed.preferredSun.replace('-', ' ')}, bed is ${bed.sunExposure.replace('-', ' ')}.`,
          severity: 'warning',
          bedId: bed.id
        });
      }

      if (bed.soil.ph < seed.soilPhMin || bed.soil.ph > seed.soilPhMax) {
        result.push({
          id: `soil-${bed.id}`,
          title: `${bed.name}: soil pH risk`,
          detail: `${seed.name} target pH is ${seed.soilPhMin}-${seed.soilPhMax}. Current pH is ${bed.soil.ph}.`,
          severity: 'warning',
          bedId: bed.id
        });
      }

      if (bed.lastSeasonFamily === seed.family) {
        result.push({
          id: `rotation-${bed.id}`,
          title: `${bed.name}: crop rotation conflict`,
          detail: `${seed.family} family was already planted last season in this bed.`,
          severity: 'critical',
          bedId: bed.id
        });
      }

      const density = this.calculateDensityScore(bed, seed);
      if (density > 1) {
        result.push({
          id: `density-${bed.id}`,
          title: `${bed.name}: spacing exceeds recommendation`,
          detail: `Estimated density is ${(density * 100).toFixed(0)}% of recommended spacing.`,
          severity: 'critical',
          bedId: bed.id
        });
      }
    }

    result.push(...this.computeCompanionWarnings());

    if (result.length === 0) {
      result.push({
        id: 'healthy-plan',
        title: 'No active warnings',
        detail: 'Current project has no detected spacing, soil, or rotation conflicts.',
        severity: 'info'
      });
    }

    return result;
  });

  addBed(): void {
    const index = this.beds().length + 1;
    const newBed: BedLayout = {
      id: `bed-${crypto.randomUUID().slice(0, 8)}`,
      type: 'bed',
      name: `Bed ${index}`,
      xInches: 24 + index * 12,
      yInches: 24 + index * 8,
      widthInches: 96,
      heightInches: 36,
      rotationDeg: 0,
      rows: 3,
      sunExposure: 'full-sun',
      soil: {
        ph: 6.5,
        drainage: 'good',
        organicMatterPercent: 4
      }
    };

    this.patchProject((project) => ({
      ...project,
      objects: [...project.objects, newBed]
    }));
    this.selectedObjectId.set(newBed.id);
  }

  selectObject(objectId: string | null): void {
    this.selectedObjectId.set(objectId);
  }

  selectSeed(seedId: string): void {
    this.selectedSeedId.set(seedId);
  }

  setActiveProject(projectId: string): void {
    const exists = this.projects().some((project) => project.id === projectId);
    if (!exists) {
      return;
    }

    this.activeProjectId.set(projectId);
    this.selectedObjectId.set(null);
  }

  archiveActiveProject(): void {
    const active = this.activeProject();
    if (!active || active.archivedAtIso) {
      return;
    }

    this.patchProject((project) => ({
      ...project,
      archivedAtIso: new Date().toISOString()
    }));

    this.ensureActiveProjectVisible();
  }

  unarchiveProject(projectId: string): void {
    const exists = this.projects().some((project) => project.id === projectId && !!project.archivedAtIso);
    if (!exists) {
      return;
    }

    const updated = this.projects().map((project) =>
      project.id === projectId
        ? { ...project, archivedAtIso: undefined, updatedAtIso: new Date().toISOString() }
        : project
    );

    this.projects.set(updated);
    this.persistProjectsToStorage();
  }

  setSeason(season: ProjectSeason): void {
    this.patchProject((project) => ({ ...project, season }));
  }

  toggleTaskCompletion(taskId: string, completed: boolean): void {
    this.patchProject((project) => {
      const completedTaskIds = new Set(project.completedTaskIds ?? []);
      if (completed) {
        completedTaskIds.add(taskId);
      } else {
        completedTaskIds.delete(taskId);
      }

      return {
        ...project,
        completedTaskIds: [...completedTaskIds]
      };
    });
  }

  assignSelectedSeedToSelectedBed(): void {
    const bed = this.selectedBed();
    const selectedSeed = this.seeds().find((seed) => seed.id === this.selectedSeedId());

    if (!bed || !selectedSeed) {
      return;
    }

    const plantCount = this.calculatePlantCount(bed, selectedSeed);
    const now = new Date();
    const harvestDate = new Date(now);
    harvestDate.setDate(harvestDate.getDate() + selectedSeed.daysToMaturity);

    this.patchObject(bed.id, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      return {
        ...object,
        planting: {
          seedId: selectedSeed.id,
          plantedOnIso: now.toISOString(),
          plantCount,
          expectedHarvestPounds: Number((plantCount * selectedSeed.yield.averagePoundsPerPlant).toFixed(1)),
          expectedHarvestDateIso: harvestDate.toISOString()
        }
      };
    });
  }

  clearSelectedBedPlanting(): void {
    const bed = this.selectedBed();
    if (!bed || !bed.planting) {
      return;
    }

    this.patchObject(bed.id, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      const { planting, ...rest } = object;
      return rest;
    });

    this.clearTaskCompletionForBed(bed.id);
  }

  duplicateSelectedBed(): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    const duplicate: BedLayout = {
      ...bed,
      id: `bed-${crypto.randomUUID().slice(0, 8)}`,
      name: `${bed.name} Copy`,
      xInches: bed.xInches + 16,
      yInches: bed.yInches + 16,
      planting: bed.planting ? { ...bed.planting } : undefined
    };

    this.patchProject((project) => ({
      ...project,
      objects: [...project.objects, duplicate]
    }));

    this.selectedObjectId.set(duplicate.id);
  }

  deleteSelectedObject(): void {
    const selectedId = this.selectedObjectId();
    if (!selectedId) {
      return;
    }

    const selectedBed = this.selectedBed();

    this.patchProject((project) => ({
      ...project,
      objects: project.objects.filter((item) => item.id !== selectedId)
    }));

    if (selectedBed) {
      this.clearTaskCompletionForBed(selectedBed.id);
    }

    this.selectedObjectId.set(null);
  }

  updateBedGeometry(update: BedGeometryUpdate): void {
    this.patchObject(update.bedId, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      return {
        ...object,
        xInches: Math.max(0, Math.round(update.xInches)),
        yInches: Math.max(0, Math.round(update.yInches)),
        widthInches: Math.max(12, Math.round(update.widthInches)),
        heightInches: Math.max(12, Math.round(update.heightInches)),
        rotationDeg: Number(update.rotationDeg.toFixed(2))
      };
    });
  }

  renameSelectedObject(name: string): void {
    const selectedId = this.selectedObjectId();
    if (!selectedId) {
      return;
    }

    this.patchObject(selectedId, (object) => ({ ...object, name: name.trim() || object.name }));
  }

  renameObject(objectId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    this.patchObject(objectId, (object) => ({ ...object, name: trimmed }));
  }

  saveProjects(): void {
    const project = this.activeProject();
    if (!project) {
      return;
    }

    this.plannerApi.saveProject(project).subscribe({
      next: (savedProject) => {
        this.patchProject(() => savedProject);
        this.persistProjectsToStorage();
      },
      error: () => {
        this.persistProjectsToStorage();
      }
    });
  }

  createProject(): void {
    const active = this.activeProject();
    const count = this.projects().length + 1;
    const payload = {
      name: `Garden ${count}`,
      season: active.season,
      climateZone: active.climateZone,
      lastFrostDateIso: active.lastFrostDateIso,
      firstFrostDateIso: active.firstFrostDateIso
    };

    this.plannerApi.createProject(payload).subscribe({
      next: (createdProject) => {
        this.projects.set([createdProject, ...this.projects()]);
        this.activeProjectId.set(createdProject.id);
        this.selectedObjectId.set(null);
        this.selectedSeedId.set(null);
        this.persistProjectsToStorage();
      },
      error: () => {
        const localProject = this.createStarterProject();
        localProject.id = `project-${crypto.randomUUID().slice(0, 8)}`;
        localProject.name = payload.name;
        localProject.season = payload.season;
        localProject.climateZone = payload.climateZone;
        localProject.lastFrostDateIso = payload.lastFrostDateIso;
        localProject.firstFrostDateIso = payload.firstFrostDateIso;
        localProject.objects = [];
        localProject.seeds = active.seeds.map((seed) => ({ ...seed }));

        this.projects.set([localProject, ...this.projects()]);
        this.activeProjectId.set(localProject.id);
        this.selectedObjectId.set(null);
        this.selectedSeedId.set(null);
        this.persistProjectsToStorage();
      }
    });
  }

  duplicateActiveProject(): void {
    const source = this.activeProject();
    const duplicate: GardenProject = {
      ...source,
      id: `project-${crypto.randomUUID().slice(0, 8)}`,
      name: `${source.name} Copy`,
      seeds: structuredClone(source.seeds),
      objects: structuredClone(source.objects)
    };

    this.plannerApi.saveProject(duplicate).subscribe({
      next: (savedProject) => {
        this.projects.set([savedProject, ...this.projects()]);
        this.activeProjectId.set(savedProject.id);
        this.selectedObjectId.set(null);
        this.persistProjectsToStorage();
      },
      error: () => {
        this.projects.set([duplicate, ...this.projects()]);
        this.activeProjectId.set(duplicate.id);
        this.selectedObjectId.set(null);
        this.persistProjectsToStorage();
      }
    });
  }

  deleteActiveProject(): void {
    const active = this.activeProject();
    const allProjects = this.projects();

    if (!active || allProjects.length <= 1) {
      return;
    }

    this.plannerApi.deleteProject(active.id).subscribe({
      next: () => this.removeProjectFromState(active.id),
      error: () => this.removeProjectFromState(active.id)
    });
  }

  loadSavedProjects(): void {
    this.plannerApi.getProjects().subscribe({
      next: (loaded) => {
        if (!Array.isArray(loaded) || loaded.length === 0) {
          return;
        }

        this.projects.set(loaded);
        this.activeProjectId.set(loaded[0].id);
        this.selectedObjectId.set(null);
        this.persistProjectsToStorage();
      },
      error: () => {
        const loaded = this.loadProjects();
        this.projects.set(loaded);
        this.activeProjectId.set(loaded[0]?.id ?? 'project-home');
        this.selectedObjectId.set(null);
      }
    });
  }

  getBedSummary(bed: BedLayout): string {
    if (!bed.planting) {
      return `Open bed ${formatInches(bed.widthInches)} x ${formatInches(bed.heightInches)}`;
    }

    const seed = this.seeds().find((entry) => entry.id === bed.planting?.seedId);
    return `${seed?.name ?? 'Unknown crop'} • ${bed.planting.plantCount} plants • ${bed.planting.expectedHarvestPounds} lbs`;
  }

  private calculatePlantCount(bed: BedLayout, seed: SeedMetadata): number {
    const bedArea = bed.widthInches * bed.heightInches;
    const recommendedArea = seed.spacingInches * seed.rowSpacingInches;
    return Math.max(1, Math.floor(bedArea / recommendedArea));
  }

  private calculateDensityScore(bed: BedLayout, seed: SeedMetadata): number {
    if (!bed.planting) {
      return 0;
    }

    const bedArea = bed.widthInches * bed.heightInches;
    const usedArea = bed.planting.plantCount * seed.spacingInches * seed.rowSpacingInches;
    return usedArea / bedArea;
  }

  private computeCompanionWarnings(): PlannerWarning[] {
    const warnings: PlannerWarning[] = [];
    const plantedBeds = this.beds().filter((bed) => !!bed.planting);

    for (let i = 0; i < plantedBeds.length; i++) {
      for (let j = i + 1; j < plantedBeds.length; j++) {
        const a = plantedBeds[i];
        const b = plantedBeds[j];

        const seedA = this.seeds().find((seed) => seed.id === a.planting?.seedId);
        const seedB = this.seeds().find((seed) => seed.id === b.planting?.seedId);
        if (!seedA || !seedB) {
          continue;
        }

        const distance = this.getBedCenterDistanceInches(a, b);
        if (distance > 220) {
          continue;
        }

        const conflictPair =
          seedA.conflictSeedIds?.includes(seedB.id) || seedB.conflictSeedIds?.includes(seedA.id);
        if (conflictPair) {
          warnings.push({
            id: `companion-conflict-${a.id}-${b.id}`,
            title: `${a.name} and ${b.name}: incompatible pairing`,
            detail: `${seedA.name} and ${seedB.name} are not recommended close together (${Math.round(distance)}in apart).`,
            severity: 'warning',
            bedId: a.id
          });
          continue;
        }

        const companionPair =
          seedA.companionSeedIds?.includes(seedB.id) || seedB.companionSeedIds?.includes(seedA.id);
        if (companionPair) {
          warnings.push({
            id: `companion-good-${a.id}-${b.id}`,
            title: `${a.name} and ${b.name}: companion match`,
            detail: `${seedA.name} and ${seedB.name} are companion plants and can support each other nearby.`,
            severity: 'info',
            bedId: a.id
          });
        }
      }
    }

    return warnings;
  }

  private getBedCenterDistanceInches(a: BedLayout, b: BedLayout): number {
    const aX = a.xInches + a.widthInches / 2;
    const aY = a.yInches + a.heightInches / 2;
    const bX = b.xInches + b.widthInches / 2;
    const bY = b.yInches + b.heightInches / 2;
    return Math.hypot(aX - bX, aY - bY);
  }

  private removeProjectFromState(projectId: string): void {
    const remaining = this.projects().filter((project) => project.id !== projectId);
    if (remaining.length === 0) {
      return;
    }

    const nextActive = remaining[0];
    this.projects.set(remaining);
    this.activeProjectId.set(nextActive.id);
    this.selectedObjectId.set(null);
    this.selectedSeedId.set(null);
    this.persistProjectsToStorage();
  }

  private ensureActiveProjectVisible(): void {
    const active = this.activeProject();
    if (!active?.archivedAtIso) {
      return;
    }

    const fallback = this.projects().find((project) => !project.archivedAtIso);
    if (!fallback) {
      return;
    }

    this.activeProjectId.set(fallback.id);
    this.selectedObjectId.set(null);
  }

  private patchProject(updater: (project: GardenProject) => GardenProject): void {
    const currentId = this.activeProjectId();
    const updated = this.projects().map((project) =>
      project.id === currentId ? updater({ ...project, updatedAtIso: new Date().toISOString() }) : project
    );

    this.projects.set(updated);
    this.persistProjectsToStorage();
  }

  private patchObject(objectId: string, updater: (object: LayoutObject) => LayoutObject): void {
    this.patchProject((project) => ({
      ...project,
      objects: project.objects.map((item) => (item.id === objectId ? updater(item) : item))
    }));
  }

  private loadProjects(): GardenProject[] {
    const saved = this.storage?.getItem(STORAGE_KEY) ?? null;
    if (!saved) {
      return [this.createStarterProject()];
    }

    try {
      const parsed = JSON.parse(saved) as GardenProject[];
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return [this.createStarterProject()];
      }

      return parsed;
    } catch {
      return [this.createStarterProject()];
    }
  }

  private persistProjectsToStorage(): void {
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.projects()));
  }

  private clearTaskCompletionForBed(bedId: string): void {
    const taskIdsForBed = new Set([
      `task-plan-${bedId}`,
      `task-harvest-${bedId}`,
      `task-succession-${bedId}`
    ]);

    this.patchProject((project) => ({
      ...project,
      completedTaskIds: (project.completedTaskIds ?? []).filter((taskId) => !taskIdsForBed.has(taskId))
    }));
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
          companionSeedIds: ['seed-lettuce-romaine'],
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
          companionSeedIds: ['seed-tomato-sungold'],
          conflictSeedIds: ['seed-blueberry-patriot'],
          notes: 'Great for succession sowing every 2-3 weeks.'
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
          conflictSeedIds: ['seed-lettuce-romaine'],
          notes: 'Perennial shrub, acidic soil required.'
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
            organicMatterPercent: 4
          }
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
          canopyDiameterInches: 120
        },
        {
          id: 'structure-shed',
          type: 'structure',
          name: 'Tool Shed',
          xInches: 300,
          yInches: 220,
          widthInches: 84,
          heightInches: 60,
          rotationDeg: 0
        }
      ]
    };
  }

  private resolveStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
    const candidate = globalThis.localStorage as Partial<Storage> | undefined;
    if (!candidate) {
      return null;
    }

    if (typeof candidate.getItem !== 'function' || typeof candidate.setItem !== 'function') {
      return null;
    }

    return {
      getItem: candidate.getItem.bind(candidate),
      setItem: candidate.setItem.bind(candidate)
    };
  }
}
