import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
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
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
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

  it('supports placement-backed bed details and summary APIs', async () => {
    const createResponse = await request(app.getHttpServer())
      .post('/api/projects')
      .send({
        name: 'Placement API Test Project',
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
            zones: [
              {
                id: 'zone-1',
                name: 'Row 1',
                rowIndex: 0,
                shapeType: 'row-strip',
                colorHex: '#7ab77d',
                planting: {
                  seedId: 'seed-test',
                  plantedOnIso: '2026-03-12T00:00:00.000Z',
                  plantCount: 8,
                  expectedHarvestPounds: 8,
                  expectedHarvestDateIso: '2026-04-11T00:00:00.000Z',
                },
              },
            ],
          },
        ],
        completedTaskIds: ['task-harvest-bed-it-zone-1'],
      };

      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}`)
        .send(updatedProject)
        .expect(200);

      const summariesResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/beds/summary`)
        .expect(200);

      expect(Array.isArray(summariesResponse.body)).toBe(true);
      expect(summariesResponse.body[0].bedId).toBe('bed-it');
      expect(summariesResponse.body[0].currentPlants.length).toBe(1);

      const bedDetails = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/beds/bed-it`)
        .expect(200);

      expect(bedDetails.body.bed.id).toBe('bed-it');
      expect(Array.isArray(bedDetails.body.placements)).toBe(true);
      expect(bedDetails.body.placements.length).toBeGreaterThan(0);
      const migratedPlacementId = bedDetails.body.placements[0].id as string;

      const previewHarvest = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/beds/bed-it/placements/preview-harvest`)
        .send({
          seedId: 'seed-test',
          plantedOnIso: '2026-03-18T00:00:00.000Z',
          plantCount: 6,
        })
        .expect(201);

      expect(previewHarvest.body.expectedHarvestDateIso).toBeDefined();
      expect(previewHarvest.body.expectedHarvestPounds).toBe(6);

      const createdPlacement = await request(app.getHttpServer())
        .post(`/api/projects/${projectId}/beds/bed-it/placements`)
        .send({
          seedId: 'seed-test',
          plantedOnIso: '2026-03-18T00:00:00.000Z',
          plantCount: 6,
          colorHex: '#58a680',
          placementMode: 'block',
          polygonPoints: [
            { xInches: 10, yInches: 10 },
            { xInches: 22, yInches: 10 },
            { xInches: 22, yInches: 18 },
            { xInches: 10, yInches: 18 },
          ],
        })
        .expect(201);

      expect(createdPlacement.body.expectedHarvestDateIso).toBeDefined();

      await request(app.getHttpServer())
        .put(`/api/projects/${projectId}/beds/bed-it/placements/${createdPlacement.body.id}`)
        .send({
          seedId: 'seed-test',
          plantedOnIso: '2026-03-20T00:00:00.000Z',
          plantCount: 4,
          colorHex: '#5e9f60',
          placementMode: 'polygon',
          polygonPoints: [
            { xInches: 12, yInches: 10 },
            { xInches: 20, yInches: 10 },
            { xInches: 22, yInches: 18 },
            { xInches: 14, yInches: 20 },
          ],
        })
        .expect(200)
        .expect((response) => {
          expect(response.body.plantCount).toBe(4);
        });

      const tasksResponse = await request(app.getHttpServer())
        .get(`/api/projects/${projectId}/tasks?bedId=bed-it`)
        .expect(200);

      expect(Array.isArray(tasksResponse.body)).toBe(true);
      expect(tasksResponse.body.some((task: { placementId?: string }) => task.placementId === migratedPlacementId)).toBe(true);

      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}/beds/bed-it/placements/${createdPlacement.body.id}`)
        .expect(200)
        .expect({ deleted: true });
    } finally {
      await request(app.getHttpServer())
        .delete(`/api/projects/${projectId}`)
        .expect(200);
    }
  });
});
