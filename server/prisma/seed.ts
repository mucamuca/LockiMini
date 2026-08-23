import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { slugify } from '../src/lib/slug.js';

const prisma = new PrismaClient();

/**
 * Imagem gerada pela propria API (rota /api/images).
 * Caminho relativo: funciona em dev, em preview e em producao sem reconfigurar.
 */
const img = (seed: string, n = 1) => `/api/images/${seed}-${n}.svg`;

type Seed = {
  sku: string;
  name: string;
  description: string;
  priceCents: number;
  compareAtCents?: number;
  quantity: number;
  lowStockThreshold?: number;
  featured?: boolean;
  /** Eixos que este produto usa. Ausente = produto sem variacao. */
  variants?: VariantSeed;
};

type VariantSeed = {
  colors?: { name: string; hex: string }[];
  /** `extraCents` soma ao preco base — o 512 GB custa mais que o 256 GB. */
  sizes?: { name: string; extraCents?: number }[];
};

/**
 * Distribui o estoque do produto entre as combinacoes.
 *
 * Os numeros nao sao uniformes de proposito: uma loja real tem tamanho M
 * acabando enquanto o GG encalha, e e isso que deixa a tela de estoque e os
 * avisos de "ultimas unidades" interessantes de olhar.
 */
function splitStock(total: number, parts: number, index: number) {
  const base = Math.floor(total / parts);
  const resto = total % parts;
  const peso = [1.4, 0.35, 1, 0.6, 1.2, 0.15][index % 6];
  return Math.max(0, Math.round(base * peso) + (index < resto ? 1 : 0));
}

const catalog: { category: string; products: Seed[] }[] = [
  {
    category: 'Audio',
    products: [
      {
        sku: 'AUD-HP-001',
        variants: {
          colors: [
            { name: 'Preto Meia-Noite', hex: '#101317' },
            { name: 'Prata Nebula', hex: '#c9ced6' },
            { name: 'Azul Cobalto', hex: '#1c4fa1' },
          ],
        },
        name: 'Fone Over-Ear Aurora ANC',
        description:
          'Cancelamento ativo de ruido hibrido, 40 h de bateria e espuma com memoria. Conecta em dois aparelhos ao mesmo tempo, entao a chamada do notebook interrompe a musica do celular sem voce tocar em nada.',
        priceCents: 89900,
        compareAtCents: 109900,
        quantity: 24,
        featured: true,
      },
      {
        sku: 'AUD-TW-002',
        name: 'Earbuds Pulse Mini',
        description:
          'Fone intra-auricular com 6 h por carga e 24 h no estojo. Resistencia IPX5: aguenta chuva e treino pesado.',
        priceCents: 34900,
        quantity: 60,
      },
      {
        sku: 'AUD-SP-003',
        name: 'Caixa Portatil Bloco 20W',
        description:
          'Som estereo de 20 W em um corpo que cabe na mochila. Pareie duas unidades para virar um par estereo de verdade.',
        priceCents: 42900,
        compareAtCents: 49900,
        quantity: 3,
        lowStockThreshold: 5,
        featured: true,
      },
      {
        sku: 'AUD-MC-004',
        name: 'Microfone USB Studio One',
        description:
          'Captacao cardioide com saida de monitoracao sem latencia. Plug and play no Windows, macOS e Linux.',
        priceCents: 59900,
        quantity: 12,
      },
    ],
  },
  {
    category: 'Computadores',
    products: [
      {
        sku: 'CMP-KB-101',
        variants: {
          colors: [
            { name: 'Branco Gelo', hex: '#eef0f3' },
            { name: 'Grafite', hex: '#2b2f36' },
          ],
          sizes: [
            { name: '60%' },
            { name: '75%', extraCents: 12000 },
            { name: 'Full-size', extraCents: 24000 },
          ],
        },
        name: 'Teclado Mecanico Kite',
        description:
          'Switches lubrificados de fabrica e tres camadas de espuma, em ABNT2. Hot-swap: troca de switch sem ferro de solda. Escolha o layout — 60% para mesa curta, full-size para quem usa o teclado numerico.',
        priceCents: 74900,
        quantity: 18,
        featured: true,
      },
      {
        sku: 'CMP-MS-102',
        variants: {
          colors: [
            { name: 'Preto', hex: '#15181d' },
            { name: 'Branco', hex: '#f2f4f7' },
            { name: 'Rosa Quartzo', hex: '#e3a2b5' },
          ],
        },
        name: 'Mouse Sem Fio Glide Pro',
        description:
          'Sensor de 26.000 DPI, 58 g e clique optico. Bateria dura cerca de 90 h com iluminacao desligada.',
        priceCents: 39900,
        quantity: 30,
      },
      {
        sku: 'CMP-MN-103',
        name: 'Monitor 27" QHD 165 Hz',
        description:
          'Painel IPS 2560x1440 com 165 Hz e 1 ms. Cobre 99% do sRGB, entao serve tanto para jogo quanto para edicao.',
        priceCents: 189900,
        compareAtCents: 219900,
        quantity: 7,
      },
      {
        sku: 'CMP-DK-104',
        name: 'Dock USB-C 11 em 1',
        description:
          'Dois HDMI 4K, Ethernet gigabit, leitor SD e 100 W de passagem de carga. Um cabo so para toda a mesa.',
        priceCents: 64900,
        quantity: 15,
      },
      {
        sku: 'CMP-SS-105',
        name: 'SSD NVMe 1 TB Gen4',
        description:
          'Leitura de ate 7.000 MB/s com dissipador incluso. Compativel com PS5 e notebooks com slot M.2 2280.',
        priceCents: 69900,
        quantity: 22,
      },
      {
        sku: 'CMP-WC-106',
        name: 'Webcam Clear 1080p60',
        description:
          'Foco automatico, correcao de luz de fundo e dois microfones com reducao de ruido. Tampa de privacidade fisica.',
        priceCents: 44900,
        quantity: 0,
      },
    ],
  },
  {
    category: 'Casa Inteligente',
    products: [
      {
        sku: 'HOM-LP-201',
        variants: {
          colors: [
            { name: 'Branco Fosco', hex: '#f5f5f3' },
            { name: 'Preto Fosco', hex: '#1b1c1e' },
            { name: 'Bronze', hex: '#8a6a44' },
          ],
        },
        name: 'Lampada Smart RGB (kit 3)',
        description:
          'Wi-Fi 2.4 GHz, 16 milhoes de cores e agenda por horario. Funciona com Alexa e Google Home.',
        priceCents: 19900,
        quantity: 80,
      },
      {
        sku: 'HOM-PL-202',
        name: 'Tomada Inteligente 16A',
        description:
          'Mede consumo em tempo real e desliga sozinha por temporizador. Suporta ate 16 A, entao aguenta ar-condicionado pequeno.',
        priceCents: 12900,
        quantity: 45,
      },
      {
        sku: 'HOM-CM-203',
        name: 'Camera Interna 2K Giro 360',
        description:
          'Visao noturna colorida, deteccao de pessoa e audio de duas vias. Grava em cartao local ou na nuvem.',
        priceCents: 29900,
        compareAtCents: 34900,
        quantity: 2,
        lowStockThreshold: 4,
        featured: true,
      },
      {
        sku: 'HOM-VC-204',
        name: 'Robo Aspirador Mapa Laser',
        description:
          'Mapeamento LiDAR com zonas proibidas por app. Passa pano e aspira na mesma volta.',
        priceCents: 249900,
        quantity: 5,
      },
    ],
  },
  {
    category: 'Fotografia',
    products: [
      {
        sku: 'FOT-TR-301',
        name: 'Tripe Carbono Traveler',
        description:
          'Fecha em 38 cm e pesa 1,1 kg. Cabeca ball com trava dupla e base compativel com Arca-Swiss.',
        priceCents: 89900,
        quantity: 9,
      },
      {
        sku: 'FOT-GB-302',
        name: 'Estabilizador Gimbal 3 Eixos',
        description:
          'Suporta ate 1,2 kg, 13 h de bateria e modo de rastreamento por app. Dobra para caber na mochila.',
        priceCents: 139900,
        quantity: 6,
        featured: true,
      },
      {
        sku: 'FOT-LT-303',
        name: 'Painel de LED Bicolor 60W',
        description:
          'Temperatura de 2700 K a 6500 K com CRI 96. Alimenta por bateria NP-F ou tomada.',
        priceCents: 79900,
        quantity: 11,
      },
      {
        sku: 'FOT-BG-304',
        variants: {
          sizes: [
            { name: '18 L' },
            { name: '25 L', extraCents: 9000 },
            { name: '32 L', extraCents: 18000 },
          ],
        },
        name: 'Mochila Fotografica Field',
        description:
          'Acesso lateral rapido, divisorias reconfiguraveis e capa de chuva. Comporta um corpo com lente acoplada e tres lentes.',
        priceCents: 54900,
        quantity: 14,
      },
    ],
  },
  {
    category: 'Acessorios',
    products: [
      {
        sku: 'ACC-PB-401',
        name: 'Powerbank 20.000 mAh 65W',
        description:
          'Carrega notebook por USB-C PD e ainda sobra para dois celulares. Visor mostra a carga real em porcentagem.',
        priceCents: 34900,
        quantity: 40,
        featured: true,
      },
      {
        sku: 'ACC-CB-402',
        variants: {
          colors: [
            { name: 'Cinza Urbano', hex: '#5b6270' },
            { name: 'Verde Musgo', hex: '#4a5a44' },
          ],
          sizes: [
            { name: '1 m' },
            { name: '2 m', extraCents: 1500 },
            { name: '3 m', extraCents: 3000 },
          ],
        },
        name: 'Cabo USB-C Trancado',
        description:
          'Suporta 240 W e USB 3.2 (20 Gbps). Malha de nylon testada para 30.000 dobras.',
        priceCents: 8900,
        quantity: 120,
      },
      {
        sku: 'ACC-ST-403',
        name: 'Suporte de Notebook Aluminio',
        description:
          'Eleva a tela ate a altura dos olhos e mantem a ventilacao livre. Dobra plano para viagem.',
        priceCents: 17900,
        quantity: 28,
      },
      {
        sku: 'ACC-MP-404',
        name: 'Mousepad XL Costurado',
        description:
          'Base emborrachada de 90x40 cm com bordas costuradas. Superficie de tecido de trama fina para controle.',
        priceCents: 11900,
        quantity: 1,
        lowStockThreshold: 3,
      },
      {
        sku: 'ACC-HB-405',
        name: 'Hub USB 3.0 4 Portas',
        description:
          'Quatro portas de 5 Gbps com chave individual por porta. Cabo de 30 cm, sem fonte externa.',
        priceCents: 9900,
        quantity: 55,
      },
    ],
  },
];

async function main() {
  console.log('Limpando dados anteriores...');
  await prisma.stockMovement.deleteMany();
  await prisma.stockReservation.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.address.deleteMany();
  await prisma.user.deleteMany();

  console.log('Criando usuarios...');
  const admin = await prisma.user.create({
    data: {
      name: 'Ana Administradora',
      email: 'admin@lockimini.dev',
      passwordHash: await bcrypt.hash('admin1234', 10),
      role: 'ADMIN',
    },
  });

  const customer = await prisma.user.create({
    data: {
      name: 'Carlos Cliente',
      email: 'cliente@lockimini.dev',
      passwordHash: await bcrypt.hash('cliente1234', 10),
      role: 'CUSTOMER',
      addresses: {
        create: {
          label: 'Casa',
          recipient: 'Carlos Cliente',
          line1: 'Rua das Palmeiras, 250',
          line2: 'Apto 71',
          district: 'Pinheiros',
          city: 'Sao Paulo',
          state: 'SP',
          postalCode: '05422-001',
          phone: '(11) 98888-1234',
          isDefault: true,
        },
      },
    },
  });

  console.log('Criando catalogo...');
  let created = 0;
  for (const group of catalog) {
    const slug = slugify(group.category);

    const category = await prisma.category.create({
      data: { name: group.category, slug, imageUrl: img(slug, 0) },
    });

    for (const p of group.products) {
      const productSlug = slugify(p.name);

      // Monta o produto das combinacoes: cor x tamanho. Se so um eixo existir,
      // o outro fica nulo e a tela mostra um seletor so.
      const combos: { colorName: string | null; colorHex: string | null; sizeName: string | null; extraCents: number }[] = [];
      const colors = p.variants?.colors ?? [];
      const sizes = p.variants?.sizes ?? [];
      if (colors.length > 0 || sizes.length > 0) {
        for (const c of colors.length > 0 ? colors : [null]) {
          for (const sz of sizes.length > 0 ? sizes : [null]) {
            combos.push({
              colorName: c?.name ?? null,
              colorHex: c?.hex ?? null,
              sizeName: sz?.name ?? null,
              extraCents: sz?.extraCents ?? 0,
            });
          }
        }
      }

      const product = await prisma.product.create({
        data: {
          sku: p.sku,
          name: p.name,
          slug: productSlug,
          description: p.description,
          priceCents: p.priceCents,
          compareAtCents: p.compareAtCents ?? null,
          images: JSON.stringify([img(p.sku, 1), img(p.sku, 2), img(p.sku, 3)]),
          categoryId: category.id,
          featured: p.featured ?? false,
          // Produto com variacoes tem uma linha de estoque por combinacao,
          // criadas logo abaixo; sem variacoes, uma linha unica com a sentinela.
          inventory:
            combos.length > 0
              ? undefined
              : { create: { quantity: p.quantity, lowStockThreshold: p.lowStockThreshold ?? 5 } },
        },
      });

      if (combos.length > 0) {
        let i = 0;
        for (const combo of combos) {
          const quantity = splitStock(p.quantity, combos.length, i);
          const variant = await prisma.productVariant.create({
            data: {
              productId: product.id,
              sku: `${p.sku}-${String(i + 1).padStart(2, '0')}`,
              colorName: combo.colorName,
              colorHex: combo.colorHex,
              sizeName: combo.sizeName,
              priceCents: combo.extraCents > 0 ? p.priceCents + combo.extraCents : null,
              position: i,
            },
          });
          await prisma.inventory.create({
            data: {
              productId: product.id,
              variantId: variant.id,
              quantity,
              lowStockThreshold: p.lowStockThreshold ?? 5,
            },
          });
          if (quantity > 0) {
            await prisma.stockMovement.create({
              data: {
                productId: product.id,
                variantId: variant.id,
                delta: quantity,
                reason: 'PURCHASE_ORDER',
                note: 'Carga inicial de estoque',
                actorId: admin.id,
              },
            });
          }
          i++;
        }
      } else if (p.quantity > 0) {
        await prisma.stockMovement.create({
          data: {
            productId: product.id,
            delta: p.quantity,
            reason: 'PURCHASE_ORDER',
            note: 'Carga inicial de estoque',
            actorId: admin.id,
          },
        });
      }
      created++;
    }
  }

  console.log('Criando cupons...');
  await prisma.coupon.createMany({
    data: [
      { code: 'BEMVINDO10', percentOff: 10, minSubtotalCents: 10000, active: true },
      { code: 'FRETEGRATIS', amountOffCents: 2490, minSubtotalCents: 15000, active: true },
      { code: 'BLACK25', percentOff: 25, minSubtotalCents: 50000, active: true, maxUses: 100 },
    ],
  });

  console.log('\nPronto.');
  console.log(`  ${created} produtos em ${catalog.length} categorias`);
  console.log('\n  Admin ....... admin@lockimini.dev / admin1234');
  console.log('  Cliente ..... cliente@lockimini.dev / cliente1234');
  console.log(`  (ids: ${admin.id} / ${customer.id})\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
