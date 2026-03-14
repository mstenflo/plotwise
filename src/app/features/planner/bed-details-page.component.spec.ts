import { Component, computed, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { convertToParamMap, ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { BedDetailsCanvasComponent } from './bed-details-canvas.component';
import { BedDetailsPageComponent } from './bed-details-page.component';
import {
  BedDetails,
  BedEditorToolMode,
  BedLayout,
  BedPlacement,
  GardenProject,
  PlannerTask,
} from '../../core/models/planner.model';
import { BedDetailsStateService } from '../../core/services/bed-details-state.service';
import { PlannerStateService } from '../../core/services/planner-state.service';
import { SeedMetadata } from '../../core/models/seed.model';

@Component({
  selector: 'app-bed-details-canvas',
  template: '',
})
class BedDetailsCanvasStubComponent {
  readonly bed = input<BedLayout | null>(null);
  readonly placements = input<BedPlacement[]>([]);
  readonly selectedPlacementId = input<string | null>(null);
  readonly toolMode = input<BedEditorToolMode>('select');
  readonly snapToGrid = input(true);

  readonly placementSelected = output<string | null>();
  readonly placementDrawn = output<{
    placementMode: 'row-strip' | 'block' | 'polygon';
    polygonPoints: Array<{ xInches: number; yInches: number }>;
  }>();
  readonly placementMoved = output<{
    placementId: string;
    polygonPoints: Array<{ xInches: number; yInches: number }>;
  }>();
  readonly placementPointChanged = output<{
    placementId: string;
    pointIndex: number;
    point: { xInches: number; yInches: number };
  }>();
}

class PlannerStateServiceStub {
  readonly activeProject = signal<GardenProject>({
    id: 'project-home',
    name: 'Home Garden',
    season: 'spring',
    climateZone: '6b',
    lastFrostDateIso: '2026-04-20T00:00:00.000Z',
    firstFrostDateIso: '2026-10-15T00:00:00.000Z',
    seeds: [],
    objects: [],
    completedTaskIds: [],
    updatedAtIso: '2026-03-14T00:00:00.000Z',
  });
  readonly seedCatalog = signal<SeedMetadata[]>([
    {
      id: 'seed-1',
      name: 'Tomato',
      variety: 'Sungold',
      lifecycle: 'annual',
      family: 'nightshade',
      spacingInches: 18,
      rowSpacingInches: 24,
      daysToMaturity: 65,
      matureSpreadInches: 24,
      preferredSun: 'full-sun',
      soilPhMin: 6,
      soilPhMax: 6.8,
      successionFriendly: false,
      yield: {
        averagePoundsPerPlant: 2,
      },
    },
  ]);
  readonly seeds = computed(() => this.seedCatalog());
  readonly selectedSeedId = signal<string | null>('seed-1');

  setActiveProject = vi.fn();
  selectObject = vi.fn();
  selectSeed(seedId: string): void {
    this.selectedSeedId.set(seedId);
  }
  refreshProjectResources = vi.fn();
  syncProject = vi.fn();
}

class BedDetailsStateServiceStub {
  readonly details = signal<BedDetails | null>({
    bed: {
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
      lastSeasonFamily: 'brassica',
    },
    placements: [
      {
        id: 'placement-1',
        projectId: 'project-home',
        bedId: 'bed-1',
        seedId: 'seed-1',
        plantedOnIso: '2026-03-14T00:00:00.000Z',
        expectedHarvestDateIso: '2026-05-18T00:00:00.000Z',
        plantCount: 4,
        expectedHarvestPounds: 8,
        colorHex: '#7ab77d',
        placementMode: 'block',
        polygonPoints: [
          { xInches: 0, yInches: 0 },
          { xInches: 12, yInches: 0 },
          { xInches: 12, yInches: 12 },
          { xInches: 0, yInches: 12 },
        ],
        updatedAtIso: '2026-03-14T00:00:00.000Z',
      },
    ],
    summary: {
      bedId: 'bed-1',
      bedName: 'North Bed',
      currentPlants: [
        {
          seedId: 'seed-1',
          name: 'Tomato',
          variety: 'Sungold',
          plantCount: 4,
          expectedHarvestPounds: 8,
          placementCount: 1,
          colorHex: '#7ab77d',
          nextHarvestDateIso: '2026-05-18T00:00:00.000Z',
        },
      ],
      nextTasks: [],
      placementsCount: 1,
      occupiedAreaSqInches: 144,
      openAreaSqInches: 3312,
      totalAreaSqInches: 3456,
      warnings: [],
    },
    tasks: [
      {
        id: 'task-placement',
        title: 'Harvest tomato block',
        dueDateIso: '2026-05-18T00:00:00.000Z',
        bedId: 'bed-1',
        priority: 'warning',
        completed: false,
        placementId: 'placement-1',
        taskType: 'harvest',
      },
      {
        id: 'task-other',
        title: 'Harvest peppers',
        dueDateIso: '2026-06-10T00:00:00.000Z',
        bedId: 'bed-1',
        priority: 'warning',
        completed: false,
        placementId: 'placement-2',
        taskType: 'harvest',
      },
      {
        id: 'task-bed',
        title: 'Refresh mulch',
        dueDateIso: '2026-03-20T00:00:00.000Z',
        bedId: 'bed-1',
        priority: 'info',
        completed: false,
        taskType: 'maintenance',
      },
    ],
    warnings: [],
  });
  readonly selectedPlacementId = signal<string | null>('placement-1');
  readonly toolMode = signal<BedEditorToolMode>('select');
  readonly harvestPreview = signal({
    expectedHarvestDateIso: '2026-05-18T00:00:00.000Z',
    expectedHarvestPounds: 8,
  });
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly bed = computed(() => this.details()?.bed ?? null);
  readonly placements = computed(() => this.details()?.placements ?? []);
  readonly summary = computed(() => this.details()?.summary ?? null);
  readonly tasks = computed(() => this.details()?.tasks ?? []);
  readonly warnings = computed(() => this.details()?.warnings ?? []);
  readonly selectedPlacement = computed(() =>
    this.placements().find((placement) => placement.id === this.selectedPlacementId()) ?? null,
  );

  loadBed = vi.fn();
  setToolMode = vi.fn();
  selectPlacement = vi.fn((placementId: string | null) => {
    this.selectedPlacementId.set(placementId);
  });
  createPlacement = vi.fn();
  updateSelectedPlacement = vi.fn();
  updateSelectedPlacementPoint = vi.fn();
  addVertexToSelectedPlacement = vi.fn();
  removeVertexFromSelectedPlacement = vi.fn();
  deleteSelectedPlacement = vi.fn();
  updateBedProperties = vi.fn();
}

describe('BedDetailsPageComponent', () => {
  const router = {
    navigate: vi.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    router.navigate.mockClear();

    TestBed.overrideComponent(BedDetailsPageComponent, {
      remove: {
        imports: [BedDetailsCanvasComponent],
      },
      add: {
        imports: [BedDetailsCanvasStubComponent],
      },
    });

    await TestBed.configureTestingModule({
      imports: [BedDetailsPageComponent],
      providers: [
        {
          provide: PlannerStateService,
          useClass: PlannerStateServiceStub,
        },
        {
          provide: BedDetailsStateService,
          useClass: BedDetailsStateServiceStub,
        },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ projectId: 'project-home', bedId: 'bed-1' })),
          },
        },
        {
          provide: Router,
          useValue: router,
        },
      ],
    }).compileComponents();
  });

  it('updates bed properties from the bed details inspector', () => {
    const fixture = TestBed.createComponent(BedDetailsPageComponent);
    const bedDetailsState = TestBed.inject(BedDetailsStateService) as unknown as BedDetailsStateServiceStub;
    fixture.detectChanges();

    const textInputs = fixture.nativeElement.querySelectorAll('.panel--right input:not([type])');
    const bedNameInput = textInputs[0] as HTMLInputElement;
    bedNameInput.value = 'Kitchen Bed';
    bedNameInput.dispatchEvent(new Event('change'));

    const rowsInput = fixture.nativeElement.querySelector('input[type="number"][min="1"]') as HTMLInputElement;
    rowsInput.value = '5';
    rowsInput.dispatchEvent(new Event('change'));

    const selects = fixture.nativeElement.querySelectorAll('select');
    const sunExposureSelect = selects[0] as HTMLSelectElement;
    sunExposureSelect.value = 'shade';
    sunExposureSelect.dispatchEvent(new Event('change'));

    expect(bedDetailsState.updateBedProperties).toHaveBeenNthCalledWith(1, 'project-home', 'bed-1', {
      name: 'Kitchen Bed',
    });
    expect(bedDetailsState.updateBedProperties).toHaveBeenNthCalledWith(2, 'project-home', 'bed-1', {
      rows: 5,
    });
    expect(bedDetailsState.updateBedProperties).toHaveBeenNthCalledWith(3, 'project-home', 'bed-1', {
      sunExposure: 'shade',
    });
  });

  it('filters the task list to the selected placement while preserving bed-level tasks', () => {
    const fixture = TestBed.createComponent(BedDetailsPageComponent);
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Placements');
    expect(text).toContain('Harvest tomato block');
    expect(text).toContain('Refresh mulch');
    expect(text).not.toContain('Harvest peppers');
  });
});