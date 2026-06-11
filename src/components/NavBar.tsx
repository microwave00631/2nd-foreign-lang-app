import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/', icon: '🏠', label: 'ホーム' },
  { to: '/search', icon: '🔍', label: '翻訳' },
  { to: '/quiz', icon: '✏️', label: 'クイズ' },
  { to: '/words', icon: '📚', label: '単語帳' },
  { to: '/stats', icon: '📊', label: '統計' },
  { to: '/settings', icon: '⚙️', label: '設定' },
];

export function NavBar() {
  return (
    <nav className="tabbar">
      <div className="wrap">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? 'active' : '')} end={t.to === '/'}>
            <span className="icon">{t.icon}</span>
            <span>{t.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
