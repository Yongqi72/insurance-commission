/**
 * 生成按日期分层的 OSS 归档 key：`bill/{category}/{yyyy}/{yyyyMM}/{yyyyMMdd}/{时间戳}-{文件名}`。
 * 日期各字段取自调用时刻的本地时间（非 UTC），供账单导入/提成报表导出两处归档逻辑共用，
 * 避免各自内联拼接。
 */
export function buildDatedOssKey(
  category: 'upload' | 'export',
  fileName: string,
  now: Date = new Date(),
): string {
  const yyyy = String(now.getFullYear());
  const yyyyMM = yyyy + String(now.getMonth() + 1).padStart(2, '0');
  const yyyyMMdd = yyyyMM + String(now.getDate()).padStart(2, '0');
  return `bill/${category}/${yyyy}/${yyyyMM}/${yyyyMMdd}/${now.getTime()}-${fileName}`;
}
