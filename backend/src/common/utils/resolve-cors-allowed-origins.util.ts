/**
 * 解析 CORS 允许来源列表：读取环境变量 `CORS_ALLOWED_ORIGINS`（逗号分隔），
 * trim 并过滤空串后返回；未配置、空字符串、或仅含逗号/空白（trim+过滤后长度为 0）
 * 时统一回退到本地开发默认值 `http://localhost:5173`，避免因配置疏漏导致 CORS 直接拒绝所有来源。
 */
export function resolveCorsAllowedOrigins(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw) {
    return ['http://localhost:5173'];
  }
  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : ['http://localhost:5173'];
}
