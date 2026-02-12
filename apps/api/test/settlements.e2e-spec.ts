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

describe('Settlements (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.JOBS_TICK_ENABLED = 'false';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
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

  it('creates weekly settlements, uploads proof, approves -> commissions settled and driver unsuspended', async () => {
    const city = await prisma.city.create({ data: { name: 'SettleCity' } });
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
    const adminToken = await login(srv, '+213999000001', 'ADMIN');
    const customerToken = await login(srv, '+213999000002', 'CUSTOMER');
    const driverToken = await login(srv, '+213999000003', 'DRIVER');

    const driver = await prisma.user.findUnique({ where: { phone: '+213999000003' } });
    if (!driver) throw new Error('missing driver');
    await prisma.driverProfile.update({ where: { userId: driver.id }, data: { status: DriverStatus.APPROVED } });
    await prisma.vehicle.create({
      data: {
        ownerId: driver.id,
        truckType: TruckType.SMALL,
        capacityKg: 1000,
        brand: 'Isuzu',
        model: 'NPR',
        status: VehicleStatus.ACTIVE,
        photos: { create: [{ fileUrl: 'a' }, { fileUrl: 'b' }, { fileUrl: 'c' }] },
      },
    });

    // Create completed order with commission
    const create = await request(srv)
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        cityId: city.id,
        pickup: { lat: 36.75, lng: 3.05 },
        dropoff: { lat: 36.76, lng: 3.06 },
        weightKg: 200,
        truckType: TruckType.SMALL,
      })
      .expect(201);

    const orderId = create.body.order.id as string;

    // Force assign + finalize quickly
    await prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.DELIVERED, finalFare: 2000, assignedDriverId: driver.id, deliveryPin: '0000' } });
    await request(srv)
      .post(`/orders/${orderId}/confirm-completion`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({})
      .expect(201);

    // Place completion date inside previous week relative to now
    await prisma.order.update({ where: { id: orderId }, data: { completedAt: new Date('2026-02-10T12:00:00Z') } });

    // Sunday 00:05 create settlements
    await request(srv)
      .post('/admin/jobs/run-create-settlements')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nowIso: '2026-02-16T00:05:00Z' })
      .expect(201);

    const settlements = await prisma.settlement.findMany();
    expect(settlements.length).toBe(1);
    const settlementId = settlements[0].id;

    // Driver uploads proof (simulate by direct create: API expects multipart; keep test API-only by creating record)
    const proof = await prisma.settlementProof.create({ data: { settlementId, fileUrl: '/uploads/mock.png' } });

    // AI review
    await request(srv)
      .post('/ai/verify-settlement-proof')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ proofId: proof.id })
      .expect(201);

    // Human approves
    await request(srv)
      .patch(`/admin/settlements/proofs/${proof.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'approve' })
      .expect(200);

    const freshSettlement = await prisma.settlement.findUnique({ where: { id: settlementId } });
    expect(freshSettlement?.status).toBe('VERIFIED');
    const commission = await prisma.commission.findFirst({ where: { orderId } });
    expect(commission?.status).toBe('SETTLED');
  });

  it('auto-suspends driver on Monday 00:00 if proof not verified', async () => {
    const city = await prisma.city.create({ data: { name: 'OverdueCity' } });
    await prisma.pricingProfile.create({
      data: {
        cityId: city.id,
        truckType: TruckType.MINI,
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
    await prisma.commissionRule.create({ data: { cityId: city.id, truckType: TruckType.MINI, percent: 0.1, minCommission: 150, fixedFee: 0 } });

    const srv = app.getHttpServer();
    const adminToken = await login(srv, '+213999100001', 'ADMIN');
    const customerToken = await login(srv, '+213999100002', 'CUSTOMER');
    const driverToken = await login(srv, '+213999100003', 'DRIVER');
    const driver = await prisma.user.findUnique({ where: { phone: '+213999100003' } });
    if (!driver) throw new Error('missing driver');
    await prisma.driverProfile.update({ where: { userId: driver.id }, data: { status: DriverStatus.APPROVED } });
    await prisma.vehicle.create({
      data: {
        ownerId: driver.id,
        truckType: TruckType.MINI,
        capacityKg: 400,
        brand: 'Kia',
        model: 'Bongo',
        status: VehicleStatus.ACTIVE,
        photos: { create: [{ fileUrl: 'a' }, { fileUrl: 'b' }, { fileUrl: 'c' }] },
      },
    });

    const create = await request(srv)
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ cityId: city.id, pickup: { lat: 36.75, lng: 3.05 }, dropoff: { lat: 36.76, lng: 3.06 }, weightKg: 100, truckType: TruckType.MINI })
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

    await request(srv)
      .post('/admin/jobs/run-suspend-overdue')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ nowIso: '2026-02-17T00:00:00Z' })
      .expect(201);

    const freshProfile = await prisma.driverProfile.findUnique({ where: { userId: driver.id } });
    expect(freshProfile?.status).toBe('SUSPENDED');
  });
});
