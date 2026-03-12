import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { PlannerCanvasComponent } from './features/planner/planner-canvas.component';
import { PlannerStateService } from './core/services/planner-state.service';
import { ProjectSeason } from './core/models/planner.model';

@Component({
  selector: 'app-root',
  imports: [PlannerCanvasComponent, DatePipe],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  private readonly planner = inject(PlannerStateService);

  protected readonly project = this.planner.activeProject;
  protected readonly beds = this.planner.beds;
  protected readonly seeds = this.planner.seeds;
  protected readonly selectedObject = this.planner.selectedObject;
  protected readonly selectedBed = this.planner.selectedBed;
  protected readonly selectedObjectId = this.planner.selectedObjectId;
  protected readonly selectedSeedId = this.planner.selectedSeedId;
  protected readonly tasks = this.planner.tasks;
  protected readonly warnings = this.planner.warnings;

  protected readonly selectedBedSummary = computed(() => {
    const bed = this.selectedBed();
    return bed ? this.planner.getBedSummary(bed) : 'Select a bed to inspect spacing, crop plan, and expected harvest.';
  });

  protected setSeason(value: string): void {
    this.planner.setSeason(value as ProjectSeason);
  }

  protected addBed(): void {
    this.planner.addBed();
  }

  protected selectBed(bedId: string | null): void {
    this.planner.selectObject(bedId);
  }

  protected selectSeed(seedId: string): void {
    this.planner.selectSeed(seedId);
  }

  protected assignSeedToSelectedBed(): void {
    this.planner.assignSelectedSeedToSelectedBed();
  }

  protected renameSelectedObject(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.planner.renameSelectedObject(value);
  }

  protected updateBedGeometry(update: {
    bedId: string;
    xInches: number;
    yInches: number;
    widthInches: number;
    heightInches: number;
    rotationDeg: number;
  }): void {
    this.planner.updateBedGeometry(update);
  }

  protected saveProject(): void {
    this.planner.saveProjects();
  }

  protected reloadProject(): void {
    this.planner.loadSavedProjects();
  }
}
