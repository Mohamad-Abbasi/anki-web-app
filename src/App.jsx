import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import HomePage from './pages/HomePage.jsx';
import StudyPage from './pages/StudyPage.jsx';
import BrowsePage from './pages/BrowsePage.jsx';
import StatsPage from './pages/StatsPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

// HashRouter انتخاب شده تا روی GitHub Pages بدون نیاز به پیکربندی سرور
// (و در حالت نصب‌شده روی آیفون) به‌درستی کار کند.
export default function App() {
  return (
    <HashRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/study/:deckId" element={<StudyPage />} />
          <Route path="/browse/:deckId" element={<BrowsePage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Layout>
    </HashRouter>
  );
}
