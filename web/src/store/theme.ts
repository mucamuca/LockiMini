import { create } from 'zustand';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Mesma chave usada pelo script inline do index.html — nao mude uma sem a outra. */
export const THEME_KEY = 'lockimini:theme';

const media = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

function systemTheme(): ResolvedTheme {
  return media()?.matches ? 'dark' : 'light';
}

export function readStoredPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  } catch {
    // Modo privativo ou storage bloqueado: seguimos o sistema, sem quebrar.
  }
  return 'system';
}

/** Aplica no elemento raiz. E a unica funcao que toca no DOM. */
function apply(resolved: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
}

type ThemeState = {
  /** O que a pessoa escolheu — inclui "acompanhar o sistema". */
  preference: ThemePreference;
  /** O que esta valendo na tela agora. */
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  /** Alterna claro/escuro a partir do que esta valendo. */
  toggle: () => void;
};

const initialPreference = typeof window === 'undefined' ? 'system' : readStoredPreference();
const initialResolved: ResolvedTheme =
  typeof window === 'undefined'
    ? 'light'
    : initialPreference === 'system'
      ? systemTheme()
      : initialPreference;

export const useTheme = create<ThemeState>((set, get) => ({
  preference: initialPreference,
  resolved: initialResolved,

  setPreference: (preference) => {
    const resolved = preference === 'system' ? systemTheme() : preference;
    try {
      localStorage.setItem(THEME_KEY, preference);
    } catch {
      // Sem persistencia a escolha vale so nesta aba — melhor que estourar.
    }
    apply(resolved);
    set({ preference, resolved });
  },

  toggle: () => get().setPreference(get().resolved === 'dark' ? 'light' : 'dark'),
}));

/**
 * Mantem "acompanhar o sistema" realmente acompanhando.
 *
 * Sem isto, quem escolheu \`system\` e mudou o tema do computador com a loja
 * aberta continuaria vendo o tema antigo ate recarregar.
 */
export function watchSystemTheme() {
  const mq = media();
  if (!mq) return () => undefined;

  const onChange = () => {
    if (useTheme.getState().preference !== 'system') return;
    const resolved = systemTheme();
    apply(resolved);
    useTheme.setState({ resolved });
  };

  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
