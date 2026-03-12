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
    for (const bed of this.beds()) {
      if (!bed.planting) {
        items.push({
          id: `task-plan-${bed.id}`,
          title: `Plan planting for ${bed.name}`,
          dueDateIso: new Date().toISOString(),
          bedId: bed.id,
          priority: 'info'
        });
        continue;
      }

      items.push({
        id: `task-harvest-${bed.id}`,
        title: `Harvest ${bed.name}`,
        dueDateIso: bed.planting.expectedHarvestDateIso,
        bedId: bed.id,
        priority: 'warning'
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
          priority: 'info'
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

  setSeason(season: ProjectSeason): void {
    this.patchProject((project) => ({ ...project, season }));
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

  saveProjects(): void {
    const project = this.activeProject();
    if (!project) {
      return;
    }

    this.plannerApi.saveProject(project).subscribe({
      next: (savedProject) => {
        this.patchProject(() => savedProject);
        this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.projects()));
      },
      error: () => {
        this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.projects()));
      }
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
        this.storage?.setItem(STORAGE_KEY, JSON.stringify(loaded));
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

  private patchProject(updater: (project: GardenProject) => GardenProject): void {
    const currentId = this.activeProjectId();
    const updated = this.projects().map((project) =>
      project.id === currentId ? updater({ ...project, updatedAtIso: new Date().toISOString() }) : project
    );

    this.projects.set(updated);
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
