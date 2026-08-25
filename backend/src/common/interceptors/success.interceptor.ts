import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 全局响应拦截器（SH-API-01）：把所有 Controller 成功返回值包装为
 * { code: 0, msg: 'success', data }；已符合信封形态的返回值不重复包装。
 */
@Injectable()
export class SuccessInterceptor<T> implements NestInterceptor<T, unknown> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (this.isAlreadyEnveloped(data)) {
          return data;
        }
        return { code: 0, msg: 'success', data: data ?? null };
      }),
    );
  }

  private isAlreadyEnveloped(data: unknown): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }
    const record = data as Record<string, unknown>;
    return (
      'code' in record && 'msg' in record && typeof record.code === 'number'
    );
  }
}
