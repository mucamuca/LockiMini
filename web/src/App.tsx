import { Suspense, lazy } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './store/auth';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { HomePage } from './pages/Home';

/**
 * So a home entra no pacote inicial.
 *
 * O resto — e principalmente o painel administrativo inteiro, que nenhum
 * cliente abre — vira um pedaco separado, baixado apenas quando a rota e
 * visitada. Sem isso, quem entra para ver um produto baixa tambem os graficos,
 * as tabelas e os formularios do admin.
 */
const CatalogPage = lazy(() => import('./pages/Catalog').then((m) => ({ default: m.CatalogPage })));
const ProductDetailPage = lazy(() =>
  import('./pages/ProductDetail').then((m) => ({ default: m.ProductDetailPage })),
);
const CartPage = lazy(() => import('./pages/Cart').then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import('./pages/Checkout').then((m) => ({ default: m.CheckoutPage })));
const OrderDetailPage = lazy(() =>
  import('./pages/OrderDetail').then((m) => ({ default: m.OrderDetailPage })),
);
const AccountPage = lazy(() => import('./pages/Account').then((m) => ({ default: m.AccountPage })));
const LoginPage = lazy(() => import('./pages/Auth').then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('./pages/Auth').then((m) => ({ default: m.RegisterPage })));
const OrderLookupPage = lazy(() =>
  import('./pages/Auth').then((m) => ({ default: m.OrderLookupPage })),
);

const AdminLayout = lazy(() =>
  import('./pages/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })),
);
const AdminDashboard = lazy(() =>
  import('./pages/admin/Dashboard').then((m) => ({ default: m.AdminDashboard })),
);
const AdminProducts = lazy(() =>
  import('./pages/admin/Products').then((m) => ({ default: m.AdminProducts })),
);
const AdminOrders = lazy(() => import('./pages/admin/Orders').then((m) => ({ default: m.AdminOrders })));
const AdminOrderDetail = lazy(() =>
  import('./pages/admin/Orders').then((m) => ({ default: m.AdminOrderDetail })),
);
const AdminStock = lazy(() => import('./pages/admin/Stock').then((m) => ({ default: m.AdminStock })));
const AdminCoupons = lazy(() => import('./pages/admin/Misc').then((m) => ({ default: m.AdminCoupons })));
const AdminCustomers = lazy(() =>
  import('./pages/admin/Misc').then((m) => ({ default: m.AdminCustomers })),
);

function RouteFallback() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Spinner className="h-6 w-6 text-ink-300" />
    </div>
  );
}

/** Rota que exige sessao — e, opcionalmente, papel de administrador. */
function Protected({ children, adminOnly = false }: { children: React.ReactNode; adminOnly?: boolean }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) return <RouteFallback />;
  if (!user) return <Navigate to="/entrar" state={{ from: location.pathname }} replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;

  return <>{children}</>;
}

function NotFound() {
  return (
    <div className="mx-auto max-w-md px-4 py-24 text-center">
      <p className="animate-fade-up text-6xl font-extrabold tracking-tight text-ink-200">404</p>
      <h1 className="mt-4 text-xl font-bold text-ink-900">Pagina nao encontrada</h1>
      <p className="mt-2 text-sm text-ink-500">O endereco acessado nao existe ou foi movido.</p>
      <Link to="/" className="btn-primary mt-6">
        Voltar ao inicio
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="catalogo" element={<CatalogPage />} />
          <Route path="produto/:slug" element={<ProductDetailPage />} />
          <Route path="carrinho" element={<CartPage />} />
          <Route path="checkout" element={<CheckoutPage />} />
          <Route path="pedido/:number" element={<OrderDetailPage />} />
          <Route path="rastrear" element={<OrderLookupPage />} />
          <Route path="entrar" element={<LoginPage />} />
          <Route path="criar-conta" element={<RegisterPage />} />
          <Route
            path="conta"
            element={
              <Protected>
                <AccountPage />
              </Protected>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route
          path="/admin"
          element={
            <Protected adminOnly>
              <AdminLayout />
            </Protected>
          }
        >
          <Route index element={<AdminDashboard />} />
          <Route path="pedidos" element={<AdminOrders />} />
          <Route path="pedidos/:id" element={<AdminOrderDetail />} />
          <Route path="produtos" element={<AdminProducts />} />
          <Route path="estoque" element={<AdminStock />} />
          <Route path="cupons" element={<AdminCoupons />} />
          <Route path="clientes" element={<AdminCustomers />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
