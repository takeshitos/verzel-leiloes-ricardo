import { useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router';
import { ROLE_LABEL, useAuth } from './auth/useAuth';
import { RequireRole } from './components/RequireRole';
import { AboutPage } from './pages/AboutPage';
import { AuditPage } from './pages/AuditPage';
import { LoginPage } from './pages/LoginPage';
import { LotPage } from './pages/LotPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ParticipationsPage } from './pages/ParticipationsPage';
import { ReceiptPage } from './pages/ReceiptPage';
import { SellerPage } from './pages/SellerPage';
import { ShowcasePage } from './pages/ShowcasePage';
import { WalletPage } from './pages/WalletPage';

function SiteHeader() {
  const { state, user, logout } = useAuth();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);

  async function handleLogout() {
    setLeaving(true);
    try {
      await logout();
      navigate('/');
    } finally {
      setLeaving(false);
    }
  }

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">
            ◆
          </span>
          Casa de Leilões
        </Link>

        {/* Links conforme o papel. É só conveniência: a API recusa o que o papel não pode. */}
        <nav aria-label="Navegação principal" className="main-nav">
          <NavLink to="/" end>
            Vitrine
          </NavLink>
          {user?.role === 'bidder' && (
            <>
              <NavLink to="/carteira">Carteira</NavLink>
              <NavLink to="/participacoes">Participações</NavLink>
            </>
          )}
          {user?.role === 'seller' && <NavLink to="/painel">Painel</NavLink>}
          <NavLink to="/sobre">Sobre</NavLink>
        </nav>

        <div className="session">
          {state.status === 'loading' && <span className="muted small">...</span>}
          {state.status === 'anonymous' && (
            <Link to="/entrar" className="button button-primary button-small">
              Entrar
            </Link>
          )}
          {user && (
            <>
              <span className="session-user">
                <strong>{user.publicAlias}</strong>
                <span className="muted small">{ROLE_LABEL[user.role]}</span>
              </span>
              <button type="button" className="button button-secondary button-small" onClick={handleLogout} disabled={leaving}>
                {leaving ? 'Saindo...' : 'Sair'}
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function App() {
  return (
    <div className="layout">
      <a href="#conteudo" className="skip-link">
        Pular para o conteúdo
      </a>
      <SiteHeader />

      <main id="conteudo" className="content" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<ShowcasePage />} />
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/lotes/:id" element={<LotPage />} />
          <Route path="/lotes/:id/auditoria" element={<AuditPage />} />
          <Route path="/comprovantes/:token" element={<ReceiptPage />} />
          <Route
            path="/carteira"
            element={
              <RequireRole role="bidder">
                <WalletPage />
              </RequireRole>
            }
          />
          <Route
            path="/participacoes"
            element={
              <RequireRole role="bidder">
                <ParticipationsPage />
              </RequireRole>
            }
          />
          <Route
            path="/painel"
            element={
              <RequireRole role="seller">
                <SellerPage />
              </RequireRole>
            }
          />
          <Route path="/sobre" element={<AboutPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <footer className="site-footer">
        Leilão simulado para teste técnico. Nenhum valor é real. Obras: Cleveland Museum of Art Open Access (CC0).
      </footer>
    </div>
  );
}
