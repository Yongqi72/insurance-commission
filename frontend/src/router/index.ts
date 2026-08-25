import { createRouter, createWebHistory } from 'vue-router'
import { TOKEN_KEY } from '@/constants/storage'

/**
 * 页面外壳（standards-frontend.md，foundation-design.md AppLayout 契约）：
 * 业务路由统一嵌套在 AppLayout 的 router-view 下；未登录访问业务路由重定向 /login。
 */
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      children: [
        {
          path: '',
          redirect: '/policy-records',
        },
        {
          path: 'policy-records',
          name: 'policy-record-list',
          component: () => import('@/views/PolicyRecordListView.vue'),
        },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const isPublic = to.meta.public === true
  const hasToken = !!localStorage.getItem(TOKEN_KEY)

  if (!isPublic && !hasToken) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (isPublic && hasToken && to.name === 'login') {
    return { path: '/' }
  }
  return true
})

export default router
