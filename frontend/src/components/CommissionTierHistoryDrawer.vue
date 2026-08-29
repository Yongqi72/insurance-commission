<template>
  <el-drawer id="drawer-rule-history" v-model="visible" title="提成阶梯规则 · 变更历史" direction="rtl" :size="drawerSize" @open="loadLogs">
    <DataStateWrapper
      :status="status"
      :error-message="errorMessage"
      empty-text="暂无变更记录"
      empty-id="empty-rule-history"
      @retry="loadLogs"
    >
      <div id="rule-history-body" class="commission-tier-history-drawer__body">
        <div v-for="(log, index) in logs" :key="index" class="commission-tier-history-drawer__item">
          <div class="commission-tier-history-drawer__change">{{ describeLog(log) }}</div>
          <div class="commission-tier-history-drawer__meta">{{ log.operator }} · {{ formatDateTime(log.changedAt) }}</div>
        </div>
      </div>
    </DataStateWrapper>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import DataStateWrapper from '@/components/DataStateWrapper.vue'
import {
  fetchCommissionTierChangeLogs,
  type CommissionTierChangeLog,
  type CommissionTierSnapshot,
} from '@/api/commission-tier'
import { useResponsiveDialogWidth } from '@/composables/useResponsiveDialogWidth'
import { formatDateTime } from '@/utils/format'

type Status = 'loading' | 'empty' | 'error' | 'success'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

// FE-EP-06：只读历史用右侧抽屉；design.md §六 移动端抽屉降级为满宽
const drawerSize = useResponsiveDialogWidth('480px', '100%')

const visible = ref(props.visible)
watch(
  () => props.visible,
  (value) => {
    visible.value = value
  },
)
watch(visible, (value) => {
  emit('update:visible', value)
})

const status = ref<Status>('loading')
const errorMessage = ref('')
const logs = ref<CommissionTierChangeLog[]>([])

/** 每次打开抽屉都重新拉取，保证展示的是最新变更历史（AC-13）。 */
async function loadLogs() {
  status.value = 'loading'
  try {
    logs.value = await fetchCommissionTierChangeLogs()
    status.value = logs.value.length === 0 ? 'empty' : 'success'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '请求出错，请稍后重试'
    status.value = 'error'
  }
}

function formatBound(value: number | null): string {
  return value === null ? '及以上' : String(value)
}

function formatRange(snapshot: CommissionTierSnapshot): string {
  return `(${snapshot.lowerBound}, ${formatBound(snapshot.upperBound)}]`
}

/** 按操作类型渲染"操作类型 + 变更前→变更后"文案（AC-13）。 */
function describeLog(log: CommissionTierChangeLog): string {
  if (log.operationType === 'create' && log.afterSnapshot) {
    return `新增档位：${formatRange(log.afterSnapshot)}，单价 ${log.afterSnapshot.unitPrice.toFixed(2)}`
  }
  if (log.operationType === 'delete' && log.beforeSnapshot) {
    return `删除档位：${formatRange(log.beforeSnapshot)}`
  }
  if (log.operationType === 'update' && log.beforeSnapshot && log.afterSnapshot) {
    return `编辑档位 ${formatRange(log.beforeSnapshot)} → ${formatRange(log.afterSnapshot)}：单价 ${log.beforeSnapshot.unitPrice.toFixed(2)} → ${log.afterSnapshot.unitPrice.toFixed(2)}`
  }
  return '规则变更记录'
}
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.commission-tier-history-drawer {
  &__body {
    display: flex;
    flex-direction: column;
    gap: $space-md;
  }

  &__item {
    padding-bottom: $space-md;
    border-bottom: 1px solid $border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  &__change {
    font-size: $fs-caption;
    color: $text-primary;
  }

  &__meta {
    margin-top: $space-xs;
    font-size: $fs-small;
    color: $text-hint;
  }
}
</style>
