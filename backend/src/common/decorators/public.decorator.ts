import { SetMetadata } from '@nestjs/common';

/**
 * 鉴权模型见 standards-shared.md SH-AUTH-01：全局 Guard 默认拦截所有路由，
 * 仅显式标注 @Public() 的接口 opt-out 免鉴权（如登录接口本身）。
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
