import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RequestOtpSchema, VerifyOtpSchema, RefreshSchema } from './dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('request-otp')
  async requestOtp(@Body() body: unknown) {
    const dto = RequestOtpSchema.parse(body);
    return this.auth.requestOtp(dto.phone);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() body: unknown) {
    const dto = VerifyOtpSchema.parse(body);
    return this.auth.verifyOtp(dto.phone, dto.otp, dto.role);
  }

  @Post('refresh')
  async refresh(@Body() body: unknown) {
    const dto = RefreshSchema.parse(body);
    return this.auth.refresh(dto.refreshToken);
  }
}
