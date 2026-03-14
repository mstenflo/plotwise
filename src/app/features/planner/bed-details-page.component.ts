import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { BedDetailsCanvasComponent } from './bed-details-canvas.component';
import { PlannerStateService } from '../../core/services/planner-state.service';
import { BedDetailsStateService } from '../../core/services/bed-details-state.service';
import { BedEditorToolMode, BedPlacementMode, PlacementPoint } from '../../core/models/planner.model';
import { formatInches } from '../../core/models/units.model';

@Component({
  selector: 'app-bed-details-page',
  standalone: true,
  imports: [BedDetailsCanvasComponent, DatePipe, DecimalPipe],
  templateUrl: './bed-details-page.component.html',
  styleUrl: './bed-details-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BedDetailsPageComponent {
  private readonly planner = inject(PlannerStateService);
  private readonly bedDetails = inject(BedDetailsStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly project = this.planner.activeProject;
  protected readonly seeds = this.planner.seeds;
  protected readonly selectedSeedId = this.planner.selectedSeedId;
  protected readonly bed = this.bedDetails.bed;
  protected readonly placements = this.bedDetails.placements;
  protected readonly summary = this.bedDetails.summary;
  protected readonly tasks = this.bedDetails.tasks;
  protected readonly warnings = this.bedDetails.warnings;
  protected readonly selectedPlacement = this.bedDetails.selectedPlacement;
  protected readonly selectedPlacementId = this.bedDetails.selectedPlacementId;
  protected readonly harvestPreview = this.bedDetails.harvestPreview;
  protected readonly toolMode = this.bedDetails.toolMode;
  protected readonly loading = this.bedDetails.loading;
  protected readonly saving = this.bedDetails.saving;
  protected readonly error = this.bedDetails.error;
  protected readonly currentProjectId = signal<string>('');
  protected readonly currentBedId = signal<string>('');
  protected readonly bedAreaSqFt = computed(() => {
    const bed = this.bed();
    if (!bed) {
      return 0;
    }

    return Number(((bed.widthInches * bed.heightInches) / 144).toFixed(2));
  });

  constructor() {
    effect(() => {
      if (!this.currentProjectId() || this.loading()) {
        return;
      }

      if (this.error() === 'Bed not found.') {
        void this.router.navigate(['/projects', this.currentProjectId()], {
          replaceUrl: true,
        });
      }
    });

    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const projectId = params.get('projectId');
      const bedId = params.get('bedId');
      if (!projectId || !bedId) {
        return;
      }

      this.currentProjectId.set(projectId);
      this.currentBedId.set(bedId);
      this.planner.setActiveProject(projectId);
      this.planner.selectObject(bedId);
      this.bedDetails.loadBed(projectId, bedId);
    });
  }

  protected setToolMode(mode: BedEditorToolMode): void {
    this.bedDetails.setToolMode(mode);
  }

  protected selectSeed(seedId: string): void {
    this.planner.selectSeed(seedId);
  }

  protected selectPlacement(placementId: string | null): void {
    this.bedDetails.selectPlacement(
      placementId,
      this.currentProjectId(),
      this.currentBedId(),
    );
  }

  protected handlePlacementDrawn(event: { placementMode: BedPlacementMode; polygonPoints: PlacementPoint[] }): void {
    this.bedDetails.createPlacement(
      this.currentProjectId(),
      this.currentBedId(),
      event.placementMode,
      event.polygonPoints,
    );
  }

  protected handlePlacementMoved(event: { placementId: string; polygonPoints: PlacementPoint[] }): void {
    this.selectPlacement(event.placementId);
    this.bedDetails.updateSelectedPlacement(this.currentProjectId(), this.currentBedId(), {
      polygonPoints: event.polygonPoints,
    });
  }

  protected handlePlacementPointChanged(event: { placementId: string; pointIndex: number; point: PlacementPoint }): void {
    this.selectPlacement(event.placementId);
    this.bedDetails.updateSelectedPlacementPoint(
      this.currentProjectId(),
      this.currentBedId(),
      event.pointIndex,
      event.point,
    );
  }

  protected updateSelectedPlacementSeed(event: Event): void {
    const seedId = (event.target as HTMLSelectElement).value;
    this.bedDetails.updateSelectedPlacement(this.currentProjectId(), this.currentBedId(), { seedId });
  }

  protected updateSelectedPlacementDate(event: Event): void {
    const placement = this.selectedPlacement();
    if (!placement) {
      return;
    }

    const value = (event.target as HTMLInputElement).value;
    if (!value) {
      return;
    }

    const dateIso = new Date(value).toISOString();
    this.bedDetails.updateSelectedPlacement(this.currentProjectId(), this.currentBedId(), {
      plantedOnIso: dateIso,
    });
  }

  protected updateSelectedPlacementPlantCount(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value) || value < 1) {
      return;
    }

    this.bedDetails.updateSelectedPlacement(this.currentProjectId(), this.currentBedId(), {
      plantCount: value,
    });
  }

  protected updateSelectedPlacementColor(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) {
      return;
    }

    this.bedDetails.updateSelectedPlacement(this.currentProjectId(), this.currentBedId(), {
      colorHex: value,
    });
  }

  protected addVertex(): void {
    this.bedDetails.addVertexToSelectedPlacement(this.currentProjectId(), this.currentBedId());
  }

  protected removeVertex(pointIndex: number): void {
    this.bedDetails.removeVertexFromSelectedPlacement(
      this.currentProjectId(),
      this.currentBedId(),
      pointIndex,
    );
  }

  protected deleteSelectedPlacement(): void {
    this.bedDetails.deleteSelectedPlacement(this.currentProjectId(), this.currentBedId());
  }

  protected backToSite(): void {
    void this.router.navigate(['/projects', this.currentProjectId()]);
  }

  protected formatImperial(totalInches: number): string {
    return formatInches(totalInches);
  }

  protected toDateInputValue(isoDate: string | undefined): string {
    if (!isoDate) {
      return '';
    }

    return isoDate.slice(0, 10);
  }

  protected getSeed(seedId: string) {
    return this.seeds().find((seed) => seed.id === seedId) ?? null;
  }
}
