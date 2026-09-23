<template>
  <div class="policy-record-table surface-card">
    <div class="policy-record-table__head">
      <div class="policy-record-table__title">保单记录明细</div>
      <el-button id="btn-start-fill" :loading="filling" @click="handleStartFill">开始回填</el-button>
    </div>

    <el-dialog
      id="fill-progress"
      v-model="fillDialogVisible"
      title="正在回填"
      :width="fillDialogWidth"
      align-center
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
    >
      <div v-if="fillProgress" class="policy-record-table__fill-progress">
        <el-progress
          :percentage="fillProgressPercentage"
          :stroke-width="10"
          striped
          striped-flow
          :duration="8"
        />
        <span class="policy-record-table__fill-progress-text">
          正在回填：{{ fillProgress.processed }}/{{ fillProgress.total }}
        </span>
      </div>
    </el-dialog>

    <div class="policy-record-table__toolbar">
      <div class="policy-record-table__search-wrap">
        <el-input
          id="input-search-record"
          v-model="keyword"
          placeholder="搜索工作单号 / 保单号 / 客户名称"
          clearable
          @input="handleSearchInput"
          @clear="handleSearchClear"
        />
      </div>
      <div class="policy-record-table__filter-wrap">
        <el-select id="select-fill-status-filter" v-model="fillStatusFilter" @change="handleFilterChange">
          <el-option
            v-for="option in FILL_STATUS_OPTIONS"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </div>
      <span v-if="unmatchedCount > 0" id="hint-unmatched-count" class="policy-record-table__unmatched-hint">
        ⚠ 有 {{ unmatchedCount }} 条未获取到销售记录
      </span>
    </div>

    <DataStateWrapper
      :status="status"
      :error-message="errorMessage"
      empty-text="暂无保单记录，请上传 Excel 导入"
      @retry="loadData"
    >
      <div class="policy-record-table__table-wrapper">
        <el-table
          id="table-record-list"
          :key="tableResetKey"
          ref="tableRef"
          class="data-table data-table--clickable-rows"
          :data="list"
          stripe
          row-key="id"
          @row-click="handleRowClick"
          @expand-change="handleExpandChange"
        >
          <el-table-column type="expand" width="1" class-name="policy-record-table__expand-column">
            <template #default="{ row }: { row: PolicyRecord }">
              <div class="policy-record-table__expand-panel">
                <div class="policy-record-table__field">
                  <label :for="`input-sales-name-${row.id}`">销售人员</label>
                  <el-input
                    :id="`input-sales-name-${row.id}`"
                    v-model="editingSalesName"
                    placeholder="填写姓名"
                    @click.stop
                  />
                </div>
                <el-button
                  :id="`btn-save-sales-${row.id}`"
                  type="primary"
                  size="small"
                  :loading="savingId === row.id"
                  @click.stop="handleSaveSalesName(row)"
                >
                  保存
                </el-button>
                <div class="policy-record-table__field">
                  <label :for="`input-work-order-no-${row.id}`">工作单号</label>
                  <el-input
                    :id="`input-work-order-no-${row.id}`"
                    v-model="editingWorkOrderNo"
                    placeholder="填写工作单号"
                    @click.stop
                  />
                </div>
                <el-checkbox
                  v-if="row.salesFillSource !== 'unmatched'"
                  :id="`checkbox-reset-fill-status-${row.id}`"
                  v-model="resetFillStatus"
                  @click.stop
                >
                  同时清空原销售人员回填结果
                </el-checkbox>
                <el-button
                  :id="`btn-save-work-order-no-${row.id}`"
                  type="primary"
                  size="small"
                  :loading="savingWorkOrderNoId === row.id"
                  @click.stop="handleSaveWorkOrderNo(row)"
                >
                  保存
                </el-button>
                <el-button id="btn-view-record-history" size="small" @click.stop="handleViewHistory(row)">
                  查看修改历史
                </el-button>
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="customerName" label="客户名称" min-width="140" />
          <el-table-column prop="workOrderNo" label="工作单号" min-width="140" />
          <el-table-column prop="businessType" label="业务类型" min-width="100" />
          <el-table-column prop="currency" label="币种" width="80" />
          <el-table-column prop="policyholder" label="投保人" min-width="120" />
          <el-table-column label="销售" min-width="120">
            <template #default="{ row }: { row: PolicyRecord }">
              <span
                class="policy-record-table__fill-tag"
                :class="`policy-record-table__fill-tag--${row.salesFillSource}`"
              >
                {{ row.salesFillSource === 'unmatched' ? '未匹配' : row.salesName || '-' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="保险金额" min-width="120" align="right">
            <template #default="{ row }: { row: PolicyRecord }">
              {{ row.insuredAmount.toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column label="保费" min-width="100" align="right">
            <template #default="{ row }: { row: PolicyRecord }">
              {{ row.premiumAmount !== null ? row.premiumAmount.toFixed(2) : '-' }}
            </template>
          </el-table-column>
          <el-table-column prop="policyNo" label="保单号" min-width="160" />
        </el-table>
      </div>

      <div class="policy-record-table__pagination">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="handlePageChange"
          @current-change="handlePageChange"
        />
      </div>
    </DataStateWrapper>

    <PolicyRecordHistoryDrawer
      v-model:visible="historyDrawerVisible"
      :record-id="historyRecordId"
      :work-order-no="historyWorkOrderNo"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, type TableInstance } from 'element-plus'
import DataStateWrapper from '@/components/DataStateWrapper.vue'
import PolicyRecordHistoryDrawer from '@/components/PolicyRecordHistoryDrawer.vue'
import { fetchBatchPolicyRecords, triggerSalesFill } from '@/api/commission-batch'
import { updateSalesName, updateWorkOrderNo, type PolicyRecord, type SalesFillSource } from '@/api/policy-record'
import { useResponsiveDialogWidth } from '@/composables/useResponsiveDialogWidth'

type Status = 'loading' | 'empty' | 'error' | 'success'

const props = defineProps<{ batchId: string }>()

/**
 * 人工补录销售人员保存成功后对外广播，供宿主 BatchDetailView.vue 转发给
 * CommissionSummaryPanel 触发其重新拉取提成汇总。
 */
const emit = defineEmits<{ 'sales-name-changed': [] }>()

// AC-07：value 严格对齐后端 salesFillSource 枚举字面值，禁止空字符串作 value（FE-EP-04）；
// 默认选中"全部"，选中 all 时 loadData() 不透传 fillStatus 参数。
const FILL_STATUS_OPTIONS: Array<{ label: string; value: 'all' | SalesFillSource }> = [
  { label: '回填状态：全部', value: 'all' },
  { label: '未匹配', value: 'unmatched' },
  { label: '系统回填', value: 'system' },
  { label: '人工补录', value: 'manual' },
]

const status = ref<Status>('loading')
const errorMessage = ref('')
const list = ref<PolicyRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const keyword = ref('')
const fillStatusFilter = ref<'all' | SalesFillSource>('all')

/**
 * 整个批次的未匹配总数（与主表格的搜索/筛选/分页无关，始终反映全批次），
 * 用于工具栏旁的提示文案（用户需求：不用切到"未匹配"筛选再看分页总数才知道）。
 */
const unmatchedCount = ref(0)

const filling = ref(false)
/** 分批回填的进度状态：null 表示当前不在回填中；非 null 时显示进度条（AC：每 100 条调一次接口，前端展示真实进度）。 */
const fillProgress = ref<{ processed: number; total: number } | null>(null)
const fillProgressPercentage = computed(() => {
  if (!fillProgress.value || fillProgress.value.total === 0) {
    return 0
  }
  return Math.round((fillProgress.value.processed / fillProgress.value.total) * 100)
})
const fillDialogWidth = useResponsiveDialogWidth('420px')
// 回填进度弹窗不允许用户主动关闭（do-not：不新增可手动关闭的入口）：可见性完全由 fillProgress
// 是否为 null 派生，setter 留空——close-on-click-modal/close-on-press-escape/show-close 已堵死
// el-dialog 内部触发关闭的所有来源，此处仅作兜底，忽略任何试图写回 false 的尝试。
const fillDialogVisible = computed({
  get: () => fillProgress.value !== null,
  set: () => {},
})
const savingId = ref<string | null>(null)
const editingSalesName = ref('')
/** 工作单号编辑区独立的保存中态/编辑态，与销售人员字段互不影响（各自只提交对应字段）。 */
const savingWorkOrderNoId = ref<string | null>(null)
const editingWorkOrderNo = ref('')
/** "同时清空原销售人员回填结果"勾选项，展开新行/收起时重置为默认不勾选。 */
const resetFillStatus = ref(false)

const tableRef = ref<TableInstance>()
// 分页/搜索/筛选切换时自增，强制 el-table 整体重新挂载，彻底清空其内部展开行状态，
// 避免残留旧行 DOM 引用（known-risks）。
const tableResetKey = ref(0)

const historyDrawerVisible = ref(false)
const historyRecordId = ref('')
const historyWorkOrderNo = ref('')

async function loadData() {
  status.value = 'loading'
  try {
    const result = await fetchBatchPolicyRecords(props.batchId, {
      page: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
      fillStatus: fillStatusFilter.value === 'all' ? undefined : fillStatusFilter.value,
    })
    list.value = result.list
    total.value = result.total
    page.value = result.page
    pageSize.value = result.pageSize
    status.value = result.list.length === 0 ? 'empty' : 'success'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '请求出错，请稍后重试'
    status.value = 'error'
  }
}

/**
 * 轻量查询整个批次的未匹配总数，与 handleStartFill() 内"先查一次未匹配总数作为进度条分母"
 * 同一查询手法（不新增后端接口）。known-risks：查询失败按静默失败处理，不弹错误提示，
 * 避免与主表格加载失败的错误提示重复噪音。
 */
async function loadUnmatchedCount() {
  try {
    const result = await fetchBatchPolicyRecords(props.batchId, {
      page: 1,
      pageSize: 1,
      fillStatus: 'unmatched',
    })
    unmatchedCount.value = result.total
  } catch {
    // 静默失败：不影响主表格数据展示与分页/搜索/筛选主功能
  }
}

/** 收起当前展开行、清空编辑态、强制表格重新挂载（known-risks：切换分页/搜索/筛选需主动收起展开行）。 */
function resetExpandState() {
  editingSalesName.value = ''
  editingWorkOrderNo.value = ''
  resetFillStatus.value = false
  tableResetKey.value += 1
}

function handlePageChange() {
  resetExpandState()
  loadData()
}

function handleFilterChange() {
  page.value = 1
  resetExpandState()
  loadData()
}

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSearch() {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
  searchDebounceTimer = setTimeout(() => {
    page.value = 1
    resetExpandState()
    loadData()
  }, 300)
}

function handleSearchInput() {
  scheduleSearch()
}

function handleSearchClear() {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
  keyword.value = ''
  page.value = 1
  resetExpandState()
  loadData()
}

/** 每批最多让后端处理的记录数（用户需求：无论明细多少条，都按 100 条一批调用第三方接口）。 */
const FILL_CHUNK_SIZE = 100

async function handleStartFill() {
  filling.value = true
  try {
    // 先查一次当前未匹配总数，作为进度条分母；分批过程中途新增/被删的记录不重新计入分母，
    // 避免进度条中途抖动——这批开始时存在多少条，就以处理完这些为"完成"。
    const initialUnmatched = await fetchBatchPolicyRecords(props.batchId, {
      page: 1,
      pageSize: 1,
      fillStatus: 'unmatched',
    })
    const totalToProcess = initialUnmatched.total
    if (totalToProcess === 0) {
      ElMessage.success('回填完成，0 条待人工补录')
      return
    }

    fillProgress.value = { processed: 0, total: totalToProcess }

    // AC-06：无论 matchedCount 是否为 0 均按成功分支处理（第三方接口本期未配置时全部落回未匹配，
    // 操作本身仍视为成功）。用 id 游标逐批调用：每批最多处理 FILL_CHUNK_SIZE 条，处理完一批
    // 推进一次进度条，直到 hasMore=false 或某批返回 0 条（双重兜底，避免任何原因下的死循环）。
    let afterId: string | undefined
    let totalUnmatchedAfter = 0
    for (;;) {
      const result = await triggerSalesFill(props.batchId, {
        limit: FILL_CHUNK_SIZE,
        afterId,
      })
      totalUnmatchedAfter += result.unmatchedCount
      fillProgress.value = {
        processed: Math.min(fillProgress.value.processed + result.total, totalToProcess),
        total: totalToProcess,
      }
      if (result.total === 0 || !result.hasMore || !result.nextAfterId) {
        break
      }
      afterId = result.nextAfterId
    }

    ElMessage.success(`回填完成，${totalUnmatchedAfter} 条待人工补录`)
    resetExpandState()
    await loadData()
    emit('sales-name-changed')
  } catch {
    // 失败已由 api/request.ts 响应拦截器统一 ElMessage.error 透传后端 msg（FE-ASYNC-01），不重复弹窗
  } finally {
    filling.value = false
    fillProgress.value = null
    loadUnmatchedCount()
  }
}

// 展开列自带的箭头图标点击会原生触发一次展开/收起，此时 column.type === 'expand'，
// 若再叠加整行点击的 toggleRowExpansion 会导致同一次点击被切换两次（等于没切换），
// 故整行点击处理跳过展开列本身，只处理"点击整行其余区域展开"（FE-TABLE-01）。
function handleRowClick(row: PolicyRecord, column: { type?: string }) {
  if (column?.type === 'expand') {
    return
  }
  tableRef.value?.toggleRowExpansion(row)
}

function handleExpandChange(row: PolicyRecord, expandedRows: PolicyRecord[]) {
  // FE-TABLE-01：同一时刻最多展开一行，展开新行前先收起已展开的行
  if (expandedRows.length > 1) {
    expandedRows
      .filter((expandedRow) => expandedRow.id !== row.id)
      .forEach((expandedRow) => tableRef.value?.toggleRowExpansion(expandedRow, false))
  }
  const stillExpanded = expandedRows.some((expandedRow) => expandedRow.id === row.id)
  editingSalesName.value = stillExpanded ? row.salesName || '' : ''
  editingWorkOrderNo.value = stillExpanded ? row.workOrderNo : ''
  resetFillStatus.value = false
}

async function handleSaveSalesName(row: PolicyRecord) {
  const trimmed = editingSalesName.value.trim()
  if (!trimmed) {
    ElMessage.error('请填写销售人员姓名')
    return
  }

  savingId.value = row.id
  try {
    // AC-08：成功后该行销售列更新为新值、标签变为人工补录样式；已是 system/manual 的记录同样允许覆盖。
    const updated = await updateSalesName(row.id, trimmed)
    const target = list.value.find((item) => item.id === row.id)
    if (target) {
      target.salesName = updated.salesName
      target.salesFillSource = updated.salesFillSource
    }
    ElMessage.success('保存成功')
    tableRef.value?.toggleRowExpansion(row, false)
    emit('sales-name-changed')
  } catch {
    // 失败已由 api/request.ts 响应拦截器统一 ElMessage.error 透传后端 msg（如 1001 salesName 为空，FE-ASYNC-01），不重复弹窗
  } finally {
    savingId.value = null
    loadUnmatchedCount()
  }
}

/**
 * 保存工作单号修改：与销售人员字段的保存互不影响，各自只提交对应字段、各自写入一条
 * fieldName 不同的日志。resetFillStatus 由用户在勾选项里自行决定（仅当该记录已回填过
 * 销售人员时展示），后端据此决定是否连带清空原销售人员回填结果。
 */
async function handleSaveWorkOrderNo(row: PolicyRecord) {
  const trimmed = editingWorkOrderNo.value.trim()
  if (!trimmed) {
    ElMessage.error('请填写工作单号')
    return
  }

  savingWorkOrderNoId.value = row.id
  try {
    const updated = await updateWorkOrderNo(row.id, trimmed, resetFillStatus.value)
    const target = list.value.find((item) => item.id === row.id)
    if (target) {
      target.workOrderNo = updated.workOrderNo
      target.salesName = updated.salesName
      target.salesFillSource = updated.salesFillSource
    }
    ElMessage.success('保存成功')
    tableRef.value?.toggleRowExpansion(row, false)
    emit('sales-name-changed')
  } catch {
    // 失败已由 api/request.ts 响应拦截器统一 ElMessage.error 透传后端 msg（如 1001 workOrderNo 为空，FE-ASYNC-01），不重复弹窗
  } finally {
    savingWorkOrderNoId.value = null
    loadUnmatchedCount()
  }
}

function handleViewHistory(row: PolicyRecord) {
  historyRecordId.value = row.id
  historyWorkOrderNo.value = row.workOrderNo
  historyDrawerVisible.value = true
}

watch(
  () => props.batchId,
  () => {
    page.value = 1
    resetExpandState()
    loadData()
    loadUnmatchedCount()
  },
)

onMounted(() => {
  loadData()
  loadUnmatchedCount()
})

onBeforeUnmount(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
})

// 供宿主 BatchDetailView.vue 在收到兄弟组件的记录变更信号后触发本表刷新；
// 直接复用既有 loadData，不重新实现一份加载逻辑，也不重置展开编辑态（loadData 本身不涉及该状态）。
// 同时刷新 unmatchedCount，保持工具栏提示与刷新后的数据同步。
function refresh() {
  loadUnmatchedCount()
  return loadData()
}

defineExpose({ refresh })
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.policy-record-table {
  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $space-md;
  }

  &__title {
    font-size: $fs-h3;
    font-weight: $fw-h3;
    color: $text-primary;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: $space-sm;
    margin-bottom: $space-md;
  }

  // 弹窗内容区（el-dialog__body 已提供内边距/背景，此处只负责进度条+文案的横向布局）
  &__fill-progress {
    display: flex;
    align-items: center;
    gap: $space-md;

    :deep(.el-progress) {
      flex: 1;
    }
  }

  &__fill-progress-text {
    flex-shrink: 0;
    font-size: $fs-small;
    color: $text-secondary;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  // FE-EP-04：禁止在 Element Plus 组件标签上直接用 style/class 设宽度，改用外层 wrapper + :deep()
  &__search-wrap {
    width: $input-width-lg;

    :deep(.el-input) {
      width: 100%;
    }
  }

  &__filter-wrap {
    width: $input-width-md;

    :deep(.el-select) {
      width: 100%;
    }
  }

  &__unmatched-hint {
    display: inline-block;
    padding: $space-xs $space-sm;
    border-radius: $radius-sm;
    background-color: $color-warning-bg;
    color: $color-warning-text;
    font-size: $fs-small;
    line-height: 1;
    white-space: nowrap;
  }

  &__table-wrapper {
    width: 100%;
    overflow-x: auto;
  }

  &__pagination {
    display: flex;
    justify-content: flex-end;
    margin-top: $space-md;
  }

  // FE-EP-04：禁止直接用 style/class 改 Element Plus 内部结构，改用外层选择器 + :deep()。
  // prototype.html 表头固定 9 列，无独立展开列——row-click 本身已能触发展开/收起
  // （见 handleRowClick），此处只是把 Element Plus 强制要求的 type="expand" 列在视觉上
  // 收窄到不可见，不影响功能，只对齐视觉呈现。
  :deep(.policy-record-table__expand-column) {
    padding: 0;

    .cell {
      display: none;
    }
  }

  &__expand-panel {
    display: flex;
    align-items: flex-end;
    flex-wrap: wrap;
    gap: $space-md;
    padding: $space-sm;
    background-color: $bg-hover;
  }

  &__field {
    display: flex;
    flex-direction: column;
    gap: $space-xs;
    font-size: $fs-caption;
    color: $text-secondary;
  }

  &__fill-tag {
    display: inline-block;
    padding: $space-xs $space-sm;
    border-radius: $radius-sm;
    font-size: $fs-small;
    line-height: 1;
    white-space: nowrap;

    &--unmatched {
      background-color: $color-warning-bg;
      color: $color-warning-text;
    }

    &--system {
      background-color: $bg-hover;
      color: $text-secondary;
      border: 1px solid $border-color;
    }

    &--manual {
      background-color: $primary-light;
      color: $primary-dark;
    }
  }
}
</style>
