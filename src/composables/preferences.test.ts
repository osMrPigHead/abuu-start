import { describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '@/utils/storage'

async function loadHomeCards(stored?: unknown) {
  window.localStorage.clear()
  if (stored !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.homeCards, JSON.stringify(stored))
  }
  vi.resetModules()
  return import('@/composables/useHomeCards')
}

async function loadHomeDisplay(stored?: unknown) {
  window.localStorage.clear()
  if (stored !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.homeDisplay, JSON.stringify(stored))
  }
  vi.resetModules()
  return import('@/composables/useHomeDisplay')
}

async function loadYgdkSettings(stored?: unknown) {
  window.localStorage.clear()
  if (stored !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.ygdkSettings, JSON.stringify(stored))
  }
  vi.resetModules()
  return import('@/composables/useYgdkSettings')
}

async function loadScheduleSettings(stored?: unknown) {
  window.localStorage.clear()
  if (stored !== undefined) {
    window.localStorage.setItem(STORAGE_KEYS.scheduleHighlightLeadMinutes, JSON.stringify(stored))
  }
  vi.resetModules()
  return import('@/composables/useScheduleSettings')
}

describe('useHomeCards', () => {
  it('无存储时默认全部开启', async () => {
    const { useHomeCards } = await loadHomeCards()
    const { visibility } = useHomeCards()
    expect(visibility).toEqual({
      schedule: true,
      bykc: true,
      todo: true,
      focus: true,
      ygdk: true,
    })
  })

  it('只把明确的 false 当作关闭', async () => {
    const { useHomeCards } = await loadHomeCards({ schedule: false, todo: 'no' })
    const { visibility } = useHomeCards()
    expect(visibility.schedule).toBe(false)
    expect(visibility.todo).toBe(true)
  })

  it('setVisible 修改状态并持久化', async () => {
    const { useHomeCards } = await loadHomeCards()
    const { visibility, setVisible } = useHomeCards()
    expect(setVisible('focus', false)).toBe(true)
    expect(visibility.focus).toBe(false)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.homeCards) ?? '{}')).toMatchObject({
      focus: false,
    })
  })
})

describe('useHomeDisplay', () => {
  it('无存储时使用默认显示状态', async () => {
    const { useHomeDisplay } = await loadHomeDisplay()
    expect(useHomeDisplay().display).toEqual({
      showFunctionArea: true,
      showActionButtons: true,
      minimalMode: false,
    })
  })

  it('读取已保存的 false 与 minimalMode', async () => {
    const { useHomeDisplay } = await loadHomeDisplay({
      showFunctionArea: false,
      showActionButtons: false,
      minimalMode: true,
    })
    expect(useHomeDisplay().display).toEqual({
      showFunctionArea: false,
      showActionButtons: false,
      minimalMode: true,
    })
  })

  it('setter 修改并持久化', async () => {
    const { useHomeDisplay } = await loadHomeDisplay()
    const { display, setMinimalMode, setShowFunctionArea, setShowActionButtons } =
      useHomeDisplay()

    expect(setMinimalMode(true)).toBe(true)
    expect(setShowFunctionArea(false)).toBe(true)
    expect(setShowActionButtons(false)).toBe(true)
    expect(display.minimalMode).toBe(true)
    expect(display.showFunctionArea).toBe(false)
    expect(display.showActionButtons).toBe(false)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.homeDisplay) ?? '{}')).toEqual({
      showFunctionArea: false,
      showActionButtons: false,
      minimalMode: true,
    })
  })
})

describe('useYgdkSettings', () => {
  it('无存储时使用默认目标', async () => {
    const { useYgdkSettings } = await loadYgdkSettings()
    const settings = useYgdkSettings()
    expect(settings.termTarget.value).toBe(16)
    expect(settings.weekTarget.value).toBe(4)
  })

  it('接受数字字符串并回退非法值', async () => {
    const { useYgdkSettings } = await loadYgdkSettings({ termTarget: '30', weekTarget: 99 })
    const settings = useYgdkSettings()
    expect(settings.termTarget.value).toBe(30)
    expect(settings.weekTarget.value).toBe(4)
  })

  it('setter 校验并持久化', async () => {
    const { useYgdkSettings } = await loadYgdkSettings()
    const settings = useYgdkSettings()
    expect(settings.setTermTarget(0)).toBe(false)
    expect(settings.setWeekTarget(15)).toBe(false)
    expect(settings.setTermTarget(40)).toBe(true)
    expect(settings.setWeekTarget(6)).toBe(true)
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEYS.ygdkSettings) ?? '{}')).toEqual({
      termTarget: 40,
      weekTarget: 6,
    })
  })
})

describe('useScheduleSettings', () => {
  it('无存储时默认 30 分钟', async () => {
    const { useScheduleSettings } = await loadScheduleSettings()
    expect(useScheduleSettings().highlightLeadMinutes.value).toBe(30)
  })

  it('读取合法数字或数字字符串', async () => {
    const first = await loadScheduleSettings(45)
    expect(first.useScheduleSettings().highlightLeadMinutes.value).toBe(45)

    const second = await loadScheduleSettings('60')
    expect(second.useScheduleSettings().highlightLeadMinutes.value).toBe(60)
  })

  it('非法值回退默认，setter 校验并持久化', async () => {
    const { useScheduleSettings } = await loadScheduleSettings(999)
    const settings = useScheduleSettings()
    expect(settings.highlightLeadMinutes.value).toBe(30)

    expect(settings.setHighlightLeadMinutes(181)).toBe(false)
    expect(settings.setHighlightLeadMinutes(0)).toBe(true)
    expect(settings.highlightLeadMinutes.value).toBe(0)
    expect(
      JSON.parse(
        window.localStorage.getItem(STORAGE_KEYS.scheduleHighlightLeadMinutes) ?? 'null',
      ),
    ).toBe(0)
  })
})
