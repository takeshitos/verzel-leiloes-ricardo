import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section>
      <h1>Página não encontrada</h1>
      <p>O endereço acessado não existe.</p>
      <p>
        <Link to="/">Voltar ao início</Link>
      </p>
    </section>
  );
}
