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
  BedDraftGeometry,
  BedGeometryUpdate,
  BedLayout,
  BedPolygonDraftPoint,
  BedPolygonPointUpdate,
  BedSummary,
  CanvasToolMode,
  LayoutObject,
  LayoutObjectGeometryUpdate,
  ShapePoint,
  TreeLayout,
} from '../../core/models/planner.model';

const PIXELS_PER_INCH = 2;
const GRID_STEP_INCHES = 12;
const HANDLE_RADIUS = 7;

interface PolygonBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

@Component({
  selector: 'app-planner-canvas',
  standalone: true,
  templateUrl: './planner-canvas.component.html',
  styleUrl: './planner-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlannerCanvasComponent implements AfterViewInit {
  readonly objects = input.required<LayoutObject[]>();
  readonly bedSummaries = input<BedSummary[]>([]);
  readonly selectedObjectId = input<string | null>(null);
  readonly toolMode = input<CanvasToolMode>('select');
  readonly snapToGrid = input(true);

  readonly objectSelected = output<string | null>();
  readonly objectGeometryChanged = output<LayoutObjectGeometryUpdate>();
  readonly bedPolygonPointChanged = output<BedPolygonPointUpdate>();
  readonly objectRenameRequested = output<{ objectId: string; currentName: string }>();
  readonly bedDrawn = output<BedDraftGeometry>();
  readonly polygonBedDrawn = output<BedPolygonDraftPoint[]>();

  readonly stageHost = viewChild.required<ElementRef<HTMLDivElement>>('stageHost');

  private readonly destroyRef = inject(DestroyRef);

  private stage?: Konva.Stage;
  private backgroundLayer?: Konva.Layer;
  private objectsLayer?: Konva.Layer;
  private selectionTransformer?: Konva.Transformer;
  private drawingRect?: Konva.Rect;
  private drawingStart?: { x: number; y: number };
  private drawingPolygonLine?: Konva.Line;
  private drawingPolygonPoints: Array<{ x: number; y: number }> = [];
  private objectMap = new Map<string, Konva.Shape>();

  constructor() {
    effect(() => {
      this.renderObjects(this.objects(), this.toolMode());
      this.attachTransformer(this.selectedObjectId());
      this.updateInteractionMode(this.toolMode());
    });
  }

  ngAfterViewInit(): void {
    if (!this.isCanvasSupported()) {
      return;
    }

    this.initStage();
    this.renderObjects(this.objects(), this.toolMode());
    this.attachTransformer(this.selectedObjectId());
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
      draggable: false,
    });

    this.backgroundLayer = new Konva.Layer();
    this.objectsLayer = new Konva.Layer();
    this.selectionTransformer = new Konva.Transformer({
      rotateEnabled: true,
      keepRatio: false,
      borderDash: [6, 4],
    });

    this.objectsLayer.add(this.selectionTransformer);
    this.stage.add(this.backgroundLayer);
    this.stage.add(this.objectsLayer);
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
        this.objectSelected.emit(null);
      }
    });

    this.stage.on('dblclick dbltap', (event) => {
      if (this.toolMode() !== 'draw-polygon-bed' || event.target !== this.stage) {
        return;
      }

      this.finishPolygonDraft();
    });

    this.stage.on('mousedown touchstart', (event) => {
      if (this.toolMode() !== 'draw-bed' || !this.objectsLayer || !this.stage) {
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
        listening: false,
      });

      this.objectsLayer.add(this.drawingRect);
      this.objectsLayer.batchDraw();
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
      this.objectsLayer?.batchDraw();
    });

    this.stage.on('mouseup touchend', () => {
      if (this.toolMode() !== 'draw-bed' || !this.drawingRect) {
        return;
      }

      const geometry = {
        xInches: this.toInches(this.drawingRect.x()),
        yInches: this.toInches(this.drawingRect.y()),
        widthInches: this.toInches(this.drawingRect.width()),
        heightInches: this.toInches(this.drawingRect.height()),
      };

      this.clearDrawingArtifacts();
      if (geometry.widthInches < 12 || geometry.heightInches < 12) {
        return;
      }

      this.bedDrawn.emit(geometry);
      this.objectSelected.emit(null);
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
        y: (pointer.y - this.stage.y()) / oldScale,
      };

      this.stage.scale({ x: clampedScale, y: clampedScale });
      this.stage.position({
        x: pointer.x - mousePointTo.x * clampedScale,
        y: pointer.y - mousePointTo.y * clampedScale,
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
    const step = GRID_STEP_INCHES * PIXELS_PER_INCH;

    for (let x = 0; x < width; x += step) {
      this.backgroundLayer.add(
        new Konva.Line({
          points: [x, 0, x, height],
          stroke: '#d8ead6',
          strokeWidth: x % (step * 4) === 0 ? 1.4 : 0.7,
        }),
      );
    }

    for (let y = 0; y < height; y += step) {
      this.backgroundLayer.add(
        new Konva.Line({
          points: [0, y, width, y],
          stroke: '#d8ead6',
          strokeWidth: y % (step * 4) === 0 ? 1.4 : 0.7,
        }),
      );
    }

    this.backgroundLayer.batchDraw();
  }

  private renderObjects(objects: LayoutObject[], mode: CanvasToolMode): void {
    if (!this.objectsLayer || !this.selectionTransformer) {
      return;
    }

    this.objectsLayer.destroyChildren();
    this.objectsLayer.add(this.selectionTransformer);
    if (this.drawingRect) {
      this.objectsLayer.add(this.drawingRect);
    }
    if (this.drawingPolygonLine) {
      this.objectsLayer.add(this.drawingPolygonLine);
    }
    this.objectMap.clear();

    for (const object of objects) {
      const shape = this.createObjectShape(object, mode);
      shape.on('click tap', () => this.objectSelected.emit(object.id));
      shape.on('dblclick dbltap', () =>
        this.objectRenameRequested.emit({ objectId: object.id, currentName: object.name }),
      );
      shape.on('dragend', () => this.emitGeometry(shape, object));
      shape.on('transformend', () => this.handleShapeTransform(shape, object));

      this.objectsLayer.add(shape);
      this.objectMap.set(object.id, shape);

      const label = new Konva.Text({
        x: object.xInches * PIXELS_PER_INCH + 6,
        y: object.yInches * PIXELS_PER_INCH + 6,
        text: this.getObjectLabel(object),
        fontSize: 12,
        fill: '#204627',
        listening: true,
      });
      label.on('click tap', () => this.objectSelected.emit(object.id));
      label.on('dblclick dbltap', () =>
        this.objectRenameRequested.emit({ objectId: object.id, currentName: object.name }),
      );
      this.objectsLayer.add(label);

      if (
        mode === 'select' &&
        object.type === 'bed' &&
        object.id === this.selectedObjectId() &&
        object.shapeType === 'polygon'
      ) {
        this.drawBedPolygonHandles(object);
      }
    }

    this.objectsLayer.batchDraw();
  }

  private createObjectShape(object: LayoutObject, mode: CanvasToolMode): Konva.Shape {
    if (object.type === 'bed' && object.shapeType === 'polygon' && Array.isArray(object.polygon) && object.polygon.length >= 3) {
      return new Konva.Line({
        points: object.polygon.flatMap((point) => [
          point.xPct * object.widthInches * PIXELS_PER_INCH,
          point.yPct * object.heightInches * PIXELS_PER_INCH,
        ]),
        x: object.xInches * PIXELS_PER_INCH,
        y: object.yInches * PIXELS_PER_INCH,
        closed: true,
        fill: this.getBedFillColor(object),
        stroke: '#2f6f3b',
        strokeWidth: 2,
        draggable: mode === 'select',
        id: object.id,
        name: 'layout-object',
      });
    }

    if (object.type === 'tree') {
      const tree = object as TreeLayout;
      return new Konva.Ellipse({
        x: (tree.xInches + tree.widthInches / 2) * PIXELS_PER_INCH,
        y: (tree.yInches + tree.heightInches / 2) * PIXELS_PER_INCH,
        radiusX: (tree.widthInches / 2) * PIXELS_PER_INCH,
        radiusY: (tree.heightInches / 2) * PIXELS_PER_INCH,
        fill: 'rgba(115, 160, 83, 0.35)',
        stroke: '#426e2c',
        strokeWidth: 2,
        draggable: mode === 'select',
        id: tree.id,
        name: 'layout-object',
      });
    }

    return new Konva.Rect({
      x: object.xInches * PIXELS_PER_INCH,
      y: object.yInches * PIXELS_PER_INCH,
      width: object.widthInches * PIXELS_PER_INCH,
      height: object.heightInches * PIXELS_PER_INCH,
      rotation: object.rotationDeg,
      fill: object.type === 'bed' ? this.getBedFillColor(object) : 'rgba(164, 129, 90, 0.35)',
      stroke: object.type === 'bed' ? '#2f6f3b' : '#6f4f2f',
      strokeWidth: 2,
      cornerRadius: object.type === 'structure' ? 4 : 8,
      draggable: mode === 'select',
      id: object.id,
      name: 'layout-object',
    });
  }

  private getObjectLabel(object: LayoutObject): string {
    if (object.type !== 'bed') {
      return object.name;
    }

    const summary = this.bedSummaries().find((entry) => entry.bedId === object.id);
    if (!summary || summary.currentPlants.length === 0) {
      return `${object.name} • open`;
    }

    return `${object.name} • ${summary.currentPlants.length} crops`;
  }

  private getBedFillColor(bed: BedLayout): string {
    const summary = this.bedSummaries().find((entry) => entry.bedId === bed.id);
    if (!summary || summary.currentPlants.length === 0) {
      return '#d6ddd2';
    }

    const openRatio = summary.totalAreaSqInches > 0 ? summary.openAreaSqInches / summary.totalAreaSqInches : 0;
    if (openRatio <= 0.1) {
      return '#7ab77d';
    }

    if (openRatio <= 0.4) {
      return '#9ccf96';
    }

    return '#c4df9b';
  }

  private drawBedPolygonHandles(bed: BedLayout): void {
    if (!this.objectsLayer || !Array.isArray(bed.polygon) || bed.polygon.length < 3) {
      return;
    }

    const shape = this.objectMap.get(bed.id);
    if (!(shape instanceof Konva.Line)) {
      return;
    }

    const bounds = {
      x: bed.xInches * PIXELS_PER_INCH,
      y: bed.yInches * PIXELS_PER_INCH,
      width: bed.widthInches * PIXELS_PER_INCH,
      height: bed.heightInches * PIXELS_PER_INCH,
    };

    bed.polygon.forEach((point, pointIndex) => {
      const handle = new Konva.Circle({
        x: bounds.x + point.xPct * bounds.width,
        y: bounds.y + point.yPct * bounds.height,
        radius: HANDLE_RADIUS,
        fill: '#fffaf4',
        stroke: '#2f6f3b',
        strokeWidth: 2,
        draggable: true,
      });

      handle.on('mousedown touchstart click tap dragstart', (event) => {
        event.cancelBubble = true;
        this.objectSelected.emit(bed.id);
      });
      handle.dragBoundFunc((position) => this.constrainHandlePosition(position, bounds));
      handle.on('dragmove', () => {
        this.syncPolygonShapePoint(shape, pointIndex, { x: handle.x(), y: handle.y() });
      });
      handle.on('dragend', () => {
        const nextPoint = this.toRelativePoint({ x: handle.x(), y: handle.y() }, bounds);
        this.bedPolygonPointChanged.emit({
          bedId: bed.id,
          pointIndex,
          xPct: nextPoint.xPct,
          yPct: nextPoint.yPct,
        });
      });

      this.objectsLayer?.add(handle);
    });
  }

  private attachTransformer(selectedId: string | null): void {
    if (!this.selectionTransformer || !this.objectsLayer) {
      return;
    }

    if (this.toolMode() !== 'select' || !selectedId) {
      this.selectionTransformer.nodes([]);
      this.objectsLayer.batchDraw();
      return;
    }

    const shape = this.objectMap.get(selectedId);
    this.selectionTransformer.nodes(shape ? [shape] : []);
    this.objectsLayer.batchDraw();
  }

  private emitGeometry(shape: Konva.Shape, object: LayoutObject): void {
    if (shape instanceof Konva.Rect) {
      if (this.snapToGrid()) {
        shape.position({
          x: this.toPixels(this.snapInches(this.toInches(shape.x()))),
          y: this.toPixels(this.snapInches(this.toInches(shape.y()))),
        });
      }

      this.objectGeometryChanged.emit({
        objectId: object.id,
        xInches: this.toInches(shape.x()),
        yInches: this.toInches(shape.y()),
        widthInches: this.toInches(shape.width()),
        heightInches: this.toInches(shape.height()),
        rotationDeg: shape.rotation(),
      });
      return;
    }

    if (shape instanceof Konva.Ellipse) {
      const widthInches = this.toInches(shape.radiusX() * 2);
      const heightInches = this.toInches(shape.radiusY() * 2);
      const xInches = this.toInches(shape.x() - shape.radiusX());
      const yInches = this.toInches(shape.y() - shape.radiusY());
      this.objectGeometryChanged.emit({
        objectId: object.id,
        xInches,
        yInches,
        widthInches,
        heightInches,
        rotationDeg: shape.rotation(),
      });
      return;
    }

    if (shape instanceof Konva.Line) {
      const points = shape.points();
      const absolute: Array<{ x: number; y: number }> = [];
      for (let index = 0; index < points.length; index += 2) {
        absolute.push({ x: points[index] + shape.x(), y: points[index + 1] + shape.y() });
      }

      const xValues = absolute.map((point) => point.x);
      const yValues = absolute.map((point) => point.y);
      const minX = Math.min(...xValues);
      const minY = Math.min(...yValues);
      const maxX = Math.max(...xValues);
      const maxY = Math.max(...yValues);
      this.objectGeometryChanged.emit({
        objectId: object.id,
        xInches: this.toInches(minX),
        yInches: this.toInches(minY),
        widthInches: Math.max(12, this.toInches(maxX - minX)),
        heightInches: Math.max(12, this.toInches(maxY - minY)),
        rotationDeg: 0,
      });
    }
  }

  private handleShapeTransform(shape: Konva.Shape, object: LayoutObject): void {
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
      this.emitGeometry(shape, object);
      return;
    }

    if (shape instanceof Konva.Ellipse) {
      shape.radiusX(Math.max(6 * PIXELS_PER_INCH, shape.radiusX() * shape.scaleX()));
      shape.radiusY(Math.max(6 * PIXELS_PER_INCH, shape.radiusY() * shape.scaleY()));
      shape.scale({ x: 1, y: 1 });
      this.emitGeometry(shape, object);
      return;
    }

    if (shape instanceof Konva.Line) {
      const scaledPoints = shape.points().map((value, index) =>
        index % 2 === 0 ? value * shape.scaleX() : value * shape.scaleY(),
      );
      shape.points(scaledPoints);
      shape.scale({ x: 1, y: 1 });
      this.emitGeometry(shape, object);
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
      y: this.snapToGrid() ? this.toPixels(this.snapInches(this.toInches(y))) : y,
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

  private addPolygonDraftPoint(point: { x: number; y: number }): void {
    if (!this.objectsLayer) {
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
        listening: false,
      });
      this.objectsLayer.add(this.drawingPolygonLine);
    } else {
      this.drawingPolygonLine.points(flat);
    }

    this.objectsLayer.batchDraw();
  }

  private updatePolygonDraftPreview(): void {
    if (!this.drawingPolygonLine || this.drawingPolygonPoints.length === 0) {
      return;
    }

    const pointer = this.getStagePoint();
    if (!pointer) {
      return;
    }

    this.drawingPolygonLine.points([
      ...this.drawingPolygonPoints,
      pointer,
    ].flatMap((entry) => [entry.x, entry.y]));
    this.objectsLayer?.batchDraw();
  }

  private finishPolygonDraft(): void {
    if (this.drawingPolygonPoints.length < 3) {
      this.clearDrawingArtifacts();
      this.objectsLayer?.batchDraw();
      return;
    }

    this.polygonBedDrawn.emit(
      this.drawingPolygonPoints.map((point) => ({
        xInches: this.toInches(point.x),
        yInches: this.toInches(point.y),
      })),
    );
    this.clearDrawingArtifacts();
    this.objectsLayer?.batchDraw();
  }

  private syncPolygonShapePoint(
    shape: Konva.Line,
    pointIndex: number,
    position: { x: number; y: number },
  ): void {
    const nextPoints = [...shape.points()];
    nextPoints[pointIndex * 2] = position.x - shape.x();
    nextPoints[pointIndex * 2 + 1] = position.y - shape.y();
    shape.points(nextPoints);
    this.objectsLayer?.batchDraw();
  }

  private constrainHandlePosition(
    position: { x: number; y: number },
    bounds: PolygonBounds,
  ): { x: number; y: number } {
    const minX = bounds.x;
    const maxX = bounds.x + bounds.width;
    const minY = bounds.y;
    const maxY = bounds.y + bounds.height;

    let x = this.clamp(position.x, minX, maxX);
    let y = this.clamp(position.y, minY, maxY);

    if (this.snapToGrid()) {
      x = this.clamp(this.toPixels(this.snapInches(this.toInches(x))), minX, maxX);
      y = this.clamp(this.toPixels(this.snapInches(this.toInches(y))), minY, maxY);
    }

    return { x, y };
  }

  private toRelativePoint(
    position: { x: number; y: number },
    bounds: PolygonBounds,
  ): ShapePoint {
    return {
      xPct: this.clamp((position.x - bounds.x) / Math.max(1, bounds.width), 0, 1),
      yPct: this.clamp((position.y - bounds.y) / Math.max(1, bounds.height), 0, 1),
    };
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
