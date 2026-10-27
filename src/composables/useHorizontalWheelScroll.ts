import { onBeforeUnmount, ref, type ComponentPublicInstance } from 'vue'

type HorizontalWheelOptions = {
  /** 消费事件时阻止继续冒泡，避免外层横向区域同时滚动。 */
  consume?: boolean
}

/**
 * 把竖向滚轮转换为横向平滑滚动。
 * 指针下方已有可纵向滚动的元素时保留原生竖向滚动；横向手势与 Ctrl + 滚轮交给浏览器。
 */
export function useHorizontalWheelScroll(options: HorizontalWheelOptions = {}) {
  const scrollRef = ref<HTMLElement | null>(null)
  let targetScrollLeft = 0
  let frame: number | null = null
  let lastFrameTime = 0
  let settleTimer: number | null = null
  let lastWheelDirection = 0

  /** 作为模板 `:ref` 使用；同时避免字符串 ref 在脚本侧被判定为未使用。 */
  function setScrollElement(element: Element | ComponentPublicInstance | null): void {
    scrollRef.value = element instanceof HTMLElement ? element : null
  }

  function maxScrollLeft(element: HTMLElement): number {
    return Math.max(0, element.scrollWidth - element.clientWidth)
  }

  function clearSettleTimer(): void {
    if (settleTimer !== null) {
      clearTimeout(settleTimer)
      settleTimer = null
    }
  }

  function cancelAnimation(): void {
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }
    lastFrameTime = 0
    lastWheelDirection = 0
    clearSettleTimer()
  }

  /** 结束动画并落到目标；目标越过边界时交给浏览器钳到实际滚动端点。 */
  function finishAnimation(): void {
    if (frame !== null) {
      cancelAnimationFrame(frame)
      frame = null
    }

    const element = scrollRef.value
    if (element) {
      const max = maxScrollLeft(element)
      if (targetScrollLeft <= 0) element.scrollLeft = 0
      else if (targetScrollLeft >= max) element.scrollLeft = element.scrollWidth
      else element.scrollLeft = targetScrollLeft
    }

    lastFrameTime = 0
    lastWheelDirection = 0
    clearSettleTimer()
  }

  function scheduleSettle(): void {
    clearSettleTimer()
    settleTimer = window.setTimeout(() => {
      settleTimer = null
      if (frame !== null) finishAnimation()
    }, 240)
  }

  function animate(time: number): void {
    const element = scrollRef.value
    if (!element) {
      frame = null
      return
    }

    const distance = targetScrollLeft - element.scrollLeft
    if (Math.abs(distance) < 0.5) {
      finishAnimation()
      return
    }

    const delta = lastFrameTime === 0 ? 16.7 : Math.min(64, time - lastFrameTime)
    lastFrameTime = time
    // 指数趋近目标值；连续滚轮只更新目标，动画不必重启，避免逐次跳变。
    const ease = 1 - Math.exp(-delta / 55)
    const before = element.scrollLeft
    element.scrollLeft += distance * ease

    // 已到浏览器实际边界时不再等待收敛，直接吸附到目标端点。
    if (element.scrollLeft === before) {
      finishAnimation()
      return
    }

    frame = requestAnimationFrame(animate)
  }

  function hasVerticalScrollTarget(target: EventTarget | null): boolean {
    const boundary = scrollRef.value
    let element = target instanceof Element ? target : null

    while (element && element !== boundary) {
      if (element instanceof HTMLElement && element.scrollHeight > element.clientHeight + 1) {
        const { overflowY } = getComputedStyle(element)
        if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return true
      }
      element = element.parentElement
    }

    return false
  }

  function prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  }

  function onWheel(event: WheelEvent): void {
    const element = scrollRef.value
    if (!element || event.defaultPrevented || event.ctrlKey) return
    // 触摸板横向手势交给浏览器原生横向滚动。
    if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
    if (hasVerticalScrollTarget(event.target)) return

    const max = maxScrollLeft(element)
    if (max <= 0) return

    const unit =
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? element.clientHeight
          : 1
    const delta = event.deltaY * unit
    const direction = Math.sign(delta)

    event.preventDefault()
    if (options.consume) event.stopPropagation()

    if (prefersReducedMotion()) {
      cancelAnimation()
      element.scrollLeft += delta
      return
    }

    // 目标不预先钳到计算出的端点，由浏览器在真正越界时钳位，避免两端差一截。
    if (frame === null) {
      targetScrollLeft = element.scrollLeft
    } else if (direction !== 0 && lastWheelDirection !== 0 && direction !== lastWheelDirection) {
      targetScrollLeft = element.scrollLeft
    }

    targetScrollLeft += delta
    lastWheelDirection = direction

    if (frame === null) {
      lastFrameTime = 0
      frame = requestAnimationFrame(animate)
    }
    scheduleSettle()
  }

  onBeforeUnmount(cancelAnimation)

  return { setScrollElement, onWheel }
}
