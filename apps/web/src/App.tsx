import { NavLink, Route, Routes } from 'react-router';
import { AboutPage } from './pages/AboutPage';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

export function App() {
  return (
    <div className="layout">
      <header className="site-header">
        <NavLink to="/" className="brand">
          Casa de Leilões
        </NavLink>
        <nav aria-label="Navegação principal">
          <NavLink to="/" end>
            Início
          </NavLink>
          <NavLink to="/sobre">Sobre</NavLink>
        </nav>
      </header>

      <main className="content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/sobre" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <footer className="site-footer">Simulação para teste técnico. Nenhum valor é real.</footer>
    </div>
  );
}
