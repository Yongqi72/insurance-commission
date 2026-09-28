<template>
  <el-dialog
    id="modal-rule-edit"
    v-model="visible"
    :title="tier ? '编辑档位' : '新增档位'"
    :width="dialogWidth"
    align-center
    :before-close="handleBeforeClose"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item label="下限（票，含）" prop="lowerBound">
        <el-input id="input-tier-lower" v-model="form.lowerBound" type="number" class="commission-tier-edit-modal__input" />
      </el-form-item>
      <el-form-item label="上限（票，含；最高档留空=“及以上”）" prop="upperBound">
        <el-input id="input-tier-upper" v-model="form.upperBound" type="number" class="commission-tier-edit-modal__input" />
      </el-form-item>
      <el-form-item label="单价（元/票）" prop="unitPrice">
        <el-input
          id="input-tier-price"
          v-model="form.unitPrice"
          type="number"
          step="0.01"
          class="commission-tier-edit-modal__input"
        />
        <div v-if="conflictError" id="error-tier-conflict" class="commission-tier-edit-modal__field-error">
          {{ conflictError }}
        </div>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button id="btn-save-tier" type="primary" :loading="submitting" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import axios from 'axios'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { createCommissionTier, updateCommissionTier, type CommissionTier } from '@/api/commission-tier'
import type { ApiEnvelope } from '@/api/request'
import { useResponsiveDialogWidth } from '@/composables/useResponsiveDialogWidth'
import { ErrorCode } from '@/types/enums'

const props = defineProps<{
  visible: boolean
  tier: CommissionTier | null
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  saved: []
}>()

const dialogWidth = useResponsiveDialogWidth('480px')

// 父组件用 v-model:visible 控制打开/关闭；本地代理一份，既满足 el-dialog v-model 需要，
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

const formRef = ref<FormInstance>()
const form = reactive({
  lowerBound: '',
  upperBound: '',
  unitPrice: '',
})
const submitting = ref(false)
const conflictError = ref('')
// FE-EP-05：dirty 标志，字段变更置位，保存成功后复位；关闭前 dirty 为真需二次确认
const dirty = ref(false)
let initializing = false

function toNumberOrNull(value: string): number | null {
  if (value === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isNaN(parsed) ? null : parsed
}

const rules: FormRules = {
  lowerBound: [
    { required: true, message: '请输入下限', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        const lower = toNumberOrNull(value)
        if (lower === null || !Number.isInteger(lower) || lower < 0) {
          callback(new Error('下限必须为不小于 0 的整数'))
          return
        }
        const upper = toNumberOrNull(form.upperBound)
        if (upper !== null && lower > upper) {
          callback(new Error('下限不能大于上限'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  upperBound: [
    {
      validator: (_rule, value: string, callback) => {
        if (value === '') {
          // 留空表示"及以上"，合法
          callback()
          return
        }
        const upper = toNumberOrNull(value)
        if (upper === null || !Number.isInteger(upper) || upper < 0) {
          callback(new Error('上限必须为不小于 0 的整数'))
          return
        }
        const lower = toNumberOrNull(form.lowerBound)
        if (lower !== null && lower > upper) {
          callback(new Error('下限不能大于上限'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  unitPrice: [
    { required: true, message: '请输入单价', trigger: 'blur' },
    {
      validator: (_rule, value: string, callback) => {
        const price = toNumberOrNull(value)
        if (price === null || !Number.isFinite(price) || price <= 0 || price > 99999999.99) {
          callback(new Error('单价须大于 0 且不超过 99999999.99 元'))
          return
        }
        if (Math.abs(price * 100 - Math.round(price * 100)) > 1e-7) {
          callback(new Error('单价最多保留两位小数'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

// 弹窗打开时按 tier（编辑）或空值（新增）重置表单；放在 visible 变为 true 时处理，
// 而不是关闭时处理，避免关闭动画期间表单值被提前清空导致视觉跳变。
watch(visible, (value) => {
  if (!value) {
    return
  }
  initializing = true
  form.lowerBound = props.tier ? String(props.tier.lowerBound) : ''
  form.upperBound = props.tier && props.tier.upperBound !== null ? String(props.tier.upperBound) : ''
  form.unitPrice = props.tier ? String(props.tier.unitPrice) : ''
  conflictError.value = ''
  dirty.value = false
  nextTick(() => {
    formRef.value?.clearValidate()
    initializing = false
  })
})

watch(
  form,
  () => {
    if (initializing) {
      return
    }
    dirty.value = true
    // 用户重新编辑后清除上一次的冲突/校验错误提示，避免陈旧错误信息误导
    conflictError.value = ''
  },
  { deep: true },
)

function closeDialog() {
  visible.value = false
}

/** FE-EP-05：dirty 为真时二次确认，为假直接放行。 */
function confirmLeaveIfDirty(): Promise<boolean> {
  if (!dirty.value) {
    return Promise.resolve(true)
  }
  return ElMessageBox.confirm('当前档位的修改还没保存，确定要离开吗？未保存的内容会丢失。', '有未保存的修改', {
    type: 'warning',
    confirmButtonText: '放弃修改',
    cancelButtonText: '继续编辑',
  })
    .then(() => true)
    .catch(() => false)
}

function handleBeforeClose(done: () => void) {
  confirmLeaveIfDirty().then((canClose) => {
    if (canClose) {
      done()
    }
  })
}

function handleCancel() {
  confirmLeaveIfDirty().then((canClose) => {
    if (canClose) {
      closeDialog()
    }
  })
}

async function handleSave() {
  if (!formRef.value) {
    return
  }
  try {
    // FE-ASYNC-02：Promise 式校验
    await formRef.value.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    const payload = {
      lowerBound: Number(form.lowerBound),
      unitPrice: Number(form.unitPrice),
      ...(form.upperBound !== '' ? { upperBound: Number(form.upperBound) } : {}),
    }
    if (props.tier) {
      await updateCommissionTier(props.tier.id, payload)
    } else {
      await createCommissionTier(payload)
    }
    ElMessage.success('保存成功，已记入变更历史')
    dirty.value = false
    closeDialog()
    emit('saved')
  } catch (error) {
    // AC-11：1005（区间重叠）/1001（单价非正数、下限>上限）在字段错误区展示、不关闭弹窗；
    // 其余异常已由 request.ts 拦截器统一 toast 提示（FE-ASYNC-01），此处不重复弹窗。
    if (axios.isAxiosError<ApiEnvelope<unknown>>(error)) {
      const code = error.response?.data?.code
      if (code === ErrorCode.CONFLICT || code === ErrorCode.VALIDATION_FAILED) {
        conflictError.value = error.response?.data?.msg || '保存失败，请检查后重试'
      }
    }
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.commission-tier-edit-modal {
  &__input {
    width: $input-width-sm;
  }

  &__field-error {
    margin-top: $space-xs;
    font-size: $fs-small;
    color: $color-danger;
  }
}
</style>
