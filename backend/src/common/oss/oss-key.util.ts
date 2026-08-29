import { randomUUID } from 'crypto';

/**
 * 生成按日期分层的 OSS 归档 key：
 * `bill/{category}/{yyyy}/{yyyyMM}/{yyyyMMdd}/{时间戳}-{随机短token}-{文件名}`。
 * 日期各字段取自调用时刻的本地时间（非 UTC），供账单导入/提成报表导出两处归档逻辑共用，
 * 避免各自内联拼接。随机短 token（8 位十六进制，来自 UUID v4 首段）用于消除"同一批次/
 * 同名批次在同一毫秒内两次并发归档"时 OSS 覆盖写语义带来的对象互相覆盖风险——仅靠时间戳
 * 精度不足以保证唯一，而 OSS `put()` 对同 key 是静默覆盖，不会报错提示冲突。
 */
export function buildDatedOssKey(
  category: 'upload' | 'export',
  fileName: string,
  now: Date = new Date(),
): string {
  const yyyy = String(now.getFullYear());
  const yyyyMM = yyyy + String(now.getMonth() + 1).padStart(2, '0');
  const yyyyMMdd = yyyyMM + String(now.getDate()).padStart(2, '0');
  const uniqueToken = randomUUID().split('-')[0];
  return `bill/${category}/${yyyy}/${yyyyMM}/${yyyyMMdd}/${now.getTime()}-${uniqueToken}-${fileName}`;
}
