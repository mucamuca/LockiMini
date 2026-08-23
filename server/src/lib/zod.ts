import { z } from 'zod';

/**
 * Aceita URL absoluta (CDN, bucket, foto real do fornecedor) ou caminho que
 * comeca com "/" — que e o formato das imagens servidas pela propria API.
 * Restringir a URL absoluta deixaria o catalogo do seed invalido no cadastro.
 */
export const imageRef = z
  .string()
  .trim()
  .min(1)
  .refine(
    (value) => value.startsWith('/') || /^https?:\/\//i.test(value),
    'Informe uma URL http(s) ou um caminho comecando com "/".',
  );
