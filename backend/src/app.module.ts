import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { PolicyRecordModule } from './policy-record/policy-record.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SuccessInterceptor } from './common/interceptors/success.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { buildTypeOrmOptions } from './config/typeorm.config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildTypeOrmOptions,
    }),
    AuthModule,
    PolicyRecordModule,
  ],
  providers: [
    // 全局鉴权卫士（SH-AUTH-01）：默认拦截全部路由，@Public() 显式 opt-out
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // 全局异常过滤器（SH-API-01）：统一错误信封
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // 全局响应拦截器（SH-API-01）：统一成功信封
    { provide: APP_INTERCEPTOR, useClass: SuccessInterceptor },
  ],
})
export class AppModule {}
