import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class ProductIdParamsDto {
  @ApiProperty({ example: 'GC-1001' })
  @IsString()
  @MaxLength(40)
  @Matches(/^GC-[A-Z0-9]+$/)
  id: string;
}
