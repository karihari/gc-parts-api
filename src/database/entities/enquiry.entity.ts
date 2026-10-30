import { ApiProperty } from '@nestjs/swagger';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { TimestampedEntity } from './base.entity';
import { EnquiryStatus } from './enums';

// A message sent from the contact form; the admin reads and resolves it on the Messages page.
@Entity('enquiries')
export class EnquiryEntity extends TimestampedEntity {
  @ApiProperty({ example: 'MSG-3F9A1C0B2E' })
  @PrimaryColumn({ type: 'text' })
  id: string;

  @ApiProperty()
  @Column({ type: 'text' })
  name: string;

  @ApiProperty()
  @Column({ type: 'text' })
  phone: string;

  @ApiProperty()
  @Column({ type: 'text' })
  email: string;

  @ApiProperty()
  @Column({ type: 'text', default: '' })
  part: string;

  @ApiProperty()
  @Column({ type: 'text', default: '' })
  message: string;

  @ApiProperty()
  @Column({ type: 'text', default: '' })
  vehicle: string;

  @ApiProperty({ enum: EnquiryStatus })
  @Index('enquiries_status_idx')
  @Column({ type: 'text', default: EnquiryStatus.NEW })
  status: EnquiryStatus;
}
