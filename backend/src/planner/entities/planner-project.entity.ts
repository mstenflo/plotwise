import { Column, Entity, PrimaryColumn } from 'typeorm';
import type {
  LayoutObject,
  ProjectSeason,
  SeedMetadata,
} from '../models/planner.types';

@Entity({ name: 'planner_projects' })
export class PlannerProjectEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 24 })
  season!: ProjectSeason;

  @Column({ type: 'varchar', length: 24 })
  climateZone!: string;

  @Column({ type: 'timestamptz' })
  lastFrostDateIso!: string;

  @Column({ type: 'timestamptz' })
  firstFrostDateIso!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  seeds!: SeedMetadata[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  objects!: LayoutObject[];

  @Column({ type: 'timestamptz' })
  updatedAtIso!: string;
}
