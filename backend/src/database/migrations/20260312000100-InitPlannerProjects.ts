import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitPlannerProjects20260312000100 implements MigrationInterface {
  name = 'InitPlannerProjects20260312000100';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "planner_projects" (
        "id" character varying(64) NOT NULL,
        "name" character varying(120) NOT NULL,
        "season" character varying(24) NOT NULL,
        "climateZone" character varying(24) NOT NULL,
        "lastFrostDateIso" TIMESTAMPTZ NOT NULL,
        "firstFrostDateIso" TIMESTAMPTZ NOT NULL,
        "seeds" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "objects" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "updatedAtIso" TIMESTAMPTZ NOT NULL,
        CONSTRAINT "PK_planner_projects_id" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "planner_projects"');
  }
}
