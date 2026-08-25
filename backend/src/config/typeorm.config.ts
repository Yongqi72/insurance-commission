import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * 数据源配置：生产/正式部署走 MySQL（DB_TYPE=mysql），
 * 本地开发与自动化测试走 SQLite（DB_TYPE=sqlite，默认值；测试环境固定用内存库）。
 * 两者共用同一套 Entity 定义，仅 DataSource 配置按环境变量切换驱动——
 * 这是当前沙箱环境无 Docker/本地 MySQL 服务的权宜之计，不是撤销"生产用 MySQL"的决策。
 */
export function buildTypeOrmOptions(
  configService: ConfigService,
): TypeOrmModuleOptions {
  const dbType = configService.get<string>('DB_TYPE', 'sqlite');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  if (dbType === 'mysql') {
    return {
      type: 'mysql',
      host: configService.get<string>('DB_HOST', 'localhost'),
      port: configService.get<number>('DB_PORT', 3306),
      username: configService.get<string>('DB_USERNAME'),
      password: configService.get<string>('DB_PASSWORD'),
      database: configService.get<string>('DB_DATABASE'),
      autoLoadEntities: true,
      // 生产环境应改走 migration；V0 走骨架阶段尚未建 migration 体系，见完成报告 deviations。
      synchronize: !isProduction,
    };
  }

  return {
    type: 'better-sqlite3',
    database: isTest
      ? ':memory:'
      : configService.get<string>('DB_SQLITE_PATH', './data/dev.sqlite'),
    autoLoadEntities: true,
    synchronize: true,
  };
}
