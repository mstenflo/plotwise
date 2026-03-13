import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePlantingDto {
  @IsString()
  @MaxLength(64)
  bedId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  zoneId?: string;

  @IsString()
  @MaxLength(64)
  seedId!: string;

  @IsDateString()
  plantedOnIso!: string;

  @IsInt()
  @Min(1)
  plantCount!: number;

  @IsNumber()
  @Min(0)
  expectedHarvestPounds!: number;

  @IsDateString()
  expectedHarvestDateIso!: string;
}
