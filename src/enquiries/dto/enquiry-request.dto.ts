import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class EnquiryRequestDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(40)
  phone: string;

  @ApiProperty()
  @Transform(trim)
  @IsEmail()
  @MaxLength(200)
  email: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  part?: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  message?: string;

  @ApiPropertyOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  @IsOptional()
  vehicle?: string;

  // Honeypot: a field hidden from people with CSS. Bots fill every input; if this one
  // has a value the enquiry is dropped while the bot still gets a normal "ok".
  @ApiPropertyOptional({ description: 'Leave empty (spam trap)' })
  @IsString()
  @MaxLength(200)
  @IsOptional()
  website?: string;
}
