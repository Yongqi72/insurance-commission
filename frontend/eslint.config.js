import js from '@eslint/js'
import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import vuePlugin from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import prettierConfig from 'eslint-config-prettier'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  js.configs.recommended,
  ...vuePlugin.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        import: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        Event: 'readonly',
        HTMLInputElement: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // FE-COMP-01：<template> → <script setup> → <style> 固定顺序
      'vue/block-order': [
        'error',
        { order: ['template', 'script', 'style'] },
      ],
      // FE-BUILD-01：禁止 CommonJS require()
      'no-restricted-globals': ['error', 'require'],
      '@typescript-eslint/no-explicit-any': 'warn',
      'vue/multi-word-component-names': 'off',
      'no-console': ['warn', { allow: ['error'] }],
      'no-warning-comments': ['warn', { terms: ['todo', 'fixme'], location: 'anywhere' }],
      // TS 允许同名 const + type 合并声明（如 ErrorCode 常量对象 + 联合类型），核心规则不识别，关闭改由 TS 自身校验
      'no-redeclare': 'off',
    },
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        localStorage: 'readonly',
        console: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        Event: 'readonly',
        HTMLInputElement: 'readonly',
        URL: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['error'] }],
      'no-warning-comments': ['warn', { terms: ['todo', 'fixme'], location: 'anywhere' }],
    },
  },
  prettierConfig,
]
