
import React, { useState } from 'react';
import { User } from '../types';
import { Settings, Database, Shield, Zap, X, Info, Key, Link as LinkIcon, Trash2, RefreshCw, Server, User as UserIcon } from 'lucide-react';
import { isSupabaseEnabled } from '../services/supabaseClient';
import { saveSupabaseConfig, clearSupabaseConfig } from '../config/runtimeEnv';
import { dbProvider } from '../data';

interface DebugPanelProps {
  user: User | null;
  clientsCount: number;
  onClose: () => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ user, clientsCount, onClose }) => {
  const isSupaOk = isSupabaseEnabled();
  const [url, setUrl] = useState(localStorage.getItem('MVP_SUPABASE_URL') || '');
  const [key, setKey] = useState(localStorage.getItem('MVP_SUPABASE_ANON_KEY') || '');
  const [loading, setLoading] = useState(false);

  const handleConnect = () => {
    if (!url || !key) return;
    setLoading(true);
    saveSupabaseConfig(url, key);
  };

  const handleReset = () => {
    if(confirm("¿Borrar credenciales guardadas y volver al modo demo?")) {
        clearSupabaseConfig();
        setUrl('');
        setKey('');
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
      <div className="bg-zinc-900 border border-zinc-800 w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/30">
          <div className="flex items-center gap-3">
            <Settings size={20} className="text-mvp-gold" />
            <div>
                <h3 className="font-black text-white uppercase tracking-tighter text-lg">System Diagnostic</h3>
                <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Hardware & Cloud Status</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-700 rounded-full text-zinc-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
          
          {/* Diagnostic Info Section */}
          <section className="grid grid-cols-1 gap-3">
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-1 flex items-center gap-2">
              <Server size={12}/> Provider State
            </h4>
            <div className="bg-black/50 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                    <span className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">Data Mode</span>
                    <span className={`text-[10px] font-black px-3 py-1 rounded-lg ${isSupaOk ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20' : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'}`}>
                        {isSupaOk ? 'SUPABASE_SAAS' : 'DEMO_LOCAL'}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">Active Client</span>
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest bg-zinc-800 px-3 py-1 rounded-lg">
                        {dbProvider.name}
                    </span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-[11px] text-zinc-400 font-medium uppercase tracking-wider">User Identity</span>
                    <div className="flex items-center gap-2 bg-zinc-800/50 px-3 py-1 rounded-lg">
                        <UserIcon size={10} className="text-mvp-gold" />
                        <span className="text-[10px] font-bold text-zinc-200 truncate max-w-[150px]">{user?.email || 'NOT_LOGGED_IN'}</span>
                    </div>
                </div>
            </div>
          </section>

          {/* Configuración Section */}
          <section className="space-y-4">
             <h4 className="text-[10px] font-bold text-mvp-gold uppercase tracking-widest flex items-center gap-2">
              <Key size={12}/> SaaS Credentials
            </h4>
            <div className="bg-black/30 border border-zinc-800/50 p-6 rounded-[2rem] space-y-5">
               <div>
                  <label className="text-[9px] text-zinc-500 font-bold mb-2 block uppercase tracking-widest">Supabase URL Endpoint</label>
                  <div className="relative">
                    <LinkIcon size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"/>
                    <input 
                        type="text" 
                        value={url} 
                        onChange={e => setUrl(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-[11px] text-white rounded-xl pl-11 pr-4 py-4 outline-none focus:border-mvp-gold transition-all"
                        placeholder="https://xyz.supabase.co"
                    />
                  </div>
               </div>
               <div>
                  <label className="text-[9px] text-zinc-500 font-bold mb-2 block uppercase tracking-widest">Public Anon Key</label>
                  <div className="relative">
                    <Shield size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600"/>
                    <input 
                        type="password" 
                        value={key} 
                        onChange={e => setKey(e.target.value)}
                        className="w-full bg-zinc-900 border border-zinc-800 text-[11px] text-white rounded-xl pl-11 pr-4 py-4 outline-none focus:border-mvp-gold transition-all"
                        placeholder="eyJhbGciOiJIUzI1..."
                    />
                  </div>
               </div>
               <div className="flex gap-3">
                    <button 
                        onClick={handleConnect}
                        disabled={loading || !url || !key}
                        className="flex-1 bg-white text-black text-xs font-black py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-200 transition-all disabled:opacity-30 uppercase tracking-tighter"
                    >
                        {loading ? <RefreshCw size={14} className="animate-spin"/> : <Zap size={14}/>} {isSupaOk ? 'Update Keys' : 'Link Infrastructure'}
                    </button>
                    {isSupaOk && (
                        <button 
                            onClick={handleReset}
                            className="p-4 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl hover:bg-red-500/20 transition-all"
                            title="Unlink and Factory Reset"
                        >
                            <Trash2 size={18}/>
                        </button>
                    )}
               </div>
            </div>
          </section>

          <div className="flex items-center gap-2 text-[10px] text-zinc-600 italic justify-center bg-zinc-800/20 py-3 rounded-xl border border-zinc-800/50">
            <Info size={10}/> Technical Admin Panel • Hot-Reload Active
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugPanel;
