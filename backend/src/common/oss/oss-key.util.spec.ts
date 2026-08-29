import { buildDatedOssKey } from './oss-key.util';

function buildRegex(prefix: string, timestamp: number, fileName: string): RegExp {
  const escapedFileName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${prefix}/${timestamp}-[0-9a-f]{8}-${escapedFileName}$`);
}

describe('buildDatedOssKey', () => {
  it('月/日均为两位数时不补零', () => {
    const now = new Date(2026, 10, 23, 8, 0, 0); // 2026-11-23
    expect(buildDatedOssKey('upload', 'a.xlsx', now)).toMatch(
      buildRegex('bill/upload/2026/202611/20261123', now.getTime(), 'a.xlsx'),
    );
  });

  it('月为个位数时补零到两位', () => {
    const now = new Date(2026, 0, 23, 8, 0, 0); // 2026-01-23
    expect(buildDatedOssKey('upload', 'a.xlsx', now)).toMatch(
      buildRegex('bill/upload/2026/202601/20260123', now.getTime(), 'a.xlsx'),
    );
  });

  it('日为个位数时补零到两位', () => {
    const now = new Date(2026, 10, 5, 8, 0, 0); // 2026-11-05
    expect(buildDatedOssKey('upload', 'a.xlsx', now)).toMatch(
      buildRegex('bill/upload/2026/202611/20261105', now.getTime(), 'a.xlsx'),
    );
  });

  it('月、日均为个位数时同时补零', () => {
    const now = new Date(2026, 0, 5, 8, 0, 0); // 2026-01-05
    expect(buildDatedOssKey('upload', 'a.xlsx', now)).toMatch(
      buildRegex('bill/upload/2026/202601/20260105', now.getTime(), 'a.xlsx'),
    );
  });

  it('12 月 31 日边界：月、日均为两位数', () => {
    const now = new Date(2026, 11, 31, 23, 59, 59); // 2026-12-31
    expect(buildDatedOssKey('export', 'b.xlsx', now)).toMatch(
      buildRegex('bill/export/2026/202612/20261231', now.getTime(), 'b.xlsx'),
    );
  });

  it('category=export 时写入 export 段', () => {
    const now = new Date(2026, 5, 15);
    expect(buildDatedOssKey('export', '报表.xlsx', now)).toMatch(
      buildRegex('bill/export/2026/202606/20260615', now.getTime(), '报表.xlsx'),
    );
  });

  it('同一毫秒内连续两次调用生成不同 key（随机 token 消除碰撞）', () => {
    const now = new Date(2026, 5, 15);
    const key1 = buildDatedOssKey('export', 'c.xlsx', now);
    const key2 = buildDatedOssKey('export', 'c.xlsx', now);
    expect(key1).not.toBe(key2);
  });
});
