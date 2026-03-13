import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('Backend API (e2e)', () => {
  let app: INestApplication;
  let createdProjectId: string | undefined;

  beforeAll(async () => {
    process.env.DATABASE_URL =
      process.env.TEST_DATABASE_URL ??
      'postgresql://postgres:postgres@localhost:5432/plotwise';
    process.env.DB_SSL = 'false';
    process.env.TYPEORM_SYNCHRONIZE = 'false';
    process.env.TYPEORM_MIGRATIONS_RUN = 'true';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (createdProjectId) {
      await request(app.getHttpServer())
        .delete(`/api/projects/${createdProjectId}`)
        .expect(200);
    }

    await app.close();
  });

  it('GET /api/health returns db status', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);

    expect(response.body.service).toBe('plotwise-backend');
    expect(response.body.database).toBe('up');
    expect(response.body.status).toBe('ok');
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('supports projects CRUD over HTTP', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/projects')
      .send({
        name: 'Integration Test Project',
        season: 'spring',
        climateZone: '7a',
        lastFrostDateIso: '2026-04-15T00:00:00.000Z',
        firstFrostDateIso: '2026-11-01T00:00:00.000Z',
      })
      .expect(201);

    expect(createResponse.body.id).toBeDefined();
    expect(createResponse.body.name).toBe('Integration Test Project');
    createdProjectId = createResponse.body.id;

    const listResponse = await request(app.getHttpServer())
      .get('/api/projects')
      .expect(200);

    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(
      listResponse.body.some(
        (project: { id: string }) => project.id === createdProjectId,
      ),
    ).toBe(true);

    const getResponse = await request(app.getHttpServer())
      .get(`/api/projects/${createdProjectId}`)
      .expect(200);

    expect(getResponse.body.id).toBe(createdProjectId);

    const updatedProject = {
      ...getResponse.body,
      name: 'Integration Test Project Updated',
    };

    await request(app.getHttpServer())
      .put(`/api/projects/${createdProjectId}`)
      .send(updatedProject)
      .expect(200)
      .expect((response) => {
        expect(response.body.name).toBe('Integration Test Project Updated');
      });

    await request(app.getHttpServer())
      .delete(`/api/projects/${createdProjectId}`)
      .expect(200)
      .expect({ deleted: true });

    await request(app.getHttpServer())
      .get(`/api/projects/${createdProjectId}`)
      .expect(404);

    createdProjectId = undefined;
  });

  it('supports planning resources sync and task filtering', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/projects')
      .send({
        name: 'Planning API Test Project',
        season: 'spring',
        climateZone: '7a',
        lastFrostDateIso: '2026-04-15T00:00:00.000Z',
        firstFrostDateIso: '2026-11-01T00:00:00.000Z',
      })
      .expect(201);

    const projectId = createResponse.body.id as string;

    try {
      const getProjectResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}`)
        .expect(200);

      const updatedProject = {
        ...getProjectResponse.body,
        seeds: [
          {
            id: 'seed-test',
            name: 'Test Crop',
            variety: 'Fixture',
            lifecycle: 'annual',
            family: 'Testaceae',
            spacingInches: 12,
            rowSpacingInches: 12,
            daysToMaturity: 30,
            matureSpreadInches: 14,
            preferredSun: 'full-sun',
            soilPhMin: 6,
            soilPhMax: 7,
            successionFriendly: true,
            yield: { averagePoundsPerPlant: 1 },
          },
        ],
        objects: [
          {
            id: 'bed-it',
            type: 'bed',
            name: 'Integration Bed',
            xInches: 24,
            yInches: 24,
            widthInches: 96,
            heightInches: 36,
            rotationDeg: 0,
            rows: 3,
            sunExposure: 'full-sun',
            soil: { ph: 6.5, drainage: 'good', organicMatterPercent: 4 },
            planting: {
              seedId: 'seed-test',
              plantedOnIso: '2026-03-12T00:00:00.000Z',
              plantCount: 8,
              expectedHarvestPounds: 8,
              expectedHarvestDateIso: '2026-04-11T00:00:00.000Z',
            },
          },
        ],
        completedTaskIds: ['task-harvest-bed-it'],
      };

      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}`)
        .send(updatedProject)
        .expect(200);

      const plantingsResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/plantings`)
        .expect(200);

      expect(Array.isArray(plantingsResponse.body)).toBe(true);
      expect(plantingsResponse.body.length).toBe(1);

      const tasksResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks`)
        .expect(200);

      expect(Array.isArray(tasksResponse.body)).toBe(true);
      expect(tasksResponse.body.length).toBeGreaterThan(0);
      const harvestTask = tasksResponse.body.find(
        (task: { id: string }) => task.id === 'task-harvest-bed-it',
      );
      expect(harvestTask).toBeDefined();

      await request(app.getHttpServer())
        .patch(`/api/projects/${projectId}/tasks/task-harvest-bed-it`)
        .send({ completed: false })
        .expect(200)
        .expect((response) => {
          expect(response.body.completed).toBe(false);
        });

      const openTasks = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks?completed=false`)
        .expect(200);
      expect(openTasks.body.some((task: { id: string }) => task.id === 'task-harvest-bed-it')).toBe(true);

      const doneTasks = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks?completed=true`)
        .expect(200);
      expect(doneTasks.body.some((task: { id: string }) => task.id === 'task-harvest-bed-it')).toBe(false);

      await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/tasks/sync`)
        .expect(201)
        .expect({ synced: true });

      const upsertZonePlanting = await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/plantings/bed-it/zone-1`)
        .send({
          seedId: 'seed-test',
          plantedOnIso: '2026-03-18T00:00:00.000Z',
          plantCount: 6,
          expectedHarvestPounds: 6,
          expectedHarvestDateIso: '2026-04-18T00:00:00.000Z',
          zoneId: 'zone-1',
        })
        .expect(200);

      expect(upsertZonePlanting.body.zoneId).toBe('zone-1');

      const zoneTasks = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks?zoneId=zone-1`)
        .expect(200);
      expect(Array.isArray(zoneTasks.body)).toBe(true);

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/plantings/bed-it/zone-1`)
        .expect(200)
        .expect({ deleted: true });
    } finally {
      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}`)
        .expect(200);
    }
  });
});
