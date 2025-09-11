"use client"

import { createContext, useContext, useState, ReactNode } from 'react'
import { flow } from '@/lib/flow-tracker'
import { en } from '@/lib/translations/en'
import { es } from '@/lib/translations/es'
import { fr } from '@/lib/translations/fr'
import { zh } from '@/lib/translations/zh'
import { vi } from '@/lib/translations/vi'

type TranslationValue = string | { [key: string]: TranslationValue }

type Translations = {
  [key: string]: TranslationValue
}

const translations: { [key: string]: Translations } = {
  en,
  es,
  fr,
  zh,
  vi
}

type TranslationsContextType = {
  t: (key: string) => string
  locale: string
  setLocale: (locale: string) => void
}

const TranslationsContext = createContext<TranslationsContextType | null>(null)

export function TranslationsProvider({ children }: { children: ReactNode }) {
  // FLOW OVERVIEW (i18n)
  // 1. Provider mounts -> initial locale 'en'
  // 2. setLocale(..) called -> locale.change event
  // 3. t(key) lookups -> only misses are logged (avoid noise)
  const [locale, setLocaleState] = useState('en')
  flow.step('i18n', 1, 'provider.mount', { locale: 'en' })

  const setLocale = (next: string) => {
    if (next === locale) return
    flow.step('i18n', 2, 'locale.change', { from: locale, to: next })
    setLocaleState(next)
  }

  const t = (key: string): string => {
    const keys = key.split('.')
    let value: TranslationValue = translations[locale]
    for (const k of keys) {
      if (value === undefined) {
        flow.event('i18n', 't.lookup.miss', { key, locale })
        return key
      }
      value = typeof value === 'object' ? value[k] : key
    }
    if (typeof value !== 'string') {
      flow.event('i18n', 't.lookup.miss', { key, locale })
      return key
    }
    return value
  }

  return (
    <TranslationsContext.Provider value={{ t, locale, setLocale }}>
      {children}
    </TranslationsContext.Provider>
  )
}

export function useTranslations() {
  const context = useContext(TranslationsContext)
  if (!context) {
    throw new Error('useTranslations must be used within a TranslationsProvider')
  }
  return context
} 