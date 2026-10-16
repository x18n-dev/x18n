import { Trans, useTranslation } from 'react-i18next'

export function Login({ onForgot }: { onForgot: () => void }) {
  const { t } = useTranslation('auth', { keyPrefix: 'login' })
  return (
    <form>
      <h1>{t('title')}</h1>
      <label>{t('email')}<input type="email" /></label>
      <label>{t('password')}<input type="password" /></label>
      <button type="submit">{t('submit')}</button>
      <a onClick={onForgot}>{t('forgot')}</a>
      <button type="button">{t('common:cancel')}</button>
      <p>Need an account? Contact support.</p>
    </form>
  )
}
