import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PageQueryDto } from './page-query.dto';

describe('PageQueryDto', () => {
  it('未传 page/pageSize 时使用默认值 1/20', async () => {
    const dto = plainToInstance(PageQueryDto, {});
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
  });

  it('查询字符串会被 @Type(() => Number) 转换为整数', async () => {
    const dto = plainToInstance(PageQueryDto, { page: '2', pageSize: '50' });
    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.pageSize).toBe(50);
  });

  it('page 小于 1 应校验失败', async () => {
    const dto = plainToInstance(PageQueryDto, { page: 0 });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });

  it('pageSize 超过 100 应校验失败', async () => {
    const dto = plainToInstance(PageQueryDto, { pageSize: 101 });
    const errors = await validate(dto);

    expect(errors.length).toBeGreaterThan(0);
  });
});
