import { routes } from './app.routes';

describe('app routes', () => {
  it('defines the site planner and bed-details routes', () => {
    expect(routes.map((route) => route.path)).toEqual([
      '',
      'projects/:projectId',
      'projects/:projectId/beds/:bedId',
      '**',
    ]);
  });
});
