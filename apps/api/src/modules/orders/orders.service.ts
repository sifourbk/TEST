import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from './pricing.service';
import { MatchingService } from './matching.service';
import { CommissionStatus, OfferSide, OrderOfferStatus, OrderStatus, TruckType, UserRole } from '@prisma/client';
import { randomInt } from 'crypto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly matching: MatchingService,
  ) {}

  async createOrder(user: { id: string; role: UserRole }, input: {
    cityId: string;
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
    weightKg: number;
    truckType: TruckType;
  }) {
    if (user.role !== UserRole.CUSTOMER) throw new ForbiddenException('Only customers can create orders');

    const { profile, distanceKm, estimatedFare } = await this.pricing.estimate({
      cityId: input.cityId,
      truckType: input.truckType,
      weightKg: input.weightKg,
      pickupLat: input.pickupLat,
      pickupLng: input.pickupLng,
      dropoffLat: input.dropoffLat,
      dropoffLng: input.dropoffLng,
    });

    const order = await this.prisma.order.create({
      data: {
        customerId: user.id,
        cityId: input.cityId,
        truckType: input.truckType,
        weightKg: input.weightKg,
        pickupLat: input.pickupLat,
        pickupLng: input.pickupLng,
        dropoffLat: input.dropoffLat,
        dropoffLng: input.dropoffLng,
        distanceKm,
        estimatedFare,
        status: OrderStatus.SEARCHING,
        events: { create: { type: 'STATUS', meta: { status: OrderStatus.SEARCHING } } },
      },
    });

    const matches = await this.matching.matchOrder({
      cityId: order.cityId,
      truckType: order.truckType,
      weightKg: order.weightKg,
      pickup: { lat: order.pickupLat, lng: order.pickupLng },
      limit: 10,
    });

    return {
      order,
      pricingProfile: {
        negotiateMinPct: profile.negotiateMinPct,
        negotiateMaxPct: profile.negotiateMaxPct,
        offerTimeoutSec: profile.offerTimeoutSec,
        maxCountersPerSide: profile.maxCountersPerSide,
      },
      matchedDriverIds: matches,
    };
  }

  async getOrder(user: { id: string; role: UserRole }, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { offers: { orderBy: { createdAt: 'asc' } }, events: { orderBy: { createdAt: 'asc' } } },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (user.role === UserRole.CUSTOMER && order.customerId !== user.id) throw new ForbiddenException();
    if (user.role === UserRole.DRIVER && order.assignedDriverId !== user.id) throw new ForbiddenException();
    return order;
  }

  async createCustomerOffer(user: { id: string; role: UserRole }, orderId: string, amount: number) {
    if (user.role !== UserRole.CUSTOMER) throw new ForbiddenException('Only customers');
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== user.id) throw new ForbiddenException();
    if (order.finalFare) throw new BadRequestException('Order already locked');

    const profile = await this.prisma.pricingProfile.findUnique({ where: { cityId_truckType: { cityId: order.cityId, truckType: order.truckType } } });
    if (!profile) throw new NotFoundException('Pricing profile not found');

    this.assertNegotiationBounds(order.estimatedFare, amount, profile.negotiateMinPct, profile.negotiateMaxPct);
    await this.assertOfferWindow(orderId);
    await this.assertCounterLimit(orderId, OfferSide.CUSTOMER, profile.maxCountersPerSide);

    const expiresAt = new Date(Date.now() + profile.offerTimeoutSec * 1000);
    const offer = await this.prisma.orderOffer.create({
      data: { orderId, side: OfferSide.CUSTOMER, amount, status: OrderOfferStatus.PENDING, expiresAt },
    });
    await this.prisma.orderEvent.create({ data: { orderId, type: 'OFFER_CREATED', meta: { side: 'CUSTOMER', amount } } });
    await this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.OFFERED } });
    return offer;
  }

  async createDriverOffer(user: { id: string; role: UserRole }, orderId: string, amount: number) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenException('Only drivers');
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.finalFare) throw new BadRequestException('Order already locked');

    const profile = await this.prisma.pricingProfile.findUnique({ where: { cityId_truckType: { cityId: order.cityId, truckType: order.truckType } } });
    if (!profile) throw new NotFoundException('Pricing profile not found');
    this.assertNegotiationBounds(order.estimatedFare, amount, profile.negotiateMinPct, profile.negotiateMaxPct);
    await this.assertOfferWindow(orderId);
    await this.assertCounterLimit(orderId, OfferSide.DRIVER, profile.maxCountersPerSide);

    const expiresAt = new Date(Date.now() + profile.offerTimeoutSec * 1000);
    const offer = await this.prisma.orderOffer.create({
      data: { orderId, side: OfferSide.DRIVER, driverId: user.id, amount, status: OrderOfferStatus.PENDING, expiresAt },
    });
    await this.prisma.orderEvent.create({ data: { orderId, type: 'OFFER_CREATED', meta: { side: 'DRIVER', amount, driverId: user.id } } });
    await this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.OFFERED } });
    return offer;
  }

  async acceptOffer(user: { id: string; role: UserRole }, orderId: string, offerId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.finalFare) throw new BadRequestException('Order already locked');

    const offer = await this.prisma.orderOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.orderId !== orderId) throw new NotFoundException('Offer not found');
    if (offer.status !== OrderOfferStatus.PENDING) throw new BadRequestException('Offer not pending');
    if (offer.expiresAt.getTime() <= Date.now()) {
      await this.prisma.orderOffer.update({ where: { id: offer.id }, data: { status: OrderOfferStatus.EXPIRED } });
      throw new BadRequestException('Offer expired');
    }

    // Permissions: customer accepts driver offer; driver accepts customer offer.
    if (offer.side === OfferSide.DRIVER) {
      if (user.role !== UserRole.CUSTOMER || order.customerId !== user.id) throw new ForbiddenException();
      if (!offer.driverId) throw new BadRequestException('Driver offer missing driver');
    } else {
      if (user.role !== UserRole.DRIVER) throw new ForbiddenException();
    }

    const assignedDriverId = offer.side === OfferSide.DRIVER ? offer.driverId! : user.id;

    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findUnique({ where: { id: orderId } });
      if (!fresh) throw new NotFoundException('Order not found');
      if (fresh.finalFare || fresh.acceptedOfferId) throw new BadRequestException('Order already locked');

      await tx.orderOffer.update({ where: { id: offerId }, data: { status: OrderOfferStatus.ACCEPTED } });
      await tx.orderOffer.updateMany({ where: { orderId, status: OrderOfferStatus.PENDING, id: { not: offerId } }, data: { status: OrderOfferStatus.REJECTED } });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          finalFare: offer.amount,
          acceptedOfferId: offerId,
          assignedDriverId,
          status: OrderStatus.ASSIGNED,
          events: {
            create: [
              { type: 'OFFER_ACCEPTED', meta: { offerId, amount: offer.amount, assignedDriverId } },
              { type: 'STATUS', meta: { status: OrderStatus.ASSIGNED } },
            ],
          },
        },
      });
      return updated;
    });
  }

  private generatePin(): string {
    return String(randomInt(0, 10000)).padStart(4, '0');
  }

  async driverSetStatus(user: { id: string; role: UserRole }, orderId: string, next: OrderStatus) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenException('Only drivers');
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.assignedDriverId !== user.id) throw new ForbiddenException();
    if ([OrderStatus.CANCELED, OrderStatus.COMPLETED].includes(order.status)) throw new BadRequestException('Order closed');

    const allowed = this.allowedDriverTransitions(order.status);
    if (!allowed.includes(next)) {
      throw new BadRequestException(`Invalid transition ${order.status} -> ${next}`);
    }

    const data: any = { status: next };
    const events: any[] = [{ type: 'STATUS', meta: { status: next } }];

    if (next === OrderStatus.ARRIVED) {
      // Generate a 4-digit PIN if not already generated.
      if (!order.deliveryPin) {
        const pin = String(randomInt(0, 10000)).padStart(4, '0');
        data.deliveryPin = pin;
        data.arrivedAt = new Date();
        events.push({ type: 'POD_PIN_GENERATED', meta: { generated: true } });
      }
    }
    if (next === OrderStatus.CANCELED) {
      data.canceledAt = new Date();
      events.push({ type: 'CANCELED', meta: { by: 'DRIVER' } });
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        ...data,
        events: { create: events },
      },
    });
  }

  async getPodPin(user: { id: string; role: UserRole }, orderId: string) {
    if (user.role !== UserRole.CUSTOMER) throw new ForbiddenException();
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== user.id) throw new ForbiddenException();
    if (![OrderStatus.ARRIVED, OrderStatus.LOADING, OrderStatus.IN_TRANSIT, OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(order.status)) {
      throw new BadRequestException('PIN not available yet');
    }
    if (!order.deliveryPin) throw new BadRequestException('PIN not generated');
    return { pin: order.deliveryPin };
  }

  async driverDeliverWithPin(user: { id: string; role: UserRole }, orderId: string, pin: string) {
    if (user.role !== UserRole.DRIVER) throw new ForbiddenException('Only drivers');
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.assignedDriverId !== user.id) throw new ForbiddenException();
    if (!order.deliveryPin) throw new BadRequestException('PIN not generated');
    if (order.deliveryPin !== pin) throw new BadRequestException('Invalid PIN');
    if ([OrderStatus.DELIVERED, OrderStatus.COMPLETED].includes(order.status)) throw new BadRequestException('Already delivered');

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.DELIVERED,
        deliveredAt: new Date(),
        events: {
          create: [
            { type: 'POD_PIN_VERIFIED', meta: { ok: true } },
            { type: 'STATUS', meta: { status: OrderStatus.DELIVERED } },
          ],
        },
      },
    });
  }

  async customerConfirmCompletion(user: { id: string; role: UserRole }, orderId: string) {
    if (user.role !== UserRole.CUSTOMER) throw new ForbiddenException('Only customers');
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (order.customerId !== user.id) throw new ForbiddenException();
    if (order.status !== OrderStatus.DELIVERED) throw new BadRequestException('Order not delivered');
    if (!order.finalFare) throw new BadRequestException('Final fare missing');
    if (!order.assignedDriverId) throw new BadRequestException('Driver missing');

    const rule = await this.prisma.commissionRule.findUnique({
      where: { cityId_truckType: { cityId: order.cityId, truckType: order.truckType } },
    });
    if (!rule) throw new NotFoundException('Commission rule not found');

    const computed = this.computeCommission(order.finalFare, rule.percent, rule.minCommission, rule.fixedFee);

    return this.prisma.$transaction(async (tx) => {
      const fresh = await tx.order.findUnique({ where: { id: orderId } });
      if (!fresh) throw new NotFoundException('Order not found');
      if (fresh.status === OrderStatus.COMPLETED) return fresh;
      if (fresh.status !== OrderStatus.DELIVERED) throw new BadRequestException('Order not delivered');

      // Cash payment (record-only)
      await tx.cashPayment.upsert({
        where: { orderId },
        create: {
          orderId,
          amount: fresh.finalFare!,
          collectedAt: new Date(),
          customerConfirmed: true,
        },
        update: { customerConfirmed: true },
      });

      // Commission record
      await tx.commission.upsert({
        where: { orderId },
        create: {
          orderId,
          driverId: fresh.assignedDriverId!,
          cityId: fresh.cityId,
          truckType: fresh.truckType,
          finalFare: fresh.finalFare!,
          percent: rule.percent,
          minCommission: rule.minCommission,
          fixedFee: rule.fixedFee,
          amount: computed,
        },
        update: { amount: computed },
      });

      const updated = await tx.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.COMPLETED,
          completedAt: new Date(),
          events: {
            create: [
              { type: 'CASH_COLLECTED', meta: { amount: fresh.finalFare } },
              { type: 'COMMISSION_CREATED', meta: { amount: computed } },
              { type: 'STATUS', meta: { status: OrderStatus.COMPLETED } },
            ],
          },
        },
      });
      return updated;
    });
  }

  private computeCommission(finalFare: number, percent: number, minCommission: number, fixedFee: number) {
    const pct = Math.ceil(finalFare * percent);
    return Math.max(minCommission, pct) + (fixedFee ?? 0);
  }

  private allowedDriverTransitions(current: OrderStatus): OrderStatus[] {
    switch (current) {
      case OrderStatus.ASSIGNED:
        return [OrderStatus.EN_ROUTE, OrderStatus.CANCELED];
      case OrderStatus.EN_ROUTE:
        return [OrderStatus.ARRIVED, OrderStatus.CANCELED];
      case OrderStatus.ARRIVED:
        return [OrderStatus.LOADING, OrderStatus.CANCELED];
      case OrderStatus.LOADING:
        return [OrderStatus.IN_TRANSIT, OrderStatus.CANCELED];
      case OrderStatus.IN_TRANSIT:
        return [OrderStatus.CANCELED]; // delivered handled via pin endpoint
      default:
        return [];
    }
  }

  private assertNegotiationBounds(estimatedFare: number, amount: number, minPct: number, maxPct: number) {
    const min = Math.floor(estimatedFare * (1 - minPct));
    const max = Math.ceil(estimatedFare * (1 + maxPct));
    if (amount < min || amount > max) {
      throw new BadRequestException(`Offer out of bounds. Allowed: ${min}..${max}`);
    }
  }

  private async assertOfferWindow(orderId: string) {
    const latest = await this.prisma.orderOffer.findFirst({ where: { orderId, status: OrderOfferStatus.PENDING }, orderBy: { createdAt: 'desc' } });
    if (!latest) return;
    if (latest.expiresAt.getTime() <= Date.now()) {
      await this.prisma.orderOffer.update({ where: { id: latest.id }, data: { status: OrderOfferStatus.EXPIRED } });
      throw new BadRequestException('Previous offer expired');
    }
  }

  private async assertCounterLimit(orderId: string, side: OfferSide, limit: number) {
    const count = await this.prisma.orderOffer.count({ where: { orderId, side } });
    if (count >= limit) throw new BadRequestException('Max counters reached');
  }
}
