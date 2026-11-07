export interface Settings {
  /** Encryption switch default on the Encode page */
  defaultEncrypt: boolean;
  /** Payload per page, in MiB */
  pageMiB: number;
  /** Keep a local, metadata-only history (never files, passwords or keys) */
  keepHistory: boolean;
}

export const PAGE_SIZE_CHOICES = [2, 4, 8, 16] as const;
export const DEFAULT_SETTINGS: Settings = { defaultEncrypt: true, pageMiB: 8, keepHistory: false };
const KEY = 'pixti.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<Settings>;
    return {
      defaultEncrypt: typeof p.defaultEncrypt === 'boolean' ? p.defaultEncrypt : DEFAULT_SETTINGS.defaultEncrypt,
      pageMiB: (PAGE_SIZE_CHOICES as readonly number[]).includes(p.pageMiB ?? -1) ? (p.pageMiB as number) : DEFAULT_SETTINGS.pageMiB,
      keepHistory: p.keepHistory === true,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable (private mode etc.): settings simply won't persist */
  }
}
