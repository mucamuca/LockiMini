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
};

const catalog: { category: string; products: Seed[] }[] = [
  {
    category: 'Audio',
    products: [
      {
        sku: 'AUD-HP-001',
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
        name: 'Teclado Mecanico Kite 75%',
        description:
          'Layout 75% ABNT2, switches lubrificados de fabrica e tres camadas de espuma. Hot-swap: troca de switch sem ferro de solda.',
        priceCents: 74900,
        quantity: 18,
        featured: true,
      },
      {
        sku: 'CMP-MS-102',
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
        name: 'Mochila Fotografica 25L',
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
        name: 'Cabo USB-C Trancado 2 m',
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
          inventory: {
            create: { quantity: p.quantity, lowStockThreshold: p.lowStockThreshold ?? 5 },
          },
        },
      });

      if (p.quantity > 0) {
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
