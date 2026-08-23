import { useMemo } from 'react';
import { Check } from 'lucide-react';
import type { Product, ProductVariant } from '../lib/types';

/**
 * Encontra a variacao correspondente a uma cor e um tamanho.
 *
 * Um dos eixos pode nao existir no produto (so cor, ou so tamanho), e ai o
 * valor procurado e nulo dos dois lados.
 */
export function findVariant(
  variants: ProductVariant[],
  color: string | null,
  size: string | null,
): ProductVariant | undefined {
  return variants.find((v) => v.colorName === color && v.sizeName === size);
}

/** A primeira combinacao que da para comprar — o padrao ao abrir a pagina. */
export function firstAvailableVariant(variants: ProductVariant[]): ProductVariant | undefined {
  return variants.find((v) => !v.stock.outOfStock) ?? variants[0];
}

type Props = {
  product: Product;
  color: string | null;
  size: string | null;
  onChange: (next: { color: string | null; size: string | null }) => void;
};

export function VariantPicker({ product, color, size, onChange }: Props) {
  const { variants, options } = product;

  /**
   * Para cada valor de um eixo, existe alguma combinacao comprável?
   *
   * Sem isto, o cliente escolheria "Azul" e so descobriria no botao que o
   * tamanho dele nao vem em azul. Aqui a opcao ja aparece riscada.
   */
  const colorHasStock = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const c of options.colors) {
      map.set(
        c.name,
        variants.some((v) => v.colorName === c.name && !v.stock.outOfStock),
      );
    }
    return map;
  }, [options.colors, variants]);

  // Disponibilidade do tamanho DENTRO da cor escolhida — e o que importa na hora.
  const sizeHasStock = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const sz of options.sizes) {
      map.set(
        sz,
        variants.some(
          (v) => v.sizeName === sz && (color === null || v.colorName === color) && !v.stock.outOfStock,
        ),
      );
    }
    return map;
  }, [options.sizes, variants, color]);

  if (variants.length === 0) return null;

  /** Troca de cor mantendo o tamanho se ele existir na cor nova. */
  const pickColor = (name: string) => {
    const keepSize = size && variants.some((v) => v.colorName === name && v.sizeName === size);
    const fallback = variants.find((v) => v.colorName === name && !v.stock.outOfStock)?.sizeName ?? null;
    onChange({ color: name, size: keepSize ? size : fallback });
  };

  return (
    <div className="mt-6 space-y-5">
      {options.colors.length > 0 && (
        <div>
          <div className="flex items-baseline gap-2">
            <span className="label mb-0">Cor</span>
            <span className="text-sm font-medium text-ink-700 dark:text-ink-200">{color ?? 'Selecione'}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {options.colors.map((c) => {
              const selected = c.name === color;
              const disponivel = colorHasStock.get(c.name) ?? false;
              return (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => pickColor(c.name)}
                  title={disponivel ? c.name : `${c.name} — esgotado`}
                  aria-pressed={selected}
                  aria-label={c.name}
                  className={`relative grid h-10 w-10 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-white transition-transform duration-150 hover:scale-110 dark:ring-offset-ink-900 ${
                    selected ? 'ring-ink-900 dark:ring-white' : 'ring-ink-200 dark:ring-ink-700'
                  } ${disponivel ? '' : 'opacity-40'}`}
                  style={{ backgroundColor: c.hex ?? '#c9ced6' }}
                >
                  {selected && (
                    <Check
                      className="h-4 w-4 drop-shadow"
                      // Contraste do tique contra a propria cor da bolinha.
                      style={{ color: isDark(c.hex) ? '#fff' : '#101317' }}
                    />
                  )}
                  {!disponivel && (
                    <span className="absolute h-[2px] w-11 -rotate-45 rounded bg-ink-400" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {options.sizes.length > 0 && (
        <div>
          <div className="flex items-baseline gap-2">
            <span className="label mb-0">Tamanho</span>
            <span className="text-sm font-medium text-ink-700 dark:text-ink-200">{size ?? 'Selecione'}</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {options.sizes.map((sz) => {
              const selected = sz === size;
              const disponivel = sizeHasStock.get(sz) ?? false;
              return (
                <button
                  key={sz}
                  type="button"
                  onClick={() => onChange({ color, size: sz })}
                  disabled={!disponivel}
                  aria-pressed={selected}
                  className={`min-w-14 rounded-xl border px-3.5 py-2 text-sm font-semibold transition-all duration-150 ${
                    selected
                      ? 'border-ink-900 bg-ink-900 text-white dark:border-white dark:bg-white dark:text-ink-900'
                      : disponivel
                        ? 'border-ink-200 bg-white dark:bg-ink-900 text-ink-800 hover:border-ink-400 dark:border-ink-700 dark:bg-ink-800 dark:text-ink-100 dark:hover:border-ink-500'
                        : 'cursor-not-allowed border-ink-100 bg-ink-50 dark:bg-ink-925 text-ink-300 line-through dark:border-ink-800 dark:bg-ink-900 dark:text-ink-600'
                  }`}
                >
                  {sz}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Luminancia aproximada — decide se o tique sobre a cor sai branco ou preto. */
function isDark(hex: string | null) {
  if (!hex) return false;
  const m = hex.replace('#', '');
  if (m.length !== 6) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b < 140;
}
