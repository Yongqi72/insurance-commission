import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * import_file 表加可空 JSON 列 fail_reasons：持久化导入失败行清单
 * （BE-DB-03；TypeORM 属性名 failReasons，见 import-file.entity.ts）。
 * 纯加法：不改动本表任何既有列，up()/down() 互为镜像，down() 直接 DROP COLUMN
 * （历史行本来就没有本列数据，回滚不丢失除本字段外的任何信息）。
 */
export class AddFailReasonsToImportFile1788074308866 implements MigrationInterface {
  name = 'AddFailReasonsToImportFile1788074308866';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'import_file',
      new TableColumn({
        name: 'fail_reasons',
        type: 'json',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('import_file', 'fail_reasons');
  }
}
