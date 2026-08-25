import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';

function buildContext(headers: Record<string, string> = {}): ExecutionContext {
  const request = { headers };
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('JwtAuthGuard', () => {
  let reflector: Reflector;
  let jwtService: JwtService;
  let configService: ConfigService;
  let guard: JwtAuthGuard;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
    configService = {
      get: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;
    guard = new JwtAuthGuard(reflector, jwtService, configService);
  });

  it('@Public() 标注的路由直接放行，不校验 token', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
    const context = buildContext();

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('未标注 @Public() 且无 Authorization 头应抛出 401', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    const context = buildContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('Authorization 头非 Bearer 格式应抛出 401', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    const context = buildContext({ authorization: 'Basic abc123' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('token 校验失败应抛出 401', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    (jwtService.verifyAsync as jest.Mock).mockRejectedValue(
      new Error('invalid'),
    );
    const context = buildContext({ authorization: 'Bearer bad-token' });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('token 校验通过应放行并挂载 request.user', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
    (jwtService.verifyAsync as jest.Mock).mockResolvedValue({
      sub: 'admin',
      username: 'admin',
    });
    const context = buildContext({ authorization: 'Bearer good-token' });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    const request = context.switchToHttp().getRequest<{ user?: unknown }>();
    expect(request.user).toEqual({ sub: 'admin', username: 'admin' });
  });
});
