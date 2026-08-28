<template>
  <div class="import-panel">
    <div class="import-panel__head">
      <div class="import-panel__title">导入记录</div>
      <el-button id="btn-open-import" type="primary" @click="openImportDialog">导入 Excel</el-button>
    </div>

    <DataStateWrapper :status="status" :error-message="errorMessage" empty-text="暂无导入记录" @retry="loadImports">
      <div class="import-panel__table-wrapper">
        <el-table id="table-import-list" :data="list" border stripe row-key="id">
          <el-table-column prop="fileName" label="文件名" min-width="200" />
          <el-table-column label="导入时间" min-width="160">
            <template #default="{ row }: { row: ImportRecord }">
              {{ formatDateTime(row.importedAt) }}
            </template>
          </el-table-column>
          <el-table-column prop="successCount" label="成功" width="90" align="right" />
          <el-table-column prop="failCount" label="失败" width="90" align="right" />
          <el-table-column label="" width="90">
            <template #default="{ row }: { row: ImportRecord }">
              <el-button class="btn-delete-import" link type="danger" @click="handleDeleteImport(row)">
                删除
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </DataStateWrapper>

    <el-dialog
      id="modal-import"
      v-model="importDialogVisible"
      title="导入 Excel"
      :width="dialogWidth"
      align-center
      @closed="handleImportDialogClosed"
    >
      <div class="import-panel__upload-box">
        <input
          id="input-file-import"
          ref="fileInputRef"
          type="file"
          accept=".xlsx,.xls"
          class="import-panel__file-input"
          @change="handleFileChange"
        />
        <p class="import-panel__upload-hint">仅解析文件中名为「账单」的 sheet</p>
        <p v-if="selectedFile" class="import-panel__file-name">已选择：{{ selectedFile.name }}</p>
      </div>

      <div v-if="importResult" id="import-result" class="import-panel__result">
        <div>
          成功导入 <b>{{ importResult.successCount }}</b> 行，失败 <b>{{ importResult.failCount }}</b> 行
        </div>
        <ul v-if="importResult.failRows.length" class="import-panel__fail-list">
          <li v-for="failRow in importResult.failRows" :key="failRow.row">
            第 {{ failRow.row }} 行：{{ failRow.reason }}
          </li>
        </ul>
      </div>

      <template #footer>
        <el-button @click="importDialogVisible = false">关闭</el-button>
        <el-button
          id="btn-start-import"
          type="primary"
          :loading="importing"
          :disabled="!selectedFile"
          @click="handleStartImport"
        >
          开始导入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import DataStateWrapper from '@/components/DataStateWrapper.vue'
import {
  deleteImport,
  importExcel,
  listImports,
  type ImportExcelResult,
  type ImportRecord,
} from '@/api/commission-batch'
import { formatDateTime } from '@/utils/format'

type Status = 'loading' | 'empty' | 'error' | 'success'

const props = defineProps<{ batchId: string }>()

/**
 * 删除导入后对外广播"记录变更信号"：导入记录的增删会影响该批次下已回填的保单记录，
 * 供页面上关注这批数据的其他区块按需监听后触发各自的刷新；本包不预先绑定具体消费逻辑，属预留接口。
 */
const emit = defineEmits<{ 'records-changed': [] }>()

// design.md §六 响应式断点：Mobile < 768px 时弹窗改 95vw（FE-RESPONSIVE-01）
const MOBILE_BREAKPOINT_QUERY = '(max-width: 768px)'
const dialogWidth = ref('480px')
let mobileMediaQuery: ReturnType<typeof window.matchMedia> | undefined

function syncDialogWidth() {
  dialogWidth.value = mobileMediaQuery?.matches ? '95vw' : '480px'
}

const status = ref<Status>('loading')
const errorMessage = ref('')
const list = ref<ImportRecord[]>([])

const importDialogVisible = ref(false)
const importing = ref(false)
// eslint-disable-next-line no-undef -- File/HTMLInputElement 为浏览器内置全局类型，eslint.config.js globals 未登记
const selectedFile = ref<File | null>(null)
const importResult = ref<ImportExcelResult | null>(null)
// eslint-disable-next-line no-undef
const fileInputRef = ref<HTMLInputElement>()

async function loadImports() {
  status.value = 'loading'
  try {
    list.value = await listImports(props.batchId)
    status.value = list.value.length === 0 ? 'empty' : 'success'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '请求出错，请稍后重试'
    status.value = 'error'
  }
}

function openImportDialog() {
  importDialogVisible.value = true
}

function handleImportDialogClosed() {
  selectedFile.value = null
  importResult.value = null
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
  // AC-03：用户关闭弹窗后触发导入记录列表刷新
  loadImports()
}

// eslint-disable-next-line no-undef -- Event/HTMLInputElement 为浏览器内置全局类型，eslint.config.js globals 未登记
function handleFileChange(event: Event) {
  // eslint-disable-next-line no-undef
  const target = event.target as HTMLInputElement
  selectedFile.value = target.files?.[0] ?? null
  importResult.value = null
}

async function handleStartImport() {
  if (!selectedFile.value) {
    return
  }
  importing.value = true
  try {
    // 成功响应渲染于 #import-result；失败（如错误码 1001）由 request.ts 拦截器统一
    // ElMessage.error 透传后端 msg（FE-ASYNC-01），此处 catch 分支不写入结果区。
    importResult.value = await importExcel(props.batchId, selectedFile.value)
    await loadImports()
  } catch {
    // 已由拦截器提示，不重复弹窗
  } finally {
    importing.value = false
  }
}

async function handleDeleteImport(row: ImportRecord) {
  try {
    // FE-EP-03：删除类操作必须经 ElMessageBox.confirm 二次确认，type: 'warning'
    await ElMessageBox.confirm(
      '删除后，该次导入产生的全部保单记录将被移除，此操作不可撤销。原始文件仍保留在存档中。确定删除吗？',
      '删除该次导入',
      {
        type: 'warning',
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        customClass: 'import-panel__delete-confirm',
      },
    )
  } catch {
    return
  }

  try {
    await deleteImport(props.batchId, row.id)
    ElMessage.success('删除成功')
    await loadImports()
    emit('records-changed')
  } catch {
    // 已由拦截器提示，不重复弹窗
  }
}

watch(
  () => props.batchId,
  () => loadImports(),
)

onMounted(() => {
  loadImports()
  mobileMediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY)
  syncDialogWidth()
  mobileMediaQuery.addEventListener('change', syncDialogWidth)
})

onBeforeUnmount(() => {
  mobileMediaQuery?.removeEventListener('change', syncDialogWidth)
})
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.import-panel {
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

  &__table-wrapper {
    width: 100%;
    overflow-x: auto;
  }

  &__upload-box {
    padding: $space-lg;
    border: 1px dashed $border-color;
    border-radius: $radius-md;
    text-align: center;
    background-color: $bg-page;
  }

  &__file-input {
    width: 100%;
    font-size: $fs-body;
    cursor: pointer;
  }

  &__upload-hint {
    margin: $space-sm 0 0;
    font-size: $fs-small;
    color: $text-hint;
  }

  &__file-name {
    margin: $space-sm 0 0;
    font-size: $fs-caption;
    color: $text-primary;
  }

  &__result {
    margin-top: $space-md;
    padding: $space-md;
    border: 1px solid $border-color;
    border-radius: $radius-md;
    background-color: $bg-hover;
    font-size: $fs-caption;
    color: $text-primary;
  }

  &__fail-list {
    margin: $space-sm 0 0;
    padding-left: $space-lg;
    color: $color-danger;
    font-size: $fs-small;
  }
}
</style>

<!-- ElMessageBox 由 append-to-body 渲染，非本组件子树，scoped 样式选择器不可达，
     用独立的非 scoped 样式块承接（FE-SCSS-01：每个 style 块独立声明 @use）。 -->
<style lang="scss">
@use '@/styles/variables.scss' as *;

.import-panel__delete-confirm {
  @media (width <= $breakpoint-mobile) {
    width: 95vw;
    max-width: 95vw;
  }
}
</style>
