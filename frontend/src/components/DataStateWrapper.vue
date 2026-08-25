<template>
  <div class="data-state-wrapper">
    <el-skeleton v-if="status === 'loading'" :rows="5" animated class="data-state-wrapper__loading" />

    <el-result
      v-else-if="status === 'error'"
      icon="error"
      title="加载失败"
      :sub-title="errorMessage || '请求出错，请稍后重试'"
      class="data-state-wrapper__error"
    >
      <template #extra>
        <el-button type="primary" @click="emit('retry')">重试</el-button>
      </template>
    </el-result>

    <el-empty v-else-if="status === 'empty'" :description="emptyText" class="data-state-wrapper__empty" />

    <slot v-else />
  </div>
</template>

<script setup lang="ts">
/**
 * 数据页公共脚手架（standards-frontend.md 状态四态）：
 * status 切换 loading/empty/error/success 四态，success 态渲染默认 slot。
 * 读请求失败反馈由本组件的 error 态承接，组件内不重复弹 toast（FE-ASYNC-01）。
 */
withDefaults(
  defineProps<{
    status: 'loading' | 'empty' | 'error' | 'success'
    errorMessage?: string
    emptyText?: string
  }>(),
  {
    errorMessage: '',
    emptyText: '暂无数据',
  },
)

const emit = defineEmits<{ retry: [] }>()
</script>

<style scoped lang="scss">
.data-state-wrapper {
  width: 100%;
}
</style>
