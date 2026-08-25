/**
 * 日期格式化统一走本模块（FE-UTIL-01），禁止在组件内拼接日期字符串。
 */
export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) {
    return '-'
  }
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) {
    return '-'
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}
