import type { Request } from 'express';

/** 操作人取自当前登录管理员（JwtAuthGuard 校验通过后挂载的 request.user，见该 Guard 注释）。 */
export function extractOperator(request: Request): string {
  const user = (request as Request & { user?: { username?: string } }).user;
  return user?.username ?? 'unknown';
}
