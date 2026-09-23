import { resolveCorsAllowedOrigins } from './resolve-cors-allowed-origins.util';

describe('resolveCorsAllowedOrigins', () => {
  const originalEnv = process.env.CORS_ALLOWED_ORIGINS;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.CORS_ALLOWED_ORIGINS;
    } else {
      process.env.CORS_ALLOWED_ORIGINS = originalEnv;
    }
  });

  it('未设置环境变量时回退默认值', () => {
    delete process.env.CORS_ALLOWED_ORIGINS;
    expect(resolveCorsAllowedOrigins()).toEqual(['http://localhost:5173']);
  });

  it('空字符串时回退默认值', () => {
    process.env.CORS_ALLOWED_ORIGINS = '';
    expect(resolveCorsAllowedOrigins()).toEqual(['http://localhost:5173']);
  });

  it('仅逗号/空白（过严陷阱）时回退默认值', () => {
    process.env.CORS_ALLOWED_ORIGINS = '  ,  ,';
    expect(resolveCorsAllowedOrigins()).toEqual(['http://localhost:5173']);
  });

  it('单一来源时原样返回', () => {
    process.env.CORS_ALLOWED_ORIGINS = 'https://example.com';
    expect(resolveCorsAllowedOrigins()).toEqual(['https://example.com']);
  });

  it('多来源带空格时正确 trim 并返回多元素数组', () => {
    process.env.CORS_ALLOWED_ORIGINS =
      '  https://a.example.com , https://b.example.com  ';
    expect(resolveCorsAllowedOrigins()).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });

  it('多余逗号产生的空字符串项被过滤', () => {
    process.env.CORS_ALLOWED_ORIGINS =
      'https://a.example.com,,https://b.example.com,';
    expect(resolveCorsAllowedOrigins()).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });
});
