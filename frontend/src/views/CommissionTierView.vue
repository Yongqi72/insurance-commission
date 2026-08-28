<template>
  <div class="commission-tier-view">
    <div class="commission-tier-view__head">
      <h1 class="commission-tier-view__title">提成阶梯规则</h1>
      <div class="commission-tier-view__actions">
        <el-button id="btn-view-rule-history" @click="historyVisible = true">查看变更历史</el-button>
        <el-button id="btn-add-tier" type="primary" @click="openAddModal">+ 新增档位</el-button>
      </div>
    </div>

    <el-alert
      v-if="status === 'success' && !ruleComplete"
      id="hint-rule-incomplete"
      class="commission-tier-view__incomplete-hint"
      title="规则不完整（存在空隙），提成计算暂不可用"
      type="warning"
      show-icon
      :closable="false"
    />

    <DataStateWrapper :status="status" :error-message="errorMessage" empty-text="暂未配置提成规则" @retry="loadTiers">
      <div class="commission-tier-view__table-wrapper">
        <el-table id="table-rule-list" :data="tiers" border stripe row-key="id">
          <el-table-column label="下限（票）" width="120">
            <template #default="{ row }: { row: CommissionTier }">{{ row.lowerBound }}</template>
          </el-table-column>
          <el-table-column label="上限（票）" width="120">
            <template #default="{ row }: { row: CommissionTier }">
              {{ row.upperBound === null ? '及以上' : row.upperBound }}
            </template>
          </el-table-column>
          <el-table-column label="单价（元/票）" align="right" min-width="140">
            <template #default="{ row }: { row: CommissionTier }">{{ row.unitPrice.toFixed(2) }}</template>
          </el-table-column>
          <el-table-column label="" width="140">
            <template #default="{ row }: { row: CommissionTier }">
              <el-button link type="primary" @click="openEditModal(row)">编辑</el-button>
              <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </DataStateWrapper>

    <CommissionTierEditModal v-model:visible="modalVisible" :tier="editingTier" @saved="handleSaved" />
    <CommissionTierHistoryDrawer v-model:visible="historyVisible" />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DataStateWrapper from '@/components/DataStateWrapper.vue'
import CommissionTierEditModal from '@/components/CommissionTierEditModal.vue'
import CommissionTierHistoryDrawer from '@/components/CommissionTierHistoryDrawer.vue'
import { deleteCommissionTier, fetchCommissionTiers, type CommissionTier } from '@/api/commission-tier'

type Status = 'loading' | 'empty' | 'error' | 'success'

const status = ref<Status>('loading')
const errorMessage = ref('')
const tiers = ref<CommissionTier[]>([])
// TRD：ruleComplete 由后端 GET /api/commission-tiers 判定，前端不自行重算完整性
const ruleComplete = ref(true)

const modalVisible = ref(false)
const editingTier = ref<CommissionTier | null>(null)
const historyVisible = ref(false)

/**
 * quiet=true 用于新增/编辑/删除成功后的局部刷新：保留当前已渲染内容，不重置为 loading 骨架，
 * 也不在失败时把已有列表覆盖为错误态（失败反馈已由 request.ts 拦截器统一 toast，FE-ASYNC-01）。
 */
async function loadTiers(options: { quiet?: boolean } = {}) {
  if (!options.quiet) {
    status.value = 'loading'
  }
  try {
    const result = await fetchCommissionTiers()
    tiers.value = result.tiers
    ruleComplete.value = result.ruleComplete
    status.value = result.tiers.length === 0 ? 'empty' : 'success'
  } catch (error) {
    if (!options.quiet) {
      errorMessage.value = error instanceof Error ? error.message : '请求出错，请稍后重试'
      status.value = 'error'
    }
  }
}

function openAddModal() {
  editingTier.value = null
  modalVisible.value = true
}

function openEditModal(row: CommissionTier) {
  editingTier.value = row
  modalVisible.value = true
}

function handleSaved() {
  loadTiers({ quiet: true })
}

async function handleDelete(row: CommissionTier) {
  try {
    // FE-EP-03：删除类操作必须经 ElMessageBox.confirm 二次确认，type: 'warning'
    await ElMessageBox.confirm('删除该档位？删除后请确认相邻档位是否需要一并调整以消除空隙。', '删除档位', {
      type: 'warning',
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  try {
    await deleteCommissionTier(row.id)
    ElMessage.success('删除成功，已记入变更历史')
    await loadTiers({ quiet: true })
  } catch {
    // 已由拦截器提示，不重复弹窗
  }
}

onMounted(() => loadTiers())
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.commission-tier-view {
  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: $space-sm;
    margin-bottom: $space-md;
  }

  &__title {
    margin: 0;
    font-size: $fs-h2;
    color: $text-primary;
  }

  &__actions {
    display: flex;
    gap: $space-sm;
  }

  &__incomplete-hint {
    margin-bottom: $space-md;
  }

  &__table-wrapper {
    width: 100%;
    overflow-x: auto;
  }
}
</style>
