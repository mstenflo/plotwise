import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { PlannerCanvasComponent } from './planner-canvas.component';
import { PlannerStateService } from '../../core/services/planner-state.service';
import {
  BedDraftGeometry,
  BedPolygonDraftPoint,
  BedPolygonPointUpdate,
  BedShapeType,
  CanvasToolMode,
  LayoutObject,
} from '../../core/models/planner.model';
import { formatInches } from '../../core/models/units.model';

@Component({
  selector: 'app-site-planner-page',
  standalone: true,
  imports: [PlannerCanvasComponent, DatePipe, DecimalPipe],
  templateUrl: './site-planner-page.component.html',
  styleUrl: './site-planner-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SitePlannerPageComponent {
  protected readonly planner = inject(PlannerStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly project = this.planner.activeProject;
  protected readonly beds = this.planner.beds;
  protected readonly objects = this.planner.objects;
  protected readonly selectedObject = this.planner.selectedObject;
  protected readonly selectedBed = this.planner.selectedBed;
  protected readonly tasks = this.planner.tasks;
  protected readonly warnings = this.planner.warnings;
  protected readonly bedSummaries = this.planner.bedSummaries;
  protected readonly selectedObjectId = this.planner.selectedObjectId;
  protected readonly quickRenameObjectId = signal<string | null>(null);
  protected readonly quickRenameValue = signal('');
  protected readonly taskStatusFilter = signal<'all' | 'open' | 'completed'>('all');
  protected readonly taskBedFilter = signal<string>('all');
  protected readonly canvasToolMode = signal<CanvasToolMode>('select');
  protected readonly snapToGrid = signal(true);

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

  protected readonly selectedBedAreaSqFt = computed(() => {
    const bed = this.selectedBed();
    if (!bed) {
      return 0;
    }

    return Number(((bed.widthInches * bed.heightInches) / 144).toFixed(2));
  });

  protected readonly selectedBedSummary = computed(() => {
    const bed = this.selectedBed();
    if (!bed) {
      return null;
    }

    return this.planner.getBedSummary(bed.id);
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const projectId = params.get('projectId');
      if (projectId) {
        this.planner.setActiveProject(projectId);
      }
    });
  }

  protected addBed(): void {
    this.planner.addBed();
    this.canvasToolMode.set('select');
  }

  protected addStructure(): void {
    this.planner.addStructure();
    this.canvasToolMode.set('select');
  }

  protected addTree(): void {
    this.planner.addTree();
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

  protected selectObject(objectId: string | null): void {
    this.planner.selectObject(objectId);
  }

  protected updateObjectGeometry(update: {
    objectId: string;
    xInches: number;
    yInches: number;
    widthInches: number;
    heightInches: number;
    rotationDeg: number;
  }): void {
    this.planner.updateObjectGeometry(update);
  }

  protected renameSelectedObject(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.planner.renameSelectedObject(value);
  }

  protected renameObjectFromCanvas(event: { objectId: string; currentName: string }): void {
    this.selectObject(event.objectId);
    this.quickRenameObjectId.set(event.objectId);
    this.quickRenameValue.set(event.currentName);
  }

  protected updateQuickRenameValue(event: Event): void {
    this.quickRenameValue.set((event.target as HTMLInputElement).value);
  }

  protected applyQuickRename(): void {
    const objectId = this.quickRenameObjectId();
    if (!objectId) {
      return;
    }

    const nextName = this.quickRenameValue().trim();
    if (!nextName) {
      return;
    }

    this.planner.renameObject(objectId, nextName);
    this.cancelQuickRename();
  }

  protected cancelQuickRename(): void {
    this.quickRenameObjectId.set(null);
    this.quickRenameValue.set('');
  }

  protected setCanvasToolMode(value: string): void {
    if (value === 'select' || value === 'pan' || value === 'draw-bed' || value === 'draw-polygon-bed') {
      this.canvasToolMode.set(value);
    }
  }

  protected setSnapToGrid(event: Event): void {
    this.snapToGrid.set((event.target as HTMLInputElement).checked);
  }

  protected updateSelectedObjectDimension(
    field: 'xInches' | 'yInches' | 'widthInches' | 'heightInches' | 'rotationDeg',
    event: Event,
  ): void {
    const object = this.selectedObject();
    if (!object) {
      return;
    }

    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value)) {
      return;
    }

    this.updateObjectGeometry({
      objectId: object.id,
      xInches: field === 'xInches' ? value : object.xInches,
      yInches: field === 'yInches' ? value : object.yInches,
      widthInches: field === 'widthInches' ? value : object.widthInches,
      heightInches: field === 'heightInches' ? value : object.heightInches,
      rotationDeg: field === 'rotationDeg' ? value : object.rotationDeg,
    });
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

  protected updateBedPolygonPointFromCanvas(update: BedPolygonPointUpdate): void {
    this.planner.updateBedPolygonPoint(update.bedId, update.pointIndex, {
      xPct: update.xPct,
      yPct: update.yPct,
    });
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

  protected toggleTaskCompletion(taskId: string, event: Event): void {
    this.planner.toggleTaskCompletion(taskId, (event.target as HTMLInputElement).checked);
  }

  protected setTaskStatusFilter(value: string): void {
    if (value === 'all' || value === 'open' || value === 'completed') {
      this.taskStatusFilter.set(value);
    }
  }

  protected setTaskBedFilter(value: string): void {
    this.taskBedFilter.set(value || 'all');
  }

  protected getBedName(bedId: string): string {
    return this.beds().find((bed) => bed.id === bedId)?.name ?? 'Unknown Bed';
  }

  protected focusBed(bedId: string | undefined): void {
    if (!bedId) {
      return;
    }

    this.selectObject(bedId);
  }

  protected navigateToBedDetails(bedId: string): void {
    void this.router.navigate(['/projects', this.project().id, 'beds', bedId]);
  }

  protected duplicateSelectedBed(): void {
    this.planner.duplicateSelectedBed();
  }

  protected deleteSelectedObject(): void {
    this.planner.deleteSelectedObject();
  }

  protected saveProject(): void {
    this.planner.saveProjects();
  }

  protected reloadProject(): void {
    this.planner.loadSavedProjects();
  }

  protected formatImperial(totalInches: number): string {
    return formatInches(totalInches);
  }

  protected getOpenAreaSqFt(bedId: string): number {
    const summary = this.planner.getBedSummary(bedId);
    return Number((((summary?.openAreaSqInches ?? 0) / 144) || 0).toFixed(1));
  }

  protected getBedPlantNames(bedId: string): string {
    const summary = this.planner.getBedSummary(bedId);
    return summary?.currentPlants.map((plant) => plant.name).join(', ') ?? '';
  }

  protected getSelectedObjectCanopy(): number {
    const object = this.selectedObject();
    return object?.type === 'tree' ? object.canopyDiameterInches : 0;
  }

  protected getSelectedBedPolygonPoints(): Array<{ xPct: number; yPct: number }> {
    return this.selectedBed()?.polygon ?? [];
  }

  protected getObjectTypeLabel(object: LayoutObject): string {
    if (object.type === 'bed') {
      return 'Bed';
    }

    if (object.type === 'tree') {
      return 'Tree';
    }

    return 'Structure';
  }
}
