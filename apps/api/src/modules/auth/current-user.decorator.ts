import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Returns the authenticated user injected by passport-jwt.
 *
 * Our JwtStrategy returns: { userId, role, adminRole }
 * This decorator normalizes it to: { id, role, adminRole }
 */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  const u = req.user as any;
  if (!u) return undefined;
  return { id: u.userId, role: u.role, adminRole: u.adminRole };
});
