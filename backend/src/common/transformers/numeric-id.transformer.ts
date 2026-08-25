import { ValueTransformer } from 'typeorm';

/**
 * 自增主键跨驱动统一序列化为 string（standards-shared.md 序列化约定：ID 统一 string）。
 * 未对主键列声明 type: 'bigint'：SQLite 的 AUTOINCREMENT 只允许出现在 INTEGER PRIMARY KEY
 * 上（`AUTOINCREMENT is only allowed on an INTEGER PRIMARY KEY`），bigint 主键自增在 SQLite
 * 驱动下建表会失败；用默认自增整数列 + 本 transformer 换取跨 MySQL/SQLite 两驱动的可移植性，
 * 该列本身不是 BE-TYPEORM-02 所指的 BIGINT 列，故不适用该规则，仅在此处对齐序列化约定。
 */
export const numericIdTransformer: ValueTransformer = {
  to: (value?: string | number | null) => value,
  from: (value?: string | number | null) => {
    if (value === null || value === undefined) {
      return value;
    }
    return String(value);
  },
};
