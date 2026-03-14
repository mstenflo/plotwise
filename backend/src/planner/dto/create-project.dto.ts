import { IsDateString, IsNotEmpty, IsString, Matches } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @Matches(/^(spring|summer|fall|winter)$/)
  season!: 'spring' | 'summer' | 'fall' | 'winter';

  @IsString()
  @IsNotEmpty()
  climateZone!: string;

  @IsDateString()
  lastFrostDateIso!: string;

  @IsDateString()
  firstFrostDateIso!: string;
}
