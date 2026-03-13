import { IsBoolean } from 'class-validator';

export class UpdateTaskStatusDto {
  @IsBoolean()
  completed!: boolean;
}
