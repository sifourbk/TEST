import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SupportCategory, SupportPriority } from '@prisma/client';

export class CreateSupportTicketDto {
  @ApiProperty({ enum: SupportCategory, default: SupportCategory.GENERAL })
  category!: SupportCategory;

  @ApiProperty({ enum: SupportPriority, default: SupportPriority.MEDIUM })
  priority!: SupportPriority;

  @ApiProperty({ description: 'Initial message to start the ticket' })
  message!: string;

  @ApiPropertyOptional({ description: 'Optional order id to link context' })
  orderId?: string;
}

export class SupportChatDto {
  @ApiProperty()
  ticketId!: string;

  @ApiProperty()
  message!: string;
}

export class AdminReplyDto {
  @ApiProperty()
  message!: string;
}