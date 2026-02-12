import { PrismaClient, TruckType, UserRole, UserStatus, AdminRole } from '@prisma/client';

const prisma = new PrismaClient();

function rectPolygon(lng1: number, lat1: number, lng2: number, lat2: number) {
  // GeoJSON Polygon expects [lng,lat]
  return {
    type: 'Polygon' as const,
    coordinates: [
      [
        [lng1, lat1],
        [lng2, lat1],
        [lng2, lat2],
        [lng1, lat2],
        [lng1, lat1],
      ],
    ],
  };
}

async function main() {
  const cities = [
    { name: 'Alger', rect: rectPolygon(2.9, 36.65, 3.25, 36.9) },
    { name: 'Oran', rect: rectPolygon(-0.75, 35.60, -0.45, 35.78) },
    { name: 'Constantine', rect: rectPolygon(6.55, 36.25, 6.75, 36.42) },
  ];

  for (const c of cities) {
    const city = await prisma.city.upsert({
      where: { name: c.name },
      update: {},
      create: { name: c.name },
    });

    await prisma.zone.upsert({
      where: { cityId_name: { cityId: city.id, name: `${c.name} Center` } },
      update: { polygon: c.rect },
      create: { cityId: city.id, name: `${c.name} Center`, polygon: c.rect },
    });

    for (const tt of Object.values(TruckType)) {
      await prisma.pricingProfile.upsert({
        where: { cityId_truckType: { cityId: city.id, truckType: tt } },
        update: {},
        create: {
          cityId: city.id,
          truckType: tt,
          baseFee: 500,
          rateKm: 35,
          rateKg: 0,
          minFare: 600,
          maxFare: 20000,
          negotiateMinPct: 0.20,
          negotiateMaxPct: 0.30,
          offerTimeoutSec: 120,
          maxCountersPerSide: 3,
        },
      });

      await prisma.commissionRule.upsert({
        where: { cityId_truckType: { cityId: city.id, truckType: tt } },
        update: {},
        create: {
          cityId: city.id,
          truckType: tt,
          percent: 0.10,
          minCommission: 150,
          fixedFee: 0,
        },
      });
    }
  }

  await prisma.user.upsert({
    where: { phone: '+213000000000' },
    update: { role: UserRole.ADMIN, adminRole: AdminRole.SUPERADMIN, status: UserStatus.ACTIVE },
    create: {
      phone: '+213000000000',
      role: UserRole.ADMIN,
      adminRole: AdminRole.SUPERADMIN,
      status: UserStatus.ACTIVE,
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
