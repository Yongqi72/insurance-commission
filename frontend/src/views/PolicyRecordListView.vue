<template>
  <div class="policy-record-list">
    <h2 class="policy-record-list__title">保单记录</h2>

    <DataStateWrapper
      :status="status"
      :error-message="errorMessage"
      empty-text="暂无保单记录"
      empty-id="empty-record-list"
      @retry="loadData"
    >
      <div class="policy-record-list__table-wrapper">
        <el-table :data="list" border stripe>
          <el-table-column prop="customerName" label="客户名称" min-width="140" />
          <el-table-column prop="workOrderNo" label="工作单号" min-width="140" />
          <el-table-column prop="businessType" label="业务类型" min-width="120" />
          <el-table-column prop="currency" label="币种" width="80" />
          <el-table-column prop="policyholder" label="投保人" min-width="140" />
          <el-table-column label="保险金额" min-width="120">
            <template #default="{ row }: { row: PolicyRecord }">
              {{ row.insuredAmount.toFixed(2) }}
            </template>
          </el-table-column>
          <el-table-column prop="policyNo" label="保单号" min-width="140" />
          <el-table-column label="销售人员" min-width="100">
            <template #default="{ row }: { row: PolicyRecord }">
              {{ row.salesName || '-' }}
            </template>
          </el-table-column>
          <el-table-column label="创建时间" min-width="160">
            <template #default="{ row }: { row: PolicyRecord }">
              {{ formatDateTime(row.createdAt) }}
            </template>
          </el-table-column>
        </el-table>
      </div>

      <div class="policy-record-list__pagination">
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
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import DataStateWrapper from '@/components/DataStateWrapper.vue'
import { fetchPolicyRecordPage, type PolicyRecord } from '@/api/policy-record'
import { formatDateTime } from '@/utils/format'

type Status = 'loading' | 'empty' | 'error' | 'success'

const status = ref<Status>('loading')
const errorMessage = ref('')
const list = ref<PolicyRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)

async function loadData() {
  status.value = 'loading'
  try {
    const result = await fetchPolicyRecordPage({ page: page.value, pageSize: pageSize.value })
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

onMounted(loadData)
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.policy-record-list {
  &__title {
    margin: 0 0 $space-md;
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
}
</style>
