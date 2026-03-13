import { computed, inject, Injectable, signal } from '@angular/core';
import {
  BedPolygonDraftPoint,
  BedPlanting,
  BedShapeType,
  BedZone,
  BedGeometryUpdate,
  BedDraftGeometry,
  BedLayout,
  GardenProject,
  LayoutObject,
  PlannerTask,
  PlannerWarning,
  ProjectSeason,
  ShapePoint,
  ZoneRect,
  ZoneShapeType
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
  readonly seedCatalog = signal<SeedMetadata[]>([]);
  readonly backendTasks = signal<PlannerTask[]>([]);
  readonly backendTasksLoadedForProjectId = signal<string | null>(null);

  readonly projects = signal<GardenProject[]>(this.loadProjects());

  constructor() {
    this.loadSavedProjects();
    this.loadSeedCatalog();
    this.loadProjectTasks(this.activeProjectId());
  }

  readonly activeProject = computed(() =>
    this.projects().find((project) => project.id === this.activeProjectId()) ?? this.projects()[0]
  );

  readonly season = computed(() => this.activeProject().season);
  readonly seeds = computed(() => {
    const projectSeeds = this.activeProject().seeds;
    if (projectSeeds.length > 0) {
      return projectSeeds;
    }

    return this.seedCatalog();
  });
  readonly beds = computed(() => this.activeProject().objects.filter((obj): obj is BedLayout => obj.type === 'bed'));

  readonly selectedObject = computed(() =>
    this.activeProject().objects.find((item) => item.id === this.selectedObjectId()) ?? null
  );

  readonly selectedBed = computed(() =>
    this.beds().find((bed) => bed.id === this.selectedObjectId()) ?? null
  );

  readonly tasks = computed<PlannerTask[]>(() => {
    if (this.backendTasksLoadedForProjectId() === this.activeProjectId()) {
      return this.backendTasks();
    }

    return this.buildLocalTasks();
  });

  readonly warnings = computed<PlannerWarning[]>(() => {
    const result: PlannerWarning[] = [];

    for (const bed of this.beds()) {
      const zones = this.resolveZonesForBed(bed);
      for (const zone of zones) {
        if (!zone.planting) {
          continue;
        }

        const seed = this.seeds().find((entry) => entry.id === zone.planting?.seedId);
        if (!seed) {
          continue;
        }

        if (seed.preferredSun !== bed.sunExposure) {
          result.push({
            id: `sun-${bed.id}-${zone.id}`,
            title: `${bed.name} ${zone.name}: sunlight mismatch`,
            detail: `${seed.name} prefers ${seed.preferredSun.replace('-', ' ')}, bed is ${bed.sunExposure.replace('-', ' ')}.`,
            severity: 'warning',
            bedId: bed.id
          });
        }

        if (bed.soil.ph < seed.soilPhMin || bed.soil.ph > seed.soilPhMax) {
          result.push({
            id: `soil-${bed.id}-${zone.id}`,
            title: `${bed.name} ${zone.name}: soil pH risk`,
            detail: `${seed.name} target pH is ${seed.soilPhMin}-${seed.soilPhMax}. Current pH is ${bed.soil.ph}.`,
            severity: 'warning',
            bedId: bed.id
          });
        }

        if (bed.lastSeasonFamily === seed.family) {
          result.push({
            id: `rotation-${bed.id}-${zone.id}`,
            title: `${bed.name} ${zone.name}: crop rotation conflict`,
            detail: `${seed.family} family was already planted last season in this bed.`,
            severity: 'critical',
            bedId: bed.id
          });
        }

        const density = this.calculateZoneDensityScore(bed, zone, seed);
        if (density > 1) {
          result.push({
            id: `density-${bed.id}-${zone.id}`,
            title: `${bed.name} ${zone.name}: spacing exceeds recommendation`,
            detail: `Estimated density is ${(density * 100).toFixed(0)}% of recommended spacing.`,
            severity: 'critical',
            bedId: bed.id
          });
        }
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

  private buildLocalTasks(): PlannerTask[] {
    const items: PlannerTask[] = [];
    const completedTaskIds = new Set(this.activeProject().completedTaskIds ?? []);

    for (const bed of this.beds()) {
      const zones = this.resolveZonesForBed(bed);

      for (const zone of zones) {
        if (!zone.planting) {
          const taskId = `task-plan-${bed.id}-${zone.id}`;
          items.push({
            id: taskId,
            title: `Plan planting for ${bed.name} ${zone.name}`,
            dueDateIso: new Date().toISOString(),
            bedId: bed.id,
            priority: 'info',
            completed: completedTaskIds.has(taskId)
          });
          continue;
        }

        const harvestTaskId = `task-harvest-${bed.id}-${zone.id}`;
        items.push({
          id: harvestTaskId,
          title: `Harvest ${bed.name} ${zone.name}`,
          dueDateIso: zone.planting.expectedHarvestDateIso,
          bedId: bed.id,
          priority: 'warning',
          completed: completedTaskIds.has(harvestTaskId)
        });

        const seed = this.seeds().find((entry) => entry.id === zone.planting?.seedId);
        if (seed?.successionFriendly) {
          const successionDate = new Date(zone.planting.plantedOnIso);
          successionDate.setDate(successionDate.getDate() + 21);
          const successionTaskId = `task-succession-${bed.id}-${zone.id}`;
          items.push({
            id: successionTaskId,
            title: `Succession sowing for ${seed.name} (${bed.name} ${zone.name})`,
            dueDateIso: successionDate.toISOString(),
            bedId: bed.id,
            priority: 'info',
            completed: completedTaskIds.has(successionTaskId)
          });
        }
      }
    }

    return items.sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso));
  }

  addBed(draft?: BedDraftGeometry): void {
    const index = this.beds().length + 1;
    const newBed: BedLayout = {
      id: `bed-${crypto.randomUUID().slice(0, 8)}`,
      type: 'bed',
      name: `Bed ${index}`,
      shapeType: 'rectangle',
      xInches: Math.max(0, Math.round(draft?.xInches ?? 24 + index * 12)),
      yInches: Math.max(0, Math.round(draft?.yInches ?? 24 + index * 8)),
      widthInches: Math.max(12, Math.round(draft?.widthInches ?? 96)),
      heightInches: Math.max(12, Math.round(draft?.heightInches ?? 36)),
      rotationDeg: 0,
      rows: 3,
      zones: this.createDefaultZones(3),
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

  addPolygonBed(points: BedPolygonDraftPoint[]): void {
    if (!Array.isArray(points) || points.length < 3) {
      return;
    }

    const xValues = points.map((point) => point.xInches);
    const yValues = points.map((point) => point.yInches);
    const minX = Math.min(...xValues);
    const minY = Math.min(...yValues);
    const maxX = Math.max(...xValues);
    const maxY = Math.max(...yValues);

    const index = this.beds().length + 1;
    const newBed: BedLayout = {
      id: `bed-${crypto.randomUUID().slice(0, 8)}`,
      type: 'bed',
      name: `Bed ${index}`,
      shapeType: 'polygon',
      xInches: Math.round(minX),
      yInches: Math.round(minY),
      widthInches: Math.max(12, Math.round(maxX - minX)),
      heightInches: Math.max(12, Math.round(maxY - minY)),
      rotationDeg: 0,
      rows: 3,
      zones: this.createDefaultZones(3),
      polygon: points.map((point) => ({
        xPct: (point.xInches - minX) / Math.max(1, maxX - minX),
        yPct: (point.yInches - minY) / Math.max(1, maxY - minY)
      })),
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
    this.syncProjectTasks(projectId);
    this.loadProjectTasks(projectId);
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

    const projectId = this.activeProjectId();
    if (this.backendTasksLoadedForProjectId() === projectId) {
      this.backendTasks.update((tasks) =>
        tasks.map((task) => (task.id === taskId ? { ...task, completed } : task))
      );

      this.plannerApi.updateTaskStatus(projectId, taskId, completed).subscribe({
        next: (savedTask) => {
          this.backendTasks.update((tasks) =>
            tasks.map((task) => (task.id === savedTask.id ? savedTask : task))
          );
        },
        error: () => {
          this.backendTasks.update((tasks) =>
            tasks.map((task) => (task.id === taskId ? { ...task, completed: !completed } : task))
          );
        }
      });
    }
  }

  assignSelectedSeedToSelectedBed(): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    const firstZone = this.resolveZonesForBed(bed)[0];
    if (!firstZone) {
      return;
    }

    this.assignSelectedSeedToBedZone(bed.id, firstZone.id);
  }

  clearSelectedBedPlanting(): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    this.patchObject(bed.id, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      return {
        ...object,
        planting: undefined,
        zones: this.resolveZonesForBed(object).map((zone) => ({ ...zone, planting: undefined }))
      };
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
      planting: bed.planting ? { ...bed.planting } : undefined,
      zones: this.resolveZonesForBed(bed).map((zone) => ({
        ...zone,
        id: `zone-${crypto.randomUUID().slice(0, 6)}`,
        planting: zone.planting ? { ...zone.planting } : undefined
      }))
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

  setBedRows(bedId: string, rows: number): void {
    const nextRows = Math.max(1, Math.round(rows));
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      return {
        ...object,
        rows: nextRows,
        zones: this.reconcileZones(
          object.zones ?? this.createDefaultZones(object.rows, object.planting ? [object.planting] : []),
          nextRows
        )
      };
    });
  }

  setBedShapeType(bedId: string, shapeType: BedShapeType): void {
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      return {
        ...object,
        shapeType,
        polygon:
          shapeType === 'polygon'
            ? object.polygon ?? [
                { xPct: 0.06, yPct: 0.2 },
                { xPct: 0.82, yPct: 0.06 },
                { xPct: 0.95, yPct: 0.76 },
                { xPct: 0.3, yPct: 0.94 }
              ]
            : undefined
      };
    });
  }

  updateBedPolygonPoint(bedId: string, pointIndex: number, point: Partial<ShapePoint>): void {
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed' || !Array.isArray(object.polygon) || !object.polygon[pointIndex]) {
        return object;
      }

      const nextPolygon = [...object.polygon];
      const current = nextPolygon[pointIndex];
      nextPolygon[pointIndex] = {
        xPct: this.clampPct(point.xPct ?? current.xPct),
        yPct: this.clampPct(point.yPct ?? current.yPct)
      };

      return {
        ...object,
        polygon: nextPolygon
      };
    });
  }

  addBedPolygonPoint(bedId: string): void {
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      const polygon = Array.isArray(object.polygon) ? [...object.polygon] : [];
      const fallback = polygon[polygon.length - 1] ?? { xPct: 0.5, yPct: 0.5 };
      polygon.push({
        xPct: this.clampPct(fallback.xPct + 0.05),
        yPct: this.clampPct(fallback.yPct + 0.05)
      });

      return {
        ...object,
        shapeType: 'polygon',
        polygon
      };
    });
  }

  removeBedPolygonPoint(bedId: string, pointIndex: number): void {
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed' || !Array.isArray(object.polygon) || object.polygon.length <= 3) {
        return object;
      }

      return {
        ...object,
        polygon: object.polygon.filter((_, index) => index !== pointIndex)
      };
    });
  }

  setZoneShapeType(bedId: string, zoneId: string, shapeType: ZoneShapeType): void {
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      return {
        ...object,
        zones: this.resolveZonesForBed(object).map((zone) => {
          if (zone.id !== zoneId) {
            return zone;
          }

          return {
            ...zone,
            shapeType,
            rect: shapeType === 'square' ? zone.rect ?? { xPct: 0.08, yPct: 0.1, widthPct: 0.32, heightPct: 0.8 } : zone.rect,
            polygon:
              shapeType === 'polygon'
                ? zone.polygon ?? [
                    { xPct: 0.08, yPct: 0.2 },
                    { xPct: 0.5, yPct: 0.04 },
                    { xPct: 0.92, yPct: 0.2 },
                    { xPct: 0.84, yPct: 0.88 },
                    { xPct: 0.16, yPct: 0.88 }
                  ]
                : zone.polygon
          };
        })
      };
    });
  }

  updateZonePolygonPoint(bedId: string, zoneId: string, pointIndex: number, point: Partial<ShapePoint>): void {
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      return {
        ...object,
        zones: this.resolveZonesForBed(object).map((zone) => {
          if (zone.id !== zoneId || !Array.isArray(zone.polygon) || !zone.polygon[pointIndex]) {
            return zone;
          }

          const nextPolygon = [...zone.polygon];
          const current = nextPolygon[pointIndex];
          nextPolygon[pointIndex] = {
            xPct: this.clampPct(point.xPct ?? current.xPct),
            yPct: this.clampPct(point.yPct ?? current.yPct)
          };

          return {
            ...zone,
            polygon: nextPolygon
          };
        })
      };
    });
  }

  addZonePolygonPoint(bedId: string, zoneId: string): void {
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      return {
        ...object,
        zones: this.resolveZonesForBed(object).map((zone) => {
          if (zone.id !== zoneId) {
            return zone;
          }

          const polygon = Array.isArray(zone.polygon) ? [...zone.polygon] : [];
          const fallback = polygon[polygon.length - 1] ?? { xPct: 0.5, yPct: 0.5 };
          polygon.push({
            xPct: this.clampPct(fallback.xPct + 0.05),
            yPct: this.clampPct(fallback.yPct + 0.05)
          });

          return {
            ...zone,
            shapeType: 'polygon',
            polygon
          };
        })
      };
    });
  }

  removeZonePolygonPoint(bedId: string, zoneId: string, pointIndex: number): void {
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      return {
        ...object,
        zones: this.resolveZonesForBed(object).map((zone) => {
          if (zone.id !== zoneId || !Array.isArray(zone.polygon) || zone.polygon.length <= 3) {
            return zone;
          }

          return {
            ...zone,
            polygon: zone.polygon.filter((_, index) => index !== pointIndex)
          };
        })
      };
    });
  }

  setZoneColor(bedId: string, zoneId: string, colorHex: string): void {
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      return {
        ...object,
        zones: this.resolveZonesForBed(object).map((zone) =>
          zone.id === zoneId ? { ...zone, colorHex } : zone
        )
      };
    });
  }

  updateZoneRect(bedId: string, zoneId: string, rect: Partial<ZoneRect>): void {
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      return {
        ...object,
        zones: this.resolveZonesForBed(object).map((zone) => {
          if (zone.id !== zoneId) {
            return zone;
          }

          const nextRect: ZoneRect = {
            xPct: this.clampPct(rect.xPct ?? zone.rect?.xPct ?? 0.08),
            yPct: this.clampPct(rect.yPct ?? zone.rect?.yPct ?? 0.1),
            widthPct: this.clampPct(rect.widthPct ?? zone.rect?.widthPct ?? 0.32),
            heightPct: this.clampPct(rect.heightPct ?? zone.rect?.heightPct ?? 0.8)
          };

          return {
            ...zone,
            rect: nextRect
          };
        })
      };
    });
  }

  getZonesForBed(bedId: string): BedZone[] {
    const bed = this.beds().find((entry) => entry.id === bedId);
    if (!bed) {
      return [];
    }

    return this.resolveZonesForBed(bed);
  }

  assignSelectedSeedToBedZone(bedId: string, zoneId: string): void {
    const selectedSeed = this.seeds().find((seed) => seed.id === this.selectedSeedId());
    const bed = this.beds().find((entry) => entry.id === bedId);
    if (!selectedSeed || !bed) {
      return;
    }

    const zones = this.resolveZonesForBed(bed);
    const targetZone = zones.find((zone) => zone.id === zoneId);
    if (!targetZone) {
      return;
    }

    const planting = this.buildPlantingForZone(bed, selectedSeed, zones.length);
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      const nextZones = this.resolveZonesForBed(object).map((zone) =>
        zone.id === zoneId ? { ...zone, planting } : zone
      );

      return {
        ...object,
        zones: nextZones,
        planting: undefined
      };
    });

    const projectId = this.activeProjectId();
    this.plannerApi
      .upsertPlanting(projectId, bedId, {
        bedId,
        zoneId,
        ...planting
      })
      .subscribe({
        next: () => {
          this.syncProjectTasks(projectId);
          this.loadProjectTasks(projectId);
        },
        error: () => {
          // Keep the optimistic local zone planting when backend write is unavailable.
        }
      });
  }

  clearBedZonePlanting(bedId: string, zoneId: string): void {
    const bed = this.beds().find((entry) => entry.id === bedId);
    if (!bed) {
      return;
    }

    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed') {
        return object;
      }

      return {
        ...object,
        zones: this.resolveZonesForBed(object).map((zone) =>
          zone.id === zoneId ? { ...zone, planting: undefined } : zone
        ),
        planting: undefined
      };
    });

    this.clearTaskCompletionForBed(bed.id);

    const projectId = this.activeProjectId();
    this.plannerApi.deletePlanting(projectId, bedId, zoneId).subscribe({
      next: () => {
        this.syncProjectTasks(projectId);
        this.loadProjectTasks(projectId);
      },
      error: () => {
        // Keep optimistic local clear and let regular save/sync restore server state later.
      }
    });
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
        this.syncProjectTasks(savedProject.id);
        this.loadProjectTasks(savedProject.id);
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
        this.loadProjectTasks(createdProject.id);
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
        this.loadProjectTasks(localProject.id);
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
        this.loadProjectTasks(savedProject.id);
      },
      error: () => {
        this.projects.set([duplicate, ...this.projects()]);
        this.activeProjectId.set(duplicate.id);
        this.selectedObjectId.set(null);
        this.persistProjectsToStorage();
        this.loadProjectTasks(duplicate.id);
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
        this.syncProjectTasks(loaded[0].id);
        this.loadProjectTasks(loaded[0].id);
      },
      error: () => {
        const loaded = this.loadProjects();
        this.projects.set(loaded);
        this.activeProjectId.set(loaded[0]?.id ?? 'project-home');
        this.selectedObjectId.set(null);
        this.loadProjectTasks(this.activeProjectId());
      }
    });
  }

  private loadSeedCatalog(): void {
    this.plannerApi.getSeeds().subscribe({
      next: (seeds) => {
        if (!Array.isArray(seeds) || seeds.length === 0) {
          return;
        }

        this.seedCatalog.set(seeds);
        this.clearSelectedSeedIfInvalid();
      },
      error: () => {
        this.clearSelectedSeedIfInvalid();
      }
    });
  }

  private loadProjectTasks(projectId: string): void {
    this.plannerApi.getProjectTasks(projectId).subscribe({
      next: (tasks) => {
        this.backendTasks.set(tasks);
        this.backendTasksLoadedForProjectId.set(projectId);
      },
      error: () => {
        this.backendTasks.set([]);
        this.backendTasksLoadedForProjectId.set(null);
      }
    });
  }

  private syncProjectTasks(projectId: string): void {
    this.plannerApi.syncProjectTasks(projectId).subscribe({
      next: () => {
        // Tasks are loaded separately after sync in callers.
      },
      error: () => {
        // Keep local fallback behavior when backend sync is unavailable.
      }
    });
  }

  getBedSummary(bed: BedLayout): string {
    const zones = this.resolveZonesForBed(bed);
    const plantedZones = zones.filter((zone) => !!zone.planting);

    if (plantedZones.length === 0) {
      return `Open bed ${formatInches(bed.widthInches)} x ${formatInches(bed.heightInches)}`;
    }

    const totalPlants = plantedZones.reduce((sum, zone) => sum + (zone.planting?.plantCount ?? 0), 0);
    const totalYield = plantedZones.reduce((sum, zone) => sum + (zone.planting?.expectedHarvestPounds ?? 0), 0);
    return `${plantedZones.length}/${zones.length} rows planted • ${totalPlants} plants • ${totalYield.toFixed(1)} lbs`;
  }

  private calculatePlantCount(areaInSquareInches: number, seed: SeedMetadata): number {
    const recommendedArea = seed.spacingInches * seed.rowSpacingInches;
    return Math.max(1, Math.floor(areaInSquareInches / recommendedArea));
  }

  private calculateZoneDensityScore(bed: BedLayout, zone: BedZone, seed: SeedMetadata): number {
    if (!zone.planting) {
      return 0;
    }

    const zoneArea = this.getZoneAreaInSquareInches(bed, this.resolveZonesForBed(bed), zone);
    const usedArea = zone.planting.plantCount * seed.spacingInches * seed.rowSpacingInches;
    return zoneArea <= 0 ? 0 : usedArea / zoneArea;
  }

  private computeCompanionWarnings(): PlannerWarning[] {
    const warnings: PlannerWarning[] = [];
    const plantedBeds = this.beds().filter((bed) => this.resolveZonesForBed(bed).some((zone) => !!zone.planting));

    for (let i = 0; i < plantedBeds.length; i++) {
      for (let j = i + 1; j < plantedBeds.length; j++) {
        const a = plantedBeds[i];
        const b = plantedBeds[j];

        const plantingA = this.resolveZonesForBed(a).find((zone) => !!zone.planting)?.planting;
        const plantingB = this.resolveZonesForBed(b).find((zone) => !!zone.planting)?.planting;
        const seedA = this.seeds().find((seed) => seed.id === plantingA?.seedId);
        const seedB = this.seeds().find((seed) => seed.id === plantingB?.seedId);
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

  private resolveZonesForBed(bed: BedLayout): BedZone[] {
    if (Array.isArray(bed.zones) && bed.zones.length > 0) {
      return this.reconcileZones(bed.zones, bed.rows);
    }

    return this.createDefaultZones(bed.rows, bed.planting ? [bed.planting] : []);
  }

  private createDefaultZones(rows: number, plantings: BedPlanting[] = []): BedZone[] {
    const zoneColors = ['#7ab77d', '#58a680', '#76b2a3', '#90af73', '#a2c46f', '#66a58d'];
    return Array.from({ length: rows }, (_, index) => ({
      id: `zone-${index + 1}`,
      name: `Row ${index + 1}`,
      rowIndex: index,
      shapeType: 'row-strip',
      colorHex: zoneColors[index % zoneColors.length],
      planting: plantings[index] ? { ...plantings[index] } : undefined
    }));
  }

  private reconcileZones(zones: BedZone[] | undefined, rows: number): BedZone[] {
    const nextRows = Math.max(1, Math.round(rows));
    const current = Array.isArray(zones) ? [...zones].sort((a, b) => a.rowIndex - b.rowIndex) : [];
    const normalized = this.createDefaultZones(nextRows);

    return normalized.map((fallback, index) => {
      const existing = current[index];
      if (!existing) {
        return fallback;
      }

      return {
        ...existing,
        rowIndex: index,
        name: existing.name?.trim() || fallback.name,
        shapeType: existing.shapeType ?? fallback.shapeType,
        colorHex: existing.colorHex ?? fallback.colorHex
      };
    });
  }

  private clampPct(value: number): number {
    return Math.min(1, Math.max(0, Number(value.toFixed(3))));
  }

  private getZoneAreaInSquareInches(bed: BedLayout, zones: BedZone[], zone: BedZone): number {
    const totalRows = Math.max(1, zones.length || bed.rows || 1);
    return (bed.widthInches * bed.heightInches) / totalRows;
  }

  private buildPlantingForZone(bed: BedLayout, seed: SeedMetadata, zoneCount: number): BedPlanting {
    const zoneArea = (bed.widthInches * bed.heightInches) / Math.max(1, zoneCount);
    const plantCount = this.calculatePlantCount(zoneArea, seed);
    const now = new Date();
    const harvestDate = new Date(now);
    harvestDate.setDate(harvestDate.getDate() + seed.daysToMaturity);

    return {
      seedId: seed.id,
      plantedOnIso: now.toISOString(),
      plantCount,
      expectedHarvestPounds: Number((plantCount * seed.yield.averagePoundsPerPlant).toFixed(1)),
      expectedHarvestDateIso: harvestDate.toISOString()
    };
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

  private clearSelectedSeedIfInvalid(): void {
    const selectedSeedId = this.selectedSeedId();
    if (!selectedSeedId) {
      return;
    }

    const exists = this.seeds().some((seed) => seed.id === selectedSeedId);
    if (!exists) {
      this.selectedSeedId.set(null);
    }
  }

  private clearTaskCompletionForBed(bedId: string): void {
    this.patchProject((project) => ({
      ...project,
      completedTaskIds: (project.completedTaskIds ?? []).filter(
        (taskId) =>
          !taskId.startsWith(`task-plan-${bedId}`) &&
          !taskId.startsWith(`task-harvest-${bedId}`) &&
          !taskId.startsWith(`task-succession-${bedId}`)
      )
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
