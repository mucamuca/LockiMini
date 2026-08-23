import { Router } from 'express';

export const imagesRouter = Router();

/**
 * Imagens de produto geradas no servidor.
 *
 * O catalogo de demonstracao usava um servico externo de fotos: cada imagem
 * levava mais de um segundo e vinha em 900px para ser exibida em 290px. Com 13
 * imagens na home, isso sozinho fazia a loja parecer travada.
 *
 * Aqui a "foto" e um SVG determinístico derivado do proprio identificador —
 * cerca de 1 KB, sem rede externa, sem custo de decodificacao e igual em toda
 * execucao. Produtos reais continuam podendo apontar para URLs de verdade: o
 * cadastro aceita tanto URL absoluta quanto caminho comecando com "/".
 */

/** Hash estavel (FNV-1a) — mesma entrada, mesma imagem, sempre. */
function hash(input: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return Math.abs(h);
}

function buildSvg(seed: string) {
  const h = hash(seed);
  const hue = h % 360;
  // Duas cores analogas: variedade sem sair da paleta.
  const hue2 = (hue + 40 + (h % 40)) % 360;
  const variant = h % 3;

  const bgA = `hsl(${hue} 62% 92%)`;
  const bgB = `hsl(${hue2} 58% 84%)`;
  const inkA = `hsl(${hue} 72% 42%)`;
  const inkB = `hsl(${hue2} 66% 56%)`;

  // Cada variante muda a composicao, entao as fotos da galeria nao ficam iguais.
  const composition =
    variant === 0
      ? `<circle cx="300" cy="330" r="170" fill="url(#blob)" />
         <rect x="120" y="470" width="360" height="150" rx="28" fill="${inkA}" opacity=".18" />`
      : variant === 1
        ? `<rect x="150" y="180" width="300" height="300" rx="48" fill="url(#blob)" transform="rotate(-12 300 330)" />
           <circle cx="420" cy="470" r="90" fill="${inkB}" opacity=".22" />`
        : `<path d="M300 150 L470 460 L130 460 Z" fill="url(#blob)" />
           <circle cx="300" cy="300" r="120" fill="${inkA}" opacity=".14" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600" role="img" aria-label="Imagem ilustrativa do produto">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bgA}"/>
      <stop offset="1" stop-color="${bgB}"/>
    </linearGradient>
    <radialGradient id="blob" cx="35%" cy="30%" r="80%">
      <stop offset="0" stop-color="${inkB}" stop-opacity=".85"/>
      <stop offset="1" stop-color="${inkA}" stop-opacity=".55"/>
    </radialGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M40 0H0V40" fill="none" stroke="${inkA}" stroke-opacity=".07" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="600" height="600" fill="url(#bg)"/>
  <rect width="600" height="600" fill="url(#grid)"/>
  ${composition}
</svg>`;
}

imagesRouter.get('/:seed', (req, res) => {
  const seed = req.params.seed.replace(/\.svg$/i, '').slice(0, 80);

  res.type('image/svg+xml');
  // O conteudo e funcao pura do seed: pode ficar em cache para sempre.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.send(buildSvg(seed));
});
