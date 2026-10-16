import { getTranslations } from 'next-intl/server'

export default async function Pricing() {
  const t = await getTranslations({ namespace: 'Pricing' })
  return <section><h1>{t('title')}</h1><p>{t('plans', { count: 3 })}</p></section>
}
