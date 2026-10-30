import { Body, Controller, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { OkResponseDto } from '../auth/dto/auth-response.dto';
import { AppController } from '../common/decorators/app-controller.decorator';
import { EnquiryRequestDto } from './dto/enquiry-request.dto';
import { EnquiriesService } from './services/enquiries.service';

@ApiTags('Enquiries')
@Controller('enquiries')
export class EnquiriesController {
  private readonly logger = new Logger(EnquiriesController.name);

  constructor(private readonly enquiries: EnquiriesService) {}

  @Post()
  @AppController({
    title: 'Contact form: saves the enquiry and notifies the shop',
    public: true,
    httpCode: HttpStatus.OK,
    throttle: { limit: 5, ttl: 10 * 60_000 },
    response: [ApiOkResponse({ type: OkResponseDto })],
  })
  async send(@Body() body: EnquiryRequestDto): Promise<OkResponseDto> {
    const { website, ...enquiry } = body;
    if (website) {
      this.logger.warn('Enquiry dropped by honeypot');
      return { ok: true };
    }
    await this.enquiries.create(enquiry);
    return { ok: true };
  }
}
