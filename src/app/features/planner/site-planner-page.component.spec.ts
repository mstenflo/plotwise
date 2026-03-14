import { computed, Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { PlannerStateService } from '../../core/services/planner-state.service';
import {
  BedDraftGeometry,
  BedLayout,
  BedPolygonDraftPoint,
  BedPolygonPointUpdate,
  BedSummary,
  CanvasToolMode,
  GardenProject,
  LayoutObject,
  LayoutObjectGeometryUpdate,
  PlannerTask,
  PlannerWarning,
} from '../../core/models/planner.model';
import { PlannerCanvasComponent } from './planner-canvas.component';
import { SitePlannerPageComponent } from './site-planner-page.component';

@Component({
  selector: 'app-planner-canvas',
  standalone: true,
  template: '',
})
class PlannerCanvasStubComponent {
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
}

class PlannerStateServiceStub {
  private readonly bed: BedLayout = {
    id: 'bed-1',
    type: 'bed',
    name: 'North Bed',
    xInches: 24,
    yInches: 24,
    widthInches: 96,
    heightInches: 36,
    rotationDeg: 0,
    rows: 3,
    sunExposure: 'full-sun',
    soil: {
      ph: 6.5,
      drainage: 'good',
      organicMatterPercent: 4,
    },
  };

  readonly activeProjectId = signal('project-home');
  readonly selectedObjectId = signal<string | null>('bed-1');
  readonly selectedSeedId = signal<string | null>(null);
  readonly projects = signal<GardenProject[]>([
    {
      id: 'project-home',
      name: 'Home Garden',
      season: 'spring',
      climateZone: '6b',
      lastFrostDateIso: '2026-04-20T00:00:00.000Z',
      firstFrostDateIso: '2026-10-15T00:00:00.000Z',
      seeds: [],
      objects: [this.bed],
      completedTaskIds: [],
      updatedAtIso: '2026-03-13T00:00:00.000Z',
    },
  ]);

  readonly activeProject = computed(() => this.projects()[0]!);
  readonly objects = computed(() => this.activeProject().objects);
  readonly beds = computed(() =>
    this.objects().filter((object): object is BedLayout => object.type === 'bed'),
  );
  readonly selectedObject = computed(
    () => this.objects().find((object) => object.id === this.selectedObjectId()) ?? null,
  );
  readonly selectedBed = computed(
    () => this.beds().find((bed) => bed.id === this.selectedObjectId()) ?? null,
  );
  readonly tasks = signal<PlannerTask[]>([
    {
      id: 'task-harvest-1',
      title: 'Harvest Tomato in North Bed',
      dueDateIso: '2026-04-22T00:00:00.000Z',
      bedId: 'bed-1',
      priority: 'warning',
      completed: false,
      placementId: 'placement-1',
      taskType: 'harvest',
    },
  ]);
  readonly warnings = signal<PlannerWarning[]>([]);
  readonly bedSummaries = signal<BedSummary[]>([
    {
      bedId: 'bed-1',
      bedName: 'North Bed',
      currentPlants: [
        {
          seedId: 'seed-tomato',
          name: 'Tomato',
          variety: 'Sungold',
          plantCount: 6,
          expectedHarvestPounds: 12,
          placementCount: 2,
          colorHex: '#7ab77d',
          nextHarvestDateIso: '2026-04-22T00:00:00.000Z',
        },
      ],
      nextTasks: this.tasks(),
      placementsCount: 2,
      occupiedAreaSqInches: 2000,
      openAreaSqInches: 1456,
      totalAreaSqInches: 3456,
      warnings: [],
    },
  ]);

  setActiveProject = vi.fn();

  selectObject(objectId: string | null): void {
    this.selectedObjectId.set(objectId);
  }

  updateObjectGeometry(): void {}

  renameSelectedObject(): void {}

  renameObject(): void {}

  setBedShapeType(): void {}

  updateBedPolygonPoint(): void {}

  addBedPolygonPoint(): void {}

  removeBedPolygonPoint(): void {}

  toggleTaskCompletion(): void {}

  duplicateSelectedBed(): void {}

  deleteSelectedObject(): void {}

  saveProjects(): void {}

  loadSavedProjects(): void {}

  addBed(): void {}

  addStructure(): void {}

  addTree(): void {}

  addPolygonBed(): void {}

  getBedSummary(bedId: string): BedSummary | null {
    return this.bedSummaries().find((summary) => summary.bedId === bedId) ?? null;
  }

  getBedSummaryLine(): string {
    return '1 crops, next task, open space';
  }
}

describe('SitePlannerPageComponent', () => {
  const router = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    router.navigate.mockClear();

    TestBed.overrideComponent(SitePlannerPageComponent, {
      remove: {
        imports: [PlannerCanvasComponent],
      },
      add: {
        imports: [PlannerCanvasStubComponent],
      },
    });

    await TestBed.configureTestingModule({
      imports: [SitePlannerPageComponent],
      providers: [
        {
          provide: PlannerStateService,
          useClass: PlannerStateServiceStub,
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ projectId: 'project-home' })),
          },
        },
        {
          provide: Router,
          useValue: router,
        },
      ],
    }).compileComponents();
  });

  it('shows compact bed summary content without inline row or zone editing controls', () => {
    const fixture = TestBed.createComponent(SitePlannerPageComponent);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Current crops, next tasks, and open space.');
    expect(text).toContain('Tomato Sungold');
    expect(text).toContain('Open space:');
    expect(text).toContain('Harvest Tomato in North Bed');
    expect(text).toContain('Edit bed details');
    expect(text).not.toContain('Row Count');
    expect(text).not.toContain('Zone Shape');
    expect(text).not.toContain('Zone Color');
  });

  it('navigates to the bed-details route from the selected bed summary', async () => {
    const fixture = TestBed.createComponent(SitePlannerPageComponent);
    fixture.detectChanges();

    const button = [...fixture.nativeElement.querySelectorAll('button')].find(
      (candidate): candidate is HTMLButtonElement =>
        candidate.textContent?.includes('Edit bed details') ?? false,
    );

    expect(button).toBeTruthy();
    button?.click();

    expect(router.navigate).toHaveBeenCalledWith([
      '/projects',
      'project-home',
      'beds',
      'bed-1',
    ]);
  });
});
