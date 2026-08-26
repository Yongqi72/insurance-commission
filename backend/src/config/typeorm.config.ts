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
      // migrations 路径与 CLI 专用 DataSource（src/config/data-source.ts）保持一致（BE-DB-03）；
      // 不设 migrationsRun——按 package.json migration:run 脚本手动执行，不随应用启动静默跑迁移。
      migrations: [__dirname + '/../migrations/*{.ts,.js}'],
      synchronize: false,
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
