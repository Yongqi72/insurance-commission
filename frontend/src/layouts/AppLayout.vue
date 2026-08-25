<template>
  <div class="app-layout">
    <header class="app-layout__header">
      <span class="app-layout__title">保单提成管理系统</span>
      <el-button link type="primary" @click="handleLogout">退出登录</el-button>
    </header>
    <main class="app-layout__content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

function handleLogout() {
  authStore.logout()
  router.push('/login')
}
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100%;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: $layout-header-height;
    padding: 0 $space-5;
    background-color: $bg-card;
    border-bottom: 1px solid $border-color;
  }

  &__title {
    font-size: $font-size-lg;
    font-weight: 600;
    color: $text-primary;
  }

  &__content {
    flex: 1;
    padding: $space-5;
  }
}
</style>
