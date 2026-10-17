import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type { TextStyle, ViewStyle } from 'react-native';

import { getItemAsync, setItemAsync } from '@/lib/storage';

import { mergeMessages, type MessageEntry } from './define';
import { common } from './messages/common';
import { account } from './messages/account';
import { home } from './messages/home';
import { explore } from './messages/explore';
import { project } from './messages/project';
import { unit } from './messages/unit';
import { assistant } from './messages/assistant';
import { tools } from './messages/tools';
import { saved } from './messages/saved';
import { leads } from './messages/leads';
import { deals } from './messages/deals';
import { notifications } from './messages/notifications';
import { viewings } from './messages/viewings';
import { calculators } from './messages/calculators';
import { developer } from './messages/developer';
import { ceo } from './messages/ceo';
import { broker } from './messages/broker';
import { aiSearch } from './messages/ai-search';
import { settings } from './messages/settings';
import { inquiries } from './messages/inquiries';
import { content } from './messages/content';
import { blog } from './messages/blog';
import { careers } from './messages/careers';
import { press } from './messages/press';
import { contact } from './messages/contact';
import { ceoProjects } from './messages/ceo-projects';
import { ceoCatalog } from './messages/ceo-catalog';
import { ceoPeople } from './messages/ceo-people';
import { ceoOps } from './messages/ceo-ops';
import { compare } from './messages/compare';
import { dashboard } from './messages/dashboard';
import { alerts } from './messages/alerts';
import { pano } from './messages/pano';
import { afford } from './messages/afford';
import { reviews } from './messages/reviews';
import { rentbuy } from './messages/rentbuy';
import { offers } from './messages/offers';
import { areas } from './messages/areas';
import { locations } from './messages/locations';
import { share } from './messages/share';
import { vn } from './messages/voicenotes';
import { brate } from './messages/brate';
import { ceoMetrics } from './messages/ceo-metrics';
import { ceoDeals } from './messages/ceo-deals';
import { ceoInv } from './messages/ceo-inventory';
import { ceoPipe } from './messages/ceo-pipeline';
import { guide } from './messages/guide';
import { ceoStaging } from './messages/ceo-staging';

/**
 * Bilingual (ar/en) runtime.
 *
 * Mirrors the website's `LanguageProvider`: a flat dotted key space, a `t()`
 * that falls back to the key, and a choice kept on the device rather than on
 * the server — except that here both languages travel together and `t()` is
 * typed, so an untranslated string cannot ship.
 *
 * ## Layout direction
 *
 * RTL is applied *explicitly* rather than through `I18nManager.forceRTL()`.
 * That call flips the whole layout but only takes effect after the native
 * bundle restarts, which would strand an Arabic user in a left-to-right app
 * until they killed it. Every kit component instead reads `isRtl` from this
 * provider and picks `row` / `row-reverse` and `left` / `right` itself, so the
 * switch is instant and behaves identically on iOS, Android and web.
 */
const KEY = 'ghaya.lang';

export type Lang = 'en' | 'ar';

const TABLES = mergeMessages(
  common,
  account,
  home,
  explore,
  project,
  unit,
  assistant,
  tools,
  saved,
  leads,
  deals,
  notifications,
  viewings,
  calculators,
  developer,
  ceo,
  broker,
  aiSearch,
  settings,
  inquiries,
  content,
  blog,
  careers,
  press,
  contact,
  ceoProjects,
  ceoCatalog,
  ceoPeople,
  ceoOps,
  compare,
  dashboard,
  ceoMetrics,
  ceoDeals,
  ceoInv,
  ceoPipe,
  ceoStaging,
  guide,
  alerts,
  pano,
  afford,
  reviews,
  rentbuy,
  offers,
  areas,
  locations,
  share,
  vn,
  brate,
);

export type MessageKey =
  | keyof typeof common
  | keyof typeof account
  | keyof typeof home
  | keyof typeof explore
  | keyof typeof project
  | keyof typeof unit
  | keyof typeof assistant
  | keyof typeof tools
  | keyof typeof saved
  | keyof typeof leads
  | keyof typeof deals
  | keyof typeof notifications
  | keyof typeof viewings
  | keyof typeof calculators
  | keyof typeof developer
  | keyof typeof ceo
  | keyof typeof broker
  | keyof typeof aiSearch
  | keyof typeof settings
  | keyof typeof inquiries
  | keyof typeof content
  | keyof typeof blog
  | keyof typeof careers
  | keyof typeof press
  | keyof typeof contact
  | keyof typeof ceoProjects
  | keyof typeof ceoCatalog
  | keyof typeof ceoPeople
  | keyof typeof ceoOps
  | keyof typeof compare
  | keyof typeof dashboard
  | keyof typeof ceoMetrics
  | keyof typeof ceoDeals
  | keyof typeof ceoInv
  | keyof typeof ceoPipe
  | keyof typeof ceoStaging
  | keyof typeof guide
  | keyof typeof alerts
  | keyof typeof pano
  | keyof typeof afford
  | keyof typeof reviews
  | keyof typeof rentbuy
  | keyof typeof offers
  | keyof typeof areas
  | keyof typeof locations
  | keyof typeof share
  | keyof typeof vn
  | keyof typeof brate;

type I18nContextValue = {
  lang: Lang;
  setLang: (next: Lang) => void;
  isRtl: boolean;
  /** Translate. Unknown keys return the key itself rather than throwing. */
  t: (key: MessageKey) => string;
  /** `flexDirection` that follows the language — spread onto row containers. */
  row: ViewStyle;
  /** Writing direction only — safe to add to *centered* text without moving it. */
  text: TextStyle;
  /** `text` plus edge alignment, for text that must sit on the reading edge. */
  align: TextStyle;
  /** Pick the Arabic value when the language is Arabic, else the English. */
  pick: <T>(english: T, arabic: T) => T;
  /** Prefer a model's `*Arabic` column when Arabic is on and it is populated. */
  localized: (english: string | null | undefined, arabic?: string | null) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readEntry(entry: MessageEntry | undefined, lang: Lang): string {
  if (!entry) return '';
  return lang === 'ar' ? entry[1] : entry[0];
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  // Restore before the first meaningful paint so an Arabic user does not get
  // a frame of English — the same "read storage first" rule CurrencyProvider
  // follows.
  useEffect(() => {
    getItemAsync(KEY)
      .then((raw) => {
        if (raw === 'ar' || raw === 'en') setLangState(raw);
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    setItemAsync(KEY, next).catch(() => {});
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const isRtl = lang === 'ar';
    return {
      lang,
      setLang,
      isRtl,
      t: (key) => readEntry(TABLES[key], lang) || String(key),
      row: { flexDirection: isRtl ? 'row-reverse' : 'row' } as ViewStyle,
      text: { writingDirection: isRtl ? 'rtl' : 'ltr' } as TextStyle,
      align: {
        textAlign: isRtl ? 'right' : 'left',
        writingDirection: isRtl ? 'rtl' : 'ltr',
      } as TextStyle,
      pick: (english, arabic) => (isRtl ? arabic : english),
      localized: (english, arabic) => {
        if (isRtl && arabic) return arabic;
        return english ?? arabic ?? '';
      },
    };
  }, [lang, setLang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

export type { MessageEntry };
