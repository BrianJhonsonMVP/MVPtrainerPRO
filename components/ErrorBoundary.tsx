
import React, { ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RotateCcw, Copy } from 'lucide-react';

// Added children as optional to Props to satisfy JSX child checks in some environments
interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Componente ErrorBoundary para capturar errores en el ciclo de vida de React
 * y mostrar una interfaz de respaldo amigable.
 * Se utiliza React.Component explícitamente para asegurar que TypeScript reconozca las propiedades de clase.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    // Initializing state in constructor
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Catch errors in any components below and re-render with error info
    this.setState({ errorInfo });
    console.error("CRITICAL_UI_ERROR:", error, errorInfo);
  }

  handleCopyError = () => {
    // Copy detailed error information to clipboard for debugging
    const errorLog = `
Error: ${this.state.error?.message}
Stack: ${this.state.error?.stack}
Component Stack: ${this.state.errorInfo?.componentStack}
    `;
    navigator.clipboard.writeText(errorLog);
    alert("Log de error copiado al portapapeles.");
  };

  render() {
    if (this.state.hasError) {
      // Render fallback UI when an error is caught
      return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center z-[9999]">
          <div className="bg-red-500/10 p-4 rounded-full mb-6 border border-red-500/30">
            <AlertCircle size={48} className="text-red-500" />
          </div>
          <h1 className="text-2xl font-black mb-2 text-white uppercase tracking-tighter">Fallo Crítico detectado</h1>
          <p className="text-zinc-400 text-sm mb-6 max-w-md">
            La interfaz de la aplicación ha colapsado. Esto suele deberse a un error inesperado en el renderizado.
          </p>
          
          <div className="w-full max-w-2xl bg-zinc-900 border border-zinc-800 rounded-xl p-4 mb-6 text-left overflow-hidden">
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
          </div>

          <div className="flex gap-4">
            <button 
              onClick={() => window.location.reload()} 
              className="bg-white text-black px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-zinc-200 transition-colors"
            >
              <RotateCcw size={18} /> Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }

    // Return children if no error occurred
    return this.props.children;
  }
}
