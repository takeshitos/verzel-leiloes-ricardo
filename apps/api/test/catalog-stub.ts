// Servidor HTTP local que imita a API da Cleveland nos testes. O código de produção
// é o mesmo; só o endereço configurado muda. Permite provocar 429, 500, timeout etc.
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

const FIXTURES = new URL('../../../docs/fixtures/catalog/', import.meta.url);

/** Respostas reais salvas na etapa 01 (docs/fixtures/catalog). */
export const fixtureSearch = JSON.parse(readFileSync(new URL('cma-artworks-search.json', FIXTURES), 'utf8'));
export const fixtureItem152006 = JSON.parse(readFileSync(new URL('cma-artwork-152006.json', FIXTURES), 'utf8'));

export type StubHandler = (req: IncomingMessage, res: ServerResponse, url: URL) => void;

export type CatalogStub = {
  baseUrl: string;
  /** URLs recebidas, na ordem. */
  requests: URL[];
  setHandler(handler: StubHandler): void;
  close(): Promise<void>;
};

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

/** Handler padrão: busca devolve a fixture de busca; /artworks/152006 devolve a fixture do item. */
export const realFixturesHandler: StubHandler = (_req, res, url) => {
  if (url.pathname === '/api/artworks/') return sendJson(res, 200, fixtureSearch);
  if (url.pathname === '/api/artworks/152006') return sendJson(res, 200, fixtureItem152006);
  return sendJson(res, 404, { detail: 'Artwork not found' });
};

export async function startCatalogStub(handler: StubHandler = realFixturesHandler): Promise<CatalogStub> {
  let current = handler;
  const requests: URL[] = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://stub.local');
    requests.push(url);
    current(req, res, url);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}/api/`,
    requests,
    setHandler(next) {
      current = next;
    },
    close() {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
