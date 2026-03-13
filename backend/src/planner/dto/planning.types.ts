export interface PlantingRecord {
  id: string;
  projectId: string;
  bedId: string;
  zoneId?: string;
  seedId: string;
  plantedOnIso: string;
  plantCount: number;
  expectedHarvestPounds: number;
  expectedHarvestDateIso: string;
  updatedAtIso: string;
}

export interface CalendarTaskRecord {
  id: string;
  projectId: string;
  bedId: string;
  zoneId?: string;
  title: string;
  dueDateIso: string;
  priority: 'info' | 'warning' | 'critical';
  completed: boolean;
  plantingId?: string;
  updatedAtIso: string;
}
