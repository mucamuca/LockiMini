import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { PackageSearch } from 'lucide-react';
import { ApiError } from '../lib/api';
import { useAuth } from '../store/auth';
import { useToast } from '../components/Toast';
import { Field, Spinner } from '../components/ui';

function AuthShell({ title, subtitle, children, footer }: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="mx-auto grid min-h-[70vh] max-w-6xl items-center gap-12 px-4 py-12 lg:grid-cols-2">
      <div className="hidden lg:block">
        <div className="rounded-3xl bg-ink-900 p-10 text-white">
          <span className="chip bg-white/10 text-white ring-1 ring-white/20">LockiMini</span>
          <h2 className="mt-6 text-3xl font-extrabold leading-tight">
            Acompanhe seus pedidos
            <br />
            do carrinho ate a porta.
          </h2>
          <p className="mt-4 leading-relaxed text-ink-300">
            Com uma conta, seu carrinho fica salvo entre dispositivos, os enderecos ficam prontos no
            checkout e voce ve o status de cada pedido mudar em tempo real.
          </p>
          <dl className="mt-8 space-y-3 text-sm text-ink-200">
            <div className="flex gap-2"><span className="text-brand-400">•</span> Historico completo de compras</div>
            <div className="flex gap-2"><span className="text-brand-400">•</span> Endereco salvo para o proximo pedido</div>
            <div className="flex gap-2"><span className="text-brand-400">•</span> Notificacao de status ao vivo</div>
          </dl>
        </div>
      </div>

      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">{title}</h1>
        <p className="mt-1.5 text-sm text-ink-500">{subtitle}</p>
        {children}
        <div className="mt-6 text-center text-sm text-ink-500">{footer}</div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const from = (location.state as { from?: string } | null)?.from ?? '/';

  // Um unico redirecionamento, declarativo: o contexto de auth atualiza assim que
  // o login resolve, e um navigate() imperativo aqui correria com este Navigate.
  // Admin sem destino especifico cai direto no painel.
  if (user) {
    const target = user.role === 'ADMIN' && from === '/' ? '/admin' : from;
    return <Navigate to={target} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const logged = await login(email.trim().toLowerCase(), password);
      toast.success(`Bem-vindo, ${logged.name.split(' ')[0]}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel entrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Entrar"
      subtitle="Use sua conta para acompanhar pedidos."
      footer={
        <>
          Ainda nao tem conta?{' '}
          <Link to="/criar-conta" className="font-semibold text-brand-600 hover:underline">
            Criar agora
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="E-mail">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Senha">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            autoComplete="current-password"
            required
          />
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

        <button type="submit" className="btn-primary h-11 w-full" disabled={busy}>
          {busy ? <Spinner /> : 'Entrar'}
        </button>
      </form>

      <div className="mt-5 rounded-xl bg-ink-100/70 p-3.5 text-xs text-ink-600">
        <p className="font-semibold text-ink-800">Contas de demonstracao</p>
        <div className="mt-2 space-y-1.5">
          <button
            type="button"
            onClick={() => {
              setEmail('cliente@lockimini.dev');
              setPassword('cliente1234');
            }}
            className="block text-left hover:text-brand-700"
          >
            Cliente — cliente@lockimini.dev / cliente1234
          </button>
          <button
            type="button"
            onClick={() => {
              setEmail('admin@lockimini.dev');
              setPassword('admin1234');
            }}
            className="block text-left hover:text-brand-700"
          >
            Admin — admin@lockimini.dev / admin1234
          </button>
        </div>
      </div>
    </AuthShell>
  );
}

export function RegisterPage() {
  const { user, register } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (form.password !== form.confirm) {
      setError('As senhas nao conferem.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await register(form.name.trim(), form.email.trim().toLowerCase(), form.password);
      toast.success('Conta criada', 'Bom ter voce por aqui.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nao foi possivel criar a conta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Criar conta"
      subtitle="Leva menos de um minuto."
      footer={
        <>
          Ja tem conta?{' '}
          <Link to="/entrar" className="font-semibold text-brand-600 hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <Field label="Nome completo">
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
            autoComplete="name"
            required
          />
        </Field>
        <Field label="E-mail">
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="input"
            autoComplete="email"
            required
          />
        </Field>
        <Field label="Senha" hint="Minimo de 8 caracteres, com letra e numero.">
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="input"
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Confirmar senha">
          <input
            type="password"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
            className="input"
            autoComplete="new-password"
            required
          />
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

        <button type="submit" className="btn-primary h-11 w-full" disabled={busy}>
          {busy ? <Spinner /> : 'Criar conta'}
        </button>
      </form>
    </AuthShell>
  );
}

export function OrderLookupPage() {
  const [number, setNumber] = useState('');
  const [email, setEmail] = useState('');
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-md px-4 py-20">
      <div className="card p-6">
        <PackageSearch className="h-8 w-8 text-brand-600" />
        <h1 className="mt-4 text-xl font-bold text-ink-900">Rastrear pedido</h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Comprou sem criar conta? Informe o numero do pedido e o e-mail usado na compra.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate(`/pedido/${number.trim()}`, { state: { email: email.trim() } });
          }}
          className="mt-5 space-y-4"
        >
          <Field label="Numero do pedido">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value.toUpperCase())}
              className="input font-mono"
              placeholder="LK-2026-XXXXXX"
              required
            />
          </Field>
          <Field label="E-mail da compra">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              required
            />
          </Field>
          <button type="submit" className="btn-primary w-full">Buscar pedido</button>
        </form>
      </div>
    </div>
  );
}
