import { useState } from 'react';

const PLACEHOLDER = '/obra-sem-imagem.svg';

type ArtworkImageProps = {
  /** URL salva no snapshot do lote (CDN do museu). null quando a obra não tem imagem. */
  src: string | null;
  alt: string;
  width?: number | null;
  height?: number | null;
  className?: string;
};

/**
 * Imagem da obra com fallback local: se a URL do museu não carregar (CDN fora do ar,
 * bloqueio, obra sem imagem), mostra o placeholder servido pelo próprio app.
 * Os demais dados do lote continuam vindo do snapshot local.
 */
export function ArtworkImage({ src, alt, width, height, className }: ArtworkImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPlaceholder = !src || failedSrc === src;

  return (
    <img
      className={className}
      src={showPlaceholder ? PLACEHOLDER : src}
      alt={showPlaceholder ? `${alt} (imagem indisponível)` : alt}
      width={width ?? undefined}
      height={height ?? undefined}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (src) setFailedSrc(src);
      }}
    />
  );
}
