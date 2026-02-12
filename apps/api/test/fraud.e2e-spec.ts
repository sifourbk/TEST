import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/modules/app.module';
import { PrismaClient, TruckType, VehicleStatus, DriverStatus, UserRole, OrderStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function login(server: any, phone: string, role: 'CUSTOMER' | 'DRIVER' | 'ADMIN') {
  await request(server).post('/auth/request-otp').send({ phone });
  const res = await request(server).post('/auth/verify-otp').send({ phone, otp: '123456', role });
  return res.body.accessToken as string;
}

describe('Fraud -> Ban + Penalty (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JOBS_TICK_ENABLED = 'false';
    process.env.HASH_PEPPER = process.env.HASH_PEPPER || 'dev-pepper';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    await prisma.ban.deleteMany();
    await prisma.penaltyInvoice.deleteMany();
    await prisma.settlementProof.deleteMany();
    await prisma.settlement.deleteMany();
    await prisma.commission.deleteMany();
    await prisma.cashPayment.deleteMany();
    await prisma.orderEvent.deleteMany();
    await prisma.orderOffer.deleteMany();
    await prisma.order.deleteMany();
    await prisma.vehiclePhoto.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.driverProfile.deleteMany();
    await prisma.user.deleteMany({ where: { role: { in: [UserRole.CUSTOMER, UserRole.DRIVER, UserRole.ADMIN] } } });
    await prisma.pricingProfile.deleteMany();
    await prisma.commissionRule.deleteMany();
    await prisma.zone.deleteMany();
    await prisma.city.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('fraud settlement proof bans driver and creates 10x penalty; unban requires paid penalty + superadmin lift', async () => {
    const city = await prisma.city.create({ data: { name: 'FraudCity' } });
    await prisma.pricingProfile.create({
      data: {
        cityId: city.id,
        truckType: TruckType.SMALL,
        baseFee: 200,
        rateKm: 10,
        rateKg: 1,
        minFare: 200,
        maxFare: 200000,
        negotiateMinPct: 0.2,
        negotiateMaxPct: 0.3,
        offerTimeoutSec: 120,
        maxCountersPerSide: 3,
      },
    });
    await prisma.commissionRule.create({ data: { cityId: city.id, truckType: TruckType.SMALL, percent: 0.1, minCommission: 150, fixedFee: 0 } });

    const srv = app.getHttpServer();
    const adminToken = await login(srv, '+213700000001', 'ADMIN');
    const customerToken = await login(srv, '+213700000002', 'CUSTOMER');
    const driverToken = await login(srv, '+213700000003', 'DRIVER');

    const driver = await prisma.user.findUnique({ where: { phone: '+213700000003' } });
    if (!driver) throw new Error('missing driver');
    await prisma.driverProfile.update({ where: { userId: driver.id }, data: { status: DriverStatus.APPROVED, licenseHash: 'lh' } });
    await prisma.vehicle.create({
      data: {
        ownerId: driver.id,
        truckType: TruckType.SMALL,
        capacityKg: 1000,
        brand: 'Isuzu',
        model: 'NPR',
        registrationHash: 'rh',
        status: VehicleStatus.ACTIVE,
        photos: { create: [{ fileUrl: 'a' }, { fileUrl: 'b' }, { fileUrl: 'c' }] },
      },
    });

    const create = await request(srv)
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ cityId: city.id, pickup: { lat: 36.75, lng: 3.05 }, dropoff: { lat: 36.76, lng: 3.06 }, weightKg: 200, truckType: TruckType.SMALL })
      .expect(201);
    const orderId = create.body.order.id as string;

    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.DELIVERED, finalFare: 2000, assignedDriverId: driver.id, deliveryPin: '0000' } });
    await request(srv).post(`/orders/${orderId}/confirm-completion`).set('Authorization', `Bearer ${customerToken}`).send({}).expect(201);
    await prisma.order.update({ where: { id: orderId }, data: { completedAt: new Date('2026-02-10T12:00:00Z') } });

    await request(srv)
      .post('/admin/jobs/run-create-settlements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nowIso: '2026-02-16T00:05:00Z' })
      .expect(201);

    const settlement = await prisma.settlement.findFirst({ where: { driverId: driver.id } });
    if (!settlement) throw new Error('missing settlement');
    const proof = await prisma.settlementProof.create({ data: { settlementId: settlement.id, fileUrl: '/uploads/p.png' } });

    await request(srv)
      .patch(`/admin/settlements/proofs/${proof.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'fraud' })
      .expect(200);

    const bannedUser = await prisma.user.findUnique({ where: { id: driver.id } });
    expect(bannedUser?.status).toBe('BANNED');
    const ban = await prisma.ban.findFirst({ where: { userId: driver.id, isActive: true } });
    expect(ban).toBeTruthy();
    expect(ban?.licenseHash).toBe('lh');
    expect(ban?.registrationHash).toBe('rh');

    const penalty = await prisma.penaltyInvoice.findFirst({ where: { userId: driver.id } });
    expect(penalty?.amount).toBe(settlement.amountDue * 10);
    expect(penalty?.status).toBe('UNPAID');

    // lifting ban should fail until penalty is paid
    const liftFail = await request(srv)
      .patch(`/admin/bans/${ban!.id}/lift`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(400);
    expect(liftFail.body.message).toContain('unpaid');

    await request(srv)
      .patch(`/admin/penalties/${penalty!.id}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ proofUrl: '/uploads/paid.png' })
      .expect(200);

    await request(srv)
      .patch(`/admin/bans/${ban!.id}/lift`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    const unbannedUser = await prisma.user.findUnique({ where: { id: driver.id } });
    expect(unbannedUser?.status).toBe('ACTIVE');
  });
});
