import { useTranslations } from 'next-intl'

export default function Page() {
  const t = useTranslations('Home')
  return (
    <main>
      <h1>{t('title', { name: 'Ada' })}</h1>
      <p>{t.rich('intro', { b: chunks => <b>{chunks}</b> })}</p>
      <a href="/start">{t('cta')}</a>
      <p>{t('subtitle')}</p>
    </main>
  )
}
