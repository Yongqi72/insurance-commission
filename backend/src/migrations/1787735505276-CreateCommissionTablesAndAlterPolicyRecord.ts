import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from 'typeorm';

/**
 * V1 基础设施 migration：新建 6 张提成相关表 + 变更 policy_record 结构
 * （TRD §数据库设计）。替代 V0 遗留的 synchronize 建表方式（BE-DB-03）。
 *
 * policy_record 处理策略：本项目此前从未在真实 MySQL 库上跑过（仅 sqlite 走 synchronize，
 * 见 typeorm.config.ts），本 migration 是全库首个正式 migration。up() 按目标库是否已存在
 * policy_record 表分两条路径处理，保证在「空库」（AC1 场景）与「已有 V0 synchronize 建表」
 * 两种场景下都能收敛到同一份 v1 终态：
 *   - 空库：直接以 v1 终态列/索引创建该表；
 *   - 已存在：加 3 个新列 + 把 work_order_no/policy_no 的唯一约束换成普通索引。
 * down() 不区分来源、统一只撤销「v1 相对 v0 的增量」（3 个新列 + 索引变更），
 * 不删除 policy_record 表本身——对齐 AC2 oracle 明确写的回滚范围。
 */
export class CreateCommissionTablesAndAlterPolicyRecord1787735505276 implements MigrationInterface {
  name = 'CreateCommissionTablesAndAlterPolicyRecord1787735505276';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 提成批次（无依赖，最先建）
    await queryRunner.createTable(
      new Table({
        name: 'commission_batch',
        columns: [
          {
            name: 'id',
            type: 'bigint',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'name', type: 'varchar', length: '128' },
          {
            name: 'status',
            type: 'varchar',
            length: '16',
            default: `'doing'`,
          },
          {
            name: 'created_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_commission_batch_created_at',
            columnNames: ['created_at'],
          }),
        ],
      }),
      true,
    );

    // 2. 导入文件记录（依赖 commission_batch）
    await queryRunner.createTable(
      new Table({
        name: 'import_file',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'batch_id', type: 'bigint' },
          { name: 'file_name', type: 'varchar', length: '255' },
          { name: 'oss_key', type: 'varchar', length: '512' },
          { name: 'imported_at', type: 'datetime' },
          { name: 'success_count', type: 'int' },
          { name: 'fail_count', type: 'int' },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_import_file_batch_id',
            columnNames: ['batch_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_import_file_batch_id',
            columnNames: ['batch_id'],
            referencedTableName: 'commission_batch',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
      }),
      true,
    );

    // 3. policy_record：空库直接建终态表；已有 V0 表则原地 ALTER
    const policyRecordExists = await queryRunner.hasTable('policy_record');
    if (!policyRecordExists) {
      await this.createPolicyRecordAtV1Shape(queryRunner);
    } else {
      await this.alterPolicyRecordToV1Shape(queryRunner);
    }

    // 4. 销售人员补录日志（依赖 policy_record）
    await queryRunner.createTable(
      new Table({
        name: 'sales_fill_log',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'policy_record_id', type: 'int' },
          { name: 'operator', type: 'varchar', length: '64' },
          { name: 'changed_at', type: 'datetime' },
          {
            name: 'old_value',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          { name: 'new_value', type: 'varchar', length: '64' },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_sales_fill_log_policy_record_id',
            columnNames: ['policy_record_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_sales_fill_log_policy_record_id',
            columnNames: ['policy_record_id'],
            referencedTableName: 'policy_record',
            referencedColumnNames: ['id'],
            // 硬删除导入时不留孤儿日志（区别于其余外键的 RESTRICT）
            onDelete: 'CASCADE',
          }),
        ],
      }),
      true,
    );

    // 5. 提成阶梯规则（无依赖）
    await queryRunner.createTable(
      new Table({
        name: 'commission_tier',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'lower_bound', type: 'int' },
          { name: 'upper_bound', type: 'int', isNullable: true },
          { name: 'unit_price', type: 'decimal', precision: 10, scale: 2 },
          {
            name: 'created_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_commission_tier_lower_bound',
            columnNames: ['lower_bound'],
          }),
        ],
      }),
      true,
    );

    // 6. 提成阶梯规则变更日志（无依赖，逻辑关联 commission_tier 但不建外键——记录只增不改不删，
    //    且需在阶梯规则被删除后仍保留历史快照，不适用外键级联）
    await queryRunner.createTable(
      new Table({
        name: 'commission_tier_change_log',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'operation_type', type: 'varchar', length: '16' },
          { name: 'operator', type: 'varchar', length: '64' },
          { name: 'changed_at', type: 'datetime' },
          {
            name: 'before_snapshot',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'after_snapshot',
            type: 'text',
            isNullable: true,
          },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_commission_tier_change_log_changed_at',
            columnNames: ['changed_at'],
          }),
        ],
      }),
      true,
    );

    // 7. 导出记录（依赖 commission_batch）
    await queryRunner.createTable(
      new Table({
        name: 'export_record',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'batch_id', type: 'bigint' },
          { name: 'oss_key', type: 'varchar', length: '512' },
          { name: 'exported_at', type: 'datetime' },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_export_record_batch_id',
            columnNames: ['batch_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_export_record_batch_id',
            columnNames: ['batch_id'],
            referencedTableName: 'commission_batch',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
      }),
      true,
    );
  }

  /**
   * 运维前提：执行 `migration:revert` 前必须停止对 `policy_record` 表的写入。
   * `assertNoDuplicatesForRevert()` 的重复值检测与下方实际执行的 `ADD UNIQUE INDEX`
   * 之间存在窗口——若检测通过后、DDL 执行前另一连接插入了新的重复
   * `policy_no`/`work_order_no`，仍会复现半回滚状态失败（DROP 已执行，
   * ADD UNIQUE INDEX 失败）。该窗口无法在应用层消除，只能靠运维流程约束。
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    // 先做全程唯一的前置校验（V1 允许 policy_no/work_order_no 重复，回滚要恢复唯一索引，
    // MySQL 不支持事务性 DDL、任何一步失败都不会自动撤销前面已执行的 DDL——故必须在
    // 删除任何表之前就确认可以走完全程，而不是走到最后一步才失败留下半回滚状态）。
    await this.assertNoDuplicatesForRevert(queryRunner, 'policy_no');
    await this.assertNoDuplicatesForRevert(queryRunner, 'work_order_no');

    // 逆序撤销：先删有外键指向 commission_batch/policy_record 的子表，
    // 最后处理 policy_record 自身的增量与 commission_batch。
    await queryRunner.dropTable('export_record', true);
    await queryRunner.dropTable('commission_tier_change_log', true);
    await queryRunner.dropTable('commission_tier', true);
    await queryRunner.dropTable('sales_fill_log', true);

    await this.revertPolicyRecordV1Shape(queryRunner);

    await queryRunner.dropTable('import_file', true);
    await queryRunner.dropTable('commission_batch', true);
  }

  /** 空库场景：直接以 v1 终态创建 policy_record（V0 全字段 + V1 新增 3 列），供 AC1 覆盖。 */
  private async createPolicyRecordAtV1Shape(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'policy_record',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'customer_name', type: 'varchar', length: '128' },
          { name: 'work_order_no', type: 'varchar', length: '64' },
          { name: 'business_type', type: 'varchar', length: '64' },
          { name: 'currency', type: 'varchar', length: '16' },
          { name: 'policyholder', type: 'varchar', length: '128' },
          {
            name: 'insured_amount',
            type: 'decimal',
            precision: 14,
            scale: 2,
          },
          { name: 'policy_no', type: 'varchar', length: '64' },
          {
            name: 'sales_name',
            type: 'varchar',
            length: '64',
            isNullable: true,
          },
          { name: 'import_batch_id', type: 'bigint', isNullable: true },
          {
            name: 'premium_amount',
            type: 'decimal',
            precision: 14,
            scale: 2,
            isNullable: true,
          },
          { name: 'import_file_id', type: 'int', isNullable: true },
          {
            name: 'sales_fill_source',
            type: 'varchar',
            length: '16',
            default: `'unmatched'`,
          },
          {
            name: 'created_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'datetime',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          new TableIndex({
            name: 'IDX_policy_record_work_order_no',
            columnNames: ['work_order_no'],
          }),
          new TableIndex({
            name: 'IDX_policy_record_policy_no',
            columnNames: ['policy_no'],
          }),
          new TableIndex({
            name: 'IDX_policy_record_import_batch_id',
            columnNames: ['import_batch_id'],
          }),
        ],
        foreignKeys: [
          new TableForeignKey({
            name: 'FK_policy_record_import_batch_id',
            columnNames: ['import_batch_id'],
            referencedTableName: 'commission_batch',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
          new TableForeignKey({
            name: 'FK_policy_record_import_file_id',
            columnNames: ['import_file_id'],
            referencedTableName: 'import_file',
            referencedColumnNames: ['id'],
            onDelete: 'RESTRICT',
          }),
        ],
      }),
      true,
    );
  }

  /** 已有 V0 表场景：加 3 个新列 + 把 work_order_no/policy_no 的唯一约束换成普通索引。 */
  private async alterPolicyRecordToV1Shape(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.addColumns('policy_record', [
      new TableColumn({
        name: 'premium_amount',
        type: 'decimal',
        precision: 14,
        scale: 2,
        isNullable: true,
      }),
      new TableColumn({
        name: 'import_file_id',
        type: 'int',
        isNullable: true,
      }),
      new TableColumn({
        name: 'sales_fill_source',
        type: 'varchar',
        length: '16',
        default: `'unmatched'`,
      }),
    ]);

    await this.dropExistingUniqueIndex(queryRunner, 'work_order_no');
    await this.dropExistingUniqueIndex(queryRunner, 'policy_no');

    await queryRunner.createIndex(
      'policy_record',
      new TableIndex({
        name: 'IDX_policy_record_work_order_no',
        columnNames: ['work_order_no'],
      }),
    );
    await queryRunner.createIndex(
      'policy_record',
      new TableIndex({
        name: 'IDX_policy_record_policy_no',
        columnNames: ['policy_no'],
      }),
    );
    await queryRunner.createIndex(
      'policy_record',
      new TableIndex({
        name: 'IDX_policy_record_import_batch_id',
        columnNames: ['import_batch_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'policy_record',
      new TableForeignKey({
        name: 'FK_policy_record_import_batch_id',
        columnNames: ['import_batch_id'],
        referencedTableName: 'commission_batch',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );
    await queryRunner.createForeignKey(
      'policy_record',
      new TableForeignKey({
        name: 'FK_policy_record_import_file_id',
        columnNames: ['import_file_id'],
        referencedTableName: 'import_file',
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      }),
    );
  }

  /**
   * 撤销 v1 相对 v0 的增量：删 3 个新列 + 2 个 FK + 3 个索引，恢复
   * work_order_no/policy_no 的 UNIQUE KEY。不删除 policy_record 表本身（AC2 oracle）。
   */
  private async revertPolicyRecordV1Shape(
    queryRunner: QueryRunner,
  ): Promise<void> {
    await queryRunner.dropForeignKey(
      'policy_record',
      'FK_policy_record_import_file_id',
    );
    await queryRunner.dropForeignKey(
      'policy_record',
      'FK_policy_record_import_batch_id',
    );

    await queryRunner.dropIndex(
      'policy_record',
      'IDX_policy_record_import_batch_id',
    );
    await queryRunner.dropIndex('policy_record', 'IDX_policy_record_policy_no');
    await queryRunner.dropIndex(
      'policy_record',
      'IDX_policy_record_work_order_no',
    );

    await queryRunner.dropColumns('policy_record', [
      'sales_fill_source',
      'import_file_id',
      'premium_amount',
    ]);

    await queryRunner.createIndex(
      'policy_record',
      new TableIndex({
        name: 'UQ_policy_record_policy_no',
        columnNames: ['policy_no'],
        isUnique: true,
      }),
    );
    await queryRunner.createIndex(
      'policy_record',
      new TableIndex({
        name: 'UQ_policy_record_work_order_no',
        columnNames: ['work_order_no'],
        isUnique: true,
      }),
    );
  }

  private async assertNoDuplicatesForRevert(
    queryRunner: QueryRunner,
    columnName: 'policy_no' | 'work_order_no',
  ): Promise<void> {
    const duplicates: Array<Record<string, unknown>> = await queryRunner.query(
      `SELECT \`${columnName}\` AS value, COUNT(*) AS count FROM \`policy_record\` GROUP BY \`${columnName}\` HAVING COUNT(*) > 1 LIMIT 1`,
    );
    if (duplicates.length > 0) {
      throw new Error(
        `无法回滚：policy_record.${columnName} 存在重复值 "${String(
          duplicates[0].value,
        )}"（V1 明确允许该列重复，回滚需要恢复唯一索引）。请先人工核对/清理重复数据后再执行 migration:revert。`,
      );
    }
  }

  /**
   * 已有 V0 表的 work_order_no/policy_no 唯一约束系 synchronize 自动建立，
   * 名称由 typeorm 默认命名策略生成、非本 migration 可控，故通过 getTable() 读库内实际
   * 索引元数据动态定位（columnNames 恰为该列且 isUnique），再按其真实名称删除，
   * 不硬编码猜测约束名。
   */
  private async dropExistingUniqueIndex(
    queryRunner: QueryRunner,
    columnName: string,
  ): Promise<void> {
    const table = await queryRunner.getTable('policy_record');
    const existingUniqueIndex = table?.indices.find(
      (index) =>
        index.isUnique &&
        index.columnNames.length === 1 &&
        index.columnNames[0] === columnName,
    );
    if (existingUniqueIndex) {
      await queryRunner.dropIndex('policy_record', existingUniqueIndex);
      return;
    }
    // 少数环境下 typeorm/驱动会把单列唯一约束落成 uniques 而非 indices，做兜底处理
    const existingUniqueConstraint = table?.uniques.find(
      (unique) =>
        unique.columnNames.length === 1 && unique.columnNames[0] === columnName,
    );
    if (existingUniqueConstraint) {
      await queryRunner.dropUniqueConstraint(
        'policy_record',
        existingUniqueConstraint,
      );
    }
  }
}
