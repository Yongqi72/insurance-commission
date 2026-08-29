<template>
  <div class="app-layout">
    <header class="app-layout__header">
      <div class="app-layout__brand">
        <span class="app-layout__title">保单提成管理系统</span>
        <nav class="app-layout__nav">
          <router-link
            class="app-layout__nav-link"
            :class="{ 'router-link-active': isBatchNavActive }"
            :to="{ name: 'batch-list' }"
          >
            提成批次
          </router-link>
          <router-link class="app-layout__nav-link" :to="{ name: 'commission-tier' }">提成阶梯规则</router-link>
        </nav>
      </div>
      <el-button class="app-layout__logout" link @click="handleLogout">退出登录</el-button>
    </header>
    <main class="app-layout__content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

// batch-detail（/commission-batches/:id）与 batch-list 是路由平级关系（非嵌套子路由），
// vue-router 的 router-link-active 默认按 matched 路由记录判定，不会把 batch-detail
// 页面算作"提成批次"这一导航项的激活态，需要手动按当前路由名补一条判定。
const isBatchNavActive = computed(() => route.name === 'batch-detail')

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
    background-color: $primary;
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
    color: $text-on-primary;
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
    color: rgb(255 255 255 / 75%);
    text-decoration: none;
    transition: $transition-fast;

    &:hover {
      color: $text-on-primary;
      background-color: rgb(255 255 255 / 12%);
    }

    &.router-link-active {
      color: $text-on-primary;
      font-weight: $fw-h3;
      background-color: rgb(255 255 255 / 18%);
    }
  }

  // 顶栏改深色底后，退出登录若仍用 type="primary" 的默认蓝色文字会与背景同色不可见，
  // 模板已去掉 type="primary"，此处显式指定白色系文字，hover 态提亮到纯白。
  &__logout.el-button.is-link {
    color: rgb(255 255 255 / 75%);

    &:hover {
      color: $text-on-primary;
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
