
import React from 'react';
import { AlertCircle, RotateCcw, Copy } from 'lucide-react';

interface Props {
  children?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends (React.Component as any) {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  public static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error("CRITICAL_UI_ERROR:", error, errorInfo);
  }

  private handleCopyError = () => {
    // Copy detailed error information to clipboard for debugging
    const errorLog = `
Error: ${this.state.error?.message}
Stack: ${this.state.error?.stack}
Component Stack: ${this.state.errorInfo?.componentStack}
    `;
    navigator.clipboard.writeText(errorLog);
    alert("Log de error copiado al portapapeles.");
  };

  public render() {
    if (this.state.hasError) {
      const showTechnicalDetails = Boolean((import.meta as any).env?.DEV);
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center z-[9999]">
          <div className="bg-red-500/10 p-4 rounded-full mb-6 border border-red-500/30">
            <AlertCircle size={48} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-black mb-2 text-white">No pudimos mostrar esta pantalla</h1>
          <p className="text-zinc-400 text-sm mb-6 max-w-md">
            Tus datos siguen guardados. Recarga la aplicación para continuar; si vuelve a ocurrir, comunícate con soporte.
          </p>
          
          {showTechnicalDetails && <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 text-left overflow-hidden">
             <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold text-red-400 uppercase tracking-widest">Error Log</span>
                <button onClick={this.handleCopyError} className="text-[10px] text-zinc-500 hover:text-white flex items-center gap-1">
                   <Copy size={12}/> Copiar
                </button>
             </div>
             <pre className="text-[10px] font-mono text-zinc-500 overflow-x-auto whitespace-pre-wrap max-h-40 custom-scrollbar">
                {this.state.error?.message}
                {"\n\n"}
                {this.state.error?.stack}
             </pre>
          </div>}

          <div className="flex gap-4">
            <button 
              onClick={() => window.location.reload()} 
              className="bg-white text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-200 transition-colors"
            >
              <RotateCcw size={18} /> Volver a intentar
            </button>
          </div>
        </div>
      );
    }

    // Return children if no error occurred
    return this.props.children;
  }
}
