import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { loadEnv } from '../../config/env';
import { UserRole } from '@prisma/client';
import * as crypto from 'crypto';

const env = loadEnv();

type OtpRecord = { otpHash: string; expiresAt: number };

@Injectable()
export class AuthService {
  private otpStore = new Map<string, OtpRecord>();

  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) {}

  async requestOtp(phone: string) {
    const otp = '123456'; // dev stub
    const otpHash = this.hashOtp(otp);
    this.otpStore.set(phone, { otpHash, expiresAt: Date.now() + 5 * 60 * 1000 });
    return { ok: true, devOtp: otp };
  }

  async verifyOtp(phone: string, otp: string, role?: 'CUSTOMER' | 'DRIVER' | 'ADMIN') {
    const rec = this.otpStore.get(phone);
    const valid = otp === '123456' || (!!rec && rec.expiresAt > Date.now() && rec.otpHash === this.hashOtp(otp));
    if (!valid) throw new UnauthorizedException('Invalid OTP');

    const desiredRole = role === 'ADMIN' ? UserRole.ADMIN : role === 'DRIVER' ? UserRole.DRIVER : UserRole.CUSTOMER;

    const user = await this.prisma.user.upsert({
      where: { phone },
      update: {},
      create: { phone, role: desiredRole, adminRole: desiredRole === UserRole.ADMIN ? 'SUPERADMIN' : undefined },
    });

    let finalUser = user;
    if (user.role !== desiredRole && user.role !== UserRole.ADMIN) {
      // allow promoting CUSTOMER->DRIVER for dev/testing
      finalUser = await this.prisma.user.update({ where: { id: user.id }, data: { role: desiredRole } });
    }

    // Block auth for banned/suspended accounts
    if (finalUser.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account not active');
    }

    if (desiredRole === UserRole.DRIVER) {
      await this.prisma.driverProfile.upsert({
        where: { userId: finalUser.id },
        update: {},
        create: { userId: finalUser.id },
      });
    }

    const accessToken = this.jwt.sign({ sub: finalUser.id, role: finalUser.role, adminRole: finalUser.adminRole });
    const refreshToken = this.signRefresh(finalUser.id);
    return { accessToken, refreshToken, user: { id: finalUser.id, phone: finalUser.phone, role: finalUser.role, adminRole: finalUser.adminRole } };
  }

  async refresh(refreshToken: string) {
    let decoded: any;
    try {
      decoded = this.jwt.verify(refreshToken, { secret: env.JWT_REFRESH_SECRET });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const user = await this.prisma.user.findUnique({ where: { id: decoded.sub } });
    if (!user) throw new UnauthorizedException('Unknown user');
    if (user.status !== 'ACTIVE') throw new UnauthorizedException('Account not active');
    const accessToken = this.jwt.sign({ sub: user.id, role: user.role, adminRole: user.adminRole });
    return { accessToken };
  }

  private signRefresh(userId: string) {
    return this.jwt.sign({ sub: userId, typ: 'refresh' }, { secret: env.JWT_REFRESH_SECRET, expiresIn: '30d' });
  }

  private hashOtp(otp: string) {
    return crypto.createHash('sha256').update(`${env.HASH_PEPPER}:${otp}`).digest('hex');
  }
}
