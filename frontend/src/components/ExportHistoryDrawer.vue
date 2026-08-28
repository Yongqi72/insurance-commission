<template>
  <el-drawer id="drawer-export-history" v-model="visible" title="导出历史" direction="rtl" :size="drawerSize" @open="loadHistory">
    <DataStateWrapper :status="status" :error-message="errorMessage" empty-text="暂无导出记录" @retry="loadHistory">
      <div id="export-history-body" class="export-history-drawer__body">
        <div v-for="record in records" :key="record.id" class="export-history-drawer__item">
          <div class="export-history-drawer__meta">{{ formatDateTime(record.exportedAt) }}</div>
          <el-button class="export-history-drawer__redownload-btn" link type="primary" @click="handleRedownload(record)">
            重新下载
          </el-button>
        </div>
      </div>
    </DataStateWrapper>
  </el-drawer>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import DataStateWrapper from '@/components/DataStateWrapper.vue'
import { fetchExportHistory, triggerUrlDownload, type ExportRecord } from '@/api/commission-report'
import { useResponsiveDialogWidth } from '@/composables/useResponsiveDialogWidth'
import { formatDateTime } from '@/utils/format'

type Status = 'loading' | 'empty' | 'error' | 'success'

const props = defineProps<{ visible: boolean; batchId: string }>()
const emit = defineEmits<{ 'update:visible': [value: boolean] }>()

// FE-EP-06：只读历史用右侧抽屉；design.md §六 移动端抽屉降级为满宽（FE-RESPONSIVE-01）
const drawerSize = useResponsiveDialogWidth('480px', '100%')

// 父组件用 v-model:visible 控制打开/关闭；本地代理一份，既满足 el-drawer v-model 需要，
// 又避免直接修改 props（Vue 单向数据流约束），与 PolicyRecordHistoryDrawer/CommissionTierHistoryDrawer 一致。
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
const records = ref<ExportRecord[]>([])

/** 每次打开抽屉都重新拉取，保证展示的是最新导出记录（AC-17）。 */
async function loadHistory() {
  status.value = 'loading'
  try {
    // 后端已按 exportedAt 倒序返回，前端不再排序（TRD §接口：GET .../exports）
    records.value = await fetchExportHistory(props.batchId)
    status.value = records.value.length === 0 ? 'empty' : 'success'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '请求出错，请稍后重试'
    status.value = 'error'
  }
}

/** AC-17：直接用响应内当次生成的 downloadUrl 发起下载，不重新调用导出计算接口。 */
function handleRedownload(record: ExportRecord) {
  triggerUrlDownload(record.downloadUrl)
}

// 抽屉已打开时若切到另一批次（batchId 变化），需重新拉取，不能沿用上一批次的导出历史。
watch(
  () => props.batchId,
  () => {
    if (visible.value) {
      loadHistory()
    }
  },
)
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.export-history-drawer {
  &__body {
    display: flex;
    flex-direction: column;
    gap: $space-md;
  }

  &__item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: $space-md;
    border-bottom: 1px solid $border-color;

    &:last-child {
      border-bottom: none;
    }
  }

  &__meta {
    font-size: $fs-caption;
    color: $text-primary;
  }
}
</style>
