import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ErrorCode } from '../constants/error-code.enum';

/**
 * 全局异常过滤器（SH-API-01）：统一返回 { code, msg, data: null }，
 * HTTP 状态码按异常类型映射；非 HttpException 视为服务器内部错误，
 * 记录完整原因（BE-LOG-01），不向客户端泄露堆栈细节。
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ErrorCode.INTERNAL_ERROR;
    let msg = '服务器内部错误';

    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      msg = this.extractMessage(exception.getResponse(), exception.message);
      code = this.mapStatusToCode(httpStatus);
      if (httpStatus >= 500) {
        this.logger.error(msg, exception.stack);
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    } else {
      this.logger.error(`未知异常：${JSON.stringify(exception)}`);
    }

    response.status(httpStatus).json({ code, msg, data: null });
  }

  private extractMessage(res: unknown, fallback: string): string {
    if (typeof res === 'string') {
      return res;
    }
    if (res && typeof res === 'object' && 'message' in res) {
      const m = (res as { message: unknown }).message;
      return Array.isArray(m) ? m.join('; ') : String(m);
    }
    return fallback;
  }

  private mapStatusToCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCode.CONFLICT;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return ErrorCode.RULE_INCOMPLETE;
      default:
        return status >= 500
          ? ErrorCode.INTERNAL_ERROR
          : ErrorCode.VALIDATION_FAILED;
    }
  }
}
