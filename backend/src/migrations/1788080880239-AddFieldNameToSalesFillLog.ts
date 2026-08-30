import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * sales_fill_log 表加非空列 field_name：区分该条日志记录的是销售人员（salesName）还是
 * 工作单号（workOrderNo）的修改，使该表从"销售人员补录日志"扩展为"保单记录人工修改日志"
 * （BE-DB-03；TypeORM 属性名 fieldName，见 sales-fill-log.entity.ts）。
 * `DEFAULT 'salesName'`：MySQL 对既有行的默认值回填在本条 `ALTER TABLE` 内自动完成
 * （既有日志此前只可能来自销售人员补录），不需要额外 UPDATE 语句。
 * 纯加法：不改动本表任何既有列，up()/down() 互为镜像，down() 直接 DROP COLUMN
 * （历史行本来就没有本列数据，回滚不丢失除本字段外的任何信息）。
 */
export class AddFieldNameToSalesFillLog1788080880239 implements MigrationInterface {
  name = 'AddFieldNameToSalesFillLog1788080880239';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'sales_fill_log',
      new TableColumn({
        name: 'field_name',
        type: 'varchar',
        length: '16',
        isNullable: false,
        default: "'salesName'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('sales_fill_log', 'field_name');
  }
}
