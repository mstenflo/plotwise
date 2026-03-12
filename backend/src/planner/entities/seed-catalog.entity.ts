import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { CropLifecycle, SunExposure, YieldProfile } from '../models/planner.types';

@Entity({ name: 'seed_catalog' })
export class SeedCatalogEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 120 })
  variety!: string;

  @Column({ type: 'varchar', length: 24 })
  lifecycle!: CropLifecycle;

  @Column({ type: 'varchar', length: 64 })
  family!: string;

  @Column({ type: 'int' })
  spacingInches!: number;

  @Column({ type: 'int' })
  rowSpacingInches!: number;

  @Column({ type: 'int' })
  daysToMaturity!: number;

  @Column({ type: 'int' })
  matureSpreadInches!: number;

  @Column({ type: 'varchar', length: 24 })
  preferredSun!: SunExposure;

  @Column({ type: 'float' })
  soilPhMin!: number;

  @Column({ type: 'float' })
  soilPhMax!: number;

  @Column({ type: 'boolean' })
  successionFriendly!: boolean;

  @Column({ type: 'jsonb' })
  yield!: YieldProfile;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  companionSeedIds!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  conflictSeedIds!: string[];

  @Column({ type: 'timestamptz' })
  updatedAtIso!: string;
}
