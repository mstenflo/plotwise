import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PlannerStateService } from '../../core/services/planner-state.service';

@Component({
  selector: 'app-active-project-redirect',
  standalone: true,
  template: '',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ActiveProjectRedirectComponent {
  private readonly planner = inject(PlannerStateService);
  private readonly router = inject(Router);

  constructor() {
    effect(() => {
      const projectId = this.planner.activeProjectId();
      if (!projectId) {
        return;
      }

      void this.router.navigate(['/projects', projectId], { replaceUrl: true });
    });
  }
}
