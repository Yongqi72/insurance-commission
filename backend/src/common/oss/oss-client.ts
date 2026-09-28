import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// ali-oss 的 .d.ts 用 `export =` 声明（CJS 风格），项目 tsconfig 未开 esModuleInterop，
// `import OSS from 'ali-oss'` 会经不存在的 `.default` 属性拿到 undefined；
// 用命名空间导入规避，运行时等价于 `require('ali-oss')`。
import * as OSS from 'ali-oss';

/** 签名 URL 默认有效期：1 小时（秒） */
const DEFAULT_SIGNED_URL_EXPIRES_SECONDS = 3600;

/**
 * 对象存储访问统一封装（BE-EXT-02）：业务代码（Controller/Service）禁止直接 import
 * `ali-oss` SDK，一律经本类暴露的 upload/getSignedUrl 方法；SDK 初始化、鉴权、路径拼接
 * 等细节收敛在此。凭证经环境变量注入（OSS_BUCKET/OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET/
 * OSS_REGION/OSS_ENDPOINT，见 backend/.env.example），禁止硬编码（BE-SEC-01）。
 */
@Injectable()
export class OssClient {
  private readonly logger = new Logger(OssClient.name);
  private client: OSS | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 延迟初始化底层 SDK 客户端：避免未配置真实 OSS 凭证的环境（本地开发/无凭证沙箱）
   * 在模块加载阶段就因缺少必填 Options 而抛错；真正发起 upload/getSignedUrl 调用时才校验。
   */
  private getClient(): OSS {
    if (this.client) {
      return this.client;
    }
    const accessKeyId = this.configService.get<string>('OSS_ACCESS_KEY_ID');
    const accessKeySecret = this.configService.get<string>(
      'OSS_ACCESS_KEY_SECRET',
    );
    const bucket = this.configService.get<string>('OSS_BUCKET');
    const region = this.configService.get<string>('OSS_REGION');
    const endpoint = this.configService.get<string>('OSS_ENDPOINT');

    if (!accessKeyId || !accessKeySecret || !bucket) {
      throw new Error(
        'OSS 未配置：缺少 OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET/OSS_BUCKET 环境变量',
      );
    }

    this.client = new OSS({
      accessKeyId,
      accessKeySecret,
      bucket,
      region,
      endpoint: endpoint || undefined,
      authorizationV4: true,
    });
    return this.client;
  }

  /**
   * 上传文件归档到 OSS。
   * @param buffer 文件二进制内容
   * @param key 目标对象 key（调用方负责拼接业务路径，如 `imports/{batchId}/{fileName}`）
   * @returns 实际写入的 ossKey（与传入 key 一致，供落库 import_file.oss_key/export_record.oss_key）
   */
  async upload(buffer: Buffer, key: string): Promise<string> {
    const client = this.getClient();
    try {
      const result = await client.put(key, buffer);
      return result.name;
    } catch (error) {
      this.logger.error(
        `OSS 上传失败：key=${key}, error=${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 删除已上传的对象（补偿用途：如 upload() 成功后落库失败，调用方可据此清理孤儿对象，
   * 避免 OSS 里留下无对应业务记录的文件）。删除失败仅记录日志、不抛错——调用方通常处在
   * 自身错误处理路径中，不应再让清理动作本身的失败掩盖原始错误或中断响应。
   * @param key 待删除的对象 key
   */
  async delete(key: string): Promise<void> {
    const client = this.getClient();
    try {
      await client.delete(key);
    } catch (error) {
      this.logger.error(
        `OSS 删除孤儿对象失败：key=${key}, error=${(error as Error).message}`,
        (error as Error).stack,
      );
    }
  }

  /**
   * 为已归档的对象生成可下载的签名 URL。
   * @param ossKey 对象 key（upload 返回值 / 落库的 oss_key）
   * @param expiresSeconds 签名有效期（秒），默认 1 小时
   */
  async getSignedUrl(
    ossKey: string,
    expiresSeconds: number = DEFAULT_SIGNED_URL_EXPIRES_SECONDS,
  ): Promise<string> {
    const client = this.getClient();
    try {
      return client.signatureUrl(ossKey, { expires: expiresSeconds });
    } catch (error) {
      this.logger.error(
        `OSS 签名 URL 生成失败：ossKey=${ossKey}, error=${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }
}
