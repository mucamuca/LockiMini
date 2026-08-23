import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Search,
  ShoppingBag,
  User as UserIcon,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../store/auth';
import { useCart } from '../hooks/useCart';
import { useRealtime } from './RealtimeProvider';
import { CartDrawer } from './CartDrawer';

const NAV = [
  { to: '/catalogo', label: 'Catalogo' },
  { to: '/catalogo?category=audio', label: 'Audio' },
  { to: '/catalogo?category=computadores', label: 'Computadores' },
  { to: '/catalogo?category=casa-inteligente', label: 'Casa inteligente' },
];

/**
 * Detecta "a pagina saiu do topo" sem ouvir o evento de scroll.
 *
 * Um listener de scroll roda a cada quadro enquanto o usuario rola; um
 * IntersectionObserver sobre uma marca de 1px no topo dispara duas vezes na
 * vida da pagina. Mesmo efeito visual, sem trabalho por quadro.
 */
function useScrolledPastTop() {
  const sentinel = useRef<HTMLDivElement | null>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    io.observe(node);
    return () => io.disconnect();
  }, []);

  return { sentinel, scrolled };
}

export function Layout() {
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [term, setTerm] = useState('');
  const { user, isAdmin, logout } = useAuth();
  const { cart } = useCart();
  const { connected } = useRealtime();
  const navigate = useNavigate();
  const location = useLocation();
  const { sentinel, scrolled } = useScrolledPastTop();

  const itemCount = cart?.itemCount ?? 0;

  // Faz o contador do carrinho "pular" quando muda — feedback de que o item entrou.
  const [badgePop, setBadgePop] = useState(false);
  const previousCount = useRef(itemCount);
  useEffect(() => {
    if (itemCount !== previousCount.current && itemCount > 0) {
      setBadgePop(true);
      previousCount.current = itemCount;
      const timer = setTimeout(() => setBadgePop(false), 450);
      return () => clearTimeout(timer);
    }
    previousCount.current = itemCount;
  }, [itemCount]);

  // Toda troca de rota volta ao topo: sem isso a proxima pagina abre no meio.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
    setMenuOpen(false);
  }, [location.pathname]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate(`/catalogo?search=${encodeURIComponent(term.trim())}`);
    setMenuOpen(false);
  };

  return (
    <div className="flex min-h-screen flex-col">
      <div ref={sentinel} aria-hidden className="h-px" />

      <div className="bg-ink-900 px-4 py-2 text-center text-xs font-medium text-ink-100">
        Frete gratis acima de R$ 299 · Estoque atualizado em tempo real
        <span
          className="ml-3 inline-flex items-center gap-1 align-middle text-ink-300"
          title={connected ? 'Conectado ao canal de estoque' : 'Reconectando...'}
        >
          {connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          {connected ? 'ao vivo' : 'offline'}
        </span>
      </div>

      {/*
        Fundo solido em vez de backdrop-blur: um cabecalho fixo com desfoque
        obriga o navegador a repintar a faixa embaixo dele a cada quadro de
        rolagem, e era um dos motivos de a pagina "arrastar".
      */}
      <header
        className={`sticky top-0 z-40 border-b bg-white transition-shadow duration-200 ${
          scrolled ? 'border-ink-100 shadow-card' : 'border-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4">
          <button
            className="btn-ghost px-2 lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Abrir menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link to="/" className="group flex items-center gap-2 font-extrabold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-sm text-white transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110">
              L
            </span>
            <span className="text-lg">LockiMini</span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.label}
                to={item.to}
                className={({ isActive }) =>
                  `nav-link rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? 'text-brand-700' : 'text-ink-600 hover:text-ink-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <form onSubmit={submitSearch} className="ml-auto hidden max-w-xs flex-1 md:block">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="Buscar produtos"
                className="input pl-9"
                aria-label="Buscar produtos"
              />
            </div>
          </form>

          <div className="ml-auto flex items-center gap-1 md:ml-0">
            {isAdmin && (
              <Link
                to="/admin"
                className="btn-ghost hidden px-2.5 sm:inline-flex"
                title="Painel administrativo"
              >
                <LayoutDashboard className="h-5 w-5" />
              </Link>
            )}

            {user ? (
              <div className="group relative">
                <button className="btn-ghost px-2.5" aria-label="Minha conta">
                  <UserIcon className="h-5 w-5" />
                </button>
                <div className="invisible absolute right-0 top-full w-52 translate-y-1 pt-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
                  <div className="card overflow-hidden py-1">
                    <p className="truncate px-3 py-2 text-xs text-ink-500">{user.email}</p>
                    <Link
                      to="/conta"
                      className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-ink-50"
                    >
                      <Package className="h-4 w-4" /> Meus pedidos
                    </Link>
                    {isAdmin && (
                      <Link
                        to="/admin"
                        className="flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-ink-50"
                      >
                        <LayoutDashboard className="h-4 w-4" /> Painel admin
                      </Link>
                    )}
                    <button
                      onClick={() => logout().then(() => navigate('/'))}
                      className="flex w-full items-center gap-2 px-3 py-2 text-sm text-rose-600 transition-colors hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" /> Sair
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <Link to="/entrar" className="btn-ghost px-3 text-sm">
                Entrar
              </Link>
            )}

            <button
              onClick={() => setCartOpen(true)}
              className="relative rounded-xl px-2.5 py-2 text-ink-700 transition-colors hover:bg-ink-100"
              aria-label={`Carrinho com ${itemCount} itens`}
            >
              <ShoppingBag className="h-5 w-5" />
              {itemCount > 0 && (
                <span
                  className={`absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand-600 px-1 text-[11px] font-bold text-white ${
                    badgePop ? 'animate-pop' : ''
                  }`}
                >
                  {itemCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div className="animate-fade-up border-t border-ink-100 bg-white px-4 py-3 lg:hidden">
            <form onSubmit={submitSearch} className="mb-3 md:hidden">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="Buscar produtos"
                  className="input pl-9"
                />
              </div>
            </form>
            <nav className="grid gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.label}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-50"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* key na rota: cada pagina entra com seu proprio fade. */}
      <main key={location.pathname} className="flex-1 animate-fade-up">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-ink-100 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2 font-extrabold">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-600 text-sm text-white">
                L
              </span>
              LockiMini
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-ink-500">
              Loja de demonstracao com catalogo, checkout, pagamentos e controle de estoque em tempo real.
            </p>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-900">Loja</h3>
            <ul className="mt-3 space-y-2 text-sm text-ink-500">
              <li>
                <Link to="/catalogo" className="transition-colors hover:text-ink-900">
                  Todos os produtos
                </Link>
              </li>
              <li>
                <Link to="/catalogo?featured=true" className="transition-colors hover:text-ink-900">
                  Destaques
                </Link>
              </li>
              <li>
                <Link to="/carrinho" className="transition-colors hover:text-ink-900">
                  Carrinho
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-900">Conta</h3>
            <ul className="mt-3 space-y-2 text-sm text-ink-500">
              <li>
                <Link to="/entrar" className="transition-colors hover:text-ink-900">
                  Entrar
                </Link>
              </li>
              <li>
                <Link to="/criar-conta" className="transition-colors hover:text-ink-900">
                  Criar conta
                </Link>
              </li>
              <li>
                <Link to="/rastrear" className="transition-colors hover:text-ink-900">
                  Rastrear pedido
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wide text-ink-900">Contas de teste</h3>
            <ul className="mt-3 space-y-1.5 font-mono text-xs text-ink-500">
              <li>admin@lockimini.dev / admin1234</li>
              <li>cliente@lockimini.dev / cliente1234</li>
              <li className="pt-2 font-sans">Cartao aprovado: 4242 4242 4242 4242</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-ink-100 px-4 py-5 text-center text-xs text-ink-400">
          Projeto de demonstracao — nenhuma cobranca real e processada.
        </div>
      </footer>

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  );
}
