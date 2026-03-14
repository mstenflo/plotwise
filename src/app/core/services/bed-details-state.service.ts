import { computed, inject, Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  BedDetails,
  BedEditorToolMode,
  BedLayout,
  BedPlacement,
  BedPlacementMode,
  PlacementPoint,
} from '../models/planner.model';
import { createRectPolygon, getPlacementAreaSqInches, normalizePlacementPoints } from '../models/placement.utils';
import { UpdateBedDetailsRequest } from './planner-api.types';
import { PlannerApiService } from './planner-api.service';
import { PlannerStateService } from './planner-state.service';

@Injectable({ providedIn: 'root' })
export class BedDetailsStateService {
  private readonly plannerApi = inject(PlannerApiService);
  private readonly planner = inject(PlannerStateService);

  readonly details = signal<BedDetails | null>(null);
  readonly selectedPlacementId = signal<string | null>(null);
  readonly toolMode = signal<BedEditorToolMode>('select');
  readonly harvestPreview = signal<{
    expectedHarvestDateIso: string;
    expectedHarvestPounds: number;
  } | null>(null);
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

  loadBed(projectId: string, bedId: string): void {
    this.loading.set(true);
    this.error.set(null);
    this.plannerApi.getBedDetails(projectId, bedId).subscribe({
      next: (details) => {
        this.details.set(details);
        this.loading.set(false);
        const selectedPlacementId = this.selectedPlacementId();
        if (selectedPlacementId && details.placements.some((placement) => placement.id === selectedPlacementId)) {
          this.refreshSelectedPlacementPreview(projectId, bedId);
          return;
        }

        const nextPlacement = details.placements[0];
        this.selectedPlacementId.set(nextPlacement?.id ?? null);
        if (nextPlacement) {
          this.refreshPreview(projectId, bedId, nextPlacement.seedId, nextPlacement.plantedOnIso, nextPlacement.plantCount);
        } else {
          this.harvestPreview.set(null);
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.details.set(null);
        this.selectedPlacementId.set(null);
        this.harvestPreview.set(null);
        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.error.set('Bed not found.');
          return;
        }

        this.error.set('Unable to load bed details.');
      },
    });
  }

  setToolMode(mode: BedEditorToolMode): void {
    this.toolMode.set(mode);
  }

  updateBedProperties(
    projectId: string,
    bedId: string,
    patch: UpdateBedDetailsRequest,
  ): void {
    const currentDetails = this.details();
    const currentBed = currentDetails?.bed;
    if (!currentDetails || !currentBed) {
      return;
    }

    const nextBed: BedLayout = {
      ...currentBed,
      name: patch.name?.trim() ? patch.name.trim() : currentBed.name,
      rows: patch.rows ?? currentBed.rows,
      sunExposure: patch.sunExposure ?? currentBed.sunExposure,
      soil: patch.soil
        ? {
            ph: patch.soil.ph,
            drainage: patch.soil.drainage,
            organicMatterPercent: patch.soil.organicMatterPercent,
          }
        : currentBed.soil,
      lastSeasonFamily:
        patch.lastSeasonFamily !== undefined
          ? patch.lastSeasonFamily || undefined
          : currentBed.lastSeasonFamily,
    };

    this.details.set({
      ...currentDetails,
      bed: nextBed,
    });
    this.saving.set(true);
    this.error.set(null);

    this.plannerApi.updateBedDetails(projectId, bedId, patch).subscribe({
      next: (details) => {
        this.details.set(details);
        this.saving.set(false);
        this.planner.syncProject(projectId);
      },
      error: () => {
        this.saving.set(false);
        this.loadBed(projectId, bedId);
        this.error.set('Unable to save bed properties.');
      },
    });
  }

  selectPlacement(placementId: string | null, projectId?: string, bedId?: string): void {
    this.selectedPlacementId.set(placementId);
    if (!placementId || !projectId || !bedId) {
      this.harvestPreview.set(null);
      return;
    }

    this.refreshSelectedPlacementPreview(projectId, bedId);
  }

  createPlacement(
    projectId: string,
    bedId: string,
    placementMode: BedPlacementMode,
    polygonPoints: PlacementPoint[],
  ): void {
    const bed = this.bed();
    const selectedSeedId = this.planner.selectedSeedId();
    const seed = this.planner.seeds().find((entry) => entry.id === selectedSeedId) ?? this.planner.seeds()[0];
    if (!bed || !seed) {
      return;
    }

    const normalizedPolygon = normalizePlacementPoints(bed, polygonPoints);
    const area = Math.max(1, getPlacementAreaSqInches(normalizedPolygon));
    const recommendedArea = Math.max(1, seed.spacingInches * seed.rowSpacingInches);
    const plantCount = Math.max(1, Math.floor(area / recommendedArea));

    this.saving.set(true);
    this.plannerApi
      .createPlacement(projectId, bedId, {
        seedId: seed.id,
        plantedOnIso: new Date().toISOString(),
        plantCount,
        colorHex: '#7ab77d',
        placementMode,
        polygonPoints: normalizedPolygon,
      })
      .subscribe({
        next: (placement) => {
          this.details.update((details) =>
            details
              ? {
                  ...details,
                  placements: [...details.placements, placement],
                }
              : details,
          );
          this.selectedPlacementId.set(placement.id);
          this.saving.set(false);
          this.refreshPreview(projectId, bedId, placement.seedId, placement.plantedOnIso, placement.plantCount);
          this.reloadAfterMutation(projectId, bedId);
        },
        error: () => {
          this.saving.set(false);
          this.error.set('Unable to create placement.');
        },
      });
  }

  updateSelectedPlacement(
    projectId: string,
    bedId: string,
    patch: Partial<Pick<BedPlacement, 'seedId' | 'plantedOnIso' | 'plantCount' | 'colorHex' | 'placementMode' | 'polygonPoints'>>,
  ): void {
    const placement = this.selectedPlacement();
    const bed = this.bed();
    if (!placement || !bed) {
      return;
    }

    const nextPlacement: BedPlacement = {
      ...placement,
      ...patch,
      polygonPoints: normalizePlacementPoints(
        bed,
        patch.polygonPoints ?? placement.polygonPoints,
      ),
    };

    this.details.update((details) =>
      details
        ? {
            ...details,
            placements: details.placements.map((entry) =>
              entry.id === placement.id ? nextPlacement : entry,
            ),
          }
        : details,
    );
    this.saving.set(true);
    this.error.set(null);

    if (
      patch.seedId !== undefined ||
      patch.plantedOnIso !== undefined ||
      patch.plantCount !== undefined
    ) {
      this.refreshPreview(
        projectId,
        bedId,
        nextPlacement.seedId,
        nextPlacement.plantedOnIso,
        nextPlacement.plantCount,
      );
    }

    this.plannerApi
      .updatePlacement(projectId, bedId, placement.id, {
        seedId: nextPlacement.seedId,
        plantedOnIso: nextPlacement.plantedOnIso,
        plantCount: nextPlacement.plantCount,
        colorHex: nextPlacement.colorHex,
        placementMode: nextPlacement.placementMode,
        polygonPoints: nextPlacement.polygonPoints,
      })
      .subscribe({
        next: (saved) => {
          this.replacePlacement(saved);
          this.saving.set(false);
          this.refreshPreview(projectId, bedId, saved.seedId, saved.plantedOnIso, saved.plantCount);
          this.reloadAfterMutation(projectId, bedId);
        },
        error: () => {
          this.saving.set(false);
          this.loadBed(projectId, bedId);
          this.error.set('Unable to save placement changes.');
        },
      });
  }

  deleteSelectedPlacement(projectId: string, bedId: string): void {
    const placementId = this.selectedPlacementId();
    if (!placementId) {
      return;
    }

    const previousDetails = this.details();
    this.details.update((details) =>
      details
        ? {
            ...details,
            placements: details.placements.filter((placement) => placement.id !== placementId),
          }
        : details,
    );
    this.selectedPlacementId.set(null);
    this.saving.set(true);

    this.plannerApi.deletePlacement(projectId, bedId, placementId).subscribe({
      next: () => {
        this.saving.set(false);
        this.harvestPreview.set(null);
        this.reloadAfterMutation(projectId, bedId);
      },
      error: () => {
        this.saving.set(false);
        this.details.set(previousDetails);
        this.selectedPlacementId.set(placementId);
        this.error.set('Unable to delete placement.');
      },
    });
  }

  addVertexToSelectedPlacement(projectId: string, bedId: string): void {
    const placement = this.selectedPlacement();
    if (!placement) {
      return;
    }

    const points = [...placement.polygonPoints];
    const last = points[points.length - 1] ?? { xInches: 0, yInches: 0 };
    points.push({
      xInches: last.xInches,
      yInches: last.yInches,
    });
    this.updateSelectedPlacement(projectId, bedId, {
      placementMode: 'polygon',
      polygonPoints: points,
    });
  }

  removeVertexFromSelectedPlacement(projectId: string, bedId: string, pointIndex: number): void {
    const placement = this.selectedPlacement();
    if (!placement || placement.polygonPoints.length <= 3) {
      return;
    }

    this.updateSelectedPlacement(projectId, bedId, {
      polygonPoints: placement.polygonPoints.filter((_, index) => index !== pointIndex),
    });
  }

  updateSelectedPlacementPoint(
    projectId: string,
    bedId: string,
    pointIndex: number,
    point: PlacementPoint,
  ): void {
    const placement = this.selectedPlacement();
    if (!placement || !placement.polygonPoints[pointIndex]) {
      return;
    }

    const polygonPoints = [...placement.polygonPoints];
    polygonPoints[pointIndex] = point;
    this.updateSelectedPlacement(projectId, bedId, { polygonPoints });
  }

  refreshPreview(projectId: string, bedId: string, seedId: string, plantedOnIso: string, plantCount: number): void {
    this.plannerApi
      .previewHarvest(projectId, bedId, { seedId, plantedOnIso, plantCount })
      .subscribe({
        next: (preview) => this.harvestPreview.set(preview),
        error: () => this.harvestPreview.set(null),
      });
  }

  buildDraftPolygon(
    bed: BedLayout,
    placementMode: BedPlacementMode,
    startXInches: number,
    startYInches: number,
    widthInches: number,
    heightInches: number,
  ): PlacementPoint[] {
    const rect = createRectPolygon(startXInches, startYInches, widthInches, heightInches);
    return normalizePlacementPoints(bed, rect);
  }

  private replacePlacement(saved: BedPlacement): void {
    this.details.update((details) =>
      details
        ? {
            ...details,
            placements: details.placements.map((placement) =>
              placement.id === saved.id ? saved : placement,
            ),
          }
        : details,
    );
  }

  private refreshSelectedPlacementPreview(projectId: string, bedId: string): void {
    const placement = this.selectedPlacement();
    if (!placement) {
      this.harvestPreview.set(null);
      return;
    }

    this.refreshPreview(projectId, bedId, placement.seedId, placement.plantedOnIso, placement.plantCount);
  }

  private reloadAfterMutation(projectId: string, bedId: string): void {
    this.planner.refreshProjectResources(projectId);
    this.loadBed(projectId, bedId);
  }
}
