import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { paginate, Paginated } from '../../common/dto/pagination.dto';
import { newEnquiryId } from '../../common/helpers/ids';
import { EnquiryEntity, EnquiryStatus } from '../../database/entities';
import { NotificationsService } from '../../notifications/notifications.service';
import { AdminEnquiriesQueryDto } from '../dto/enquiry-admin.dto';
import { EnquiryRequestDto } from '../dto/enquiry-request.dto';
import { ENQUIRY_NOT_FOUND } from '../errors';

@Injectable()
export class EnquiriesService {
  private readonly logger = new Logger(EnquiriesService.name);

  constructor(
    @InjectRepository(EnquiryEntity)
    private readonly enquiries: Repository<EnquiryEntity>,
    private readonly notifications: NotificationsService,
  ) {}

  async create(dto: Omit<EnquiryRequestDto, 'website'>): Promise<EnquiryEntity> {
    const enquiry = await this.enquiries.save(
      this.enquiries.create({
        id: newEnquiryId(),
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        part: dto.part ?? '',
        message: dto.message ?? '',
        vehicle: dto.vehicle ?? '',
        status: EnquiryStatus.NEW,
      }),
    );
    this.logger.log(`Enquiry ${enquiry.id} received`);
    // The enquiry is saved; a failed notification is only logged and must not fail the form.
    void this.notifications.send('gcparts-contact-form', {
      id: enquiry.id,
      name: enquiry.name,
      phone: enquiry.phone,
      email: enquiry.email,
      part: enquiry.part,
      message: enquiry.message,
      vehicle: enquiry.vehicle,
    });
    return enquiry;
  }

  async list(query: AdminEnquiriesQueryDto): Promise<Paginated<EnquiryEntity>> {
    const qb = this.enquiries.createQueryBuilder('e');
    if (query.status) qb.andWhere('e.status = :status', { status: query.status });
    if (query.q) {
      qb.andWhere('(e.name ILIKE :q OR e.phone ILIKE :q OR e.email ILIKE :q OR e.part ILIKE :q)', {
        q: `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
      });
    }
    const [rows, total] = await qb
      .orderBy('e.createdAt', 'DESC')
      .addOrderBy('e.id', 'ASC')
      .skip((query.page - 1) * query.perPage)
      .take(query.perPage)
      .getManyAndCount();
    return paginate(rows, total, query);
  }

  async setStatus(id: string, status: EnquiryStatus): Promise<EnquiryEntity> {
    const enquiry = await this.enquiries.findOneBy({ id });
    if (!enquiry) throw new NotFoundException(ENQUIRY_NOT_FOUND);
    if (enquiry.status === status) return enquiry;
    await this.enquiries.update(id, { status });
    return { ...enquiry, status };
  }
}
