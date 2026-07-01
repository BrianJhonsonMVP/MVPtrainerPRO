
import React, { useState } from 'react';
import { Database, Link as LinkIcon, Key, Zap, X, ShieldCheck, AlertCircle, Trash2, RefreshCcw, CheckCircle2, Globe, Copy } from 'lucide-react';
import { getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from '../config/runtimeEnv';

const SupabaseSetupModal = ({ onClose }: { onClose: () => void }) => {
  const config = getSupabaseConfig();
  const [url, setUrl] = useState(config.url || '');
  const [key, setKey] = useState(config.anonKey || '');
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [testError, setTestError] = useState('');

  const handleTestConnection = async () => {
    if (!url || !key) return;
    setTestStatus('testing');
    setTestError('');
    try {
      // Intento de llamar a la API de Supabase para validar credenciales
      const response = await fetch(`${url}/rest/v1/?apikey=${key}`, { 
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      
      // 401 es aceptable si no hay tablas públicas (significa que el endpoint y la key son válidos)
      if (response.ok || response.status === 401 || response.status === 200) {
        setTestStatus('success');
      } else {
        const errData = await response.json().catch(() => ({}));
        setTestStatus('error');
        setTestError(errData.message || `Error HTTP ${response.status}`);
      }
    } catch (e: any) {
      setTestStatus('error');
      setTestError(e.message || "Error de red o CORS");
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(window.location.origin);
    alert("URL copiada");
  };

  const handleSave = () => {
    saveSupabaseConfig(url, key);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/95 backdrop-blur-sm animate-fadeIn">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/30">
          <div className="flex items-center gap-3">
            <div className="bg-mvp-gold/20 p-2 rounded-xl">
               <Database size={24} className="text-mvp-gold" />
            </div>
            <div>
              <h3 className="font-black text-white uppercase tracking-tighter text-lg">Backend Setup</h3>
              <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">SaaS Infrastructure</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-700 rounded-full text-zinc-400">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
          {/* Connection Test Banner */}
          <div className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                testStatus === 'success' ? 'bg-green-500/10 border-green-500/30 text-green-500' :
                testStatus === 'error' ? 'bg-red-500/10 border-red-500/30 text-red-500' :
                'bg-zinc-800/50 border-zinc-700 text-zinc-400'
            }`}>
              <div className="flex items-center gap-3">
                {testStatus === 'testing' ? <RefreshCcw size={18} className="animate-spin" /> : 
                 testStatus === 'success' ? <CheckCircle2 size={18} /> : <Zap size={18} />}
                <span className="text-[11px] font-bold uppercase tracking-wider">
                    {testStatus === 'testing' ? 'Verificando...' : 
                     testStatus === 'success' ? 'Conexión Exitosa' : 
                     testStatus === 'error' ? `Error: ${testError}` : 'Prueba de credenciales'}
                </span>
              </div>
              <button 
                onClick={handleTestConnection}
                disabled={!url || !key || testStatus === 'testing'}
                className="text-[10px] font-black uppercase tracking-tighter bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10"
              >
                Probar
              </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-[10px] text-zinc-500 font-bold uppercase mb-2 block tracking-widest">Project URL</label>
              <div className="relative">
                <LinkIcon size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"/>
                <input 
                    type="text" 
                    value={url} 
                    onChange={e => { setUrl(e.target.value); setTestStatus('idle'); }}
                    className="w-full bg-black border border-zinc-800 text-sm text-white rounded-xl pl-11 pr-4 py-4 outline-none focus:border-mvp-gold transition-all"
                    placeholder="https://brbkfmshwwehidsdqijl.supabase.co"
                />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-zinc-500 font-bold uppercase mb-2 block tracking-widest">Public Anon Key</label>
              <div className="relative">
                <Key size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"/>
                <input 
                    type="password" 
                    value={key} 
                    onChange={e => { setKey(e.target.value); setTestStatus('idle'); }}
                    className="w-full bg-black border border-zinc-800 text-sm text-white rounded-xl pl-11 pr-4 py-4 outline-none focus:border-mvp-gold transition-all"
                    placeholder="eyJhbGciOiJIUzI1..."
                />
              </div>
            </div>
          </div>

          {/* Help Section for Redirect URLs */}
          <div className="bg-blue-500/5 border border-blue-500/20 p-5 rounded-2xl space-y-3">
             <div className="flex items-center gap-2 text-blue-400">
                <Globe size={16} />
                <span className="text-[11px] font-black uppercase tracking-tighter">Configuración de Redirect URLs</span>
             </div>
             <p className="text-[10px] text-zinc-500 leading-relaxed font-bold">
                Para que el registro funcione correctamente, agrega esta URL en tu Dashboard de Supabase (Authentication → URL Configuration):
             </p>
             <div className="flex items-center gap-2 bg-black/40 p-3 rounded-xl border border-white/5">
                <code className="text-[10px] text-mvp-gold flex-1 truncate">{window.location.origin}</code>
                <button onClick={handleCopyUrl} className="p-1.5 hover:bg-white/10 rounded-lg text-zinc-400">
                    <Copy size={14} />
                </button>
             </div>
             <p className="text-[9px] text-zinc-600 font-medium">
                * Agregue también <code>{window.location.origin}/**</code> en Redirect URLs.
             </p>
          </div>

          <div className="flex gap-3">
             <button 
                onClick={handleSave}
                disabled={!url || !key || testStatus === 'error'}
                className="flex-1 bg-mvp-gold hover:bg-amber-500 text-black font-black text-sm py-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-30 uppercase tracking-tighter shadow-lg"
             >
                <CheckCircle2 size={18} /> Guardar y Activar
             </button>
             
             {config.source === 'localStorage' && (
                <button 
                  onClick={() => { if(confirm("¿Volver a Demo?")) clearSupabaseConfig(); }}
                  className="p-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-500 rounded-xl border border-zinc-700"
                >
                  <Trash2 size={20}/>
                </button>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SupabaseSetupModal;
