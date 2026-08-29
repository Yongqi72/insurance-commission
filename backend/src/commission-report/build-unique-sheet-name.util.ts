/** Excel sheet 名称不允许出现的字符（exceljs/Excel 本身的限制），命中一律替换为下划线 */
const SHEET_NAME_INVALID_CHARS = /[*?:\\/[\]]/g;
/** Excel sheet 名称长度上限 */
const SHEET_NAME_MAX_LENGTH = 31;

/**
 * 投保人名可能超出 Excel sheet 名称限制（≤31 字符、不含 `*?:\/[]`）或与同批次内另一个
 * 投保人截断后重名；分别做字符清理、长度截断、重名追加序号兜底，避免 exceljs 在
 * addWorksheet() 时直接抛错导致整份报表生成失败。
 */
export function buildUniqueSheetName(
  policyholder: string,
  usedNames: Set<string>,
): string {
  const sanitized =
    policyholder.replace(SHEET_NAME_INVALID_CHARS, '_').trim() ||
    '未命名投保人';
  const base = sanitized.slice(0, SHEET_NAME_MAX_LENGTH);

  let candidate = base;
  let suffix = 1;
  while (usedNames.has(candidate)) {
    const suffixText = `~${suffix}`;
    candidate =
      base.slice(0, SHEET_NAME_MAX_LENGTH - suffixText.length) + suffixText;
    suffix += 1;
  }
  usedNames.add(candidate);
  return candidate;
}
