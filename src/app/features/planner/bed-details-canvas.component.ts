import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import Konva from 'konva';
import {
  BedEditorToolMode,
  BedLayout,
  BedPlacement,
  BedPlacementMode,
  PlacementPoint,
} from '../../core/models/planner.model';

const CANVAS_PADDING = 18;
const HANDLE_RADIUS = 6;

@Component({
  selector: 'app-bed-details-canvas',
  standalone: true,
  templateUrl: './bed-details-canvas.component.html',
  styleUrl: './bed-details-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BedDetailsCanvasComponent implements AfterViewInit {
  readonly bed = input<BedLayout | null>(null);
  readonly placements = input<BedPlacement[]>([]);
  readonly selectedPlacementId = input<string | null>(null);
  readonly toolMode = input<BedEditorToolMode>('select');
  readonly snapToGrid = input(true);

  readonly placementSelected = output<string | null>();
  readonly placementDrawn = output<{ placementMode: BedPlacementMode; polygonPoints: PlacementPoint[] }>();
  readonly placementMoved = output<{ placementId: string; polygonPoints: PlacementPoint[] }>();
  readonly placementPointChanged = output<{ placementId: string; pointIndex: number; point: PlacementPoint }>();

  readonly stageHost = viewChild.required<ElementRef<HTMLDivElement>>('stageHost');

  private readonly destroyRef = inject(DestroyRef);

  private stage?: Konva.Stage;
  private backgroundLayer?: Konva.Layer;
  private placementsLayer?: Konva.Layer;
  private previewLayer?: Konva.Layer;
  private placementShapes = new Map<string, Konva.Line>();
  private drawingRect?: Konva.Rect;
  private drawingStart?: PlacementPoint;
  private polygonDraft: PlacementPoint[] = [];
  private polygonDraftLine?: Konva.Line;

  constructor() {
    effect(() => {
      this.render();
    });
  }

  ngAfterViewInit(): void {
    if (!this.isCanvasSupported()) {
      return;
    }

    const container = this.stageHost().nativeElement;
    this.stage = new Konva.Stage({
      container,
      width: container.clientWidth,
      height: container.clientHeight,
    });
    this.backgroundLayer = new Konva.Layer();
    this.placementsLayer = new Konva.Layer();
    this.previewLayer = new Konva.Layer();
    this.stage.add(this.backgroundLayer);
    this.stage.add(this.placementsLayer);
    this.stage.add(this.previewLayer);

    this.bindStageEvents();
    this.render();

    const onResize = () => this.render();
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
  }

  private bindStageEvents(): void {
    if (!this.stage) {
      return;
    }

    this.stage.on('click tap', (event) => {
      if (this.toolMode() === 'polygon') {
        if (event.target !== this.stage) {
          return;
        }

        const point = this.getBedPointFromStage();
        if (!point) {
          return;
        }

        this.addPolygonDraftPoint(point);
        return;
      }

      if (event.target === this.stage) {
        this.placementSelected.emit(null);
      }
    });

    this.stage.on('dblclick dbltap', (event) => {
      if (this.toolMode() !== 'polygon' || event.target !== this.stage) {
        return;
      }

      this.finishPolygonDraft();
    });

    this.stage.on('mousedown touchstart', (event) => {
      if ((this.toolMode() !== 'row-strip' && this.toolMode() !== 'block') || event.target !== this.stage) {
        return;
      }

      const point = this.getBedPointFromStage();
      if (!point) {
        return;
      }

      this.clearPreviewArtifacts();
      this.drawingStart = point;
      this.drawingRect = new Konva.Rect({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        fill: 'rgba(94, 159, 96, 0.25)',
        stroke: '#2f6f3b',
        strokeWidth: 1.5,
        dash: [6, 4],
        listening: false,
      });
      this.previewLayer?.add(this.drawingRect);
      this.previewLayer?.batchDraw();
    });

    this.stage.on('mousemove touchmove', () => {
      if (this.toolMode() === 'polygon') {
        this.updatePolygonDraftPreview();
        return;
      }

      if (!this.drawingStart || !this.drawingRect || (this.toolMode() !== 'row-strip' && this.toolMode() !== 'block')) {
        return;
      }

      const point = this.getBedPointFromStage();
      const bed = this.bed();
      if (!point || !bed) {
        return;
      }

      const bounds = this.getCanvasBounds(bed);
      const x =
        this.toolMode() === 'row-strip'
          ? 0
          : Math.min(this.drawingStart.xInches, point.xInches);
      const y = Math.min(this.drawingStart.yInches, point.yInches);
      const width =
        this.toolMode() === 'row-strip'
          ? bed.widthInches
          : Math.abs(point.xInches - this.drawingStart.xInches);
      const height = Math.abs(point.yInches - this.drawingStart.yInches);

      this.drawingRect.position({
        x: bounds.offsetX + x * bounds.scale,
        y: bounds.offsetY + y * bounds.scale,
      });
      this.drawingRect.size({
        width: Math.max(bounds.scale, width * bounds.scale),
        height: Math.max(bounds.scale, height * bounds.scale),
      });
      this.previewLayer?.batchDraw();
    });

    this.stage.on('mouseup touchend', () => {
      if (!this.drawingStart || !this.drawingRect || (this.toolMode() !== 'row-strip' && this.toolMode() !== 'block')) {
        return;
      }

      const point = this.getBedPointFromStage();
      const placementMode = this.toolMode() as BedPlacementMode;
      if (!point) {
        this.clearPreviewArtifacts();
        return;
      }

      const x =
        placementMode === 'row-strip'
          ? 0
          : Math.min(this.drawingStart.xInches, point.xInches);
      const y = Math.min(this.drawingStart.yInches, point.yInches);
      const width =
        placementMode === 'row-strip'
          ? this.bed()?.widthInches ?? 0
          : Math.abs(point.xInches - this.drawingStart.xInches);
      const height = Math.abs(point.yInches - this.drawingStart.yInches);

      this.clearPreviewArtifacts();
      if (width < 1 || height < 1) {
        return;
      }

      this.placementDrawn.emit({
        placementMode,
        polygonPoints: [
          { xInches: x, yInches: y },
          { xInches: x + width, yInches: y },
          { xInches: x + width, yInches: y + height },
          { xInches: x, yInches: y + height },
        ],
      });
    });
  }

  private render(): void {
    const bed = this.bed();
    if (!this.stage || !this.backgroundLayer || !this.placementsLayer || !bed) {
      return;
    }

    const host = this.stageHost().nativeElement;
    this.stage.width(host.clientWidth);
    this.stage.height(host.clientHeight);
    this.backgroundLayer.destroyChildren();
    this.placementsLayer.destroyChildren();
    this.previewLayer?.destroyChildren();
    this.placementShapes.clear();

    const bounds = this.getCanvasBounds(bed);
    this.drawGrid(bounds, bed);
    this.drawBedBoundary(bounds, bed);
    this.drawPlacements(bounds);
    this.drawPlacementHandles(bounds);

    if (this.drawingRect) {
      this.previewLayer?.add(this.drawingRect);
    }
    if (this.polygonDraftLine) {
      this.previewLayer?.add(this.polygonDraftLine);
    }

    this.backgroundLayer.batchDraw();
    this.placementsLayer.batchDraw();
    this.previewLayer?.batchDraw();
  }

  private drawGrid(bounds: { offsetX: number; offsetY: number; scale: number }, bed: BedLayout): void {
    if (!this.backgroundLayer) {
      return;
    }

    for (let x = 0; x <= bed.widthInches; x += 1) {
      this.backgroundLayer.add(
        new Konva.Line({
          points: [
            bounds.offsetX + x * bounds.scale,
            bounds.offsetY,
            bounds.offsetX + x * bounds.scale,
            bounds.offsetY + bed.heightInches * bounds.scale,
          ],
          stroke: x % 12 === 0 ? '#bfd7bc' : '#dcebd9',
          strokeWidth: x % 12 === 0 ? 1.1 : 0.5,
        }),
      );
    }

    for (let y = 0; y <= bed.heightInches; y += 1) {
      this.backgroundLayer.add(
        new Konva.Line({
          points: [
            bounds.offsetX,
            bounds.offsetY + y * bounds.scale,
            bounds.offsetX + bed.widthInches * bounds.scale,
            bounds.offsetY + y * bounds.scale,
          ],
          stroke: y % 12 === 0 ? '#bfd7bc' : '#dcebd9',
          strokeWidth: y % 12 === 0 ? 1.1 : 0.5,
        }),
      );
    }
  }

  private drawBedBoundary(bounds: { offsetX: number; offsetY: number; scale: number }, bed: BedLayout): void {
    if (!this.backgroundLayer) {
      return;
    }

    this.backgroundLayer.add(
      new Konva.Rect({
        x: bounds.offsetX,
        y: bounds.offsetY,
        width: bed.widthInches * bounds.scale,
        height: bed.heightInches * bounds.scale,
        fill: 'rgba(255,255,255,0.92)',
        stroke: '#2f6f3b',
        strokeWidth: 2,
      }),
    );
  }

  private drawPlacements(bounds: { offsetX: number; offsetY: number; scale: number }): void {
    if (!this.placementsLayer) {
      return;
    }

    for (const placement of this.placements()) {
      const shape = new Konva.Line({
        x: bounds.offsetX,
        y: bounds.offsetY,
        points: placement.polygonPoints.flatMap((point) => [
          point.xInches * bounds.scale,
          point.yInches * bounds.scale,
        ]),
        closed: true,
        fill: this.toAlphaFill(placement.colorHex, 0.45),
        stroke: placement.colorHex,
        strokeWidth: this.selectedPlacementId() === placement.id ? 2.5 : 1.5,
        draggable: this.toolMode() === 'select',
      });

      shape.on('click tap', (event) => {
        event.cancelBubble = true;
        this.placementSelected.emit(placement.id);
      });
      shape.dragBoundFunc((position) => {
        const bed = this.bed();
        if (!bed) {
          return position;
        }

        const xValues = placement.polygonPoints.map((point) => point.xInches);
        const yValues = placement.polygonPoints.map((point) => point.yInches);
        const minX = Math.min(...xValues);
        const maxX = Math.max(...xValues);
        const minY = Math.min(...yValues);
        const maxY = Math.max(...yValues);
        const nextDeltaX = this.clamp(
          Math.round((position.x - bounds.offsetX) / bounds.scale),
          -minX,
          bed.widthInches - maxX,
        );
        const nextDeltaY = this.clamp(
          Math.round((position.y - bounds.offsetY) / bounds.scale),
          -minY,
          bed.heightInches - maxY,
        );

        return {
          x: bounds.offsetX + nextDeltaX * bounds.scale,
          y: bounds.offsetY + nextDeltaY * bounds.scale,
        };
      });
      shape.on('dragend', () => {
        const deltaX = Math.round((shape.x() - bounds.offsetX) / bounds.scale);
        const deltaY = Math.round((shape.y() - bounds.offsetY) / bounds.scale);
        this.placementMoved.emit({
          placementId: placement.id,
          polygonPoints: placement.polygonPoints.map((point) => ({
            xInches: point.xInches + deltaX,
            yInches: point.yInches + deltaY,
          })),
        });
      });

      this.placementsLayer.add(shape);
      this.placementShapes.set(placement.id, shape);
    }
  }

  private drawPlacementHandles(bounds: { offsetX: number; offsetY: number; scale: number }): void {
    const placementsLayer = this.placementsLayer;
    if (!placementsLayer) {
      return;
    }

    const placement = this.placements().find((entry) => entry.id === this.selectedPlacementId());
    if (!placement) {
      return;
    }

    const shape = this.placementShapes.get(placement.id);
    if (!shape) {
      return;
    }

    placement.polygonPoints.forEach((point, pointIndex) => {
      const handle = new Konva.Circle({
        x: bounds.offsetX + point.xInches * bounds.scale,
        y: bounds.offsetY + point.yInches * bounds.scale,
        radius: HANDLE_RADIUS,
        fill: '#fffaf4',
        stroke: placement.colorHex,
        strokeWidth: 2,
        draggable: this.toolMode() === 'select',
      });

      handle.on('mousedown touchstart click tap dragstart', (event) => {
        event.cancelBubble = true;
        this.placementSelected.emit(placement.id);
      });
      handle.dragBoundFunc((position) => {
        const bed = this.bed();
        if (!bed) {
          return position;
        }

        return {
          x:
            bounds.offsetX +
            this.clamp(
              Math.round((position.x - bounds.offsetX) / bounds.scale),
              0,
              bed.widthInches,
            ) *
              bounds.scale,
          y:
            bounds.offsetY +
            this.clamp(
              Math.round((position.y - bounds.offsetY) / bounds.scale),
              0,
              bed.heightInches,
            ) *
              bounds.scale,
        };
      });
      handle.on('dragmove', () => {
        const nextPoints = [...shape.points()];
        nextPoints[pointIndex * 2] = handle.x() - bounds.offsetX;
        nextPoints[pointIndex * 2 + 1] = handle.y() - bounds.offsetY;
        shape.points(nextPoints);
        placementsLayer.batchDraw();
      });
      handle.on('dragend', () => {
        this.placementPointChanged.emit({
          placementId: placement.id,
          pointIndex,
          point: {
            xInches: Math.round((handle.x() - bounds.offsetX) / bounds.scale),
            yInches: Math.round((handle.y() - bounds.offsetY) / bounds.scale),
          },
        });
      });

      placementsLayer.add(handle);
    });
  }

  private getCanvasBounds(bed: BedLayout): { offsetX: number; offsetY: number; scale: number } {
    const width = this.stageHost().nativeElement.clientWidth;
    const height = this.stageHost().nativeElement.clientHeight;
    const availableWidth = Math.max(1, width - CANVAS_PADDING * 2);
    const availableHeight = Math.max(1, height - CANVAS_PADDING * 2);
    const scale = Math.max(
      1,
      Math.min(availableWidth / Math.max(1, bed.widthInches), availableHeight / Math.max(1, bed.heightInches)),
    );

    return {
      scale,
      offsetX: Math.round((width - bed.widthInches * scale) / 2),
      offsetY: Math.round((height - bed.heightInches * scale) / 2),
    };
  }

  private getBedPointFromStage(): PlacementPoint | null {
    const stage = this.stage;
    const bed = this.bed();
    if (!stage || !bed) {
      return null;
    }

    const pointer = stage.getPointerPosition();
    if (!pointer) {
      return null;
    }

    const bounds = this.getCanvasBounds(bed);
    const xInches = Math.round((pointer.x - bounds.offsetX) / bounds.scale);
    const yInches = Math.round((pointer.y - bounds.offsetY) / bounds.scale);

    return {
      xInches: this.clamp(xInches, 0, bed.widthInches),
      yInches: this.clamp(yInches, 0, bed.heightInches),
    };
  }

  private addPolygonDraftPoint(point: PlacementPoint): void {
    this.polygonDraft.push(point);
    this.updatePolygonDraftLine();
  }

  private updatePolygonDraftPreview(): void {
    if (!this.polygonDraftLine || this.polygonDraft.length === 0) {
      return;
    }

    const point = this.getBedPointFromStage();
    const bed = this.bed();
    if (!point || !bed) {
      return;
    }

    const bounds = this.getCanvasBounds(bed);
    this.polygonDraftLine.points(
      [...this.polygonDraft, point].flatMap((draftPoint) => [
        bounds.offsetX + draftPoint.xInches * bounds.scale,
        bounds.offsetY + draftPoint.yInches * bounds.scale,
      ]),
    );
    this.previewLayer?.batchDraw();
  }

  private finishPolygonDraft(): void {
    if (this.polygonDraft.length < 3) {
      this.clearPreviewArtifacts();
      return;
    }

    this.placementDrawn.emit({
      placementMode: 'polygon',
      polygonPoints: this.polygonDraft,
    });
    this.clearPreviewArtifacts();
  }

  private updatePolygonDraftLine(): void {
    const bed = this.bed();
    if (!this.previewLayer || !bed) {
      return;
    }

    const bounds = this.getCanvasBounds(bed);
    const points = this.polygonDraft.flatMap((point) => [
      bounds.offsetX + point.xInches * bounds.scale,
      bounds.offsetY + point.yInches * bounds.scale,
    ]);

    if (!this.polygonDraftLine) {
      this.polygonDraftLine = new Konva.Line({
        points,
        stroke: '#2f6f3b',
        strokeWidth: 2,
        dash: [6, 4],
        listening: false,
      });
      this.previewLayer.add(this.polygonDraftLine);
    } else {
      this.polygonDraftLine.points(points);
    }

    this.previewLayer.batchDraw();
  }

  private clearPreviewArtifacts(): void {
    this.drawingRect?.destroy();
    this.drawingRect = undefined;
    this.drawingStart = undefined;
    this.polygonDraftLine?.destroy();
    this.polygonDraftLine = undefined;
    this.polygonDraft = [];
    this.previewLayer?.batchDraw();
  }

  private toAlphaFill(colorHex: string, alpha: number): string {
    const normalized = colorHex.replace('#', '');
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }

  private isCanvasSupported(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return typeof canvas.getContext === 'function' && !!canvas.getContext('2d');
    } catch {
      return false;
    }
  }
}
