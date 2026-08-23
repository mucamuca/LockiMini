# LockiMini

Plataforma de e-commerce completa: catálogo, carrinho, checkout, pagamentos, autenticação e controle de estoque em tempo real, com painel administrativo.

Monorepo com dois workspaces npm:

| Pasta | O que é | Stack |
| --- | --- | --- |
| `server/` | API REST + WebSocket | Node + Express + Prisma + SQLite + Socket.IO |
| `web/` | Loja e painel admin | React + TypeScript + Vite + Tailwind + TanStack Query |

---

## Visão geral da arquitetura

O LockiMini separa claramente a experiência de compra da regra de negócio. O navegador
consome uma API REST e uma conexão Socket.IO; a API é a única camada que pode alterar
preços, pedidos, pagamentos e estoque. Assim, valores enviados pelo cliente são tratados
somente como intenção — o servidor sempre consulta o banco e decide o resultado final.

```text
Cliente (React/Vite)
  ├─ HTTP /api ──────────────► API Express
  │                              ├─ Prisma ─► SQLite
  │                              ├─ PaymentProvider ─► mock ou Stripe
  │                              └─ serviços de carrinho, pedidos e estoque
  └─ Socket.IO /realtime ◄── atualizações de estoque e pedidos após o commit
```

O Vite encaminha `/api` e `/realtime` ao servidor durante o desenvolvimento. Para o
navegador, a comunicação continua na mesma origem, o que permite usar cookies de sessão
e de carrinho com segurança. Em produção, a aplicação web deve ser servida junto da API
ou por um proxy reverso que preserve esse mesmo comportamento.

### Jornada de compra

1. O visitante navega pelo catálogo, pesquisa produtos e adiciona itens ao carrinho. O
   carrinho funciona antes do login por meio de um cookie próprio e é incorporado à conta
   quando o cliente entra.
2. No checkout, a API relê produtos, preços, cupom, frete e disponibilidade diretamente
   do banco. O front-end não determina nenhum total financeiro.
3. Dentro de uma transação, as unidades são reservadas, o pedido é criado e o carrinho é
   esvaziado. Em seguida, já fora da transação, o provedor de pagamento é chamado.
4. Se o pagamento for aprovado, a reserva se converte em baixa física de estoque; se for
   recusado, vencido ou cancelado, a reserva é liberada. Pix e boleto permanecem pendentes
   até uma confirmação idempotente por webhook.
5. Após cada commit relevante, o Socket.IO atualiza o estoque do catálogo e avisa o painel
   administrativo sobre pedidos e níveis baixos de inventário.

### Domínios do sistema

| Domínio | Responsabilidade |
| --- | --- |
| Catálogo | Produtos ativos, categorias, busca, filtros, imagens e preço em centavos. |
| Carrinho | Sessões anônimas ou autenticadas, quantidades e revalidação de disponibilidade. |
| Pedidos | Snapshot dos itens comprados, endereço, desconto, frete e ciclo de status. |
| Pagamentos | Interface de provedor, gateway `mock`, integração opcional com Stripe e webhooks idempotentes. |
| Estoque | Saldo físico, unidades reservadas, ajustes, histórico de movimentos e expiração de reservas. |
| Administração | Indicadores, produtos, categorias, cupons, clientes, pedidos e controle de inventário. |
| Identidade | Cadastro, login, sessão curta, renovação rotativa, papéis e revogação de acesso. |

---

## Rodando

```bash
npm run setup
```

Isso instala as dependências, cria o banco SQLite e popula o catálogo. Depois:

```bash
npm run dev
```

- Loja: <http://localhost:5173>
- API: <http://localhost:4000/api/health>

### Contas criadas pelo seed

| Papel | E-mail | Senha |
| --- | --- | --- |
| Administrador | `admin@lockimini.dev` | `admin1234` |
| Cliente | `cliente@lockimini.dev` | `cliente1234` |

### Cartões de teste (gateway simulado)

| Número | Resultado |
| --- | --- |
| `4242 4242 4242 4242` | aprovado |
| `4000 0000 0000 0002` | recusado pelo emissor |
| `4000 0000 0000 9995` | saldo insuficiente |

Qualquer validade futura e CVV de 3 dígitos. Pix e boleto ficam pendentes e podem
ser confirmados na própria tela do pedido, pelo simulador de webhook.

### Cupons prontos

`BEMVINDO10` (10%), `FRETEGRATIS` (R$ 24,90), `BLACK25` (25% acima de R$ 500).

---

## Verificação automática

Com o servidor rodando, em outro terminal:

```bash
npm run smoke
```

São 25 verificações ponta a ponta: preço recalculado no servidor, baixa de estoque
somente após pagamento aprovado, devolução das unidades quando o cartão é recusado,
reserva do Pix, disputa simultânea pela última unidade e as guardas do painel admin.

---

## Como o estoque funciona

Esta é a parte que decide se uma loja é confiável, então vale detalhar.

O estoque de cada produto tem duas colunas: **`quantity`** (o que existe fisicamente)
e **`reserved`** (o que já está prometido a pedidos em aberto). O que a loja mostra
como disponível é sempre `quantity - reserved`.

O checkout acontece em duas fases:

**Fase 1 — dentro de uma transação.** Os preços são recalculados a partir do banco
(o cliente pode mandar qualquer coisa no corpo da requisição), o estoque é reservado
e o pedido nasce como `PENDING_PAYMENT`. Nenhuma chamada de rede acontece aqui:
I/O externo dentro de transação prende o banco.

A reserva é um `UPDATE` com a guarda dentro dele:

```sql
UPDATE "Inventory"
   SET "reserved" = "reserved" + ?
 WHERE "productId" = ?
   AND "quantity" - "reserved" >= ?
```

Como a condição vive no próprio `UPDATE`, duas requisições simultâneas disputando a
última unidade não podem ambas vencer — o banco serializa os `UPDATE`s e o segundo
afeta zero linhas, o que vira um 409 com o produto e a quantidade real na resposta.
O `npm run smoke` prova isso com 8 compradores simultâneos.

**Fase 2 — fora da transação.** O gateway é chamado. Se aprovar, a reserva vira baixa
definitiva (`quantity` e `reserved` caem juntos, então o disponível não oscila). Se
recusar, a reserva é devolvida ao catálogo na hora e o pedido fica `CANCELLED`.

Pedido que nunca é pago não trava estoque para sempre: cada reserva tem prazo
(`RESERVATION_TTL_MINUTES`, 20 min por padrão) e uma rotina roda a cada minuto
liberando as vencidas e cancelando os pedidos correspondentes. O admin também pode
disparar essa limpeza na mão pela tela de Estoque.

Toda mudança gera um registro em `StockMovement` — venda, cancelamento, devolução,
entrada de compra, perda, ajuste manual — com autor e observação. O ajuste manual do
admin é recusado se deixaria o físico abaixo do que já está reservado.

### Tempo real

Sempre que o disponível de um produto muda, o servidor publica `stock:update` no
canal WebSocket, **depois do commit** — nunca se anuncia um número que ainda pode
sofrer rollback. Quem está com a loja aberta vê a contagem mudar sem recarregar, e o
selo pisca. O admin recebe também `stock:low` quando um item cruza o mínimo, e
`order:created` / `order:updated` conforme os pedidos andam.

---

## Autenticação

JWT de acesso curto (15 min) + refresh token rotativo de 30 dias, ambos em cookies
`httpOnly` — token em `localStorage` fica exposto a XSS. Quando o acesso expira, o
cliente HTTP renova sozinho e repete a requisição uma vez; renovações simultâneas
são coalescidas numa só.

Senhas com bcrypt. Login responde a mesma mensagem para e-mail inexistente e senha
errada, para não entregar quais e-mails estão cadastrados. Trocar a senha revoga as
outras sessões. Rotas de login/cadastro têm rate limit.

Papéis são `CUSTOMER` e `ADMIN`. Tudo sob `/api/admin` passa por uma única porta de
entrada que exige `ADMIN` — não há verificação espalhada por rota.

A assinatura do JWT prova que o token foi emitido pela API, não que a conta ainda
existe, então cada requisição autenticada confere o usuário no banco (busca por chave
primária). Com isso: conta desativada perde acesso na hora em vez de esperar o token
vencer, mudança de papel vale imediatamente, e o papel usado na autorização vem do
banco — um token com `role` adulterada não escala privilégio.

---

## Pagamentos

`PaymentProvider` é uma interface com três operações: `charge`, `refund` e
`parseWebhook`. Duas implementações vêm no projeto:

- **`mock`** (padrão): roda sem credencial nenhuma. Valida Luhn e validade do cartão,
  aprova ou recusa conforme o número de teste, e gera código Pix e linha digitável de
  boleto como um gateway real geraria.
- **`stripe`**: cria PaymentIntent e confirma pelo webhook. O SDK não é dependência do
  projeto — para ativar:

  ```bash
  npm i stripe -w @lockimini/server
  ```

  e no `server/.env`: `PAYMENT_PROVIDER=stripe`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.

O webhook (`POST /api/webhooks/payments`) é a mesma rota para os dois provedores e é
idempotente: reprocessar o mesmo evento não baixa estoque duas vezes. Ele fica montado
antes do `express.json` porque a verificação de assinatura precisa dos bytes originais
do corpo.

A simulação de pagamento na tela do pedido só existe com o provedor `mock` fora de
produção — em produção, quem confirma um Pix é o webhook, nunca o front.

---

## Estrutura

```
server/src
├── routes/          auth, catalog, cart, checkout, orders, webhooks, admin/*
├── services/        stock, cart, orders, serializers   ← regra de negócio
├── payments/        interface + mock + stripe
├── middleware/      auth, validate (Zod), error
├── lib/             tokens, password, slug, money
├── realtime.ts      Socket.IO: salas de catálogo, admin e por usuário
└── db.ts            Prisma, PRAGMAs do SQLite, retry de contenção

web/src
├── pages/           Home, Catalog, ProductDetail, Cart, Checkout, OrderDetail,
│                    Account, Auth, admin/*
├── components/      Layout, CartDrawer, ProductCard, StockBadge, Toast, ui
├── store/           auth (contexto), stock (zustand, mapa ao vivo)
├── hooks/           useCart
└── lib/             api (fetch + refresh automático), format, types
```

Dinheiro trafega em **centavos inteiros** de ponta a ponta; nenhum float toca preço.
Itens de pedido guardam nome, SKU, imagem e preço **no momento da compra** — editar um
produto depois não reescreve o histórico. Produto com vendas nunca é excluído: vira
inativo, para não quebrar pedidos antigos.

---

## Configuração

Tudo em `server/.env` (veja `.env.example`):

| Variável | Padrão | Para quê |
| --- | --- | --- |
| `PORT` | `4000` | porta da API |
| `DATABASE_URL` | `file:./dev.db?connection_limit=1&pool_timeout=20` | banco |
| `JWT_SECRET` | *(valor de dev)* | **troque em produção** |
| `WEB_ORIGIN` | `http://localhost:5173` | origem liberada no CORS |
| `PAYMENT_PROVIDER` | `mock` | `mock` ou `stripe` |
| `RESERVATION_TTL_MINUTES` | `20` | validade da reserva de estoque |
| `FREE_SHIPPING_THRESHOLD_CENTS` | `29900` | piso do frete grátis |
| `FLAT_SHIPPING_CENTS` | `2490` | frete abaixo do piso |

### Sobre o SQLite

O padrão é SQLite para o projeto rodar sem instalar nada. Ele aceita um escritor por
vez, então a configuração usa WAL, `busy_timeout` e `connection_limit=1` (as escritas
enfileiram no pool em vez de brigarem pelo arquivo), mais um retry com backoff para
erros de contenção. Sob a disputa do smoke test, nenhuma requisição vira erro 500.

Para trocar por PostgreSQL, mude o `provider` em `server/prisma/schema.prisma` e a
`DATABASE_URL`. Nenhum campo do schema usa recurso exclusivo de SQLite, e a guarda de
estoque é SQL padrão.

---

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run setup` | instala, cria o banco e popula |
| `npm run dev` | API + loja juntos |
| `npm run build` | compila os dois workspaces |
| `npm run smoke` | verificação ponta a ponta (servidor precisa estar no ar) |
| `npm run typecheck` | TypeScript nos dois workspaces |
| `npm run db:seed` | repopula o catálogo (apaga os dados atuais) |
| `npm run db:studio` | Prisma Studio |

---

## O que não está incluído

Para não haver surpresa sobre o escopo:

- **Variações de produto** (tamanho, cor). Cada produto é um SKU único.
- **E-mail transacional.** A confirmação de pedido é exibida na tela, não enviada.
- **Frete calculado por CEP.** A regra é frete fixo com isenção acima de um valor.
- **Nota fiscal e integração com transportadora.**
- **Testes unitários.** A verificação é o `npm run smoke`, que exercita os fluxos
  completos contra a API real.
- **Fotos reais dos produtos.** As imagens do catálogo de demonstração são SVGs
  gerados pela própria API (`/api/images/:seed.svg`) — gradientes determinísticos,
  não fotografias. O cadastro aceita URL de verdade a qualquer momento.

---

## Desempenho

A loja carregava lenta por três motivos concretos, todos medidos antes de mexer:

| Problema | Antes | Depois |
| --- | --- | --- |
| Imagem de produto | 47 KB em ~1.400 ms (host externo, 900px para exibir 290px) | 1 KB em ~8 ms (SVG local) |
| Total de imagens na home | ~615 KB | ~13 KB |
| Pacote inicial | 404 KB num arquivo só, admin incluído | admin em pedaços separados, baixados só ao abrir |
| Sourcemap de produção | 1,4 MB enviados ao visitante | desligado |

Outras mudanças, cada uma por um motivo específico:

- **Cabeçalho sem `backdrop-blur`.** Um elemento fixo com desfoque obriga o
  navegador a repintar a faixa embaixo dele a cada quadro de rolagem. Fundo sólido
  entrega o mesmo visual sem esse custo.
- **Eventos de estoque agrupados** numa janela de 60 ms. Vários `stock:update`
  simultâneos viravam um render cada; agora viram um só. O agendador é
  `setTimeout`, não `requestAnimationFrame` — este último não dispara em aba de
  segundo plano e congelaria o estoque ao vivo de quem deixa a loja aberta.
- **Carrinho só revalida quando um item dele muda.** Antes, qualquer produto da
  loja disparava um refetch do carrinho.
- **`ProductCard` memoizado** e assinando apenas o próprio produto no store: um
  evento de estoque não re-renderiza a grade inteira.
- **`width`/`height` e `decoding="async"`** em todas as imagens; `loading="lazy"`
  exceto nas que estão na primeira dobra.
- **Rolagem sem listener de scroll**: o sombreado do cabeçalho vem de um
  `IntersectionObserver` sobre uma marca de 1px no topo.

### Animações

Movimento só em `transform` e `opacity` — as duas propriedades que a GPU resolve
sem recalcular layout. Entrada escalonada no hero, revelação ao rolar, elevação
nos cartões, zoom suave nas fotos, sublinhado no menu, contador do carrinho que
pula ao receber item e brilho atravessando os esqueletos de carregamento.

Duas regras que valem destacar:

1. **Nada some esperando JavaScript.** O componente `Reveal` nasce visível e só
   recebe o estado escondido depois que o script confirma que há
   `IntersectionObserver` e que o elemento está abaixo da dobra — com um
   temporizador de segurança que mostra o conteúdo de qualquer forma. Conteúdo
   invisível por falha de script nunca é aceitável.
2. **`prefers-reduced-motion` desliga tudo**, inclusive os atrasos. Movimento pode
   causar enjoo real; quem pediu menos movimento no sistema recebe a interface
   parada, não uma versão rápida da animação.

Há também uma barreira de erro em volta da aplicação: se um componente quebrar, o
visitante vê uma mensagem com caminho de volta, não uma página branca.

---

## Licença e uso exclusivo

Este projeto é **proprietário** e **não é software de código aberto**. Todos os direitos
sobre o código, documentação, design, dados de demonstração e demais materiais deste
repositório pertencem exclusivamente a **Murilo Roque**.

A única pessoa autorizada a usar, executar, copiar, modificar, distribuir, publicar,
sublicenciar, vender ou criar trabalhos derivados deste projeto é Murilo Roque, salvo
autorização prévia e expressa, por escrito, assinada pelo titular. Nenhuma permissão é
concedida a terceiros pelo simples acesso a este repositório ou aos seus arquivos.

Os termos completos estão em [LICENSE](LICENSE). Para que terceiros também não possam
visualizar ou baixar o código, a visibilidade do repositório no GitHub deve permanecer
configurada como **privada**; a licença limita o uso jurídico, mas não torna confidencial
um repositório público.
