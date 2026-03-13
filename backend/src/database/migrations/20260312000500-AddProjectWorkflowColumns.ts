import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProjectWorkflowColumns20260312000500 implements MigrationInterface {
  name = 'AddProjectWorkflowColumns20260312000500';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "planner_projects" ADD COLUMN IF NOT EXISTS "completedTaskIds" jsonb NOT NULL DEFAULT \'[]\'::jsonb'
    );
    await queryRunner.query(
      'ALTER TABLE "planner_projects" ADD COLUMN IF NOT EXISTS "archivedAtIso" TIMESTAMPTZ'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_planner_projects_archivedAtIso" ON "planner_projects" ("archivedAtIso")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_planner_projects_archivedAtIso"');
    await queryRunner.query('ALTER TABLE "planner_projects" DROP COLUMN IF EXISTS "archivedAtIso"');
    await queryRunner.query('ALTER TABLE "planner_projects" DROP COLUMN IF EXISTS "completedTaskIds"');
  }
}
