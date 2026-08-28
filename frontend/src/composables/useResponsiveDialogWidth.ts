import { onBeforeUnmount, onMounted, ref } from 'vue'

// design.md §六 响应式断点：Mobile < 768px（FE-RESPONSIVE-01）
const MOBILE_BREAKPOINT_QUERY = '(max-width: 768px)'

/**
 * 响应式弹窗/抽屉宽度（design.md §六 响应式规则，FE-RESPONSIVE-01）：
 * 移动端（<768px）降级为 mobileWidth（弹窗通常 95vw、抽屉通常 100%），否则用 desktopWidth。
 * 多处弹窗/抽屉都需要监听同一断点、在移动端与桌面端宽度之间切换，
 * 此前各处各自手写了一份字节级相同的 matchMedia 监听样板代码；
 * 提炼为共享 composable 后，后续新增弹窗/抽屉直接复用，不再重复实现。
 */
export function useResponsiveDialogWidth(desktopWidth: string, mobileWidth = '95vw') {
  const width = ref(desktopWidth)
  let mediaQuery: ReturnType<typeof window.matchMedia> | undefined

  function sync() {
    width.value = mediaQuery?.matches ? mobileWidth : desktopWidth
  }

  onMounted(() => {
    mediaQuery = window.matchMedia(MOBILE_BREAKPOINT_QUERY)
    sync()
    mediaQuery.addEventListener('change', sync)
  })

  onBeforeUnmount(() => {
    mediaQuery?.removeEventListener('change', sync)
  })

  return width
}
