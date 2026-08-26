import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config();

/**
 * TypeORM CLI 专用 DataSource（migration:run/migration:generate/migration:revert 依赖，
 * 见 backend/package.json scripts）。仅支撑 migration 体系，MySQL only——
 * 与 backend/src/config/typeorm.config.ts 的 mysql 分支参数保持一致，sqlite 分支
 * （本地开发/自动化测试路径，维持 synchronize:true）不接入本 DataSource（BE-DB-03）。
 * typeorm 实测安装版本 1.1.0，用现代 DataSource 构造函数 API（非旧式 createConnection）。
 */
// typeorm CLI（CommandUtils.loadDataSource）要求该文件对外只暴露唯一一个 DataSource 实例
// 的导出——不可再加 `export default`，否则同一实例被判定为「两个导出」而报错拒绝加载。
export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false,
});
