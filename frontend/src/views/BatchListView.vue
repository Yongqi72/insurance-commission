<template>
  <div class="batch-list">
    <div class="batch-list__head">
      <h2 class="batch-list__title">提成批次</h2>
      <el-button id="btn-new-batch" type="primary" @click="openCreateDialog">+ 新建批次</el-button>
    </div>

    <DataStateWrapper :status="status" :error-message="errorMessage" empty-text="暂无批次，请新建" @retry="loadData">
      <div class="batch-list__table-wrapper">
        <el-table id="table-batch-list" :data="list" border stripe row-key="id" @row-click="handleRowClick">
          <el-table-column prop="name" label="批次名称" min-width="200" />
          <el-table-column label="状态" width="120">
            <template #default="{ row }: { row: CommissionBatch }">
              <span
                class="batch-list__status-tag"
                :class="`batch-list__status-tag--${row.status}`"
              >
                {{ statusLabel(row.status) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" min-width="160">
            <template #default="{ row }: { row: CommissionBatch }">
              {{ formatDateTime(row.createdAt) }}
            </template>
          </el-table-column>
          <el-table-column label="" width="80">
            <template #default>
              <span class="batch-list__view-link">查看</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="batch-list__pagination">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="loadData"
          @current-change="loadData"
        />
      </div>
    </DataStateWrapper>

    <el-dialog
      id="modal-new-batch"
      v-model="dialogVisible"
      title="新建批次"
      :width="dialogWidth"
      align-center
      @closed="handleDialogClosed"
    >
      <el-form ref="formRef" :model="form" :rules="rules">
        <el-form-item label="批次名称" prop="name">
          <el-input
            id="input-batch-name"
            v-model="form.name"
            placeholder="如：2026年8月批次"
            maxlength="128"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button id="btn-submit-new-batch" type="primary" :loading="submitting" @click="handleSubmit">
          创建
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import DataStateWrapper from '@/components/DataStateWrapper.vue'
import { createBatch, fetchBatchPage, type CommissionBatch, type CommissionBatchStatus } from '@/api/commission-batch'
import { useResponsiveDialogWidth } from '@/composables/useResponsiveDialogWidth'
import { formatDateTime } from '@/utils/format'

type Status = 'loading' | 'empty' | 'error' | 'success'

const router = useRouter()

const dialogWidth = useResponsiveDialogWidth('480px')

const status = ref<Status>('loading')
const errorMessage = ref('')
const list = ref<CommissionBatch[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

const dialogVisible = ref(false)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ name: '' })
const rules: FormRules = {
  name: [{ required: true, message: '请输入批次名称', trigger: 'blur' }],
}

function statusLabel(value: CommissionBatchStatus): string {
  return value === 'done' ? '已完成' : '进行中'
}

async function loadData() {
  status.value = 'loading'
  try {
    const result = await fetchBatchPage({ page: page.value, pageSize: pageSize.value })
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

function handleRowClick(row: CommissionBatch) {
  router.push({ name: 'batch-detail', params: { id: row.id } })
}

function openCreateDialog() {
  dialogVisible.value = true
}

function handleDialogClosed() {
  formRef.value?.resetFields()
}

async function handleSubmit() {
  if (!formRef.value) {
    return
  }
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    const batch = await createBatch(form.name)
    ElMessage.success('创建成功')
    dialogVisible.value = false
    router.push({ name: 'batch-detail', params: { id: batch.id } })
  } catch {
    // 错误提示已由 api/request.ts 响应拦截器统一 toast（FE-ASYNC-01），此处兜底不重复弹窗
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.batch-list {
  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $space-md;
  }

  &__title {
    margin: 0;
    font-size: $fs-h2;
    color: $text-primary;
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

  &__status-tag {
    display: inline-block;
    padding: $space-xs $space-sm;
    border-radius: $radius-sm;
    font-size: $fs-small;
    line-height: 1;
    white-space: nowrap;

    &--doing {
      background-color: $color-warning-bg;
      color: $color-warning-text;
    }

    &--done {
      background-color: $color-success-bg;
      color: $color-success-text;
    }
  }

  &__view-link {
    color: $primary;
    cursor: pointer;
  }
}
</style>
