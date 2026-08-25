/**
 * 共享分页结果信封，见 foundation-design.md 分页协议契约。
 * 字段名跨前后端一致（list/total/page/pageSize）。
 */
export class PageResultDto<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;

  constructor(list: T[], total: number, page: number, pageSize: number) {
    this.list = list;
    this.total = total;
    this.page = page;
    this.pageSize = pageSize;
  }
}
