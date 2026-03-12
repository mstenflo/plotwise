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
import { BedGeometryUpdate, BedLayout } from '../../core/models/planner.model';

const PIXELS_PER_INCH = 2;

@Component({
  selector: 'app-planner-canvas',
  templateUrl: './planner-canvas.component.html',
  styleUrl: './planner-canvas.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PlannerCanvasComponent implements AfterViewInit {
  readonly beds = input.required<BedLayout[]>();
  readonly selectedBedId = input<string | null>(null);

  readonly bedSelected = output<string | null>();
  readonly bedGeometryChanged = output<BedGeometryUpdate>();
  readonly bedRenameRequested = output<{ bedId: string; currentName: string }>();

  readonly stageHost = viewChild.required<ElementRef<HTMLDivElement>>('stageHost');

  private readonly destroyRef = inject(DestroyRef);

  private stage?: Konva.Stage;
  private backgroundLayer?: Konva.Layer;
  private bedsLayer?: Konva.Layer;
  private selectionTransformer?: Konva.Transformer;
  private bedMap = new Map<string, Konva.Rect>();

  constructor() {
    effect(() => {
      this.renderBeds(this.beds());
      this.attachTransformer(this.selectedBedId());
    });
  }

  ngAfterViewInit(): void {
    if (!this.isCanvasSupported()) {
      return;
    }

    this.initStage();
    this.renderBeds(this.beds());
    this.attachTransformer(this.selectedBedId());

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
      draggable: true
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
      if (event.target === this.stage) {
        this.bedSelected.emit(null);
      }
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

  private renderBeds(beds: BedLayout[]): void {
    if (!this.bedsLayer || !this.selectionTransformer) {
      return;
    }

    this.bedsLayer.destroyChildren();
    this.bedsLayer.add(this.selectionTransformer);
    this.bedMap.clear();

    for (const bed of beds) {
      const rect = new Konva.Rect({
        x: bed.xInches * PIXELS_PER_INCH,
        y: bed.yInches * PIXELS_PER_INCH,
        width: bed.widthInches * PIXELS_PER_INCH,
        height: bed.heightInches * PIXELS_PER_INCH,
        rotation: bed.rotationDeg,
        fill: this.getBedFillColor(bed),
        stroke: '#2f6f3b',
        strokeWidth: 2,
        cornerRadius: 4,
        draggable: true,
        id: bed.id,
        name: 'bed-shape'
      });

      rect.on('click tap', () => this.bedSelected.emit(bed.id));
      rect.on('dblclick dbltap', () => {
        this.bedRenameRequested.emit({ bedId: bed.id, currentName: bed.name });
      });
      rect.on('dragend', () => this.emitGeometry(rect));
      rect.on('transformend', () => {
        const updatedWidth = Math.max(12 * PIXELS_PER_INCH, rect.width() * rect.scaleX());
        const updatedHeight = Math.max(12 * PIXELS_PER_INCH, rect.height() * rect.scaleY());
        rect.width(updatedWidth);
        rect.height(updatedHeight);
        rect.scale({ x: 1, y: 1 });
        this.emitGeometry(rect);
      });

      this.bedsLayer.add(rect);
      this.bedMap.set(bed.id, rect);

      const label = new Konva.Text({
        x: rect.x() + 6,
        y: rect.y() + 6,
        text: bed.planting ? `${bed.name} • planted` : `${bed.name} • open`,
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

    if (!selectedId) {
      this.selectionTransformer.nodes([]);
      this.bedsLayer.batchDraw();
      return;
    }

    const selectedShape = this.bedMap.get(selectedId);
    this.selectionTransformer.nodes(selectedShape ? [selectedShape] : []);
    this.bedsLayer.batchDraw();
  }

  private emitGeometry(shape: Konva.Rect): void {
    this.bedGeometryChanged.emit({
      bedId: shape.id(),
      xInches: shape.x() / PIXELS_PER_INCH,
      yInches: shape.y() / PIXELS_PER_INCH,
      widthInches: shape.width() / PIXELS_PER_INCH,
      heightInches: shape.height() / PIXELS_PER_INCH,
      rotationDeg: shape.rotation()
    });
  }

  private getBedFillColor(bed: BedLayout): string {
    if (!bed.planting) {
      return '#d6ddd2';
    }

    const now = Date.now();
    const harvestAt = new Date(bed.planting.expectedHarvestDateIso).getTime();
    const daysUntilHarvest = Math.ceil((harvestAt - now) / (1000 * 60 * 60 * 24));

    if (daysUntilHarvest <= 0) {
      return '#e18f8f';
    }

    if (daysUntilHarvest <= 10) {
      return '#f0c276';
    }

    return '#9ccf96';
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
