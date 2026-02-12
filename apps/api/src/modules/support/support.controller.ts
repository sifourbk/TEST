import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guards';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupportService } from './support.service';
import { CreateSupportTicketDto, SupportChatDto } from './dto';

@ApiTags('support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('tickets')
  @Roles('CUSTOMER', 'DRIVER')
  createTicket(@CurrentUser() user: any, @Body() dto: CreateSupportTicketDto) {
    return this.support.createTicket(user, dto);
  }

  @Get('tickets')
  @Roles('CUSTOMER', 'DRIVER')
  listMyTickets(@CurrentUser() user: any) {
    return this.support.listMyTickets(user);
  }

  @Get('tickets/:id')
  @Roles('CUSTOMER', 'DRIVER')
  getMyTicket(@CurrentUser() user: any, @Param('id') id: string) {
    return this.support.getTicketForUser(user, id);
  }

  @Post('chat')
  @Roles('CUSTOMER', 'DRIVER')
  chat(@CurrentUser() user: any, @Body() dto: SupportChatDto) {
    return this.support.userChat(user, dto.ticketId, dto.message);
  }
}
