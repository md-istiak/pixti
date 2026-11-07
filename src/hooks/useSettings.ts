import { useCallback, useState } from 'react';
import { loadSettings, saveSettings } from '../utils/settings.ts';
import type { Settings } from '../utils/settings.ts';

export function useSettings(): [Settings, (patch: Partial<Settings>) => void] {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  return [settings, update];
}
