import { computed, inject, Injectable, signal } from '@angular/core';
import {
  BedDraftGeometry,
  BedLayout,
  BedPolygonDraftPoint,
  BedSummary,
  BedShapeType,
  GardenProject,
  LayoutObject,
  LayoutObjectGeometryUpdate,
  PlannerTask,
  PlannerWarning,
  ProjectSeason,
  ShapePoint,
  StructureLayout,
  TreeLayout,
} from '../models/planner.model';
import { SeedMetadata } from '../models/seed.model';
import { PlannerApiService } from './planner-api.service';

const STORAGE_KEY = 'plotwise.projects.v2';

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
  readonly backendBedSummaries = signal<BedSummary[]>([]);
  readonly backendBedSummariesLoadedForProjectId = signal<string | null>(null);
  readonly projects = signal<GardenProject[]>(this.loadProjects());

  constructor() {
    this.loadSavedProjects();
    this.loadSeedCatalog();
    this.refreshProjectResources(this.activeProjectId());
  }

  readonly activeProject = computed(
    () => {
      const projects = this.projects();
      return (
        projects.find((project) => project.id === this.activeProjectId()) ??
        projects[0] ??
        this.createStarterProject()
      );
    },
  );

  readonly objects = computed(() => this.activeProject().objects);
  readonly beds = computed(() =>
    this.objects().filter((object): object is BedLayout => object.type === 'bed'),
  );
  readonly selectedObject = computed(
    () =>
      this.objects().find((object) => object.id === this.selectedObjectId()) ?? null,
  );
  readonly selectedBed = computed(
    () =>
      this.beds().find((bed) => bed.id === this.selectedObjectId()) ?? null,
  );
  readonly seeds = computed(() => {
    const projectSeeds = this.activeProject().seeds;
    return projectSeeds.length > 0 ? projectSeeds : this.seedCatalog();
  });
  readonly tasks = computed(() => {
    if (this.backendTasksLoadedForProjectId() === this.activeProjectId()) {
      return this.backendTasks();
    }

    return this.buildFallbackTasks();
  });
  readonly bedSummaries = computed(() => {
    if (this.backendBedSummariesLoadedForProjectId() === this.activeProjectId()) {
      return this.backendBedSummaries();
    }

    return this.buildFallbackBedSummaries();
  });
  readonly warnings = computed(() =>
    this.bedSummaries().flatMap((summary) => summary.warnings),
  );
  readonly visibleProjects = computed(() =>
    this.projects().filter((project) => !project.archivedAtIso),
  );

  setActiveProject(projectId: string): void {
    const existing = this.projects().some((project) => project.id === projectId);
    if (!existing) {
      this.plannerApi.getProject(projectId).subscribe({
        next: (project) => {
          this.upsertProject(project);
          this.selectProject(projectId);
        },
      });
      return;
    }

    this.selectProject(projectId);
  }

  setSeason(season: ProjectSeason): void {
    this.patchProject((project) => ({ ...project, season }));
  }

  selectObject(objectId: string | null): void {
    this.selectedObjectId.set(objectId);
  }

  selectSeed(seedId: string): void {
    this.selectedSeedId.set(seedId);
  }

  addBed(draft?: BedDraftGeometry): void {
    const nextIndex = this.beds().length + 1;
    const bed: BedLayout = {
      id: `bed-${crypto.randomUUID().slice(0, 8)}`,
      type: 'bed',
      name: `Bed ${nextIndex}`,
      shapeType: 'rectangle',
      xInches: Math.max(0, Math.round(draft?.xInches ?? 24 + nextIndex * 12)),
      yInches: Math.max(0, Math.round(draft?.yInches ?? 24 + nextIndex * 8)),
      widthInches: Math.max(12, Math.round(draft?.widthInches ?? 96)),
      heightInches: Math.max(12, Math.round(draft?.heightInches ?? 36)),
      rotationDeg: 0,
      rows: 3,
      sunExposure: 'full-sun',
      soil: {
        ph: 6.5,
        drainage: 'good',
        organicMatterPercent: 4,
      },
    };

    this.patchProject((project) => ({
      ...project,
      objects: [...project.objects, bed],
    }));
    this.selectedObjectId.set(bed.id);
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
    const nextIndex = this.beds().length + 1;

    const bed: BedLayout = {
      id: `bed-${crypto.randomUUID().slice(0, 8)}`,
      type: 'bed',
      name: `Bed ${nextIndex}`,
      shapeType: 'polygon',
      xInches: Math.round(minX),
      yInches: Math.round(minY),
      widthInches: Math.max(12, Math.round(maxX - minX)),
      heightInches: Math.max(12, Math.round(maxY - minY)),
      rotationDeg: 0,
      rows: 3,
      polygon: points.map((point) => ({
        xPct: (point.xInches - minX) / Math.max(1, maxX - minX),
        yPct: (point.yInches - minY) / Math.max(1, maxY - minY),
      })),
      sunExposure: 'full-sun',
      soil: {
        ph: 6.5,
        drainage: 'good',
        organicMatterPercent: 4,
      },
    };

    this.patchProject((project) => ({
      ...project,
      objects: [...project.objects, bed],
    }));
    this.selectedObjectId.set(bed.id);
  }

  addStructure(): void {
    const structure: StructureLayout = {
      id: `structure-${crypto.randomUUID().slice(0, 8)}`,
      type: 'structure',
      name: 'New Structure',
      xInches: 220,
      yInches: 180,
      widthInches: 72,
      heightInches: 48,
      rotationDeg: 0,
    };

    this.patchProject((project) => ({
      ...project,
      objects: [...project.objects, structure],
    }));
    this.selectedObjectId.set(structure.id);
  }

  addTree(): void {
    const tree: TreeLayout = {
      id: `tree-${crypto.randomUUID().slice(0, 8)}`,
      type: 'tree',
      name: 'New Tree',
      xInches: 320,
      yInches: 64,
      widthInches: 72,
      heightInches: 72,
      rotationDeg: 0,
      canopyDiameterInches: 108,
    };

    this.patchProject((project) => ({
      ...project,
      objects: [...project.objects, tree],
    }));
    this.selectedObjectId.set(tree.id);
  }

  updateObjectGeometry(update: LayoutObjectGeometryUpdate): void {
    this.patchObject(update.objectId, (object) => {
      const widthInches = Math.max(12, Math.round(update.widthInches));
      const heightInches = Math.max(12, Math.round(update.heightInches));
      const rotationDeg = Number(update.rotationDeg.toFixed(2));

      if (object.type === 'tree') {
        return {
          ...object,
          xInches: Math.max(0, Math.round(update.xInches)),
          yInches: Math.max(0, Math.round(update.yInches)),
          widthInches,
          heightInches,
          rotationDeg,
          canopyDiameterInches: Math.max(widthInches, heightInches),
        };
      }

      return {
        ...object,
        xInches: Math.max(0, Math.round(update.xInches)),
        yInches: Math.max(0, Math.round(update.yInches)),
        widthInches,
        heightInches,
        rotationDeg,
      };
    });
  }

  updateBedGeometry(update: {
    bedId: string;
    xInches: number;
    yInches: number;
    widthInches: number;
    heightInches: number;
    rotationDeg: number;
  }): void {
    this.updateObjectGeometry({
      objectId: update.bedId,
      xInches: update.xInches,
      yInches: update.yInches,
      widthInches: update.widthInches,
      heightInches: update.heightInches,
      rotationDeg: update.rotationDeg,
    });
  }

  renameSelectedObject(name: string): void {
    const selectedId = this.selectedObjectId();
    if (!selectedId) {
      return;
    }

    this.renameObject(selectedId, name);
  }

  renameObject(objectId: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    this.patchObject(objectId, (object) => ({ ...object, name: trimmed }));
  }

  duplicateSelectedBed(): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    const duplicate: BedLayout = {
      ...structuredClone(bed),
      id: `bed-${crypto.randomUUID().slice(0, 8)}`,
      name: `${bed.name} Copy`,
      xInches: bed.xInches + 16,
      yInches: bed.yInches + 16,
    };

    this.patchProject((project) => ({
      ...project,
      objects: [...project.objects, duplicate],
    }));
    this.selectedObjectId.set(duplicate.id);
  }

  deleteSelectedObject(): void {
    const selectedId = this.selectedObjectId();
    if (!selectedId) {
      return;
    }

    this.patchProject((project) => ({
      ...project,
      objects: project.objects.filter((object) => object.id !== selectedId),
    }));
    this.selectedObjectId.set(null);
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
                { xPct: 0.3, yPct: 0.94 },
              ]
            : undefined,
      };
    });
  }

  updateBedPolygonPoint(
    bedId: string,
    pointIndex: number,
    point: Partial<ShapePoint>,
  ): void {
    this.patchObject(bedId, (object) => {
      if (object.type !== 'bed' || !Array.isArray(object.polygon) || !object.polygon[pointIndex]) {
        return object;
      }

      const polygon = [...object.polygon];
      const current = polygon[pointIndex];
      polygon[pointIndex] = {
        xPct: this.clampPct(point.xPct ?? current.xPct),
        yPct: this.clampPct(point.yPct ?? current.yPct),
      };

      return {
        ...object,
        polygon,
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
        yPct: this.clampPct(fallback.yPct + 0.05),
      });

      return {
        ...object,
        shapeType: 'polygon',
        polygon,
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
        polygon: object.polygon.filter((_, index) => index !== pointIndex),
      };
    });
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
        completedTaskIds: [...completedTaskIds],
      };
    });

    const projectId = this.activeProjectId();
    if (this.backendTasksLoadedForProjectId() === projectId) {
      this.backendTasks.update((tasks) =>
        tasks.map((task) => (task.id === taskId ? { ...task, completed } : task)),
      );
    }

    this.plannerApi.updateTaskStatus(projectId, taskId, completed).subscribe({
      next: () => this.refreshProjectResources(projectId),
    });
  }

  saveProjects(): void {
    const project = this.activeProject();
    if (!project) {
      return;
    }

    this.plannerApi.saveProject(project).subscribe({
      next: (savedProject) => {
        this.upsertProject(savedProject);
        this.persistProjectsToStorage();
        this.refreshProjectResources(savedProject.id);
      },
      error: () => {
        this.persistProjectsToStorage();
      },
    });
  }

  loadSavedProjects(): void {
    this.plannerApi.getProjects().subscribe({
      next: (projects) => {
        if (!Array.isArray(projects) || projects.length === 0) {
          return;
        }

        this.projects.set(projects);
        const activeProjectId = projects.some((project) => project.id === this.activeProjectId())
          ? this.activeProjectId()
          : projects[0].id;
        this.activeProjectId.set(activeProjectId);
        this.selectedObjectId.set(null);
        this.persistProjectsToStorage();
        this.refreshProjectResources(activeProjectId);
      },
      error: () => {
        const fallback = this.loadProjects();
        this.projects.set(fallback);
        this.activeProjectId.set(fallback[0]?.id ?? 'project-home');
        this.selectedObjectId.set(null);
        this.refreshProjectResources(this.activeProjectId());
      },
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
      firstFrostDateIso: active.firstFrostDateIso,
    };

    this.plannerApi.createProject(payload).subscribe({
      next: (project) => {
        this.upsertProject(project);
        this.selectProject(project.id);
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
        this.selectProject(localProject.id);
      },
    });
  }

  duplicateActiveProject(): void {
    const source = this.activeProject();
    const duplicate: GardenProject = {
      ...source,
      id: `project-${crypto.randomUUID().slice(0, 8)}`,
      name: `${source.name} Copy`,
      seeds: structuredClone(source.seeds),
      objects: structuredClone(source.objects),
      updatedAtIso: new Date().toISOString(),
    };

    this.plannerApi.saveProject(duplicate).subscribe({
      next: (savedProject) => {
        this.upsertProject(savedProject);
        this.selectProject(savedProject.id);
      },
      error: () => {
        this.projects.set([duplicate, ...this.projects()]);
        this.selectProject(duplicate.id);
      },
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
      error: () => this.removeProjectFromState(active.id),
    });
  }

  archiveActiveProject(): void {
    const active = this.activeProject();
    if (!active || active.archivedAtIso) {
      return;
    }

    this.patchProject((project) => ({
      ...project,
      archivedAtIso: new Date().toISOString(),
    }));
  }

  unarchiveProject(projectId: string): void {
    this.projects.update((projects) =>
      projects.map((project) =>
        project.id === projectId
          ? { ...project, archivedAtIso: undefined, updatedAtIso: new Date().toISOString() }
          : project,
      ),
    );
    this.persistProjectsToStorage();
  }

  getBedSummary(bedId: string): BedSummary | null {
    return this.bedSummaries().find((summary) => summary.bedId === bedId) ?? null;
  }

  getBedSummaryLine(bedId: string): string {
    const summary = this.getBedSummary(bedId);
    if (!summary) {
      return 'Open bed';
    }

    if (summary.currentPlants.length === 0) {
      return `Open bed • ${Math.round(summary.openAreaSqInches / 144)} sq ft available`;
    }

    const plantCount = summary.currentPlants.reduce((sum, plant) => sum + plant.plantCount, 0);
    return `${summary.currentPlants.length} crops • ${plantCount} plants • ${Math.round(summary.openAreaSqInches / 144)} sq ft open`;
  }

  refreshProjectResources(projectId = this.activeProjectId()): void {
    if (!projectId) {
      return;
    }

    this.plannerApi.syncProjectTasks(projectId).subscribe({
      next: () => {
        this.loadProjectTasks(projectId);
        this.loadBedSummaries(projectId);
      },
      error: () => {
        this.loadProjectTasks(projectId);
        this.loadBedSummaries(projectId);
      },
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
      },
    });
  }

  private loadBedSummaries(projectId: string): void {
    this.plannerApi.getBedSummaries(projectId).subscribe({
      next: (summaries) => {
        this.backendBedSummaries.set(summaries);
        this.backendBedSummariesLoadedForProjectId.set(projectId);
      },
      error: () => {
        this.backendBedSummaries.set([]);
        this.backendBedSummariesLoadedForProjectId.set(null);
      },
    });
  }

  private selectProject(projectId: string): void {
    this.activeProjectId.set(projectId);
    this.selectedObjectId.set(null);
    this.selectedSeedId.set(null);
    this.persistProjectsToStorage();
    this.refreshProjectResources(projectId);
  }

  private upsertProject(project: GardenProject): void {
    const existing = this.projects().some((entry) => entry.id === project.id);
    if (existing) {
      this.projects.update((projects) =>
        projects.map((entry) => (entry.id === project.id ? project : entry)),
      );
      return;
    }

    this.projects.set([project, ...this.projects()]);
  }

  private patchProject(updater: (project: GardenProject) => GardenProject): void {
    const activeProjectId = this.activeProjectId();
    this.projects.update((projects) =>
      projects.map((project) =>
        project.id === activeProjectId
          ? updater({ ...project, updatedAtIso: new Date().toISOString() })
          : project,
      ),
    );
    this.persistProjectsToStorage();
  }

  private patchObject(objectId: string, updater: (object: LayoutObject) => LayoutObject): void {
    this.patchProject((project) => ({
      ...project,
      objects: project.objects.map((object) => (object.id === objectId ? updater(object) : object)),
    }));
  }

  private loadSeedCatalog(): void {
    this.plannerApi.getSeeds().subscribe({
      next: (seeds) => {
        if (!Array.isArray(seeds) || seeds.length === 0) {
          return;
        }

        this.seedCatalog.set(seeds);
      },
    });
  }

  private buildFallbackTasks(): PlannerTask[] {
    return this.bedSummaries()
      .flatMap((summary) => summary.nextTasks)
      .sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso));
  }

  private buildFallbackBedSummaries(): BedSummary[] {
    return this.beds().map((bed) => ({
      bedId: bed.id,
      bedName: bed.name,
      currentPlants: [],
      nextTasks: [],
      placementsCount: 0,
      occupiedAreaSqInches: 0,
      openAreaSqInches: bed.widthInches * bed.heightInches,
      totalAreaSqInches: bed.widthInches * bed.heightInches,
      warnings: [],
    }));
  }

  private removeProjectFromState(projectId: string): void {
    const remaining = this.projects().filter((project) => project.id !== projectId);
    if (remaining.length === 0) {
      return;
    }

    this.projects.set(remaining);
    this.activeProjectId.set(remaining[0].id);
    this.selectedObjectId.set(null);
    this.selectedSeedId.set(null);
    this.persistProjectsToStorage();
    this.refreshProjectResources(remaining[0].id);
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
      seeds: [],
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
      setItem: candidate.setItem.bind(candidate),
    };
  }

  private clampPct(value: number): number {
    return Math.min(1, Math.max(0, Number(value.toFixed(3))));
  }
}
