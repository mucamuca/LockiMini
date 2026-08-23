import { Router } from 'express';
import { asyncHandler } from '../lib/async.js';
import { badRequest, notFound } from '../http/errors.js';

export const cepRouter = Router();

/**
 * Consulta de CEP para preencher o endereco do checkout.
 *
 * Passa pelo nosso servidor em vez de o navegador chamar o ViaCEP direto por
 * tres motivos: o IP do cliente nao vaza para um terceiro, o cache vale para
 * todo mundo (um CEP consultado uma vez serve a proxima pessoa), e a resposta
 * chega ja no formato dos campos do formulario.
 *
 * Se o servico externo cair, a rota responde 404/503 e o formulario continua
 * aceitando digitacao manual — a busca e uma conveniencia, nunca um bloqueio.
 */

const VIACEP = 'https://viacep.com.br/ws';
const TIMEOUT_MS = 4000;

export type CepAddress = {
  postalCode: string;
  street: string;
  complement: string;
  district: string;
  city: string;
  state: string;
};

/**
 * Cache em memoria. CEP nao muda de bairro, entao nao ha invalidacao a fazer;
 * o limite existe so para o processo nao crescer sem fim.
 */
const cache = new Map<string, CepAddress>();
const CACHE_MAX = 5000;

const onlyDigits = (v: string) => v.replace(/\D/g, '');

/** 00000-000 — formato que o campo do formulario espera de volta. */
const format = (digits: string) => `${digits.slice(0, 5)}-${digits.slice(5)}`;

cepRouter.get(
  '/:cep',
  asyncHandler(async (req, res) => {
    const digits = onlyDigits(req.params.cep);
    if (digits.length !== 8) throw badRequest('CEP deve ter 8 digitos.', 'invalid_cep');

    const hit = cache.get(digits);
    if (hit) return res.json({ address: hit, cached: true });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let payload: Record<string, string | boolean> | null = null;
    try {
      const upstream = await fetch(`${VIACEP}/${digits}/json/`, { signal: controller.signal });
      if (upstream.ok) payload = (await upstream.json()) as Record<string, string | boolean>;
    } catch (err) {
      // Timeout ou rede fora: nao e erro do cliente, e falta de conveniencia.
      console.warn('[cep] consulta falhou', digits, (err as Error).name);
      return res.status(503).json({
        error: { code: 'cep_lookup_failed', message: 'Nao foi possivel consultar o CEP agora.' },
      });
    } finally {
      clearTimeout(timer);
    }

    // O ViaCEP responde 200 com { erro: true } para CEP inexistente.
    if (!payload || payload.erro) throw notFound('CEP nao encontrado.');

    const address: CepAddress = {
      postalCode: format(digits),
      street: String(payload.logradouro ?? ''),
      complement: String(payload.complemento ?? ''),
      district: String(payload.bairro ?? ''),
      city: String(payload.localidade ?? ''),
      state: String(payload.uf ?? ''),
    };

    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(digits, address);

    res.json({ address, cached: false });
  }),
);
