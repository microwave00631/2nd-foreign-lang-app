import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { DEFAULT_SETTINGS, getSettings, saveSettings, type Settings } from '../db/schema';

interface SettingsCtx {
  settings: Settings;
  update: (patch: Partial<Settings>) => Promise<void>;
  loaded: boolean;
}

const Ctx = createContext<SettingsCtx>({
  settings: DEFAULT_SETTINGS,
  update: async () => {},
  loaded: false,
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
    });
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const next = await saveSettings(patch);
    setSettings(next);
  }, []);

  return <Ctx.Provider value={{ settings, update, loaded }}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  return useContext(Ctx);
}
