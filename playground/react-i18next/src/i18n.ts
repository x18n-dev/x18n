import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

void i18next.use(initReactI18next).init({ ns: ['common', 'auth'], defaultNS: 'common' })

export default i18next
