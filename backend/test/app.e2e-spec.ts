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
});
