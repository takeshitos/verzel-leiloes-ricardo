# Fixtures do catálogo

Respostas reais copiadas byte a byte das APIs públicas na etapa 01. Coleta feita com `curl`, sem autenticação.

**Finalidade:** evidência da validação da API e base para testes automatizados de parsing e normalização. **Não use estes arquivos para substituir a integração real em produção** nem para esconder falha da API externa.

| Arquivo | Origem (URL exata) | Coleta (UTC) | Status |
| --- | --- | --- | --- |
| `cma-artworks-search.json` | `https://openaccess-api.clevelandart.org/api/artworks/?q=landscape&cc0=1&has_image=1&limit=2&fields=id,accession_number,title,creators,creation_date,technique,type,culture,measurements,share_license_status,images,url` | 2026-10-29T00:49:02Z | 200 |
| `cma-artwork-152006.json` | `https://openaccess-api.clevelandart.org/api/artworks/152006` | 2026-10-29T00:49:01Z | 200 |
| `aic-artworks-search.json` | `https://api.artic.edu/api/v1/artworks/search?q=landscape&query[term][is_public_domain]=true&fields=id,title,artist_display,date_display,medium_display,dimensions,place_of_origin,credit_line,image_id,is_public_domain,thumbnail,api_link&limit=2&page=1` (cabeçalho `AIC-User-Agent` identificando o projeto) | 2026-10-29T00:47:01Z | 200 |

## Licenças informadas pelas fontes

- **Cleveland Museum of Art Open Access:** dados em CC0. Só obras com `share_license_status = "CC0"` trazem imagens CC0 (documentação em https://openaccess-api.clevelandart.org/).
- **Art Institute of Chicago:** o campo `info.license_text` da própria resposta informa CC0 para os dados, exceto `description` (CC BY 4.0). Os termos estão em https://www.artic.edu/terms.

## Observações da coleta

- Cleveland devolve `images.web.width` e `height` como **texto** (ex.: `"1166"`), não número. O código de normalização precisa converter.
- A imagem IIIF da Art Institute of Chicago respondeu 403 (proteção Cloudflare) para `curl` e foi bloqueada também no navegador embutido do app. Por isso a fixture da AIC fica só como registro da validação. Detalhes em `docs/DECISOES.md`.
