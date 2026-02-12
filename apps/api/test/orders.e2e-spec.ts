import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/modules/app.module';
import { PrismaClient, TruckType, VehicleStatus, DriverStatus, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

async function loginAs(server: any, phone: string, role: 'CUSTOMER' | 'DRIVER') {
  await request(server).post('/auth/request-otp').send({ phone });
  const res = await request(server)
    .post('/auth/verify-otp')
    .send({ phone, otp: '123456', role });
  return res.body.accessToken as string;
}

describe('Orders + Negotiation + Matching (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  beforeEach(async () => {
    // Clean tables used in this test
    await prisma.orderEvent.deleteMany();
    await prisma.commission.deleteMany();
    await prisma.cashPayment.deleteMany();
    await prisma.orderOffer.deleteMany();
    await prisma.order.deleteMany();
    await prisma.vehiclePhoto.deleteMany();
    await prisma.vehicle.deleteMany();
    await prisma.driverProfile.deleteMany();
    await prisma.user.deleteMany({ where: { role: { in: [UserRole.CUSTOMER, UserRole.DRIVER] } } });
    await prisma.pricingProfile.deleteMany();
    await prisma.commissionRule.deleteMany();
    await prisma.zone.deleteMany();
    await prisma.city.deleteMany();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('computes estimate and matches eligible drivers by capacity + >=3 photos', async () => {
    const city = await prisma.city.create({ data: { name: 'TestCity' } });
    await prisma.pricingProfile.create({
      data: {
        cityId: city.id,
        truckType: TruckType.SMALL,
        baseFee: 200,
        rateKm: 50,
        rateKg: 1,
        minFare: 300,
        maxFare: 200000,
        negotiateMinPct: 0.2,
        negotiateMaxPct: 0.3,
        offerTimeoutSec: 120,
        maxCountersPerSide: 3,
      },
    });
    await prisma.commissionRule.create({ data: { cityId: city.id, truckType: TruckType.SMALL, percent: 0.1, minCommission: 150, fixedFee: 0 } });

    const srv = app.getHttpServer();
    const customerToken = await loginAs(srv, '+213555000001', 'CUSTOMER');
    const driverToken = await loginAs(srv, '+213555000002', 'DRIVER');

    const driver = await prisma.user.findUnique({ where: { phone: '+213555000002' } });
    if (!driver) throw new Error('driver missing');
    await prisma.driverProfile.update({ where: { userId: driver.id }, data: { status: DriverStatus.APPROVED } });

    // Create ACTIVE vehicle with 3 photos and enough capacity
    const vehicle = await prisma.vehicle.create({
      data: {
        ownerId: driver.id,
        truckType: TruckType.SMALL,
        capacityKg: 800,
        brand: 'Toyota',
        model: 'Dyna',
        status: VehicleStatus.ACTIVE,
        photos: { create: [{ fileUrl: 'u1' }, { fileUrl: 'u2' }, { fileUrl: 'u3' }] },
      },
    });
    expect(vehicle.id).toBeTruthy();

    // Put driver online + location near pickup
    await request(app.getHttpServer())
      .post('/driver/online')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cityId: city.id, isOnline: true })
      .expect(201);

    await request(app.getHttpServer())
      .post('/driver/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 36.75, lng: 3.05, accuracy: 5 })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        cityId: city.id,
        pickup: { lat: 36.7525, lng: 3.04197 },
        dropoff: { lat: 36.77, lng: 3.06 },
        weightKg: 500,
        truckType: TruckType.SMALL,
      })
      .expect(201);

    expect(res.body.order.estimatedFare).toBeGreaterThan(0);
    expect(res.body.matchedDriverIds).toContain(driver.id);

    const res2 = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        cityId: city.id,
        pickup: { lat: 36.7525, lng: 3.04197 },
        dropoff: { lat: 36.77, lng: 3.06 },
        weightKg: 1200,
        truckType: TruckType.SMALL,
      })
      .expect(201);
    expect(res2.body.matchedDriverIds).not.toContain(driver.id);
  });

  it('supports negotiation and locks final fare on acceptance (single winner)', async () => {
    const city = await prisma.city.create({ data: { name: 'TestCity2' } });
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

    await prisma.commissionRule.create({
      data: { cityId: city.id, truckType: TruckType.MINI, percent: 0.1, minCommission: 150, fixedFee: 0 },
    });
    await prisma.commissionRule.create({ data: { cityId: city.id, truckType: TruckType.MINI, percent: 0.1, minCommission: 150, fixedFee: 0 } });

    const srv = app.getHttpServer();
    const customerToken = await loginAs(srv, '+213555000101', 'CUSTOMER');
    const driverToken = await loginAs(srv, '+213555000102', 'DRIVER');
    const driver = await prisma.user.findUnique({ where: { phone: '+213555000102' } });
    if (!driver) throw new Error('driver missing');
    await prisma.driverProfile.update({ where: { userId: driver.id }, data: { status: DriverStatus.APPROVED } });
    await prisma.vehicle.create({
      data: {
        ownerId: driver.id,
        truckType: TruckType.MINI,
        capacityKg: 300,
        brand: 'Hyundai',
        model: 'Porter',
        status: VehicleStatus.ACTIVE,
        photos: { create: [{ fileUrl: 'p1' }, { fileUrl: 'p2' }, { fileUrl: 'p3' }] },
      },
    });

    await request(app.getHttpServer())
      .post('/driver/online')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ cityId: city.id, isOnline: true })
      .expect(201);
    await request(app.getHttpServer())
      .post('/driver/location')
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ lat: 36.75, lng: 3.05 })
      .expect(201);

    const create = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        cityId: city.id,
        pickup: { lat: 36.7525, lng: 3.04197 },
        dropoff: { lat: 36.77, lng: 3.06 },
        weightKg: 200,
        truckType: TruckType.MINI,
      })
      .expect(201);
    const orderId = create.body.order.id as string;
    const est = create.body.order.estimatedFare as number;

    const customerOfferAmt = Math.floor(est * 1.05);
    const o1 = await request(app.getHttpServer())
      .post(`/orders/${orderId}/offers/customer`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ amount: customerOfferAmt })
      .expect(201);

    const driverCounterAmt = Math.floor(est * 1.1);
    const o2 = await request(app.getHttpServer())
      .post(`/orders/${orderId}/offers/driver`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ amount: driverCounterAmt })
      .expect(201);

    const accepted = await request(app.getHttpServer())
      .post(`/orders/${orderId}/accept-offer`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ offerId: o2.body.id })
      .expect(201);
    expect(accepted.body.finalFare).toBe(driverCounterAmt);
    expect(accepted.body.status).toBe('ASSIGNED');

    // Second acceptance must fail
    await request(app.getHttpServer())
      .post(`/orders/${orderId}/accept-offer`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ offerId: o1.body.id })
      .expect(400);
  });

  it('completes order with POD PIN, records cash payment and computes commission (>=150 DZD)', async () => {
    const city = await prisma.city.create({ data: { name: 'TestCity3' } });
    await prisma.pricingProfile.create({
      data: {
        cityId: city.id,
        truckType: TruckType.SMALL,
        baseFee: 0,
        rateKm: 0,
        rateKg: 0,
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
    const customerToken = await loginAs(srv, '+213555000201', 'CUSTOMER');
    const driverToken = await loginAs(srv, '+213555000202', 'DRIVER');
    const driver = await prisma.user.findUnique({ where: { phone: '+213555000202' } });
    if (!driver) throw new Error('driver missing');
    await prisma.driverProfile.update({ where: { userId: driver.id }, data: { status: DriverStatus.APPROVED } });
    await prisma.vehicle.create({
      data: {
        ownerId: driver.id,
        truckType: TruckType.SMALL,
        capacityKg: 1000,
        brand: 'Isuzu',
        model: 'NPR',
        status: VehicleStatus.ACTIVE,
        photos: { create: [{ fileUrl: 'p1' }, { fileUrl: 'p2' }, { fileUrl: 'p3' }] },
      },
    });

    await request(srv).post('/driver/online').set('Authorization', `Bearer ${driverToken}`).send({ cityId: city.id, isOnline: true }).expect(201);
    await request(srv).post('/driver/location').set('Authorization', `Bearer ${driverToken}`).send({ lat: 36.75, lng: 3.05 }).expect(201);

    const create = await request(srv)
      .post('/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        cityId: city.id,
        pickup: { lat: 36.7525, lng: 3.04197 },
        dropoff: { lat: 36.77, lng: 3.06 },
        weightKg: 200,
        truckType: TruckType.SMALL,
      })
      .expect(201);
    const orderId = create.body.order.id as string;

    // Driver offers 1000, customer accepts -> finalFare=1000
    const driverOffer = await request(srv)
      .post(`/orders/${orderId}/offers/driver`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ amount: 1000 })
      .expect(201);

    await request(srv)
      .post(`/orders/${orderId}/accept-offer`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ offerId: driverOffer.body.id })
      .expect(201);

    // Driver arrives -> PIN generated
    await request(srv)
      .patch(`/orders/${orderId}/driver-status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'EN_ROUTE' })
      .expect(200);

    await request(srv)
      .patch(`/orders/${orderId}/driver-status`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ status: 'ARRIVED' })
      .expect(200);

    const pinRes = await request(srv)
      .get(`/orders/${orderId}/pod-pin`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);
    const pin = pinRes.body.pin as string;
    expect(pin).toMatch(/^\d{4}$/);

    await request(srv)
      .post(`/orders/${orderId}/deliver`)
      .set('Authorization', `Bearer ${driverToken}`)
      .send({ pin })
      .expect(201);

    await request(srv)
      .post(`/orders/${orderId}/confirm-completion`)
      .set('Authorization', `Bearer ${customerToken}`)
      .send({})
      .expect(201);

    const cash = await prisma.cashPayment.findUnique({ where: { orderId } });
    expect(cash?.amount).toBe(1000);
    expect(cash?.customerConfirmed).toBe(true);

    const comm = await prisma.commission.findUnique({ where: { orderId } });
    expect(comm?.amount).toBe(150); // 10% of 1000=100, min is 150
  });

});
