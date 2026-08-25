/**
 * 错误码约定，见 standards-shared.md SH-API-02；须与后端 backend/src/common/constants/error-code.enum.ts 保持一致。
 * 用 const 对象而非 enum：项目 tsconfig 开启 erasableSyntaxOnly（TS 6 类型剥离模式），禁止生成运行时代码的 enum 语法。
 */
export const ErrorCode = {
  SUCCESS: 0,
  VALIDATION_FAILED: 1001,
  UNAUTHORIZED: 1002,
  FORBIDDEN: 1003,
  NOT_FOUND: 1004,
  CONFLICT: 1005,
  THIRD_PARTY_FAILED: 2001,
  INTERNAL_ERROR: 5000,
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]
