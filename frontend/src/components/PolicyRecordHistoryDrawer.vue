<template>
  <el-drawer
    id="drawer-record-history"
    v-model="visible"
    :title="drawerTitle"
    direction="rtl"
    :size="drawerSize"
    @open="loadLogs"
  >
    <DataStateWrapper
      :status="status"
      :error-message="errorMessage"
      empty-text="该记录暂无人工修改记录"
      @retry="loadLogs"
    >
      <div id="record-history-body" class="policy-record-history-drawer__body">
        <div v-for="(log, index) in logs" :key="index" class="policy-record-history-drawer__item">
          <div class="policy-record-history-drawer__change">
            销售人员：
            <span class="policy-record-history-drawer__old">{{ log.oldValue || '空' }}</span>
            →
            <span class="policy-record-history-drawer__new">{{ log.newValue }}</span>
          </div>
          <div class="policy-record-history-drawer__meta">{{ log.operator }} · {{ formatDateTime(log.changedAt) }}</div>
        </div>
      </div>
    </DataStateWrapper>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import DataStateWrapper from '@/components/DataStateWrapper.vue'
import { fetchSalesFillLogs, type SalesFillLog } from '@/api/policy-record'
import { useResponsiveDialogWidth } from '@/composables/useResponsiveDialogWidth'
import { formatDateTime } from '@/utils/format'

type Status = 'loading' | 'empty' | 'error' | 'success'

const props = defineProps<{
  visible: boolean
  recordId: string
  /** 仅用于抽屉标题展示上下文，可选；不传时用通用标题（PRD AC-09 未要求，纯 UX 辅助）。 */
  workOrderNo?: string
}>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

// FE-EP-06：只读历史用右侧抽屉；design.md §六 移动端抽屉降级为满宽
const drawerSize = useResponsiveDialogWidth('480px', '100%')

// 父组件用 v-model:visible 控制打开/关闭；本地代理一份，既满足 el-drawer v-model 需要，
// 又避免直接修改 props（Vue 单向数据流约束）。
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

const drawerTitle = computed(() => (props.workOrderNo ? `修改历史 · 工作单号 ${props.workOrderNo}` : '修改历史'))

const status = ref<Status>('loading')
const errorMessage = ref('')
const logs = ref<SalesFillLog[]>([])

/** 每次打开抽屉都重新拉取，保证展示的是最新修改历史（AC-09）。 */
async function loadLogs() {
  if (!props.recordId) {
    return
  }
  status.value = 'loading'
  try {
    logs.value = await fetchSalesFillLogs(props.recordId)
    status.value = logs.value.length === 0 ? 'empty' : 'success'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '请求出错，请稍后重试'
    status.value = 'error'
  }
}

// 抽屉已打开时若切到另一条记录（recordId 变化），需重新拉取，不能沿用上一条记录的历史。
watch(
  () => props.recordId,
  () => {
    if (visible.value) {
      loadLogs()
    }
  },
)
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.policy-record-history-drawer {
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

  &__old {
    color: $text-hint;
    text-decoration: line-through;
  }

  &__new {
    color: $primary-dark;
    font-weight: $fw-h3;
  }

  &__meta {
    margin-top: $space-xs;
    font-size: $fs-small;
    color: $text-hint;
  }
}
</style>
