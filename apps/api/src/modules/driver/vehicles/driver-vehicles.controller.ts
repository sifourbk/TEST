import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../auth/guards';
import { CurrentUser } from '../../auth/current-user.decorator';
import { DriverVehiclesService } from './driver-vehicles.service';
import { z } from 'zod';
import { extname } from 'path';
import { diskStorage } from 'multer';

const createVehicleSchema = z.object({
  truckType: z.enum(['MINI', 'SMALL', 'MEDIUM', 'LARGE']),
  capacityKg: z.number().int().positive(),
  brand: z.string().min(1),
  model: z.string().min(1),
});

@Controller('driver/vehicles')
@UseGuards(JwtAuthGuard)
export class DriverVehiclesController {
  constructor(private readonly svc: DriverVehiclesService) {}

  @Get('me')
  async listMine(@CurrentUser() user: { id: string; role: string }) {
    return this.svc.listMine(user.id);
  }

  @Post()
  async create(
    @CurrentUser() user: { id: string; role: string },
    @Body() body: any,
  ) {
    if (user.role !== 'DRIVER') throw new BadRequestException('Only drivers can create vehicles');
    const parsed = createVehicleSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
    return this.svc.create(user.id, parsed.data as any);
  }

  @Post(':vehicleId/photos')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      storage: diskStorage({
        destination: process.env.STORAGE_LOCAL_DIR || './uploads',
        filename: (_req, file, cb) => {
          const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${unique}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images allowed'), false);
        cb(null, true);
      },
    }),
  )
  async uploadPhotos(
    @CurrentUser() user: { id: string; role: string },
    @Param('vehicleId') vehicleId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (user.role !== 'DRIVER') throw new BadRequestException('Only drivers can upload vehicle photos');
    if (!files?.length) throw new BadRequestException('No files uploaded');
    const urls = files.map((f) => `/uploads/${f.filename}`);
    return this.svc.addPhotos(user.id, vehicleId, urls);
  }

  @Patch(':vehicleId/submit')
  async submit(
    @CurrentUser() user: { id: string; role: string },
    @Param('vehicleId') vehicleId: string,
  ) {
    if (user.role !== 'DRIVER') throw new BadRequestException('Only drivers can submit vehicles');
    return this.svc.submitForVerification(user.id, vehicleId);
  }
}
