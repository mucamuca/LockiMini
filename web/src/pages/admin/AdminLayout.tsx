import { NavLink, Outlet, Link } from 'react-router-dom';
import { ThemeToggle } from '../../components/ThemeToggle';
import {
  ArrowLeft,
  Boxes,
  LayoutDashboard,
  Package,
  Receipt,
  Tag,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAuth } from '../../store/auth';
import { useRealtime } from '../../components/RealtimeProvider';

const LINKS = [
  { to: '/admin', label: 'Visao geral', icon: LayoutDashboard, end: true },
  { to: '/admin/pedidos', label: 'Pedidos', icon: Receipt },
  { to: '/admin/produtos', label: 'Produtos', icon: Package },
  { to: '/admin/estoque', label: 'Estoque', icon: Boxes },
  { to: '/admin/cupons', label: 'Cupons', icon: Tag },
  { to: '/admin/clientes', label: 'Clientes', icon: Users },
];

export function AdminLayout() {
  const { user } = useAuth();
  const { connected } = useRealtime();

  return (
    <div className="min-h-screen bg-ink-50 dark:bg-ink-925">
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 lg:flex">
          <div className="flex h-16 items-center gap-2 border-b border-ink-100 dark:border-ink-800 px-5">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-ink-900 text-sm font-bold text-white">
              L
            </span>
            <div className="leading-tight">
              <p className="text-sm font-bold text-ink-900 dark:text-ink-50">LockiMini</p>
              <p className="text-[11px] text-ink-400">Painel administrativo</p>
            </div>
          </div>

          <nav className="flex-1 space-y-1 p-3">
            {LINKS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive ? 'bg-ink-900 text-white' : 'text-ink-600 dark:text-ink-300 hover:bg-ink-50 dark:hover:bg-ink-850 hover:text-ink-900 dark:hover:text-white'
                  }`
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="border-t border-ink-100 dark:border-ink-800 p-3">
            <div
              className={`mb-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
                connected ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
              }`}
            >
              {connected ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {connected ? 'Tempo real ativo' : 'Reconectando...'}
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="truncate px-3 text-xs text-ink-500 dark:text-ink-400">{user?.email}</p>
              <ThemeToggle />
            </div>
            <Link to="/" className="btn-ghost mt-1 w-full justify-start text-sm">
              <ArrowLeft className="h-4 w-4" /> Voltar a loja
            </Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-ink-100 bg-white px-4 dark:border-ink-800 dark:bg-ink-900 lg:hidden">
            <Link to="/" className="btn-ghost px-2">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="font-bold">Painel</span>
            <nav className="ml-auto flex gap-1 overflow-x-auto">
              {LINKS.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `rounded-lg p-2 ${isActive ? 'bg-ink-900 text-white' : 'text-ink-500 dark:text-ink-400'}`
                  }
                  title={label}
                >
                  <Icon className="h-4 w-4" />
                </NavLink>
              ))}
            </nav>
          </header>

          <main className="p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
