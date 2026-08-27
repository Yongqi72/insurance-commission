import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OssClient } from './oss-client';

/**
 * 导出 OssClient 供其他模块 import（BE-EXT-02）：
 * 需要归档文件到 OSS / 生成签名下载链接的模块（commission-batch 导入、commission-report 导出）
 * 统一 `imports: [OssModule]` 后注入 OssClient，不直接 import `ali-oss` SDK。
 */
@Module({
  imports: [ConfigModule],
  providers: [OssClient],
  exports: [OssClient],
})
export class OssModule {}
