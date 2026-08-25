import { defineStore } from 'pinia'
import { TOKEN_KEY } from '@/constants/storage'

/**
 * 鉴权状态：token 跨刷新持久化到 localStorage（FE-STORE-01），
 * key 统一走常量引用（FE-CONST-01）。
 */
export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) as string | null,
  }),
  getters: {
    isLoggedIn: (state) => !!state.token,
  },
  actions: {
    setToken(token: string) {
      this.token = token
      localStorage.setItem(TOKEN_KEY, token)
    },
    /**
     * 退出登录：除清空自身 token 外，须调用全部业务 store 的 reset()（FE-STORE-02）。
     * V0 走骨架仅有本 auth store，无其他业务 store；后续新增业务 store 须在此登记调用。
     */
    logout() {
      this.token = null
      localStorage.removeItem(TOKEN_KEY)
    },
  },
})
