<template>
  <div class="policy-record-table">
    <div class="policy-record-table__head">
      <div class="policy-record-table__title">保单记录明细</div>
      <el-button id="btn-start-fill" :loading="filling" @click="handleStartFill">开始回填</el-button>
    </div>

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
          :data="list"
          border
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
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, type TableInstance } from 'element-plus'
import DataStateWrapper from '@/components/DataStateWrapper.vue'
import PolicyRecordHistoryDrawer from '@/components/PolicyRecordHistoryDrawer.vue'
import { fetchBatchPolicyRecords, triggerSalesFill } from '@/api/commission-batch'
import { updateSalesName, type PolicyRecord, type SalesFillSource } from '@/api/policy-record'

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

const filling = ref(false)
const savingId = ref<string | null>(null)
const editingSalesName = ref('')

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

/** 收起当前展开行、清空编辑态、强制表格重新挂载（known-risks：切换分页/搜索/筛选需主动收起展开行）。 */
function resetExpandState() {
  editingSalesName.value = ''
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

async function handleStartFill() {
  filling.value = true
  try {
    // AC-06：无论 matchedCount 是否为 0 均按成功分支处理（第三方接口本期未配置）。
    const result = await triggerSalesFill(props.batchId)
    ElMessage.success(`回填完成，${result.unmatchedCount} 条待人工补录`)
    resetExpandState()
    await loadData()
  } catch {
    // 失败已由 api/request.ts 响应拦截器统一 ElMessage.error 透传后端 msg（FE-ASYNC-01），不重复弹窗
  } finally {
    filling.value = false
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
  },
)

onMounted(loadData)

onBeforeUnmount(() => {
  if (searchDebounceTimer) {
    clearTimeout(searchDebounceTimer)
  }
})

// 供宿主 BatchDetailView.vue 在收到兄弟组件的记录变更信号后触发本表刷新；
// 直接复用既有 loadData，不重新实现一份加载逻辑，也不重置展开编辑态（loadData 本身不涉及该状态）。
defineExpose({ refresh: loadData })
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.policy-record-table {
  margin-top: $space-lg;

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
