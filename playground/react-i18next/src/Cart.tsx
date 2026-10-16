import i18next from 'i18next'
import { useTranslation } from 'react-i18next'

export function Cart({ count, name }: { count: number, name: string }) {
  const { t } = useTranslation()
  return (
    <div>
      <p>{t('welcome', { name })}</p>
      <p>{t('item', { count })}</p>
      <button>{t('save')}</button>
      <button>{t('checkout')}</button>
    </div>
  )
}

export const logoutLabel = (): string => i18next.t('auth:logout')
