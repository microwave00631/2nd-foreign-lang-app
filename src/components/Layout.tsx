import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar';

export function Layout() {
  return (
    <>
      <main className="page">
        <Outlet />
      </main>
      <NavBar />
    </>
  );
}
