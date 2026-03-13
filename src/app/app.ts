import { ChangeDetectionStrategy, Component, HostListener, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PlannerCanvasComponent } from './features/planner/planner-canvas.component';
import { PlannerStateService } from './core/services/planner-state.service';
import {
  BedDraftGeometry,
  BedPolygonDraftPoint,
  BedShapeType,
  BedZone,
  CanvasToolMode,
  PlannerTask,
  ProjectSeason,
  ZoneRect,
  ZoneShapeType
} from './core/models/planner.model';
import { formatInches } from './core/models/units.model';

@Component({
  selector: 'app-root',
  imports: [PlannerCanvasComponent, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  private readonly planner = inject(PlannerStateService);

  protected readonly project = this.planner.activeProject;
  protected readonly projects = this.planner.projects;
  protected readonly beds = this.planner.beds;
  protected readonly seeds = this.planner.seeds;
  protected readonly selectedObject = this.planner.selectedObject;
  protected readonly selectedBed = this.planner.selectedBed;
  protected readonly selectedObjectId = this.planner.selectedObjectId;
  protected readonly selectedSeedId = this.planner.selectedSeedId;
  protected readonly tasks = this.planner.tasks;
  protected readonly warnings = this.planner.warnings;
  protected readonly taskStatusFilter = signal<'all' | 'open' | 'completed'>('all');
  protected readonly taskBedFilter = signal<string>('all');
  protected readonly showArchivedProjects = signal(false);
  protected readonly quickRenameBedId = signal<string | null>(null);
  protected readonly quickRenameValue = signal('');
  protected readonly canvasToolMode = signal<CanvasToolMode>('select');
  protected readonly snapToGrid = signal(true);

  protected readonly visibleProjects = computed(() => {
    if (this.showArchivedProjects()) {
      return this.projects();
    }

    return this.projects().filter((project) => !project.archivedAtIso);
  });

  protected readonly filteredTasks = computed(() => {
    const statusFilter = this.taskStatusFilter();
    const bedFilter = this.taskBedFilter();

    return this.tasks().filter((task) => {
      const statusMatches =
        statusFilter === 'all' ||
        (statusFilter === 'open' && !task.completed) ||
        (statusFilter === 'completed' && task.completed);

      const bedMatches = bedFilter === 'all' || task.bedId === bedFilter;
      return statusMatches && bedMatches;
    });
  });

  protected readonly selectedBedSummary = computed(() => {
    const bed = this.selectedBed();
    return bed ? this.planner.getBedSummary(bed) : 'Select a bed to inspect spacing, crop plan, and expected harvest.';
  });

  protected readonly selectedBedAreaSqFt = computed(() => {
    const bed = this.selectedBed();
    if (!bed) {
      return 0;
    }

    return Number(((bed.widthInches * bed.heightInches) / 144).toFixed(2));
  });

  protected readonly selectedBedZones = computed(() => {
    const bed = this.selectedBed();
    if (!bed) {
      return [] as BedZone[];
    }

    return this.planner.getZonesForBed(bed.id);
  });

  protected readonly selectedBedPolygonPoints = computed(() => {
    const bed = this.selectedBed();
    return bed?.polygon ?? [];
  });

  protected setSeason(value: string): void {
    this.planner.setSeason(value as ProjectSeason);
  }

  protected setActiveProject(projectId: string): void {
    this.planner.setActiveProject(projectId);
  }

  protected createProject(): void {
    this.planner.createProject();
  }

  protected duplicateProject(): void {
    this.planner.duplicateActiveProject();
  }

  protected deleteProject(): void {
    if (this.projects().length <= 1) {
      return;
    }

    const confirmed = window.confirm(`Delete project "${this.project().name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    this.planner.deleteActiveProject();
  }

  protected archiveProject(): void {
    this.planner.archiveActiveProject();
  }

  protected unarchiveProject(projectId: string): void {
    this.planner.unarchiveProject(projectId);
  }

  protected setShowArchivedProjects(value: boolean): void {
    this.showArchivedProjects.set(value);

    if (value) {
      return;
    }

    if (this.project().archivedAtIso) {
      const firstVisible = this.visibleProjects()[0];
      if (firstVisible) {
        this.setActiveProject(firstVisible.id);
      }
    }
  }

  protected addBed(): void {
    this.planner.addBed();
    this.canvasToolMode.set('select');
  }

  protected addBedFromCanvas(geometry: BedDraftGeometry): void {
    this.planner.addBed(geometry);
    this.canvasToolMode.set('select');
  }

  protected addPolygonBedFromCanvas(points: BedPolygonDraftPoint[]): void {
    this.planner.addPolygonBed(points);
    this.canvasToolMode.set('select');
  }

  protected selectBed(bedId: string | null): void {
    this.planner.selectObject(bedId);
  }

  protected selectSeed(seedId: string): void {
    this.planner.selectSeed(seedId);
  }

  protected assignSeedToSelectedBed(): void {
    this.planner.assignSelectedSeedToSelectedBed();
  }

  protected clearSelectedBedPlanting(): void {
    this.planner.clearSelectedBedPlanting();
  }

  protected assignSeedToZone(zoneId: string): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    this.planner.assignSelectedSeedToBedZone(bed.id, zoneId);
  }

  protected clearZonePlanting(zoneId: string): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    this.planner.clearBedZonePlanting(bed.id, zoneId);
  }

  protected duplicateSelectedBed(): void {
    this.planner.duplicateSelectedBed();
  }

  protected deleteSelectedObject(): void {
    this.planner.deleteSelectedObject();
  }

  protected renameSelectedObject(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.planner.renameSelectedObject(value);
  }

  protected updateBedGeometry(update: {
    bedId: string;
    xInches: number;
    yInches: number;
    widthInches: number;
    heightInches: number;
    rotationDeg: number;
  }): void {
    this.planner.updateBedGeometry(update);
  }

  protected setCanvasToolMode(value: string): void {
    if (value === 'select' || value === 'pan' || value === 'draw-bed' || value === 'draw-polygon-bed') {
      this.canvasToolMode.set(value);
    }
  }

  protected setSnapToGrid(event: Event): void {
    this.snapToGrid.set((event.target as HTMLInputElement).checked);
  }

  protected updateSelectedBedDimension(field: 'xInches' | 'yInches' | 'widthInches' | 'heightInches' | 'rotationDeg', event: Event): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value)) {
      return;
    }

    this.updateBedGeometry({
      bedId: bed.id,
      xInches: field === 'xInches' ? value : bed.xInches,
      yInches: field === 'yInches' ? value : bed.yInches,
      widthInches: field === 'widthInches' ? value : bed.widthInches,
      heightInches: field === 'heightInches' ? value : bed.heightInches,
      rotationDeg: field === 'rotationDeg' ? value : bed.rotationDeg
    });
  }

  protected updateSelectedBedRows(event: Event): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value)) {
      return;
    }

    this.planner.setBedRows(bed.id, value);
  }

  protected setSelectedBedShapeType(event: Event): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    const shapeType = (event.target as HTMLSelectElement).value as BedShapeType;
    if (shapeType !== 'rectangle' && shapeType !== 'polygon') {
      return;
    }

    this.planner.setBedShapeType(bed.id, shapeType);
  }

  protected updateBedPolygonPoint(pointIndex: number, field: 'xPct' | 'yPct', event: Event): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value)) {
      return;
    }

    this.planner.updateBedPolygonPoint(bed.id, pointIndex, { [field]: value / 100 });
  }

  protected addBedPolygonPoint(): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    this.planner.addBedPolygonPoint(bed.id);
  }

  protected removeBedPolygonPoint(pointIndex: number): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    this.planner.removeBedPolygonPoint(bed.id, pointIndex);
  }

  protected formatImperial(totalInches: number): string {
    return formatInches(totalInches);
  }

  protected getSeedName(seedId: string): string {
    return this.seeds().find((seed) => seed.id === seedId)?.name ?? 'Unknown crop';
  }

  protected setZoneShapeType(zoneId: string, event: Event): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    const shapeType = (event.target as HTMLSelectElement).value as ZoneShapeType;
    if (shapeType !== 'row-strip' && shapeType !== 'square' && shapeType !== 'polygon') {
      return;
    }

    this.planner.setZoneShapeType(bed.id, zoneId, shapeType);
  }

  protected setZoneColor(zoneId: string, event: Event): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    const color = (event.target as HTMLInputElement).value;
    if (!color) {
      return;
    }

    this.planner.setZoneColor(bed.id, zoneId, color);
  }

  protected updateZoneRect(zoneId: string, field: keyof ZoneRect, event: Event): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value)) {
      return;
    }

    this.planner.updateZoneRect(bed.id, zoneId, { [field]: value / 100 });
  }

  protected getZonePolygonPoints(zoneId: string): Array<{ xPct: number; yPct: number }> {
    return this.selectedBedZones().find((zone) => zone.id === zoneId)?.polygon ?? [];
  }

  protected updateZonePolygonPoint(zoneId: string, pointIndex: number, field: 'xPct' | 'yPct', event: Event): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value)) {
      return;
    }

    this.planner.updateZonePolygonPoint(bed.id, zoneId, pointIndex, { [field]: value / 100 });
  }

  protected addZonePolygonPoint(zoneId: string): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    this.planner.addZonePolygonPoint(bed.id, zoneId);
  }

  protected removeZonePolygonPoint(zoneId: string, pointIndex: number): void {
    const bed = this.selectedBed();
    if (!bed) {
      return;
    }

    this.planner.removeZonePolygonPoint(bed.id, zoneId, pointIndex);
  }

  protected hasSelectedBedPlantings(): boolean {
    return this.selectedBedZones().some((zone) => !!zone.planting);
  }

  protected renameBedFromCanvas(event: { bedId: string; currentName: string }): void {
    this.selectBed(event.bedId);
    this.quickRenameBedId.set(event.bedId);
    this.quickRenameValue.set(event.currentName);
  }

  protected updateQuickRenameValue(event: Event): void {
    this.quickRenameValue.set((event.target as HTMLInputElement).value);
  }

  protected applyQuickRename(): void {
    const bedId = this.quickRenameBedId();
    if (!bedId) {
      return;
    }

    const nextName = this.quickRenameValue().trim();
    if (!nextName) {
      return;
    }

    this.planner.renameObject(bedId, nextName);
    this.cancelQuickRename();
  }

  protected cancelQuickRename(): void {
    this.quickRenameBedId.set(null);
    this.quickRenameValue.set('');
  }

  protected saveProject(): void {
    this.planner.saveProjects();
  }

  protected reloadProject(): void {
    this.planner.loadSavedProjects();
  }

  protected setTaskStatusFilter(value: string): void {
    if (value === 'all' || value === 'open' || value === 'completed') {
      this.taskStatusFilter.set(value);
    }
  }

  protected setTaskBedFilter(value: string): void {
    this.taskBedFilter.set(value || 'all');
  }

  protected toggleTaskCompletion(taskId: string, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.planner.toggleTaskCompletion(taskId, checked);
  }

  protected getBedName(bedId: string): string {
    return this.beds().find((bed) => bed.id === bedId)?.name ?? 'Unknown Bed';
  }

  protected focusBed(bedId: string | undefined): void {
    if (!bedId) {
      return;
    }

    this.selectBed(bedId);
  }

  @HostListener('window:keydown', ['$event'])
  protected handleKeyboardShortcuts(event: KeyboardEvent): void {
    if (this.shouldIgnoreShortcuts(event)) {
      return;
    }

    if (event.key === 'Escape') {
      this.selectBed(null);
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (this.selectedObjectId()) {
        event.preventDefault();
        this.deleteSelectedObject();
      }
      return;
    }

    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      this.addBed();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      this.saveProject();
      return;
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd') {
      if (this.selectedBed()) {
        event.preventDefault();
        this.duplicateSelectedBed();
      }
    }
  }

  private shouldIgnoreShortcuts(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return false;
    }

    const tag = target.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || target.isContentEditable;
  }
}
