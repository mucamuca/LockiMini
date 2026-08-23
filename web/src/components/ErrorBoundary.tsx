import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { error: Error | null };

/**
 * Rede de seguranca da interface.
 *
 * Sem isto, uma excecao em qualquer componente desmonta a arvore inteira e o
 * visitante fica olhando uma pagina branca, sem saber se o problema e a loja ou
 * a conexao dele. Aqui o erro fica contido: a pessoa ve uma mensagem, um botao
 * para tentar de novo e um caminho de volta para o catalogo.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Em producao, este e o ponto de envio para um servico de monitoramento.
    console.error('[interface] erro nao tratado', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-ink-50 px-4">
        <div className="card w-full max-w-md p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-rose-50 text-2xl">
            !
          </div>
          <h1 className="mt-4 text-lg font-bold text-ink-900">Algo quebrou nesta tela</h1>
          <p className="mt-2 text-sm text-ink-500">
            O problema ficou contido aqui — seu carrinho e seus pedidos estao intactos.
          </p>

          {import.meta.env.DEV && (
            <pre className="scroll-slim mt-4 max-h-40 overflow-auto rounded-lg bg-ink-900 p-3 text-left text-xs text-ink-100">
              {error.message}
            </pre>
          )}

          <div className="mt-6 flex gap-3">
            <button onClick={() => this.setState({ error: null })} className="btn-outline flex-1">
              Tentar de novo
            </button>
            <a href="/" className="btn-primary flex-1">
              Voltar a loja
            </a>
          </div>
        </div>
      </div>
    );
  }
}
