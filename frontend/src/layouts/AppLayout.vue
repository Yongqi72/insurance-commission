<template>
  <div class="app-layout">
    <header class="app-layout__header">
      <div class="app-layout__brand">
        <span class="app-layout__title">保单提成管理系统</span>
        <nav class="app-layout__nav">
          <router-link class="app-layout__nav-link" :to="{ name: 'batch-list' }">提成批次</router-link>
          <router-link class="app-layout__nav-link" :to="{ name: 'commission-tier' }">提成阶梯规则</router-link>
        </nav>
      </div>
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
    padding: 0 $space-lg;
    background-color: $bg-card;
    border-bottom: 1px solid $border-color;
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: $space-lg;
  }

  &__title {
    font-size: $fs-body;
    font-weight: 600;
    color: $text-primary;
  }

  &__nav {
    display: flex;
    align-items: center;
    gap: $space-md;
  }

  &__nav-link {
    font-size: $fs-caption;
    color: $text-secondary;
    text-decoration: none;
    transition: $transition-fast;

    &:hover {
      color: $primary;
    }

    &.router-link-active {
      color: $primary;
      font-weight: 600;
    }
  }

  &__content {
    flex: 1;
    padding: $space-lg;
  }
}
</style>
