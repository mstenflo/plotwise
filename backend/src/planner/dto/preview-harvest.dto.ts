import { IsDateString, IsInt, IsString, MaxLength, Min } from 'class-validator';

export class PreviewHarvestDto {
  @IsString()
  @MaxLength(64)
  seedId!: string;

  @IsDateString()
  plantedOnIso!: string;

  @IsInt()
  @Min(1)
  plantCount!: number;
}
