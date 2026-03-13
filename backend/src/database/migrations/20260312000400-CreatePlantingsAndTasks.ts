import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePlantingsAndTasks20260312000400 implements MigrationInterface {
  name = 'CreatePlantingsAndTasks20260312000400';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plantings" (
        "id" character varying(64) NOT NULL,
        "projectId" character varying(64) NOT NULL,
        "bedId" character varying(64) NOT NULL,
        "seedId" character varying(64) NOT NULL,
        "plantedOnIso" TIMESTAMPTZ NOT NULL,
        "plantCount" integer NOT NULL,
        "expectedHarvestPounds" double precision NOT NULL,
        "expectedHarvestDateIso" TIMESTAMPTZ NOT NULL,
        "updatedAtIso" TIMESTAMPTZ NOT NULL,
        CONSTRAINT "PK_plantings_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_plantings_projectId" ON "plantings" ("projectId")'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_plantings_projectId_plantedOnIso" ON "plantings" ("projectId", "plantedOnIso")'
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "calendar_tasks" (
        "id" character varying(64) NOT NULL,
        "projectId" character varying(64) NOT NULL,
        "bedId" character varying(64) NOT NULL,
        "priority" character varying(32) NOT NULL,
        "title" character varying(200) NOT NULL,
        "dueDateIso" TIMESTAMPTZ NOT NULL,
        "completed" boolean NOT NULL DEFAULT false,
        "plantingId" character varying(64),
        "updatedAtIso" TIMESTAMPTZ NOT NULL,
        CONSTRAINT "PK_calendar_tasks_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_calendar_tasks_projectId" ON "calendar_tasks" ("projectId")'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_calendar_tasks_projectId_dueDateIso" ON "calendar_tasks" ("projectId", "dueDateIso")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_calendar_tasks_projectId_dueDateIso"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_calendar_tasks_projectId"');
    await queryRunner.query('DROP TABLE IF EXISTS "calendar_tasks"');

    await queryRunner.query('DROP INDEX IF EXISTS "IDX_plantings_projectId_plantedOnIso"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_plantings_projectId"');
    await queryRunner.query('DROP TABLE IF EXISTS "plantings"');
  }
}
