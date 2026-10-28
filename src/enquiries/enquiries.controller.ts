import {
  Body,
  Controller,
  HttpStatus,
  Logger,
  Post,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { OkResponseDto } from '../auth/dto/auth-response.dto';
import { AppController } from '../common/decorators/app-controller.decorator';
import { NotificationsService } from '../notifications/notifications.service';
import { EnquiryRequestDto } from './dto/enquiry-request.dto';

const ENQUIRY_DELIVERY_FAILED = 'ENQUIRY_DELIVERY_FAILED';

@ApiTags('Enquiries')
@Controller('enquiries')
export class EnquiriesController {
  private readonly logger = new Logger(EnquiriesController.name);

  constructor(private readonly notifications: NotificationsService) {}

  @Post()
  @AppController({
    title: 'Contact form: forwards the enquiry to the shop',
    public: true,
    httpCode: HttpStatus.OK,
    throttle: { limit: 5, ttl: 10 * 60_000 },
    response: [
      ApiOkResponse({ type: OkResponseDto }),
      ApiServiceUnavailableResponse({ description: 'Could not deliver; suggest WhatsApp instead' }),
    ],
  })
  async send(@Body() body: EnquiryRequestDto): Promise<OkResponseDto> {
    const { website, ...enquiry } = body;
    if (website) {
      this.logger.warn('Enquiry dropped by honeypot');
      return { ok: true };
    }
    // Unlike orders, nothing is stored here, so a failed delivery must be reported.
    const delivered = await this.notifications.send('gcparts-contact-form', { ...enquiry });
    if (!delivered) throw new ServiceUnavailableException(ENQUIRY_DELIVERY_FAILED);
    return { ok: true };
  }
}
