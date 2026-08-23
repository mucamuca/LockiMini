import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

export type CepAddress = {
  postalCode: string;
  street: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

type Status = 'idle' | 'loading' | 'ok' | 'notfound' | 'error';

/**
 * Busca o endereco assim que o CEP fica completo.
 *
 * Regras que valem a pena registrar:
 *
 * 1. Dispara sozinho ao chegar em 8 digitos — pedir um clique a mais so para
 *    confirmar o que o sistema ja sabe fazer e trabalho jogado no cliente.
 * 2. Nunca sobrescreve o que a pessoa digitou. Se ela ja preencheu a cidade a
 *    mao, a busca respeita; so preenche campo vazio ou campo que a propria
 *    busca tinha preenchido antes (troca de CEP corrige o CEP anterior).
 * 3. Falha nao trava nada. Servico fora do ar, CEP novo demais, sem internet —
 *    o formulario continua aceitando digitacao normal.
 */
/** Quais campos esta busca tem permissao de escrever. */
export type CepPermissions = Record<keyof CepAddress, boolean>;

export function useCepLookup(onFill: (address: CepAddress, permissions: CepPermissions) => void) {
  const [status, setStatus] = useState<Status>('idle');

  // O que ESTA busca preencheu. E a memoria que permite corrigir um CEP errado
  // sem apagar o que o cliente escreveu por conta propria.
  const filledByUs = useRef<Partial<CepAddress>>({});
  // Evita que uma resposta lenta de um CEP antigo sobrescreva um CEP novo.
  const lastRequested = useRef('');
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const lookup = useCallback(
    async (raw: string, current: Record<string, string>) => {
      const digits = raw.replace(/\D/g, '');
      if (digits.length !== 8) {
        setStatus('idle');
        return;
      }
      if (digits === lastRequested.current) return; // ja buscamos este
      lastRequested.current = digits;
      setStatus('loading');

      try {
        const { address } = await api.get<{ address: CepAddress }>(`/cep/${digits}`);
        if (!alive.current || lastRequested.current !== digits) return;

        // Decidido AGORA, campo a campo, e nao como funcao a ser chamada depois.
        //
        // Isto ja foi um bug: passando uma funcao, o atualizador do setForm a
        // executava so na hora do render do React — quando `filledByUs` ja
        // apontava para o endereco novo. A comparacao "o valor atual foi
        // preenchido por mim?" entao comparava o campo contra ele mesmo do CEP
        // seguinte e dava falso, e corrigir um CEP errado nao atualizava nada.
        const permissions = Object.fromEntries(
          (Object.keys(fieldToForm) as (keyof CepAddress)[]).map((field) => {
            const atual = current[fieldToForm[field]] ?? '';
            return [field, atual.trim() === '' || atual === filledByUs.current[field]];
          }),
        ) as CepPermissions;

        filledByUs.current = address;
        onFill(address, permissions);
        setStatus('ok');
      } catch (err) {
        if (!alive.current || lastRequested.current !== digits) return;
        const status = (err as { status?: number })?.status;
        setStatus(status === 404 ? 'notfound' : 'error');
      }
    },
    [onFill],
  );

  return { lookup, status };
}

/** De onde cada campo do CEP vai parar no formulario. */
const fieldToForm: Record<keyof CepAddress, string> = {
  postalCode: 'postalCode',
  street: 'line1',
  complement: 'line2',
  district: 'district',
  city: 'city',
  state: 'state',
};
