import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlannerProjectsIndexes20260312000200 implements MigrationInterface {
  name = 'AddPlannerProjectsIndexes20260312000200';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_planner_projects_updatedAtIso" ON "planner_projects" ("updatedAtIso")'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_planner_projects_climateZone" ON "planner_projects" ("climateZone")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_planner_projects_climateZone"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_planner_projects_updatedAtIso"');
  }
}
