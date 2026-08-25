import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const adminUsername = 'admin';
  let adminPasswordHash: string;
  let jwtService: JwtService;
  let configService: ConfigService;
  let service: AuthService;

  beforeAll(async () => {
    adminPasswordHash = await bcrypt.hash('unit-test-only-pwd', 10);
  });

  beforeEach(() => {
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-jwt'),
    } as unknown as JwtService;
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'ADMIN_USERNAME') return adminUsername;
        if (key === 'ADMIN_PASSWORD_HASH') return adminPasswordHash;
        return undefined;
      }),
    } as unknown as ConfigService;
    service = new AuthService(jwtService, configService);
  });

  it('账号密码正确时返回 accessToken', async () => {
    const result = await service.login({
      username: adminUsername,
      password: 'unit-test-only-pwd',
    });

    expect(result).toEqual({ accessToken: 'signed-jwt' });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: adminUsername,
      username: adminUsername,
    });
  });

  it('账号不存在时抛出 401', async () => {
    await expect(
      service.login({ username: 'nobody', password: 'unit-test-only-pwd' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('密码错误时抛出 401', async () => {
    await expect(
      service.login({ username: adminUsername, password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('未配置管理员账号时抛出 500', async () => {
    (configService.get as jest.Mock).mockReturnValue(undefined);

    await expect(
      service.login({
        username: adminUsername,
        password: 'unit-test-only-pwd',
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });
});
