import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import type { StringValue } from 'ms';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>(
            'JWT_EXPIRES_IN',
            '8h',
          ) as StringValue,
        },
      }),
    }),
    // 登录接口限流（ic-b-022）：60 秒窗口内最多 5 次请求，按客户端 IP 区分（ThrottlerGuard 默认键）；
    // 局部挂载于 AuthController.login()，不做账号级永久锁定，窗口过后自动恢复。
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 5 }]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
