import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'calendar_tasks' })
export class CalendarTaskEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  projectId!: string;

  @Column({ type: 'varchar', length: 64 })
  bedId!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  zoneId?: string;

  @Column({ type: 'varchar', length: 32 })
  priority!: 'info' | 'warning' | 'critical';

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @Column({ type: 'timestamptz' })
  dueDateIso!: string;

  @Column({ type: 'boolean', default: false })
  completed!: boolean;

  @Column({ type: 'varchar', length: 64, nullable: true })
  plantingId?: string;

  @Column({ type: 'timestamptz' })
  updatedAtIso!: string;
}
