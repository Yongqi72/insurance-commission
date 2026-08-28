<template>
  <div class="batch-detail">
    <DataStateWrapper :status="status" :error-message="errorMessage" @retry="loadDetail">
      <div class="batch-detail__head">
        <h1 class="batch-detail__title">
          <router-link class="batch-detail__back" :to="{ name: 'batch-list' }">← 返回批次列表</router-link>
          <span id="detail-batch-name">{{ batch?.name }}</span>
        </h1>
        <div
          id="tag-batch-status"
          class="batch-detail__status-tag"
          :class="`batch-detail__status-tag--${batch?.status}`"
          @click="handleToggleStatus"
        >
          <span class="batch-detail__status-dot" :class="`batch-detail__status-dot--${batch?.status}`" />
          {{ statusToggleLabel }}
        </div>
      </div>

      <ImportPanel :batch-id="batchId" />

      <div id="policy-record-panel-mount">
        <PolicyRecordTable :batch-id="batchId" />
      </div>

      <div id="commission-summary-panel-mount">
        <CommissionSummaryPanel :batch-id="batchId" :batch-name="batch?.name" />
      </div>
    </DataStateWrapper>

    <div v-if="status === 'error' && isNotFound" class="batch-detail__not-found-action">
      <el-button type="primary" @click="goToBatchList">返回批次列表</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import axios from 'axios'
import DataStateWrapper from '@/components/DataStateWrapper.vue'
import ImportPanel from '@/components/ImportPanel.vue'
import PolicyRecordTable from '@/components/PolicyRecordTable.vue'
import CommissionSummaryPanel from '@/components/CommissionSummaryPanel.vue'
import { fetchBatchDetail, updateBatchStatus, type CommissionBatch, type CommissionBatchStatus } from '@/api/commission-batch'
import { ErrorCode } from '@/types/enums'
import type { ApiEnvelope } from '@/api/request'

type Status = 'loading' | 'error' | 'success'

const route = useRoute()
const router = useRouter()

// batchId 在此顶层声明为响应式值，供本页面下方各业务面板直接复用，无需重新解析路由参数。
const batchId = computed(() => route.params.id as string)

const status = ref<Status>('loading')
const errorMessage = ref('')
const isNotFound = ref(false)
const batch = ref<CommissionBatch | null>(null)

const statusToggleLabel = computed(() => {
  if (!batch.value) {
    return ''
  }
  return batch.value.status === 'done' ? '已完成，点击标记进行中' : '进行中，点击标记完成'
})

async function loadDetail() {
  status.value = 'loading'
  isNotFound.value = false
  try {
    batch.value = await fetchBatchDetail(batchId.value)
    status.value = 'success'
  } catch (error) {
    isNotFound.value =
      axios.isAxiosError<ApiEnvelope<unknown>>(error) && error.response?.data?.code === ErrorCode.NOT_FOUND
    errorMessage.value = error instanceof Error ? error.message : '请求出错，请稍后重试'
    status.value = 'error'
  }
}

async function handleToggleStatus() {
  if (!batch.value) {
    return
  }
  const next: CommissionBatchStatus = batch.value.status === 'doing' ? 'done' : 'doing'
  try {
    // AC-02：成功后本地即时更新；失败由 request.ts 拦截器统一 ElMessage.error 提示（FE-ASYNC-01），
    // 且此处未提前乐观更新，请求失败时 batch.value 天然保持原值，不需要额外回退逻辑。
    batch.value = await updateBatchStatus(batchId.value, next)
  } catch {
    // 已由拦截器提示，不重复弹窗
  }
}

function goToBatchList() {
  router.push({ name: 'batch-list' })
}

watch(batchId, () => loadDetail())

onMounted(loadDetail)
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.batch-detail {
  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: $space-sm;
    margin-bottom: $space-lg;
  }

  &__title {
    display: flex;
    align-items: center;
    gap: $space-md;
    margin: 0;
    font-size: $fs-h2;
    color: $text-primary;
  }

  &__back {
    font-size: $fs-caption;
    font-weight: $fw-body;
    color: $text-secondary;
    text-decoration: none;

    &:hover {
      color: $primary;
    }
  }

  &__status-tag {
    display: inline-flex;
    align-items: center;
    gap: $space-xs;
    padding: $space-xs $space-md;
    border-radius: $radius-full;
    font-size: $fs-caption;
    cursor: pointer;
    user-select: none;
    background-color: $color-warning-bg;
    color: $color-warning-text;

    &--done {
      background-color: $color-success-bg;
      color: $color-success-text;
    }
  }

  &__status-dot {
    width: $space-sm;
    height: $space-sm;
    border-radius: $radius-full;
    background-color: $color-warning-text;

    &--done {
      background-color: $color-success-text;
    }
  }

  &__not-found-action {
    display: flex;
    justify-content: center;
    margin-top: $space-md;
  }
}
</style>
