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
    padding: 0 $space-xl;
    background-color: $bg-card;
    box-shadow: $shadow-sm;
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: $space-xl;
  }

  &__title {
    font-size: $fs-body;
    font-weight: $fw-h3;
    color: $text-primary;
    letter-spacing: 0.2px;
  }

  &__nav {
    display: flex;
    align-items: center;
    gap: $space-xs;
  }

  &__nav-link {
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 $space-md;
    border-radius: $radius-full;
    font-size: $fs-caption;
    color: $text-secondary;
    text-decoration: none;
    transition: $transition-fast;

    &:hover {
      color: $primary;
      background-color: $bg-hover;
    }

    &.router-link-active {
      color: $primary;
      font-weight: $fw-h3;
      background-color: $primary-light;
    }
  }

  &__content {
    flex: 1;
    width: 100%;
    max-width: $content-max-width;
    margin: 0 auto;
    padding: $space-xl;
  }
}

// design.md §六响应式断点：Mobile < 768px。窄屏下标题+导航+退出登录挤在固定 56px
// 单行高度里放不下完整标题文案，此前会逐字断行；标题让位给导航链接，导航链接自身
// 收紧内边距，保证单行不换行。
@media (width <= $breakpoint-mobile) {
  .app-layout {
    &__header {
      padding: 0 $space-md;
    }

    &__brand {
      gap: $space-sm;
    }

    &__title {
      display: none;
    }

    &__nav-link {
      padding: 0 $space-sm;
    }

    &__content {
      padding: $space-md;
    }
  }
}
</style>
