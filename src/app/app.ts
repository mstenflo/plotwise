import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlannerStateService } from './core/services/planner-state.service';
import { ProjectSeason } from './core/models/planner.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  private readonly planner = inject(PlannerStateService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly project = this.planner.activeProject;
  protected readonly projects = this.planner.projects;
  protected readonly visibleProjects = this.planner.visibleProjects;
  protected readonly showArchivedProjects = signal(false);
  protected readonly currentUrl = signal(this.router.url);
  protected readonly isBedDetailsRoute = computed(() => this.currentUrl().includes('/beds/'));

  constructor() {
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.currentUrl.set(this.router.url);
    });

    effect(() => {
      const projectId = this.planner.activeProjectId();
      const currentProjectId = this.extractProjectId(this.currentUrl());
      if (!projectId || !currentProjectId || currentProjectId === projectId) {
        return;
      }

      void this.router.navigate(['/projects', projectId], { replaceUrl: true });
    });
  }

  protected setSeason(value: string): void {
    this.planner.setSeason(value as ProjectSeason);
  }

  protected setActiveProject(projectId: string): void {
    this.planner.setActiveProject(projectId);
    void this.router.navigate(['/projects', projectId]);
  }

  protected createProject(): void {
    this.planner.createProject();
  }

  protected duplicateProject(): void {
    this.planner.duplicateActiveProject();
  }

  protected deleteProject(): void {
    if (this.projects().length <= 1) {
      return;
    }

    const confirmed = window.confirm(`Delete project "${this.project().name}"? This cannot be undone.`);
    if (!confirmed) {
      return;
    }

    const activeProjectId = this.project().id;
    this.planner.deleteActiveProject();
    if (this.currentUrl().includes(activeProjectId)) {
      const nextProjectId = this.planner.activeProjectId();
      if (nextProjectId) {
        void this.router.navigate(['/projects', nextProjectId]);
      }
    }
  }

  protected archiveProject(): void {
    this.planner.archiveActiveProject();
  }

  protected unarchiveProject(projectId: string): void {
    this.planner.unarchiveProject(projectId);
  }

  protected setShowArchivedProjects(value: boolean): void {
    this.showArchivedProjects.set(value);
  }

  protected saveProject(): void {
    this.planner.saveProjects();
  }

  protected reloadProjects(): void {
    this.planner.loadSavedProjects();
  }

  private extractProjectId(url: string): string | null {
    const match = url.match(/\/projects\/([^/]+)/);
    return match?.[1] ?? null;
  }
}
