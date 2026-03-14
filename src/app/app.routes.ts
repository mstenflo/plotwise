import { Routes } from '@angular/router';
import { ActiveProjectRedirectComponent } from './features/planner/active-project-redirect.component';
import { BedDetailsPageComponent } from './features/planner/bed-details-page.component';
import { SitePlannerPageComponent } from './features/planner/site-planner-page.component';

export const routes: Routes = [
  {
    path: '',
    component: ActiveProjectRedirectComponent,
  },
  {
    path: 'projects/:projectId',
    component: SitePlannerPageComponent,
  },
  {
    path: 'projects/:projectId/beds/:bedId',
    component: BedDetailsPageComponent,
  },
  {
    path: '**',
    redirectTo: '',
  },
];
