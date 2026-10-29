import { Link } from 'react-router';

type Props = { title?: string; message?: string };

/** Página de não encontrado. Não revela nada interno (nem se o endereço "quase" existe). */
export function NotFoundPage({ title = 'Página não encontrada', message = 'O endereço acessado não existe.' }: Props) {
  return (
    <section className="not-found">
      <p className="eyebrow">Erro 404</p>
      <h1>{title}</h1>
      <p>{message}</p>
      <p>
        <Link to="/">Voltar para a vitrine</Link>
      </p>
    </section>
  );
}
