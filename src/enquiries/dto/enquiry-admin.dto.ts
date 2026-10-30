import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PaginationMetaDto, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { EnquiryEntity, EnquiryStatus } from '../../database/entities';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class EnquiryIdParamsDto {
  @ApiProperty({ example: 'MSG-3F9A1C0B2E' })
  @Matches(/^MSG-[A-Z0-9]{6,20}$/)
  id: string;
}

export class UpdateEnquiryStatusRequestDto {
  @ApiProperty({ enum: EnquiryStatus })
  @IsEnum(EnquiryStatus)
  status: EnquiryStatus;
}

export class AdminEnquiriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: EnquiryStatus })
  @IsEnum(EnquiryStatus)
  @IsOptional()
  status?: EnquiryStatus;

  @ApiPropertyOptional({ description: 'Name, phone, email or part' })
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  @IsOptional()
  q?: string;
}

export class AdminEnquiryListResponseDto {
  @ApiProperty({ type: [EnquiryEntity] })
  data: EnquiryEntity[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
