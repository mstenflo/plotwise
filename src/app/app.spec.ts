import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { PlannerApiService } from './core/services/planner-api.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        {
          provide: PlannerApiService,
          useValue: {
            getProjects: () =>
              of([
                {
                  id: 'project-home',
                  name: 'Home Garden',
                  season: 'spring',
                  climateZone: '6b',
                  lastFrostDateIso: '2026-04-20T00:00:00.000Z',
                  firstFrostDateIso: '2026-10-15T00:00:00.000Z',
                  seeds: [],
                  objects: [],
                  completedTaskIds: [],
                  updatedAtIso: new Date().toISOString(),
                },
              ]),
            getProject: () =>
              of({
                id: 'project-home',
                name: 'Home Garden',
                season: 'spring',
                climateZone: '6b',
                lastFrostDateIso: '2026-04-20T00:00:00.000Z',
                firstFrostDateIso: '2026-10-15T00:00:00.000Z',
                seeds: [],
                objects: [],
                completedTaskIds: [],
                updatedAtIso: new Date().toISOString(),
              }),
            saveProject: (project: unknown) => of(project),
            createProject: () =>
              of({
                id: 'project-home',
                name: 'Home Garden',
                season: 'spring',
                climateZone: '6b',
                lastFrostDateIso: '2026-04-20T00:00:00.000Z',
                firstFrostDateIso: '2026-10-15T00:00:00.000Z',
                seeds: [],
                objects: [],
                completedTaskIds: [],
                updatedAtIso: new Date().toISOString(),
              }),
            deleteProject: () => of({ deleted: true }),
            getSeeds: () => of([]),
            getProjectTasks: () => of([]),
            syncProjectTasks: () => of({ synced: true }),
            getBedSummaries: () => of([]),
            getBedDetails: () =>
              of({
                bed: {
                  id: 'bed-1',
                  type: 'bed',
                  name: 'Bed 1',
                  xInches: 0,
                  yInches: 0,
                  widthInches: 96,
                  heightInches: 36,
                  rotationDeg: 0,
                  rows: 3,
                  sunExposure: 'full-sun',
                  soil: { ph: 6.5, drainage: 'good', organicMatterPercent: 4 },
                },
                placements: [],
                summary: {
                  bedId: 'bed-1',
                  bedName: 'Bed 1',
                  currentPlants: [],
                  nextTasks: [],
                  placementsCount: 0,
                  occupiedAreaSqInches: 0,
                  openAreaSqInches: 0,
                  totalAreaSqInches: 3456,
                  warnings: [],
                },
                tasks: [],
                warnings: [],
              }),
            updateBedDetails: () =>
              of({
                bed: {
                  id: 'bed-1',
                  type: 'bed',
                  name: 'Bed 1',
                  xInches: 0,
                  yInches: 0,
                  widthInches: 96,
                  heightInches: 36,
                  rotationDeg: 0,
                  rows: 3,
                  sunExposure: 'full-sun',
                  soil: { ph: 6.5, drainage: 'good', organicMatterPercent: 4 },
                },
                placements: [],
                summary: {
                  bedId: 'bed-1',
                  bedName: 'Bed 1',
                  currentPlants: [],
                  nextTasks: [],
                  placementsCount: 0,
                  occupiedAreaSqInches: 0,
                  openAreaSqInches: 0,
                  totalAreaSqInches: 3456,
                  warnings: [],
                },
                tasks: [],
                warnings: [],
              }),
            createPlacement: () => of({}),
            updatePlacement: () => of({}),
            deletePlacement: () => of({ deleted: true }),
            previewHarvest: () =>
              of({
                expectedHarvestDateIso: new Date().toISOString(),
                expectedHarvestPounds: 0,
              }),
            updateTaskStatus: () =>
              of({
                id: 'task-1',
                title: 'Task',
                dueDateIso: new Date().toISOString(),
                bedId: 'bed-1',
                priority: 'info',
                completed: false,
              }),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app shell', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render planner shell title', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.topbar__title')?.textContent).toContain('Plotwise Planner');
  });
});
