// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  buildLoginForm,
  captchaDataUrl,
  captchaUrl,
  classifyLoginFailure,
  looksLikeLoginPage,
  parseLoginPage,
} from './authCas.ts'

const loginHtml = `<!doctype html>
<html>
  <body>
    <form method="post">
      <input type="hidden" name="lt" value="LT-1" />
      <input type="hidden" name="execution" value="e1s1" />
      <input type="text" name="username" />
      <script>config.captcha = {id: 'captcha-1'}</script>
    </form>
  </body>
</html>`

describe('auth login page parsing', () => {
  it('parseLoginPage 提取 execution、hidden 与 captchaId', () => {
    const page = parseLoginPage(loginHtml)
    expect(page.execution).toBe('e1s1')
    expect(page.captchaId).toBe('captcha-1')
    expect(page.hidden).toEqual({ lt: 'LT-1', execution: 'e1s1' })
  })

  it('缺少 execution 时返回 null', () => {
    const page = parseLoginPage('<html><body>维护中</body></html>')
    expect(page.execution).toBeNull()
    expect(page.captchaId).toBeNull()
    expect(page.hidden).toEqual({})
  })

  it('looksLikeLoginPage 识别登录页', () => {
    expect(looksLikeLoginPage(loginHtml)).toBe(true)
    expect(looksLikeLoginPage('<html><body>维护中</body></html>')).toBe(false)
  })

  it('captchaUrl 对 captchaId 编码', () => {
    expect(captchaUrl('a b')).toContain('captchaId=a%20b')
  })

  it('captchaDataUrl 使用合法图片类型并回退 jpeg', () => {
    expect(captchaDataUrl('image/png; charset=utf-8', Buffer.from('xx'))).toBe(
      'data:image/png;base64,eHg=',
    )
    expect(captchaDataUrl('text/html', Buffer.from('xx'))).toBe(
      'data:image/jpeg;base64,eHg=',
    )
    expect(captchaDataUrl(null, Buffer.from('xx'))).toBe('data:image/jpeg;base64,eHg=')
  })

  it('buildLoginForm 复制 hidden 并覆盖必要字段', () => {
    const form = buildLoginForm(
      { lt: 'LT-1', execution: 'old', extra: '1' },
      { username: '20370001', password: 'secret', execution: 'e1s1', captcha: '1234' },
    )

    expect(form.get('lt')).toBe('LT-1')
    expect(form.get('extra')).toBe('1')
    expect(form.get('username')).toBe('20370001')
    expect(form.get('password')).toBe('secret')
    expect(form.get('execution')).toBe('e1s1')
    expect(form.get('_eventId')).toBe('submit')
    expect(form.get('submit')).toBe('登录')
    expect(form.get('type')).toBe('username_password')
    expect(form.get('captcha')).toBe('1234')
    expect(form.get('captchaResponse')).toBe('1234')
  })

  it('buildLoginForm 无验证码时不附加 captcha 字段', () => {
    const form = buildLoginForm({}, {
      username: 'u',
      password: 'p',
      execution: 'e',
      captcha: null,
    })
    expect(form.has('captcha')).toBe(false)
    expect(form.has('captchaResponse')).toBe(false)
  })
})

describe('auth login failure classification', () => {
  it('验证码错误', () => {
    const error = classifyLoginFailure(
      '<div class="tip-text">验证码错误或已过期</div>',
      'https://sso.buaa.edu.cn/login',
    )
    expect(error.code).toBe('CAPTCHA_INVALID')
  })

  it('密码过期或账号安全风险', () => {
    const error = classifyLoginFailure(
      '<input name="continueForm" />',
      'https://sso.buaa.edu.cn/login',
    )
    expect(error.code).toBe('PASSWORD_EXPIRED')
  })

  it('URL 中的 exception.message 归为上游错误', () => {
    const error = classifyLoginFailure(
      '',
      'https://sso.buaa.edu.cn/login?exception.message=boom',
    )
    expect(error.code).toBe('UPSTREAM_ERROR')
    expect(error.message).toBe('boom')
  })

  it('账号或密码错误文案归为凭据错误', () => {
    const error = classifyLoginFailure(
      '<div id="errorDiv">用户名或密码错误</div>',
      'https://sso.buaa.edu.cn/login',
    )
    expect(error.code).toBe('INVALID_CREDENTIALS')
    expect(error.message).toBe('学号或密码错误')
  })

  it('仍然返回登录页时归为凭据错误', () => {
    const error = classifyLoginFailure(loginHtml, 'https://sso.buaa.edu.cn/login')
    expect(error.code).toBe('INVALID_CREDENTIALS')
  })

  it('无法识别时回退上游错误', () => {
    const error = classifyLoginFailure('', 'https://sso.buaa.edu.cn/login')
    expect(error.code).toBe('UPSTREAM_ERROR')
    expect(error.message).toBe('统一认证登录失败，请稍后重试')
  })
})
