import { Router } from 'express';
import type { Pool } from 'pg';
import { z } from 'zod';
import { centsSchema, MAX_LOT_VALUE_CENTS } from '../../shared/money.js';
import { parseBody } from '../../shared/validation.js';
import { requireRole } from '../auth/middleware.js';
import type { CatalogClient } from '../catalog/client.js';
import { requireLotOwner } from './ownership.js';
import { listSellerLots, sellerSummary } from './queries.js';
import { cancelLot, createLot } from './service.js';


// Data ISO 8601 com fuso explícito (Z ou -03:00). Guardada e devolvida em UTC.
const dateSchema = (label: string) =>
  z.iso
    .datetime({ offset: true, error: `${label}: use data e hora ISO 8601 com fuso (ex.: 2026-10-29T15:00:00-03:00).` })
    .transform((value) => new Date(value));

// strictObject: o vendedor não envia título, imagem, atributos nem dono. Campos extras são recusados.
const createLotSchema = z
  .strictObject({
    externalId: z.string({ error: 'Escolha uma obra do catálogo.' }).regex(/^\d{1,10}$/, 'Obra inválida.'),
    startingBidCents: centsSchema('O lance inicial', MAX_LOT_VALUE_CENTS),
    minIncrementCents: centsSchema('O incremento mínimo', MAX_LOT_VALUE_CENTS),
    startsAt: dateSchema('Início'),
    endsAt: dateSchema('Fim'),
  })
  .refine((input) => input.endsAt > input.startsAt, { path: ['endsAt'], message: 'O fim precisa ser depois do início.' });

export function createLotsRouter({ pool, catalog }: { pool: Pool; catalog: CatalogClient }) {
  const router = Router();

  router.post('/lots', requireRole('seller'), async (req, res) => {
    const input = parseBody(createLotSchema, req.body);
    const lot = await createLot(pool, catalog, req.user!.id, input);
    res.status(201).json({ lot });
  });

  router.post('/lots/:id/cancel', requireRole('seller'), requireLotOwner(pool), async (req, res) => {
    const lot = await cancelLot(pool, req.user!.id, req.params.id as string);
    res.json({ lot });
  });

  // Painel do leiloeiro: só os lotes dele, inclusive cancelados, e o total efetivamente recebido.
  router.get('/seller/lots', requireRole('seller'), async (req, res) => {
    res.json({ lots: await listSellerLots(pool, req.user!.id) });
  });

  router.get('/seller/summary', requireRole('seller'), async (req, res) => {
    res.json({ summary: await sellerSummary(pool, req.user!.id) });
  });

  return router;
}
