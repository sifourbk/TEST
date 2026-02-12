import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TruckType, VehicleStatus } from '@prisma/client';

@Injectable()
export class DriverVehiclesService {
  constructor(private prisma: PrismaService) {}

  listMine(userId: string) {
    return this.prisma.vehicle.findMany({
      where: { ownerId: userId },
      include: { photos: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, input: { truckType: TruckType; capacityKg: number; brand: string; model: string }) {
    if (!input.capacityKg || input.capacityKg <= 0) throw new BadRequestException('capacityKg required');
    if (!input.brand?.trim()) throw new BadRequestException('brand required');
    if (!input.model?.trim()) throw new BadRequestException('model required');
    return this.prisma.vehicle.create({
      data: {
        ownerId: userId,
        truckType: input.truckType,
        capacityKg: input.capacityKg,
        brand: input.brand.trim(),
        model: input.model.trim(),
        status: VehicleStatus.DRAFT,
      },
      include: { photos: true },
    });
  }

  async addPhotos(userId: string, vehicleId: string, fileUrls: string[]) {
    const v = await this.prisma.vehicle.findFirst({ where: { id: vehicleId, ownerId: userId } });
    if (!v) throw new BadRequestException('Vehicle not found');
    if (fileUrls.length === 0) throw new BadRequestException('No files');
    await this.prisma.vehiclePhoto.createMany({
      data: fileUrls.map((fileUrl) => ({ vehicleId, fileUrl })),
    });
    return this.prisma.vehicle.findUnique({ where: { id: vehicleId }, include: { photos: true } });
  }

  async submitForVerification(userId: string, vehicleId: string) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, ownerId: userId },
      include: { photos: true },
    });
    if (!vehicle) throw new BadRequestException('Vehicle not found');
    if (vehicle.photos.length < 3) throw new BadRequestException('Minimum 3 photos required');
    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status: VehicleStatus.PENDING },
      include: { photos: true },
    });
  }
}
