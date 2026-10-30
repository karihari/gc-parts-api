import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { AppController } from '../../common/decorators/app-controller.decorator';
import { AdminRole, EnquiryEntity } from '../../database/entities';
import {
  AdminEnquiriesQueryDto,
  AdminEnquiryListResponseDto,
  EnquiryIdParamsDto,
  UpdateEnquiryStatusRequestDto,
} from '../dto/enquiry-admin.dto';
import { EnquiriesService } from '../services/enquiries.service';

const STAFF = [AdminRole.ADMIN, AdminRole.STAFF];

@ApiTags('Admin / Enquiries')
@Controller('admin/enquiries')
export class AdminEnquiriesController {
  constructor(private readonly enquiries: EnquiriesService) {}

  @Get()
  @AppController({
    title: 'List contact-form messages, newest first',
    roles: STAFF,
    response: [ApiOkResponse({ type: AdminEnquiryListResponseDto })],
  })
  list(@Query() query: AdminEnquiriesQueryDto): Promise<AdminEnquiryListResponseDto> {
    return this.enquiries.list(query);
  }

  @Patch(':id/status')
  @AppController({
    title: 'Mark a message New or Resolved',
    roles: STAFF,
    response: [ApiOkResponse({ type: EnquiryEntity })],
  })
  setStatus(
    @Param() { id }: EnquiryIdParamsDto,
    @Body() body: UpdateEnquiryStatusRequestDto,
  ): Promise<EnquiryEntity> {
    return this.enquiries.setStatus(id, body.status);
  }
}
