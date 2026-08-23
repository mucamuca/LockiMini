import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { ApiError, api } from '../../lib/api';
import { dateTime, money } from '../../lib/format';
import type { Coupon, Customer } from '../../lib/types';
import { useToast } from '../../components/Toast';
import { EmptyState, Field, PageHeading, Spinner, TableSkeleton } from '../../components/ui';

export function AdminCoupons() {
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'coupons'],
    queryFn: () => api.get<{ items: Coupon[] }>('/admin/coupons'),
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      api.patch(`/admin/coupons/${input.id}`, { active: input.active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/coupons/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      toast.success('Cupom excluido');
    },
  });

  const coupons = data?.items ?? [];

  return (
    <>
      <PageHeading
        title="Cupons"
        subtitle="Descontos aplicaveis no checkout"
        actions={
          <button onClick={() => setCreating(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Novo cupom
          </button>
        }
      />

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={4} cols={5} />
          </div>
        ) : coupons.length === 0 ? (
          <EmptyState title="Nenhum cupom criado" message="Crie um codigo para oferecer desconto." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50/70 text-left text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Codigo</th>
                  <th className="px-4 py-3 font-semibold">Desconto</th>
                  <th className="px-4 py-3 font-semibold">Minimo</th>
                  <th className="px-4 py-3 text-center font-semibold">Usos</th>
                  <th className="px-4 py-3 text-center font-semibold">Ativo</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {coupons.map((c) => (
                  <tr key={c.id} className="hover:bg-ink-50/60">
                    <td className="px-4 py-3 font-mono font-semibold text-ink-900 dark:text-ink-50">{c.code}</td>
                    <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                      {c.percentOff ? `${c.percentOff}%` : money(c.amountOffCents ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-ink-600 dark:text-ink-300">
                      {c.minSubtotalCents > 0 ? money(c.minSubtotalCents) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-ink-600 dark:text-ink-300">
                      {c.uses}
                      {c.maxUses ? ` / ${c.maxUses}` : ''}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => toggle.mutate({ id: c.id, active: !c.active })}
                        className={`relative h-6 w-11 rounded-full transition ${
                          c.active ? 'bg-emerald-500' : 'bg-ink-200'
                        }`}
                        aria-label={c.active ? 'Desativar cupom' : 'Ativar cupom'}
                      >
                        <span
                          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white dark:bg-ink-900 shadow transition-all ${
                            c.active ? 'left-[22px]' : 'left-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => confirm(`Excluir o cupom ${c.code}?`) && remove.mutate(c.id)}
                        className="rounded-lg p-2 text-ink-500 dark:text-ink-400 transition hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600"
                        aria-label={`Excluir ${c.code}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && <CouponDialog onClose={() => setCreating(false)} />}
    </>
  );
}

function CouponDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState('');
  const [type, setType] = useState<'percent' | 'amount'>('percent');
  const [value, setValue] = useState('10');
  const [minSubtotal, setMinSubtotal] = useState('0');
  const [maxUses, setMaxUses] = useState('');
  const queryClient = useQueryClient();
  const toast = useToast();

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/admin/coupons', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      toast.success('Cupom criado');
      onClose();
    },
    onError: (err) =>
      toast.error('Nao foi possivel criar', err instanceof ApiError ? err.message : undefined),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    create.mutate({
      code: code.trim().toUpperCase(),
      percentOff: type === 'percent' ? Number(value) : null,
      amountOffCents: type === 'amount' ? Math.round(Number(value.replace(',', '.')) * 100) : null,
      minSubtotalCents: Math.round(Number(minSubtotal.replace(',', '.')) * 100),
      maxUses: maxUses ? Number(maxUses) : null,
      active: true,
    });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink-950/40" onClick={onClose} />
      <form onSubmit={onSubmit} className="relative w-full max-w-md animate-fade-up rounded-2xl bg-white dark:bg-ink-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-ink-900 dark:text-ink-50">Novo cupom</h2>
          <button type="button" onClick={onClose} className="btn-ghost px-2" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Codigo">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              className="input font-mono"
              placeholder="PROMO20"
              required
              minLength={3}
            />
          </Field>

          <div className="flex rounded-xl border border-ink-200 dark:border-ink-700 p-1">
            <button
              type="button"
              onClick={() => setType('percent')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                type === 'percent' ? 'bg-ink-900 text-white' : 'text-ink-600 dark:text-ink-300'
              }`}
            >
              Percentual
            </button>
            <button
              type="button"
              onClick={() => setType('amount')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                type === 'amount' ? 'bg-ink-900 text-white' : 'text-ink-600 dark:text-ink-300'
              }`}
            >
              Valor fixo
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="{type === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'}">
              <input value={value} onChange={(e) => setValue(e.target.value)} className="input" required />
            </Field>
            <Field label="Compra minima (R$)">
              <input value={minSubtotal} onChange={(e) => setMinSubtotal(e.target.value)} className="input" />
            </Field>
          </div>

          <Field label="Limite de usos (opcional)">
            <input
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value.replace(/\D/g, ''))}
              className="input"
              placeholder="sem limite"
            />
          </Field>
        </div>

        <div className="mt-6 flex gap-3">
          <button type="button" onClick={onClose} className="btn-outline flex-1">
            Cancelar
          </button>
          <button type="submit" className="btn-primary flex-1" disabled={create.isPending}>
            {create.isPending ? <Spinner /> : 'Criar cupom'}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AdminCustomers() {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'customers', search],
    queryFn: () =>
      api.get<{ items: Customer[] }>(`/admin/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  });

  const customers = data?.items ?? [];

  return (
    <>
      <PageHeading title="Clientes" subtitle={`${customers.length} cadastrados`} />

      <div className="card mb-5 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
            placeholder="Buscar por nome ou e-mail"
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={5} cols={4} />
          </div>
        ) : customers.length === 0 ? (
          <EmptyState title="Nenhum cliente encontrado" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-ink-50/70 text-left text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">Cliente</th>
                  <th className="px-4 py-3 font-semibold">Cadastro</th>
                  <th className="px-4 py-3 text-center font-semibold">Pedidos</th>
                  <th className="px-4 py-3 text-right font-semibold">Total comprado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                {customers.map((c) => (
                  <tr key={c.id} className="hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-100 dark:bg-ink-800 text-xs font-bold text-ink-600 dark:text-ink-300">
                          {c.name.slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-ink-900 dark:text-ink-50">
                            {c.name}
                            {c.role === 'ADMIN' && (
                              <span className="ml-2 chip bg-brand-50 dark:bg-brand-900/25 text-brand-700 dark:text-brand-400 ring-1 ring-brand-200">
                                admin
                              </span>
                            )}
                          </p>
                          <p className="truncate text-xs text-ink-500 dark:text-ink-400">{c.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{dateTime(c.createdAt)}</td>
                    <td className="px-4 py-3 text-center text-ink-600 dark:text-ink-300">{c.orderCount}</td>
                    <td className="px-4 py-3 text-right font-semibold text-ink-900 dark:text-ink-50">
                      {money(c.lifetimeValueCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
