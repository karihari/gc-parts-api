import { Module } from '@nestjs/common';
import { AdminEnquiriesController } from './controllers/admin-enquiries.controller';
import { EnquiriesController } from './enquiries.controller';
import { EnquiriesService } from './services/enquiries.service';

@Module({
  controllers: [EnquiriesController, AdminEnquiriesController],
  providers: [EnquiriesService],
})
export class EnquiriesModule {}
