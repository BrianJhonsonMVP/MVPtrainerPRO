
import React from 'react';
import { User, LimitCheckResult } from '../types';
import { Settings, Database, Shield, Zap, X, Info } from 'lucide-react';
import { isSupabaseConfigured } from '../services/supabaseClient';
import { LIMITS_CONFIG } from '../services/subscriptionLogic';

interface DebugPanelProps {
  user: User | null;
  clientsCount: number;
  onClose: () => void;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ user, clientsCount, onClose }) => {
  const isSupaOk = isSupabaseConfigured();
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center bg-zinc-800/50">
          <div className="flex items-center gap-2">
            <Settings size={18} className="text-mvp-gold" />
            <h3 className="font-bold text-white uppercase tracking-tighter">System Diagnostic</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-zinc-700 rounded-lg text-zinc-400">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar space-y-6">
          {/* Environment Section */}
          <section>
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Database size={12}/> Infraestructura
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between items-center bg-black/30 p-3 rounded-xl border border-zinc-800">
                <span className="text-xs text-zinc-400">Estado Supabase</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${isSupaOk ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
                  {isSupaOk ? 'CONNECTED' : 'MISSING_ENV_VARS'}
                </span>
              </div>
            </div>
          </section>

          {/* User & Subscription Section */}
          <section>
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Shield size={12}/> Perfil & Plan
            </h4>
            <div className="space-y-2">
              <div className="bg-black/30 p-3 rounded-xl border border-zinc-800 text-xs">
                <div className="flex justify-between mb-1">
                  <span className="text-zinc-400">User UID</span>
                  <span className="text-zinc-200 font-mono truncate max-w-[150px]">{user?.uid || 'Guest'}</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-zinc-400">Email</span>
                  <span className="text-zinc-200">{user?.email || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Plan actual</span>
                  <span className="text-mvp-gold font-bold uppercase">{user?.subscription.type || 'Free'}</span>
                </div>
              </div>
            </div>
          </section>

          {/* Limits & Usage Section */}
          <section>
            <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-3 flex items-center gap-2">
              <Zap size={12}/> Límites & Uso (Live)
            </h4>
            <div className="space-y-2">
              <div className="bg-black/30 p-3 rounded-xl border border-zinc-800 text-xs space-y-3">
                 <div>
                    <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-zinc-500">CLIENTES ACTIVOS</span>
                        <span className="text-white">{clientsCount} / {LIMITS_CONFIG.MAX_CLIENTS_FREE}</span>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-mvp-gold" style={{ width: `${(clientsCount / LIMITS_CONFIG.MAX_CLIENTS_FREE) * 100}%` }}></div>
                    </div>
                 </div>
                 
                 <div>
                    <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-zinc-500">RUTINAS IA (Semana)</span>
                        <span className="text-white">{user?.subscription.usage.routinesGenerated || 0} / {LIMITS_CONFIG.MAX_ROUTINES_PER_CLIENT_WEEKLY}</span>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500" style={{ width: `${((user?.subscription.usage.routinesGenerated || 0) / LIMITS_CONFIG.MAX_ROUTINES_PER_CLIENT_WEEKLY) * 100}%` }}></div>
                    </div>
                 </div>
              </div>
            </div>
          </section>

          <div className="flex items-center gap-2 text-[10px] text-zinc-600 italic justify-center">
            <Info size={10}/> Presiona Ctrl + Shift + D para cerrar
          </div>
        </div>
      </div>
    </div>
  );
};

export default DebugPanel;
