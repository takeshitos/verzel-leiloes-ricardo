import { z } from 'zod';

// Formato (parcial) de uma obra da Cleveland Museum of Art Open Access API.
// Validado com zod porque vem de fora: não confiamos no formato sem conferir.
const cmaImageSchema = z.object({
  url: z.url(),
  // A API devolve largura e altura como texto (ex.: "1166").
  width: z.union([z.string(), z.number()]).optional(),
  height: z.union([z.string(), z.number()]).optional(),
});

export const cmaArtworkSchema = z.object({
  id: z.number().int().positive(),
  accession_number: z.string().nullish(),
  title: z.string().min(1),
  creators: z.array(z.object({ description: z.string().nullish() })).nullish(),
  creation_date: z.string().nullish(),
  technique: z.string().nullish(),
  type: z.string().nullish(),
  culture: z.union([z.array(z.string()), z.string()]).nullish(),
  measurements: z.string().nullish(),
  share_license_status: z.string(),
  url: z.string().nullish(),
  images: z.object({ web: cmaImageSchema.nullish() }).nullish(),
});

export type CmaArtwork = z.infer<typeof cmaArtworkSchema>;

/** Dados que vão para a tabela item_snapshots. */
export type ItemSnapshotInput = {
  provider: 'cma';
  externalId: string;
  accessionNumber: string | null;
  title: string;
  creators: string | null;
  creationDate: string | null;
  technique: string | null;
  itemType: string | null;
  culture: string | null;
  measurements: string | null;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  sourceUrl: string | null;
  license: string;
  raw: unknown;
  fetchedAt: Date;
};

function toPositiveInt(value: string | number | undefined): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function emptyToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Converte uma obra da Cleveland em snapshot local.
 * Só aceita obras CC0 (as únicas com imagem liberada para uso livre).
 */
export function normalizeCmaArtwork(input: unknown, fetchedAt: Date): ItemSnapshotInput {
  const artwork = cmaArtworkSchema.parse(input);

  if (artwork.share_license_status !== 'CC0') {
    throw new Error(`Obra ${artwork.id} não é CC0 (${artwork.share_license_status}).`);
  }

  const creators = (artwork.creators ?? [])
    .map((creator) => emptyToNull(creator.description))
    .filter((description): description is string => description !== null)
    .join('; ');
  const culture = Array.isArray(artwork.culture) ? artwork.culture.join('; ') : artwork.culture;
  const webImage = artwork.images?.web ?? null;

  return {
    provider: 'cma',
    externalId: String(artwork.id),
    accessionNumber: emptyToNull(artwork.accession_number),
    title: artwork.title.trim(),
    creators: emptyToNull(creators),
    creationDate: emptyToNull(artwork.creation_date),
    technique: emptyToNull(artwork.technique),
    itemType: emptyToNull(artwork.type),
    culture: emptyToNull(culture),
    measurements: emptyToNull(artwork.measurements),
    imageUrl: webImage?.url ?? null,
    imageWidth: toPositiveInt(webImage?.width),
    imageHeight: toPositiveInt(webImage?.height),
    sourceUrl: emptyToNull(artwork.url),
    license: 'CC0',
    raw: input,
    fetchedAt,
  };
}
