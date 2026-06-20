import { useEffect } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Gate } from './components/Gate';
import { HomePage } from './pages/Home';
import { SearchPage } from './pages/Search';
import { QuizPage } from './pages/Quiz';
import { WordsPage } from './pages/Words';
import { StatsPage } from './pages/Stats';
import { SettingsPage } from './pages/Settings';
import { SettingsProvider } from './context/SettingsContext';
import { seedDictionaries } from './db/seed';
import { registerPeriodicSync, startForegroundTimer } from './lib/notify';

export function App() {
  useEffect(() => {
    void seedDictionaries();
    startForegroundTimer();
    void registerPeriodicSync();
  }, []);

  return (
    <Gate>
      <SettingsProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/quiz" element={<QuizPage />} />
              <Route path="/words" element={<WordsPage />} />
              <Route path="/stats" element={<StatsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SettingsProvider>
    </Gate>
  );
}
