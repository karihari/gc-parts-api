import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginRequestDto {
  @ApiProperty({ example: 'admin@gcparts.am' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(200)
  email: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  // Upper bound stops huge inputs from being fed to the (deliberately slow) hash.
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  rememberMe?: boolean;
}
