import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import WeekSwitcher from '@/components/WeekSwitcher.vue'
import type { Week } from '@shared/api'

const weeks: Week[] = [
  { serialNumber: 1, name: '第1周', startDate: '', endDate: '', curWeek: false },
  { serialNumber: 2, name: '第2周', startDate: '', endDate: '', curWeek: true },
  { serialNumber: 3, name: '第3周', startDate: '', endDate: '', curWeek: false },
]

describe('WeekSwitcher', () => {
  it('渲染周次选项并标记当前周', () => {
    const wrapper = mount(WeekSwitcher, {
      props: { selectedWeek: 2, currentWeek: 2, weeks, canPrev: true, canNext: true },
    })

    const options = wrapper.findAll('option')
    expect(options).toHaveLength(3)
    expect(options[1]?.text()).toBe('第 2 周（当前）')
  })

  it('canPrev / canNext 控制按钮禁用', () => {
    const wrapper = mount(WeekSwitcher, {
      props: { selectedWeek: 2, currentWeek: 2, weeks, canPrev: false, canNext: true },
    })

    const buttons = wrapper.findAll('button')
    expect(buttons[0]?.attributes('disabled')).toBeDefined()
    expect(buttons[1]?.attributes('disabled')).toBeUndefined()
  })

  it('点击上一周/下一周 emit 目标周次', async () => {
    const wrapper = mount(WeekSwitcher, {
      props: { selectedWeek: 2, currentWeek: 2, weeks, canPrev: true, canNext: true },
    })

    const buttons = wrapper.findAll('button')
    await buttons[0]?.trigger('click')
    await buttons[1]?.trigger('click')

    expect(wrapper.emitted('select')).toEqual([[1], [3]])
  })

  it('下拉选择 emit 数字周次', async () => {
    const wrapper = mount(WeekSwitcher, {
      props: { selectedWeek: 2, currentWeek: 2, weeks, canPrev: true, canNext: true },
    })

    await wrapper.get('select').setValue('3')
    expect(wrapper.emitted('select')?.[0]).toEqual([3])
  })

  it('无周次表时显示当前周次文案', () => {
    const wrapper = mount(WeekSwitcher, {
      props: { selectedWeek: 5, currentWeek: null, weeks: [], canPrev: false, canNext: false },
    })

    expect(wrapper.text()).toContain('第 5 周')
    expect(wrapper.find('select').exists()).toBe(false)
  })
})
