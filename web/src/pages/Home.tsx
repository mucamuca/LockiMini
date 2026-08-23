import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, PackageCheck, RefreshCw, ShieldCheck, Truck } from 'lucide-react';
import { api } from '../lib/api';
import type { Category, Paginated, Product } from '../lib/types';
import { useStockStore } from '../store/stock';
import { ProductCard } from '../components/ProductCard';
import { Reveal } from '../components/Reveal';
import { ProductCardSkeleton } from '../components/ui';

const BENEFITS = [
  { icon: Truck, title: 'Frete gratis', text: 'Acima de R$ 299 para todo o Brasil.' },
  { icon: ShieldCheck, title: 'Compra segura', text: 'Pagamento processado com criptografia.' },
  { icon: PackageCheck, title: 'Estoque real', text: 'A disponibilidade na tela e a do deposito.' },
  { icon: RefreshCw, title: '30 dias', text: 'Troca ou devolucao sem complicacao.' },
];

export function HomePage() {
  const seed = useStockStore((s) => s.seed);

  const featured = useQuery({
    queryKey: ['catalog', 'featured'],
    queryFn: () => api.get<Paginated<Product>>('/catalog/products?featured=true&perPage=8'),
  });

  const recent = useQuery({
    queryKey: ['catalog', 'recent'],
    queryFn: () => api.get<Paginated<Product>>('/catalog/products?perPage=8&sort=recent'),
  });

  const categories = useQuery({
    queryKey: ['catalog', 'categories'],
    queryFn: () => api.get<{ items: Category[] }>('/catalog/categories'),
  });

  // Alimenta o mapa de estoque com o que veio no JSON, antes do socket falar.
  useEffect(() => {
    const all = [...(featured.data?.items ?? []), ...(recent.data?.items ?? [])];
    if (all.length > 0) seed(all);
  }, [featured.data, recent.data, seed]);

  return (
    <>
      <section className="relative overflow-hidden bg-ink-900 text-white">
        {/* Camada de luz que respira. So transform anima, entao roda na GPU
            sem repintar o texto por cima. */}
        <div
          className="animate-aurora pointer-events-none absolute inset-0 opacity-35 will-change-transform"
          style={{
            backgroundImage:
              'radial-gradient(60% 60% at 20% 10%, #1c66f1 0%, transparent 60%), radial-gradient(50% 50% at 90% 30%, #3385fc 0%, transparent 55%)',
          }}
          aria-hidden
        />

        <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 lg:grid-cols-2 lg:py-28">
          <div>
            <span
              className="chip animate-fade-up bg-white/10 text-white ring-1 ring-white/20"
              style={{ animationDelay: '40ms' }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Estoque sincronizado ao vivo
            </span>

            <h1
              className="animate-fade-up mt-5 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl"
              style={{ animationDelay: '120ms' }}
            >
              Tecnologia que
              <br />
              chega rapido.
            </h1>

            <p
              className="animate-fade-up mt-5 max-w-md text-base leading-relaxed text-ink-200"
              style={{ animationDelay: '200ms' }}
            >
              Audio, perifericos e casa inteligente com preco honesto. Se aparece disponivel aqui, esta
              disponivel no deposito — a contagem muda na sua tela no instante em que alguem compra.
            </p>

            <div className="animate-fade-up mt-8 flex flex-wrap gap-3" style={{ animationDelay: '280ms' }}>
              <Link to="/catalogo" className="btn group bg-white text-ink-900 hover:bg-ink-100">
                Ver catalogo
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
              <Link
                to="/catalogo?featured=true"
                className="btn bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/20"
              >
                Destaques da semana
              </Link>
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="grid grid-cols-2 gap-4">
              {(featured.data?.items ?? []).slice(0, 4).map((p, i) => (
                <Link
                  key={p.id}
                  to={`/produto/${p.slug}`}
                  className={`animate-fade-up overflow-hidden rounded-2xl ring-1 ring-white/15 transition-all duration-300 hover:-translate-y-1 hover:ring-white/50 ${
                    i % 2 === 1 ? 'translate-y-6' : ''
                  }`}
                  style={{ animationDelay: `${320 + i * 90}ms` }}
                >
                  <img
                    src={p.images[0]}
                    alt={p.name}
                    width={600}
                    height={600}
                    decoding="async"
                    className="aspect-square w-full object-cover"
                    loading="eager"
                  />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-ink-100 bg-white">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map(({ icon: Icon, title, text }, i) => (
            <Reveal key={title} delay={i * 70} className="flex items-start gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink-900">{title}</p>
                <p className="text-sm text-ink-500">{text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <Reveal as="h2" className="text-xl font-bold tracking-tight text-ink-900">
          Categorias
        </Reveal>
        <div className="mt-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {categories.data?.items.map((c, i) => (
            <Reveal key={c.id} delay={i * 60}>
              <Link
                to={`/catalogo?category=${c.slug}`}
                className="group relative block overflow-hidden rounded-2xl bg-ink-900"
              >
                <img
                  src={c.imageUrl ?? ''}
                  alt=""
                  width={600}
                  height={600}
                  loading="lazy"
                  decoding="async"
                  className="h-32 w-full object-cover opacity-60 transition-transform duration-500 ease-out group-hover:scale-110"
                />
                <div className="absolute inset-0 flex flex-col justify-end p-3.5">
                  <p className="text-sm font-bold text-white transition-transform duration-300 group-hover:-translate-y-0.5">
                    {c.name}
                  </p>
                  <p className="text-xs text-ink-300">{c.productCount} produtos</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <ProductSection
        title="Destaques"
        subtitle="Selecionados pela equipe"
        to="/catalogo?featured=true"
        products={featured.data?.items ?? []}
        loading={featured.isLoading}
      />

      <ProductSection
        title="Chegou agora"
        subtitle="Ultimas adicoes ao catalogo"
        to="/catalogo"
        products={recent.data?.items ?? []}
        loading={recent.isLoading}
      />
    </>
  );
}

function ProductSection({
  title,
  subtitle,
  to,
  products,
  loading,
}: {
  title: string;
  subtitle: string;
  to: string;
  products: Product[];
  loading: boolean;
}) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <Reveal className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink-900">{title}</h2>
          <p className="text-sm text-ink-500">{subtitle}</p>
        </div>
        <Link to={to} className="btn-ghost group text-sm">
          Ver todos
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      </Reveal>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <ProductCardSkeleton key={i} />)
          : products.slice(0, 4).map((p, i) => (
              <Reveal key={p.id} delay={i * 80}>
                <ProductCard product={p} />
              </Reveal>
            ))}
      </div>
    </section>
  );
}
