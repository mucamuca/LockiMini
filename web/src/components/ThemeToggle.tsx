import { useEffect, useRef, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme, watchSystemTheme, type ThemePreference } from '../store/theme';

const OPCOES: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Sistema', icon: Monitor },
];

/**
 * Troca de tema com tres estados.
 *
 * "Sistema" existe e e o padrao porque a maioria das pessoas ja configurou a
 * preferencia no aparelho — obrigar a escolher de novo em cada site e trabalho
 * repetido. As outras duas opcoes atendem quem quer esta loja diferente do
 * resto do sistema.
 */
export function ThemeToggle() {
  const { preference, resolved, setPreference, toggle } = useTheme();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement | null>(null);

  // Mantem "sistema" acompanhando de verdade enquanto a aba esta aberta.
  useEffect(() => watchSystemTheme(), []);

  // Fecha ao clicar fora ou apertar Esc — comportamento esperado de menu.
  useEffect(() => {
    if (!aberto) return;
    const foraDaCaixa = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', foraDaCaixa);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      document.removeEventListener('keydown', escape);
    };
  }, [aberto]);

  const Icone = resolved === 'dark' ? Moon : Sun;

  return (
    <div className="relative" ref={caixa}>
      <button
        onClick={() => setAberto((v) => !v)}
        // Clique simples ja alterna para quem nao quer abrir menu nenhum.
        onDoubleClick={toggle}
        className="rounded-xl px-2.5 py-2 text-ink-700 dark:text-ink-200 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800 dark:text-ink-300 dark:hover:bg-ink-850"
        aria-label={`Tema: ${OPCOES.find((o) => o.value === preference)?.label}. Trocar.`}
        aria-haspopup="menu"
        aria-expanded={aberto}
      >
        <Icone className="h-5 w-5 transition-transform duration-300 ease-out" />
      </button>

      {aberto && (
        <div
          role="menu"
          className="animate-scale-in absolute right-0 top-full z-50 mt-2 w-40 origin-top-right overflow-hidden rounded-xl border border-ink-100 bg-white p-1 shadow-lift dark:border-ink-800 dark:bg-ink-900 dark:shadow-lift-dark"
        >
          {OPCOES.map(({ value, label, icon: Icon }) => {
            const ativo = preference === value;
            return (
              <button
                key={value}
                role="menuitemradio"
                aria-checked={ativo}
                onClick={() => {
                  setPreference(value);
                  setAberto(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  ativo
                    ? 'bg-ink-100 text-ink-900 dark:text-ink-50 dark:bg-ink-800 dark:text-white'
                    : 'text-ink-600 hover:bg-ink-50 dark:hover:bg-ink-850 dark:text-ink-300 dark:hover:bg-ink-850'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
                {value === 'system' && (
                  <span className="ml-auto text-[10px] uppercase tracking-wide text-ink-400">
                    {resolved === 'dark' ? 'escuro' : 'claro'}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
