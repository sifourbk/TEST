import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, RolesGuard } from '../auth/guards';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  CreateOrderSchema,
  CreateOfferSchema,
  AcceptOfferSchema,
  SetOnlineSchema,
  UpdateLocationSchema,
  DriverSetStatusSchema,
  DeliverWithPinSchema,
} from './dto';
import { OrdersService } from './orders.service';
import { MatchingService } from './matching.service';
import { UserRole } from '@prisma/client';

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService, private readonly matching: MatchingService) {}

  @Post('orders')
  @Roles(UserRole.CUSTOMER)
  async createOrder(@CurrentUser() user: any, @Body() body: unknown) {
    const dto = CreateOrderSchema.parse(body);
    return this.orders.createOrder(user, {
      cityId: dto.cityId,
      pickupLat: dto.pickup.lat,
      pickupLng: dto.pickup.lng,
      dropoffLat: dto.dropoff.lat,
      dropoffLng: dto.dropoff.lng,
      weightKg: dto.weightKg,
      truckType: dto.truckType,
    });
  }

  @Get('orders/:id')
  async getOrder(@CurrentUser() user: any, @Param('id') id: string) {
    return this.orders.getOrder(user, id);
  }

  @Post('orders/:id/offers/customer')
  @Roles(UserRole.CUSTOMER)
  async customerOffer(@CurrentUser() user: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = CreateOfferSchema.parse(body);
    return this.orders.createCustomerOffer(user, id, dto.amount);
  }

  @Post('orders/:id/offers/driver')
  @Roles(UserRole.DRIVER)
  async driverOffer(@CurrentUser() user: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = CreateOfferSchema.parse(body);
    return this.orders.createDriverOffer(user, id, dto.amount);
  }

  @Post('orders/:id/accept-offer')
  async accept(@CurrentUser() user: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = AcceptOfferSchema.parse(body);
    return this.orders.acceptOffer(user, id, dto.offerId);
  }

  // Driver status updates through lifecycle (after ASSIGNED)
  @Patch('orders/:id/driver-status')
  @Roles(UserRole.DRIVER)
  async driverSetStatus(@CurrentUser() user: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = DriverSetStatusSchema.parse(body);
    return this.orders.driverSetStatus(user, id, dto.status);
  }

  // Customer fetches POD PIN once driver arrives
  @Get('orders/:id/pod-pin')
  @Roles(UserRole.CUSTOMER)
  async getPodPin(@CurrentUser() user: any, @Param('id') id: string) {
    return this.orders.getPodPin(user, id);
  }

  // Driver marks delivered by entering customer-provided PIN
  @Post('orders/:id/deliver')
  @Roles(UserRole.DRIVER)
  async deliver(@CurrentUser() user: any, @Param('id') id: string, @Body() body: unknown) {
    const dto = DeliverWithPinSchema.parse(body);
    return this.orders.driverDeliverWithPin(user, id, dto.pin);
  }

  // Customer confirms completion (cash collected) -> creates CashPayment + Commission
  @Post('orders/:id/confirm-completion')
  @Roles(UserRole.CUSTOMER)
  async confirm(@CurrentUser() user: any, @Param('id') id: string) {
    return this.orders.customerConfirmCompletion(user, id);
  }

  // Driver online + location (used by matching)
  @Post('driver/online')
  @Roles(UserRole.DRIVER)
  async setOnline(@CurrentUser() user: any, @Body() body: unknown) {
    const dto = SetOnlineSchema.parse(body);
    return this.matching.setDriverOnline({ driverId: user.id, cityId: dto.cityId, isOnline: dto.isOnline });
  }

  @Post('driver/location')
  @Roles(UserRole.DRIVER)
  async updateLocation(@CurrentUser() user: any, @Body() body: unknown) {
    const dto = UpdateLocationSchema.parse(body);
    // city is required to shard by city in future; for phase4 we accept best-effort via last online city.
    // For now, client must send cityId in SetOnline first.
    // We store without city partition.
    return this.matching.updateDriverLocation({ driverId: user.id, cityId: 'unknown', lat: dto.lat, lng: dto.lng });
  }
}
