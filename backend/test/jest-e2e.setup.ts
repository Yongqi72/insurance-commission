import * as bcrypt from 'bcrypt';

/**
 * e2e 测试专用环境变量：固定测试账号/密钥，非真实凭证，仅供 supertest 驱动内存 SQLite 库。
 * SH-TEST-01：测试数据库为独立库（此处为进程内内存库，天然与生产库隔离）。
 */
process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'sqlite';
process.env.JWT_SECRET = 'e2e-test-only-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.ADMIN_USERNAME = 'e2e-admin';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('e2e-Test-Only-Pwd', 10);
