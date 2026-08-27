import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { OssClient } from './oss-client';

/**
 * AC4：OssClient.upload/getSignedUrl 行为验收。
 *
 * 沙箱环境未配置真实阿里云 OSS 测试账号凭证（.env / 环境变量均无
 * OSS_ACCESS_KEY_ID/OSS_ACCESS_KEY_SECRET），按任务包 escalate-if 约定选择单测级 mock
 * 路径：mock 掉 `ali-oss` SDK，验证 OssClient 对其 put/signatureUrl 的调用方式与返回值
 * 处理正确，不做真实网络调用。真实 OSS 联调（真正上传后能否 GET 到一致内容）留待
 * 部署/联调阶段人工核对（该阶段有真实测试 Bucket 凭证）。
 */
const putMock = jest.fn();
const signatureUrlMock = jest.fn();

jest.mock('ali-oss', () => {
  return jest.fn().mockImplementation(() => ({
    put: putMock,
    signatureUrl: signatureUrlMock,
  }));
});

function buildConfigService(
  overrides: Record<string, string | undefined> = {},
): ConfigService {
  const defaults: Record<string, string | undefined> = {
    OSS_ACCESS_KEY_ID: 'test-access-key-id',
    OSS_ACCESS_KEY_SECRET: 'test-access-key-secret',
    OSS_BUCKET: 'test-bucket',
    OSS_REGION: 'oss-cn-hangzhou',
    OSS_ENDPOINT: '',
    ...overrides,
  };
  return {
    get: (key: string) => defaults[key],
  } as unknown as ConfigService;
}

describe('OssClient（AC4，ali-oss SDK 单测级 mock）', () => {
  beforeEach(() => {
    putMock.mockReset();
    signatureUrlMock.mockReset();
  });

  it('upload 返回实际写入的 ossKey', async () => {
    putMock.mockResolvedValue({ name: 'imports/2026-08/bill.xlsx', res: {} });

    const client = new OssClient(buildConfigService());
    const key = await client.upload(
      Buffer.from('fake xlsx content'),
      'imports/2026-08/bill.xlsx',
    );

    expect(key).toBe('imports/2026-08/bill.xlsx');
    expect(putMock).toHaveBeenCalledWith(
      'imports/2026-08/bill.xlsx',
      expect.any(Buffer),
    );
  });

  it('getSignedUrl 返回底层 SDK 生成的签名 URL，且传入有效期参数', async () => {
    signatureUrlMock.mockReturnValue(
      'https://test-bucket.oss-cn-hangzhou.aliyuncs.com/imports/2026-08/bill.xlsx?Signature=xxx',
    );

    const client = new OssClient(buildConfigService());
    const url = await client.getSignedUrl('imports/2026-08/bill.xlsx', 1800);

    expect(url).toBe(
      'https://test-bucket.oss-cn-hangzhou.aliyuncs.com/imports/2026-08/bill.xlsx?Signature=xxx',
    );
    expect(signatureUrlMock).toHaveBeenCalledWith('imports/2026-08/bill.xlsx', {
      expires: 1800,
    });
  });

  it('未配置 OSS_ACCESS_KEY_ID/SECRET/BUCKET 时，调用 upload 抛出可识别错误而非静默失败', async () => {
    const client = new OssClient(
      buildConfigService({
        OSS_ACCESS_KEY_ID: undefined,
        OSS_ACCESS_KEY_SECRET: undefined,
        OSS_BUCKET: undefined,
      }),
    );

    await expect(
      client.upload(Buffer.from('x'), 'some/key.xlsx'),
    ).rejects.toThrow(/OSS 未配置/);
  });

  it('upload 失败时向上抛出原始错误（不静默吞掉）', async () => {
    const uploadError = new Error('network timeout');
    putMock.mockRejectedValue(uploadError);

    const client = new OssClient(buildConfigService());
    await expect(
      client.upload(Buffer.from('x'), 'imports/broken.xlsx'),
    ).rejects.toThrow('network timeout');
  });
});
