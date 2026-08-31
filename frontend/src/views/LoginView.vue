<template>
  <div class="login-view">
    <div class="login-view__brand" aria-hidden="true" />
    <div class="login-view__panel">
      <div class="login-view__panel-inner">
        <img class="login-view__logo" src="/logoimgloxson.png" alt="LOXSON" />
        <h1 class="login-view__title">保单提成管理系统</h1>
        <el-form ref="formRef" :model="form" :rules="rules" label-width="0" @submit.prevent>
          <el-form-item prop="username">
            <el-input v-model="form.username" placeholder="账号" size="large" :prefix-icon="User" />
          </el-form-item>
          <el-form-item prop="password">
            <el-input
              v-model="form.password"
              type="password"
              placeholder="密码"
              size="large"
              show-password
              :prefix-icon="Lock"
              @keyup.enter="handleSubmit"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" size="large" :loading="submitting" class="login-view__submit" @click="handleSubmit">
              登录
            </el-button>
          </el-form-item>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage } from 'element-plus'
import { User, Lock } from '@element-plus/icons-vue'
import { login } from '@/api/auth'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({
  username: '',
  password: '',
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleSubmit() {
  if (!formRef.value) {
    return
  }
  try {
    await formRef.value.validate()
  } catch {
    return
  }

  submitting.value = true
  try {
    const result = await login({ username: form.username, password: form.password })
    authStore.setToken(result.accessToken)
    ElMessage.success('登录成功')
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/'
    router.push(redirect)
  } catch {
    // 错误提示已由 api/request.ts 响应拦截器统一 toast（FE-ASYNC-01）
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.login-view {
  display: flex;
  min-height: 100vh;

  &__brand {
    flex: 0 0 62%;
    width: 62%;
    background-image: url('/bgimgloxson.jpg');

    /* stylelint-disable scale-unlimited/declaration-strict-value -- 结构性关键字（非色值/非量纲），
       variables.scss 无对应 token 可引用；background-repeat / background-position / background-size
       是背景图正确渲染所必需的固定取值，不属于设计 token 管辖范畴 */
    background-repeat: no-repeat;
    background-position: center;
    background-size: cover;

    /* stylelint-enable scale-unlimited/declaration-strict-value */
  }

  &__panel {
    position: relative;
    flex: 1;
    min-width: 0;
    background-color: $bg-page;
  }

  &__panel-inner {
    position: absolute;
    top: 33.333%;
    left: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
    max-width: 360px;
    padding: $space-xl;
    transform: translate(-50%, -50%);

    :deep(.el-form) {
      width: 100%;
    }
  }

  &__logo {
    max-width: 200px;
    height: auto;
    object-fit: contain;
    margin-bottom: $space-lg;
  }

  &__title {
    margin: 0 0 $space-xl;
    font-size: $fs-h3;
    font-weight: $fw-h1;
    color: $text-primary;
    text-align: center;
  }

  &__submit {
    width: 100%;
  }
}

@media (width <= $breakpoint-mobile) {
  .login-view {
    &__brand {
      display: none;
    }

    &__panel {
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: center;
      width: 100%;
    }

    &__panel-inner {
      position: static;
      max-width: 100%;
      padding: $space-lg;
      transform: none;
    }
  }
}
</style>
