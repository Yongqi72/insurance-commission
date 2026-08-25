/**
 * 错误码约定，登记于 standards-shared.md SH-API-02。
 * 新增错误码须在该文档同步登记，不得散落各处。
 */
export enum ErrorCode {
  SUCCESS = 0,
  VALIDATION_FAILED = 1001,
  UNAUTHORIZED = 1002,
  FORBIDDEN = 1003,
  NOT_FOUND = 1004,
  CONFLICT = 1005,
  THIRD_PARTY_FAILED = 2001,
  INTERNAL_ERROR = 5000,
}
