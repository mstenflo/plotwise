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
  viewChild
} from '@angular/core';
import Konva from 'konva';
import {
  BedDraftGeometry,
  BedGeometryUpdate,
  BedLayout,
  BedPolygonDraftPoint,
  BedZone,
  CanvasToolMode
} from '../../core/models/planner.model';

const PIXELS_PER_INCH = 2;
const GRID_STEP_INCHES = 12;

@Component({
  selector: 'app-planner-canvas',
  templateUrl: './planner-canvas.component.html',
  styleUrl: './planner-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlannerCanvasComponent implements AfterViewInit {
  readonly beds = input.required<BedLayout[]>();
  readonly selectedBedId = input<string | null>(null);
  readonly toolMode = input<CanvasToolMode>('select');
  readonly snapToGrid = input(true);

  readonly bedSelected = output<string | null>();
  readonly bedGeometryChanged = output<BedGeometryUpdate>();
  readonly bedRenameRequested = output<{ bedId: string; currentName: string }>();
  readonly bedDrawn = output<BedDraftGeometry>();
  readonly polygonBedDrawn = output<BedPolygonDraftPoint[]>();

  readonly stageHost = viewChild.required<ElementRef<HTMLDivElement>>('stageHost');

  private readonly destroyRef = inject(DestroyRef);

  private stage?: Konva.Stage;
  private backgroundLayer?: Konva.Layer;
  private bedsLayer?: Konva.Layer;
  private selectionTransformer?: Konva.Transformer;
  private drawingRect?: Konva.Rect;
  private drawingStart?: { x: number; y: number };
  private drawingPolygonLine?: Konva.Line;
  private drawingPolygonPoints: Array<{ x: number; y: number }> = [];
  private bedMap = new Map<string, Konva.Shape>();

  constructor() {
    effect(() => {
      this.renderBeds(this.beds(), this.toolMode());
      this.attachTransformer(this.selectedBedId());
      this.updateInteractionMode(this.toolMode());
    });
  }

  ngAfterViewInit(): void {
    if (!this.isCanvasSupported()) {
      return;
    }

    this.initStage();
    this.renderBeds(this.beds(), this.toolMode());
    this.attachTransformer(this.selectedBedId());
    this.updateInteractionMode(this.toolMode());

    const onResize = () => this.resizeStage();
    window.addEventListener('resize', onResize);
    this.destroyRef.onDestroy(() => window.removeEventListener('resize', onResize));
  }

  private initStage(): void {
    const container = this.stageHost().nativeElement;

    this.stage = new Konva.Stage({
      container,
      width: container.clientWidth,
      height: container.clientHeight,
      draggable: false
    });

    this.backgroundLayer = new Konva.Layer();
    this.bedsLayer = new Konva.Layer();
    this.selectionTransformer = new Konva.Transformer({
      rotateEnabled: true,
      keepRatio: false,
      borderDash: [6, 4]
    });

    this.bedsLayer.add(this.selectionTransformer);

    this.stage.add(this.backgroundLayer);
    this.stage.add(this.bedsLayer);

    this.drawGrid();

    this.stage.on('click tap', (event) => {
      if (this.toolMode() === 'pan') {
        return;
      }

      if (this.toolMode() === 'draw-polygon-bed') {
        if (event.target !== this.stage) {
          return;
        }

        const pointer = this.getStagePoint();
        if (!pointer) {
          return;
        }

        this.addPolygonDraftPoint(pointer);
        return;
      }

      if (this.toolMode() === 'draw-bed') {
        return;
      }

      if (event.target === this.stage) {
        this.bedSelected.emit(null);
      }
    });

    this.stage.on('dblclick dbltap', (event) => {
      if (this.toolMode() !== 'draw-polygon-bed' || event.target !== this.stage) {
        return;
      }

      this.finishPolygonDraft();
    });

    this.stage.on('mousedown touchstart', (event) => {
      if (this.toolMode() !== 'draw-bed' || !this.bedsLayer || !this.stage) {
        return;
      }

      if (event.target !== this.stage) {
        return;
      }

      const pointer = this.getStagePoint();
      if (!pointer) {
        return;
      }

      this.clearDrawingArtifacts();
      this.drawingStart = pointer;
      this.drawingRect = new Konva.Rect({
        x: pointer.x,
        y: pointer.y,
        width: 1,
        height: 1,
        fill: 'rgba(94, 159, 96, 0.25)',
        stroke: '#2f6f3b',
        strokeWidth: 1.5,
        dash: [6, 4],
        listening: false
      });

      this.bedsLayer.add(this.drawingRect);
      this.bedsLayer.batchDraw();
    });

    this.stage.on('mousemove touchmove', () => {
      if (this.toolMode() === 'draw-polygon-bed') {
        this.updatePolygonDraftPreview();
        return;
      }

      if (this.toolMode() !== 'draw-bed' || !this.drawingStart || !this.drawingRect) {
        return;
      }

      const pointer = this.getStagePoint();
      if (!pointer) {
        return;
      }

      const x = Math.min(this.drawingStart.x, pointer.x);
      const y = Math.min(this.drawingStart.y, pointer.y);
      const width = Math.abs(pointer.x - this.drawingStart.x);
      const height = Math.abs(pointer.y - this.drawingStart.y);

      this.drawingRect.position({ x, y });
      this.drawingRect.size({ width, height });
      this.bedsLayer?.batchDraw();
    });

    this.stage.on('mouseup touchend', () => {
      if (this.toolMode() !== 'draw-bed' || !this.drawingRect) {
        return;
      }

      const geometry = {
        xInches: this.toInches(this.drawingRect.x()),
        yInches: this.toInches(this.drawingRect.y()),
        widthInches: this.toInches(this.drawingRect.width()),
        heightInches: this.toInches(this.drawingRect.height())
      };

      this.clearDrawingArtifacts();

      if (geometry.widthInches < 12 || geometry.heightInches < 12) {
        return;
      }

      this.bedDrawn.emit(geometry);
      this.bedSelected.emit(null);
    });

    this.stage.on('wheel', (event) => {
      event.evt.preventDefault();

      const oldScale = this.stage?.scaleX() ?? 1;
      const pointer = this.stage?.getPointerPosition();
      if (!pointer || !this.stage) {
        return;
      }

      const direction = event.evt.deltaY > 0 ? -1 : 1;
      const scaleBy = 1.08;
      const newScale = direction > 0 ? oldScale * scaleBy : oldScale / scaleBy;
      const clampedScale = Math.min(3.5, Math.max(0.3, newScale));

      const mousePointTo = {
        x: (pointer.x - this.stage.x()) / oldScale,
        y: (pointer.y - this.stage.y()) / oldScale
      };

      this.stage.scale({ x: clampedScale, y: clampedScale });
      this.stage.position({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale
      });

      this.stage.batchDraw();
    });
  }

  private resizeStage(): void {
    if (!this.stage) {
      return;
    }

    const container = this.stageHost().nativeElement;
    this.stage.width(container.clientWidth);
    this.stage.height(container.clientHeight);
    this.drawGrid();
    this.stage.batchDraw();
  }

  private drawGrid(): void {
    if (!this.stage || !this.backgroundLayer) {
      return;
    }

    this.backgroundLayer.destroyChildren();
    const width = this.stage.width();
    const height = this.stage.height();
    const step = 12 * PIXELS_PER_INCH;

    for (let x = 0; x < width; x += step) {
      this.backgroundLayer.add(
        new Konva.Line({
          points: [x, 0, x, height],
          stroke: '#d8ead6',
          strokeWidth: x % (step * 4) === 0 ? 1.4 : 0.7
        })
      );
    }

    for (let y = 0; y < height; y += step) {
      this.backgroundLayer.add(
        new Konva.Line({
          points: [0, y, width, y],
          stroke: '#d8ead6',
          strokeWidth: y % (step * 4) === 0 ? 1.4 : 0.7
        })
      );
    }

    this.backgroundLayer.batchDraw();
  }

  private renderBeds(beds: BedLayout[], mode: CanvasToolMode): void {
    if (!this.bedsLayer || !this.selectionTransformer) {
      return;
    }

    this.bedsLayer.destroyChildren();
    this.bedsLayer.add(this.selectionTransformer);
    if (this.drawingRect) {
      this.bedsLayer.add(this.drawingRect);
    }
    if (this.drawingPolygonLine) {
      this.bedsLayer.add(this.drawingPolygonLine);
    }
    this.bedMap.clear();

    for (const bed of beds) {
      const shape = this.createBedShape(bed, mode);

      shape.on('click tap', () => this.bedSelected.emit(bed.id));
      shape.on('dblclick dbltap', () => {
        this.bedRenameRequested.emit({ bedId: bed.id, currentName: bed.name });
      });
      shape.on('dragend', () => this.emitGeometry(shape, bed));
      shape.on('transformend', () => this.handleShapeTransform(shape, bed));

      this.bedsLayer.add(shape);
      this.bedMap.set(bed.id, shape);

      const zones = bed.zones && bed.zones.length > 0 ? [...bed.zones].sort((a, b) => a.rowIndex - b.rowIndex) : [];
      const totalRows = zones.length > 0 ? zones.length : bed.rows;
      this.drawZoneOverlays(bed, zones, totalRows);

      const label = new Konva.Text({
        x: bed.xInches * PIXELS_PER_INCH + 6,
        y: bed.yInches * PIXELS_PER_INCH + 6,
        text:
          zones.length > 0
            ? `${bed.name} • ${zones.filter((zone) => !!zone.planting).length}/${zones.length} rows planted`
            : bed.planting
              ? `${bed.name} • planted`
              : `${bed.name} • open`,
        fontSize: 12,
        fill: '#204627',
        listening: true
      });

      label.on('click tap', () => this.bedSelected.emit(bed.id));
      label.on('dblclick dbltap', () => {
        this.bedRenameRequested.emit({ bedId: bed.id, currentName: bed.name });
      });
      this.bedsLayer.add(label);
    }

    this.bedsLayer.batchDraw();
  }

  private attachTransformer(selectedId: string | null): void {
    if (!this.selectionTransformer || !this.bedsLayer) {
      return;
    }

    if (this.toolMode() !== 'select') {
      this.selectionTransformer.nodes([]);
      this.bedsLayer.batchDraw();
      return;
    }

    if (!selectedId) {
      this.selectionTransformer.nodes([]);
      this.bedsLayer.batchDraw();
      return;
    }

    const selectedShape = this.bedMap.get(selectedId);
    this.selectionTransformer.nodes(selectedShape ? [selectedShape] : []);
    this.bedsLayer.batchDraw();
  }

  private emitGeometry(shape: Konva.Shape, bed: BedLayout): void {
    if (shape instanceof Konva.Rect) {
      if (this.snapToGrid()) {
        shape.position({
          x: this.toPixels(this.snapInches(this.toInches(shape.x()))),
          y: this.toPixels(this.snapInches(this.toInches(shape.y())))
        });
      }

      this.bedGeometryChanged.emit({
        bedId: shape.id(),
        xInches: this.toInches(shape.x()),
        yInches: this.toInches(shape.y()),
        widthInches: this.toInches(shape.width()),
        heightInches: this.toInches(shape.height()),
        rotationDeg: shape.rotation()
      });
      return;
    }

    if (shape instanceof Konva.Line) {
      const points = shape.points();
      const absolute: Array<{ x: number; y: number }> = [];

      for (let i = 0; i < points.length; i += 2) {
        absolute.push({ x: points[i] + shape.x(), y: points[i + 1] + shape.y() });
      }

      const xValues = absolute.map((point) => point.x);
      const yValues = absolute.map((point) => point.y);

      const minX = Math.min(...xValues);
      const minY = Math.min(...yValues);
      const maxX = Math.max(...xValues);
      const maxY = Math.max(...yValues);

      this.bedGeometryChanged.emit({
        bedId: bed.id,
        xInches: this.toInches(minX),
        yInches: this.toInches(minY),
        widthInches: Math.max(12, this.toInches(maxX - minX)),
        heightInches: Math.max(12, this.toInches(maxY - minY)),
        rotationDeg: 0
      });
    }
  }

  private updateInteractionMode(mode: CanvasToolMode): void {
    if (!this.stage) {
      return;
    }

    this.stage.draggable(mode === 'pan');
    this.clearDrawingArtifacts();
    this.stage.batchDraw();
  }

  private getStagePoint(): { x: number; y: number } | null {
    if (!this.stage) {
      return null;
    }

    const pointer = this.stage.getPointerPosition();
    if (!pointer) {
      return null;
    }

    const x = (pointer.x - this.stage.x()) / this.stage.scaleX();
    const y = (pointer.y - this.stage.y()) / this.stage.scaleY();

    return {
      x: this.snapToGrid() ? this.toPixels(this.snapInches(this.toInches(x))) : x,
      y: this.snapToGrid() ? this.toPixels(this.snapInches(this.toInches(y))) : y
    };
  }

  private clearDrawingArtifacts(): void {
    this.drawingRect?.destroy();
    this.drawingRect = undefined;
    this.drawingStart = undefined;
    this.drawingPolygonLine?.destroy();
    this.drawingPolygonLine = undefined;
    this.drawingPolygonPoints = [];
  }

  private toInches(valueInPixels: number): number {
    return Math.round(valueInPixels / PIXELS_PER_INCH);
  }

  private toPixels(valueInches: number): number {
    return valueInches * PIXELS_PER_INCH;
  }

  private snapInches(valueInches: number): number {
    return Math.round(valueInches / GRID_STEP_INCHES) * GRID_STEP_INCHES;
  }

  private getBedFillColor(bed: BedLayout): string {
    const plantings = bed.zones?.filter((zone) => !!zone.planting).map((zone) => zone.planting!) ?? [];
    const planting = plantings[0] ?? bed.planting;

    if (!planting) {
      return '#d6ddd2';
    }

    const now = Date.now();
    const harvestAt = new Date(planting.expectedHarvestDateIso).getTime();
    const daysUntilHarvest = Math.ceil((harvestAt - now) / (1000 * 60 * 60 * 24));

    if (daysUntilHarvest <= 0) {
      return '#e18f8f';
    }

    if (daysUntilHarvest <= 10) {
      return '#f0c276';
    }

    return '#9ccf96';
  }

  private createBedShape(bed: BedLayout, mode: CanvasToolMode): Konva.Shape {
    if (bed.shapeType === 'polygon' && Array.isArray(bed.polygon) && bed.polygon.length >= 3) {
      return new Konva.Line({
        points: bed.polygon.flatMap((point) => [
          point.xPct * bed.widthInches * PIXELS_PER_INCH,
          point.yPct * bed.heightInches * PIXELS_PER_INCH
        ]),
        x: bed.xInches * PIXELS_PER_INCH,
        y: bed.yInches * PIXELS_PER_INCH,
        closed: true,
        fill: this.getBedFillColor(bed),
        stroke: '#2f6f3b',
        strokeWidth: 2,
        draggable: mode === 'select',
        id: bed.id,
        name: 'bed-shape'
      });
    }

    return new Konva.Rect({
      x: bed.xInches * PIXELS_PER_INCH,
      y: bed.yInches * PIXELS_PER_INCH,
      width: bed.widthInches * PIXELS_PER_INCH,
      height: bed.heightInches * PIXELS_PER_INCH,
      rotation: bed.rotationDeg,
      fill: this.getBedFillColor(bed),
      stroke: '#2f6f3b',
      strokeWidth: 2,
      cornerRadius: 4,
      draggable: mode === 'select',
      id: bed.id,
      name: 'bed-shape'
    });
  }

  private handleShapeTransform(shape: Konva.Shape, bed: BedLayout): void {
    if (shape instanceof Konva.Rect) {
      const updatedWidth = Math.max(12 * PIXELS_PER_INCH, shape.width() * shape.scaleX());
      const updatedHeight = Math.max(12 * PIXELS_PER_INCH, shape.height() * shape.scaleY());
      shape.width(updatedWidth);
      shape.height(updatedHeight);
      shape.scale({ x: 1, y: 1 });
      if (this.snapToGrid()) {
        shape.width(this.toPixels(this.snapInches(this.toInches(shape.width()))));
        shape.height(this.toPixels(this.snapInches(this.toInches(shape.height()))));
      }
      this.emitGeometry(shape, bed);
      return;
    }

    if (shape instanceof Konva.Line) {
      const scaledPoints = shape.points().map((value, index) =>
        index % 2 === 0 ? value * shape.scaleX() : value * shape.scaleY()
      );
      shape.points(scaledPoints);
      shape.scale({ x: 1, y: 1 });
      this.emitGeometry(shape, bed);
    }
  }

  private drawZoneOverlays(bed: BedLayout, zones: BedZone[], totalRows: number): void {
    if (!this.bedsLayer) {
      return;
    }

    const bedX = bed.xInches * PIXELS_PER_INCH;
    const bedY = bed.yInches * PIXELS_PER_INCH;
    const bedWidth = bed.widthInches * PIXELS_PER_INCH;
    const bedHeight = bed.heightInches * PIXELS_PER_INCH;
    const rowHeight = bedHeight / Math.max(1, totalRows);

    const renderZones = zones.length > 0 ? zones : [];
    for (const zone of renderZones) {
      if (!zone.planting) {
        continue;
      }

      const fill = this.toAlphaFill(zone.colorHex ?? '#7ab77d', 0.33);
      const shapeType = zone.shapeType ?? 'row-strip';

      if (shapeType === 'square') {
        const rect = zone.rect ?? { xPct: 0.08, yPct: 0.1, widthPct: 0.32, heightPct: 0.8 };
        this.bedsLayer.add(
          new Konva.Rect({
            x: bedX + rect.xPct * bedWidth,
            y: bedY + rect.yPct * bedHeight,
            width: rect.widthPct * bedWidth,
            height: rect.heightPct * bedHeight,
            fill,
            listening: false
          })
        );
        continue;
      }

      if (shapeType === 'polygon' && zone.polygon && zone.polygon.length >= 3) {
        this.bedsLayer.add(
          new Konva.Line({
            x: bedX,
            y: bedY,
            points: zone.polygon.flatMap((point) => [point.xPct * bedWidth, point.yPct * bedHeight]),
            closed: true,
            fill,
            stroke: zone.colorHex ?? '#7ab77d',
            strokeWidth: 1,
            listening: false
          })
        );
        continue;
      }

      this.bedsLayer.add(
        new Konva.Rect({
          x: bedX,
          y: bedY + rowHeight * zone.rowIndex,
          width: bedWidth,
          height: rowHeight,
          fill,
          listening: false
        })
      );
    }

    if (totalRows > 1) {
      for (let i = 1; i < totalRows; i++) {
        this.bedsLayer.add(
          new Konva.Line({
            points: [0, rowHeight * i, bedWidth, rowHeight * i],
            x: bedX,
            y: bedY,
            stroke: '#2f6f3b',
            strokeWidth: 1,
            opacity: 0.45,
            listening: false
          })
        );
      }
    }
  }

  private addPolygonDraftPoint(point: { x: number; y: number }): void {
    if (!this.bedsLayer) {
      return;
    }

    this.drawingPolygonPoints.push(point);
    const flat = this.drawingPolygonPoints.flatMap((entry) => [entry.x, entry.y]);

    if (!this.drawingPolygonLine) {
      this.drawingPolygonLine = new Konva.Line({
        points: flat,
        closed: false,
        stroke: '#2f6f3b',
        strokeWidth: 2,
        dash: [6, 4],
        listening: false
      });
      this.bedsLayer.add(this.drawingPolygonLine);
    } else {
      this.drawingPolygonLine.points(flat);
    }

    this.bedsLayer.batchDraw();
  }

  private updatePolygonDraftPreview(): void {
    if (!this.drawingPolygonLine || this.drawingPolygonPoints.length === 0) {
      return;
    }

    const pointer = this.getStagePoint();
    if (!pointer) {
      return;
    }

    this.drawingPolygonLine.points([...this.drawingPolygonPoints, pointer].flatMap((entry) => [entry.x, entry.y]));
    this.bedsLayer?.batchDraw();
  }

  private finishPolygonDraft(): void {
    if (this.drawingPolygonPoints.length < 3) {
      this.clearDrawingArtifacts();
      this.bedsLayer?.batchDraw();
      return;
    }

    this.polygonBedDrawn.emit(
      this.drawingPolygonPoints.map((point) => ({
        xInches: this.toInches(point.x),
        yInches: this.toInches(point.y)
      }))
    );

    this.clearDrawingArtifacts();
    this.bedsLayer?.batchDraw();
  }

  private toAlphaFill(colorHex: string, alpha: number): string {
    const value = colorHex.replace('#', '');
    const normalized = value.length === 3 ? value.split('').map((char) => `${char}${char}`).join('') : value;
    const r = Number.parseInt(normalized.slice(0, 2), 16);
    const g = Number.parseInt(normalized.slice(2, 4), 16);
    const b = Number.parseInt(normalized.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
