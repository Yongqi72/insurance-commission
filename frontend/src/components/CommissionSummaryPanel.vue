<template>
  <div class="commission-summary-panel">
    <div class="commission-summary-panel__head">
      <div class="commission-summary-panel__title">提成汇总（实时）</div>
      <div class="commission-summary-panel__actions">
        <el-button id="btn-view-export-history" @click="historyDrawerVisible = true">导出历史</el-button>
        <el-button id="btn-export" type="primary" :loading="exporting" @click="handleExport">导出 Excel</el-button>
      </div>
    </div>

    <DataStateWrapper :status="status" :error-message="errorMessage" @retry="loadSummary">
      <div
        v-if="summary && !summary.ruleComplete"
        id="commission-unconfigured"
        class="commission-summary-panel__unconfigured"
      >
        未配置规则，无法计算
      </div>
      <template v-else-if="summary">
        <div v-if="summary.groups.length === 0" class="commission-summary-panel__no-data">
          该批次暂无提成汇总数据
        </div>
        <div v-else id="grid-commission-summary" class="commission-summary-panel__grid">
          <div
            v-for="group in summary.groups"
            :id="group.policyholder === firstEmptyPolicyholder ? 'card-commission-empty' : undefined"
            :key="group.policyholder"
            class="commission-summary-panel__card"
          >
            <div class="commission-summary-panel__station">{{ group.policyholder }}</div>
            <div v-if="group.items.length === 0" class="commission-summary-panel__empty-hint">
              当前没有已确认销售人员的记录
            </div>
            <template v-else>
              <div v-for="item in group.items" :key="item.salesName" class="commission-summary-panel__row">
                <span>{{ item.salesName }}</span>
                <span class="commission-summary-panel__amt">
                  {{ item.ticketCount }} 票 · ¥{{ item.commission.toFixed(2) }}
                </span>
              </div>
              <div class="commission-summary-panel__total">
                <span>合计</span>
                <span>¥{{ group.subtotal.toFixed(2) }}</span>
              </div>
            </template>
          </div>
        </div>
      </template>
    </DataStateWrapper>

    <ExportHistoryDrawer v-model:visible="historyDrawerVisible" :batch-id="batchId" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import DataStateWrapper from '@/components/DataStateWrapper.vue'
import ExportHistoryDrawer from '@/components/ExportHistoryDrawer.vue'
import {
  CommissionReportRuleIncompleteError,
  exportCommissionReport,
  fetchCommissionSummary,
  triggerBlobDownload,
  type CommissionSummaryResult,
} from '@/api/commission-report'

type Status = 'loading' | 'error' | 'success'

const props = defineProps<{ batchId: string; batchName?: string }>()

const status = ref<Status>('loading')
const errorMessage = ref('')
const summary = ref<CommissionSummaryResult | null>(null)
const exporting = ref(false)
const historyDrawerVisible = ref(false)

// AC-16：某投保人分组 items 为空数组时展示空态；对应原型 #card-commission-empty 只在静态演示里绑定单张卡片，
// 一批数据中可能出现多个空分组，若逐个都赋同一个 id 会产生重复 DOM id，因此只把该 id 落在第一个空分组上，
// 其余空分组仍按同一视觉样式（class）展示空态文案，不受影响。
const firstEmptyPolicyholder = computed(
  () => summary.value?.groups.find((group) => group.items.length === 0)?.policyholder ?? null,
)

async function loadSummary() {
  status.value = 'loading'
  try {
    // AC-14：批次相关数据变化后需重新现查现算，本组件随 batchId 变化重新拉取（见下方 watch）
    summary.value = await fetchCommissionSummary(props.batchId)
    status.value = 'success'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '请求出错，请稍后重试'
    status.value = 'error'
  }
}

async function handleExport() {
  exporting.value = true
  try {
    const fallbackFileName = `${props.batchName || props.batchId}-提成报表.xlsx`
    const { blob, fileName } = await exportCommissionReport(props.batchId, fallbackFileName)
    triggerBlobDownload(blob, fileName)
    // FE-ASYNC-03：写操作（导出）成功后必须有用户可见反馈
    ElMessage.success('导出成功')
  } catch (error) {
    // AC-15：命中 2002（规则不完整）与其余业务错误码用各自的具体文案区分展示，不混淆（FE-ASYNC-01）
    if (error instanceof CommissionReportRuleIncompleteError) {
      ElMessage.error(error.message)
    } else {
      ElMessage.error(error instanceof Error ? error.message : '导出失败，请稍后重试')
    }
  } finally {
    exporting.value = false
  }
}

watch(
  () => props.batchId,
  () => {
    loadSummary()
  },
)

onMounted(() => {
  loadSummary()
})
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.commission-summary-panel {
  margin-top: $space-lg;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: $space-sm;
    margin-bottom: $space-md;
  }

  &__title {
    font-size: $fs-h3;
    font-weight: $fw-h3;
    color: $text-primary;
  }

  &__actions {
    display: flex;
    gap: $space-sm;
  }

  &__unconfigured {
    padding: $space-xl;
    text-align: center;
    color: $text-hint;
    background-color: $bg-card;
    border: 1px solid $border-color;
    border-radius: $radius-md;
  }

  &__no-data {
    padding: $space-lg;
    text-align: center;
    color: $text-hint;
    background-color: $bg-card;
    border: 1px solid $border-color;
    border-radius: $radius-md;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: $space-md;

    // design.md §六 响应式断点：Mobile < 768px 多列降为单列（FE-RESPONSIVE-01）
    @media (width <= $breakpoint-mobile) {
      grid-template-columns: 1fr;
    }
  }

  &__card {
    padding: $space-md;
    background-color: $bg-card;
    border: 1px solid $border-color;
    border-radius: $radius-md;
    box-shadow: $shadow-md;
  }

  &__station {
    font-size: $fs-caption;
    font-weight: $fw-h3;
    margin-bottom: $space-sm;
    color: $text-primary;
  }

  &__row {
    display: flex;
    justify-content: space-between;
    padding: $space-xs 0;
    font-size: $fs-caption;
    color: $text-primary;
    border-bottom: 1px dashed $border-color;

    &:last-of-type {
      border-bottom: none;
    }
  }

  &__amt {
    font-variant-numeric: tabular-nums;
    font-weight: $fw-h3;
  }

  &__total {
    display: flex;
    justify-content: space-between;
    margin-top: $space-sm;
    padding-top: $space-sm;
    font-size: $fs-caption;
    font-weight: $fw-h3;
    color: $text-primary;
    border-top: 1px solid $border-color;
  }

  &__empty-hint {
    padding: $space-sm 0;
    font-size: $fs-small;
    color: $text-hint;
  }
}
</style>
