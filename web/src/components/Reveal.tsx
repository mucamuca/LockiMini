import { useLayoutEffect, useRef, type ElementType, type ReactNode } from 'react';

/**
 * Aparecer ao entrar na tela — como enfeite, nunca como condicao para o
 * conteudo existir.
 *
 * O elemento nasce VISIVEL. So depois que o JavaScript roda e confirma que ha
 * IntersectionObserver e que o elemento esta abaixo da dobra e que ele recebe o
 * estado escondido. Assim, se o script falhar, se a aba estiver em segundo
 * plano ou se o navegador for antigo, a loja continua legivel — em vez de virar
 * uma pagina em branco.
 *
 * Um unico observer atende a aplicacao toda, e cada elemento sai dele assim que
 * aparece: o custo tende a zero conforme a pagina termina de revelar.
 */
let observer: IntersectionObserver | null = null;

function getObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('reveal-in');
        observer?.unobserve(entry.target);
      }
    },
    // Comeca a animar um pouco antes de entrar na tela: quando o usuario chega,
    // o elemento ja esta pronto em vez de aparecer atrasado.
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );
  return observer;
}

type RevealProps = {
  children: ReactNode;
  /** Atraso em ms — usado para escalonar itens de uma grade. */
  delay?: number;
  as?: ElementType;
  className?: string;
};

export function Reveal({ children, delay = 0, as: Tag = 'div', className = '' }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);

  // useLayoutEffect: esconde antes da pintura, entao nao ha piscada de
  // "apareceu e sumiu".
  useLayoutEffect(() => {
    const node = ref.current;
    const io = getObserver();
    if (!node || !io) return;

    // Ja visivel na abertura da pagina? Nao ha nada a revelar — deixa quieto.
    const box = node.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;

    node.classList.add('reveal');
    if (delay) node.style.transitionDelay = `${delay}ms`;
    io.observe(node);

    // Rede de seguranca: se por qualquer motivo o observer nao disparar,
    // o conteudo aparece sozinho. Conteudo invisivel nunca e uma opcao.
    const failsafe = window.setTimeout(() => {
      node.classList.add('reveal-in');
      io.unobserve(node);
    }, 2500);

    return () => {
      window.clearTimeout(failsafe);
      io.unobserve(node);
    };
  }, [delay]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
