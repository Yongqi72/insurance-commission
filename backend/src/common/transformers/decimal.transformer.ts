import { ValueTransformer } from 'typeorm';

/**
 * decimal 列跨驱动（MySQL / sqlite）读取类型不一致（可能为 string），
 * 统一转换为 number，落地 standards-shared.md 序列化约定：金额为 number（元，两位小数）。
 */
export const decimalTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) => {
    if (value === null || value === undefined) {
      return value;
    }
    return typeof value === 'number' ? value : parseFloat(value);
  },
};
