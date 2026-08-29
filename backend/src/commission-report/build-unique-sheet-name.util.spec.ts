import { buildUniqueSheetName } from './build-unique-sheet-name.util';

describe('buildUniqueSheetName', () => {
  it('无特殊字符、未超长时原样返回', () => {
    const used = new Set<string>();
    expect(buildUniqueSheetName('常熟', used)).toBe('常熟');
    expect(used.has('常熟')).toBe(true);
  });

  it('非法字符（*?:\\/[]）替换为下划线', () => {
    const used = new Set<string>();
    expect(buildUniqueSheetName('太仓*贝斯达?:\\/[]', used)).toBe(
      '太仓_贝斯达______',
    );
  });

  it('空白或全非法字符清理后为空时兜底为"未命名投保人"', () => {
    const used = new Set<string>();
    expect(buildUniqueSheetName('   ', used)).toBe('未命名投保人');
  });

  it('超过 31 字符时截断到 31 字符', () => {
    const used = new Set<string>();
    const longName = 'a'.repeat(40);
    const result = buildUniqueSheetName(longName, used);
    expect(result).toHaveLength(31);
    expect(result).toBe('a'.repeat(31));
  });

  it('截断后与已用名称重名时追加 ~N 后缀', () => {
    const used = new Set<string>(['a'.repeat(31)]);
    const longName = 'a'.repeat(40);
    const result = buildUniqueSheetName(longName, used);
    expect(result).toBe('a'.repeat(29) + '~1');
    expect(result).toHaveLength(31);
  });

  it('连续多次重名时后缀递增，且不重复超过 31 字符', () => {
    const used = new Set<string>(['a'.repeat(31), 'a'.repeat(29) + '~1']);
    const longName = 'a'.repeat(40);
    const result = buildUniqueSheetName(longName, used);
    expect(result).toBe('a'.repeat(29) + '~2');
  });

  it('同一批次内不同投保人各自登记进 usedNames，互不覆盖', () => {
    const used = new Set<string>();
    buildUniqueSheetName('常熟', used);
    buildUniqueSheetName('太仓', used);
    expect(used).toEqual(new Set(['常熟', '太仓']));
  });
});
