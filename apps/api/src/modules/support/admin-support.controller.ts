import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AdminRoles, AdminRolesGuard, JwtAuthGuard, Roles, RolesGuard } from '../auth/guards';
import { CurrentUser } from '../auth/current-user.decorator';
import { SupportService } from './support.service';
import { AdminReplyDto } from './dto';

@ApiTags('admin-support')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, AdminRolesGuard)
@Roles('ADMIN')
@AdminRoles('SUPPORT', 'SUPERADMIN')
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  @Get('tickets')
  listTickets() {
    return this.support.adminListTickets();
  }

  @Get('tickets/:id')
  getTicket(@Param('id') id: string) {
    return this.support.adminGetTicket(id);
  }

  @Post('tickets/:id/takeover')
  takeOver(@CurrentUser() admin: any, @Param('id') id: string) {
    return this.support.adminTakeOver(admin, id);
  }

  @Post('tickets/:id/reply')
  reply(@CurrentUser() admin: any, @Param('id') id: string, @Body() dto: AdminReplyDto) {
    return this.support.adminReply(admin, id, dto.message);
  }
}
