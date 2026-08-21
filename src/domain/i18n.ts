// ---------------------------------------------------------------------------
// Localisation architecture — thin, offline-first, no runtime library.
//
// Revise ships in en-GB today but the scaffolding must not require a rewrite
// when a second locale lands. So: locale is a value, not a build flag;
// every user-facing string that will be localised goes through `t()`;
// dictionaries are plain JSON and can be split per route; formatting uses
// Intl where available and falls back deterministically where it is not.
//
// No component reads `navigator.language` directly — `detectLocale()` is the
// single entry point so tests stay deterministic and the choice is auditable.
// ---------------------------------------------------------------------------

export type Locale = "en-GB" | "en" | "cy" | "fr";
export const SUPPORTED_LOCALES: readonly Locale[] = ["en-GB", "en", "cy", "fr"] as const;
export const DEFAULT_LOCALE: Locale = "en-GB";

/** Minimal dictionary shape: flat keys so tooling can lint missing entries. */
export type Dictionary = Record<string, string>;

const DICTIONARIES: Record<Locale, Dictionary> = {
  "en-GB": {
    "nav.today": "Today",
    "nav.review": "Review",
    "nav.study": "Study",
    "nav.practice": "Practice",
    "nav.plan": "Plan",
    "nav.progress": "Progress",
    "nav.from-notes": "From notes",
    "nav.cards": "Cards",
    "nav.papers": "Past papers",
    "nav.library": "Library",
    "nav.tutor": "Tutor",
    "nav.settings": "Settings",
    "search.placeholder": "Search topics, cards and questions…",
    "search.aria": "Search",
    "search.empty": "Nothing matches “{query}”.",
    "offline.banner": "Offline — everything still works and will sync when you reconnect.",
    "onboarding.title": "Revision that knows what to do next",
    "a11y.skip": "Skip to content",
  },
  en: {
    "nav.today": "Today",
    "nav.review": "Review",
    "nav.study": "Study",
    "nav.practice": "Practice",
    "nav.plan": "Plan",
    "nav.progress": "Progress",
    "nav.from-notes": "From notes",
    "nav.cards": "Cards",
    "nav.papers": "Past papers",
    "nav.library": "Library",
    "nav.tutor": "Tutor",
    "nav.settings": "Settings",
    "search.placeholder": "Search topics, cards and questions…",
    "search.aria": "Search",
    "search.empty": "Nothing matches “{query}”.",
    "offline.banner": "Offline — everything still works and will sync when you reconnect.",
    "onboarding.title": "Revision that knows what to do next",
    "a11y.skip": "Skip to content",
  },
  cy: {
    "nav.today": "Heddiw",
    "nav.review": "Adolygu",
    "nav.study": "Astudio",
    "nav.practice": "Ymarfer",
    "nav.plan": "Cynllun",
    "nav.progress": "Cynnydd",
    "nav.from-notes": "O nodiadau",
    "nav.cards": "Cardiau",
    "nav.papers": "Papurau blaenorol",
    "nav.library": "Llyfrgell",
    "nav.tutor": "Tiwtor",
    "nav.settings": "Gosodiadau",
    "search.placeholder": "Chwilio pynciau, cardiau a chwestiynau…",
    "search.aria": "Chwilio",
    "search.empty": "Dim byd yn cyfateb i “{query}”.",
    "offline.banner": "All-lein — mae popeth yn dal i weithio a bydd yn cydamseru pan fyddwch yn ailgysylltu.",
    "onboarding.title": "Adolygu sy’n gwybod beth i’w wneud nesaf",
    "a11y.skip": "Neidio at y cynnwys",
  },
  fr: {
    "nav.today": "Aujourd’hui",
    "nav.review": "Réviser",
    "nav.study": "Étudier",
    "nav.practice": "S’entraîner",
    "nav.plan": "Planning",
    "nav.progress": "Progrès",
    "nav.from-notes": "Depuis les notes",
    "nav.cards": "Cartes",
    "nav.papers": "Anciens sujets",
    "nav.library": "Bibliothèque",
    "nav.tutor": "Tuteur",
    "nav.settings": "Réglages",
    "search.placeholder": "Rechercher thèmes, cartes et questions…",
    "search.aria": "Rechercher",
    "search.empty": "Aucun résultat pour « {query} ».",
    "offline.banner": "Hors ligne — tout continue de fonctionner et se synchronisera à la reconnexion.",
    "onboarding.title": "Des révisions qui savent quoi faire ensuite",
    "a11y.skip": "Aller au contenu",
  },
};

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** Pick the best locale from an ordered preference list (e.g. navigator.languages). */
export function detectLocale(preferred: readonly string[], fallback: Locale = DEFAULT_LOCALE): Locale {
  for (const raw of preferred) {
    const norm = raw.trim();
    if (isSupportedLocale(norm)) return norm;
    // Accept bare language codes: \"cy\" matches \"cy\", \"en\" matches \"en-GB\" fallback.
    const lang = norm.split("-")[0]?.toLowerCase();
    if (lang === "cy") return "cy";
    if (lang === "fr") return "fr";
    if (lang === "en") return "en-GB";
  }
  return fallback;
}

export function dictionaryFor(locale: Locale): Dictionary {
  return DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE];
}

export function hasKey(locale: Locale, key: string): boolean {
  return key in dictionaryFor(locale);
}

/** Translate `key` in `locale`, interpolating `{param}` placeholders. Falls back to en-GB, then to key. */
export function t(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const dict = dictionaryFor(locale);
  const fallback = DICTIONARIES[DEFAULT_LOCALE];
  let template = dict[key] ?? fallback[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      template = template.replaceAll(`{${k}}`, String(v));
    }
  }
  return template;
}

/** Locale-aware date formatting — uses Intl when available, ISO fallback otherwise. */
export function formatDateLocale(iso: string, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function formatNumberLocale(value: number, locale: Locale, opts?: Intl.NumberFormatOptions): string {
  try {
    return new Intl.NumberFormat(locale, opts).format(value);
  } catch {
    return String(value);
  }
}

/** Contract helper: every supported locale must have the same key set (no silent gaps). */
export function missingKeys(locale: Locale): string[] {
  const base = Object.keys(DICTIONARIES[DEFAULT_LOCALE]);
  const dict = dictionaryFor(locale);
  return base.filter((k) => !(k in dict));
}

export function extraKeys(locale: Locale): string[] {
  const base = new Set(Object.keys(DICTIONARIES[DEFAULT_LOCALE]));
  return Object.keys(dictionaryFor(locale)).filter((k) => !base.has(k));
}
