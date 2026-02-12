
import React, { useState, useEffect } from 'react';
import { 
  Users, Activity, Dumbbell, Crown, ChevronRight, X, 
  Sparkles, Loader2, AlertCircle, User as UserIcon, Trash2, Banknote, 
  AlertTriangle, LogOut, Plus, ChevronUp, ChevronDown, Check, MessageSquare, Lock, Calendar, Copy, Timer, MapPin, CreditCard, ExternalLink
} from 'lucide-react';
import { Client, Routine, User as AppUser, DietPlan, ClientPaymentInfo, PlanInterval } from './types';
import { generateWorkoutRoutine, generateDietPlan } from './services/geminiService';
import { dbService } from './services/db';
import { stripeService } from './services/stripeService';
import { applyBrandingToTheme } from './services/brandingService';
import BrandingSettings from './components/BrandingSettings';
import DailySchedule from './components/DailySchedule';
import { checkReminders, requestNotificationPermission } from './utils/reminderEngine';
import PaymentCalendar from './components/PaymentCalendar';
import TrainerLandingEditor from './components/TrainerLandingEditor';
import { COUNTRIES } from './data/countries';
import DebugPanel from './components/DebugPanel';

// --- HELPERS ---
const convertTo12Hour = (time24: string) => {
    if (!time24) return null;
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; 
    return (h < 10 ? '0' + h : h) + ':' + minutes + ' ' + ampm;
};

// --- COMPONENTS ---
const Toast = ({ title, message, type, onClose }: { title: string, message: string, type: 'success' | 'warning' | 'error', onClose: () => void }) => {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  const colors = type === 'error' ? 'bg-red-950 border-red-500 text-white' : type === 'warning' ? 'bg-amber-950 border-amber-500 text-white' : 'bg-zinc-800 border-mvp-gold text-white';
  const icon = type === 'error' ? <AlertCircle /> : type === 'warning' ? <AlertTriangle /> : <Check />;
  return (
    <div className={`fixed bottom-4 right-4 z-[60] max-w-sm w-full p-4 rounded-xl border flex items-center gap-3 shadow-2xl animate-slideUp ${colors}`}>
       {icon}
       <div className="flex-1">
         <h4 className="font-bold text-sm">{title}</h4>
         <p className="text-xs opacity-80">{message}</p>
       </div>
       <button onClick={onClose}><X size={14}/></button>
    </div>
  );
};

const AuthView = ({ onLoginSuccess }: { onLoginSuccess: (user: AppUser) => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (isRegistering) {
        await dbService.signUp(email, password);
      } else {
        await dbService.signIn(email, password);
      }
      const u = await dbService.getCurrentUser();
      if (u) onLoginSuccess(u);
      else throw new Error("No se pudo obtener el perfil del usuario.");
    } catch (err: any) {
      setError(err.message || 'Error de autenticación');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-8 border border-zinc-800 animate-fadeIn">
        <h1 className="text-3xl font-extrabold text-white mb-2 text-center">MVP<span className="text-mvp-gold">TRAINER</span></h1>
        <form onSubmit={handleAuth} className="space-y-4">
          {error && <div className="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded">{error}</div>}
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 outline-none focus:border-mvp-gold" placeholder="Email" required />
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 outline-none focus:border-mvp-gold" placeholder="Contraseña" required />
          <button type="submit" disabled={loading} className="w-full bg-mvp-gold text-black font-bold py-3 rounded-xl flex justify-center">
            {loading ? <Loader2 className="animate-spin"/> : (isRegistering ? 'Crear Cuenta' : 'Entrar')}
          </button>
        </form>
        <button onClick={() => setIsRegistering(!isRegistering)} className="w-full text-center mt-4 text-sm text-zinc-400 hover:text-white">
          {isRegistering ? '¿Ya tienes cuenta? Entra aquí' : '¿Nuevo? Crea una cuenta'}
        </button>
      </div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'client' | 'account'>('dashboard');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [toast, setToast] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [globalError, setGlobalError] = useState<{message: string, stack?: string} | null>(null);

  useEffect(() => {
    const init = async () => {
      try {
        const u = await dbService.getCurrentUser();
        if (u) {
          setUser(u);
          const c = await dbService.getClients(u.uid);
          setClients(c);
          if (u.branding) applyBrandingToTheme(u.branding);
        }
      } catch (e) { console.error("Error initializing app:", e); }
      finally { setLoading(false); }
    };
    init();

    // Keydown listener for Debug Panel (Ctrl+Shift+D)
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        setShowDebug(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeydown);

    // Global Error Listeners (Emergency Overlay)
    const handleGlobalError = (event: ErrorEvent) => {
        setGlobalError({ message: event.message, stack: event.error?.stack });
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
        setGlobalError({ message: "Promesa rechazada no capturada", stack: String(event.reason) });
    };
    window.addEventListener('error', handleGlobalError);
    window.addEventListener('unhandledrejection', handleRejection);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('error', handleGlobalError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  if (globalError) {
      return (
        <div className="fixed inset-0 z-[10000] bg-black flex flex-col items-center justify-center p-6 text-center">
            <div className="bg-red-500 p-4 rounded-full mb-6">
                <AlertCircle size={40} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2 uppercase">Runtime Exception</h2>
            <p className="text-zinc-500 text-sm max-w-sm mb-6">{globalError.message}</p>
            <div className="w-full max-w-lg bg-zinc-900 border border-zinc-800 p-3 rounded-lg text-left mb-6 overflow-hidden">
                <pre className="text-[10px] text-zinc-600 font-mono overflow-auto max-h-40">{globalError.stack}</pre>
            </div>
            <button onClick={() => window.location.reload()} className="bg-white text-black px-6 py-2 rounded-xl font-bold">Reiniciar App</button>
        </div>
      );
  }

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-mvp-gold"><Loader2 className="animate-spin" /></div>;
  if (!user) return <AuthView onLoginSuccess={setUser} />;

  return (
    <div className="min-h-screen bg-black text-white font-sans flex flex-col">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      {showDebug && <DebugPanel user={user} clientsCount={clients.length} onClose={() => setShowDebug(false)} />}
      
      <header className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center backdrop-blur-md z-10">
         <div onClick={() => setView('dashboard')} className="flex items-center gap-3 cursor-pointer">
            <div className="w-8 h-8 bg-mvp-gold rounded-lg flex items-center justify-center text-black font-bold">M</div>
            <span className="font-bold">MVP TRAINER</span>
         </div>
         <div className="flex items-center gap-3">
             {user.subscription?.isActive && (
                 <div className="text-mvp-gold bg-mvp-gold/10 px-3 py-1 rounded-full text-xs font-bold border border-mvp-gold/20 flex items-center gap-1">
                    <Crown size={12}/> PRO
                 </div>
             )}
             <button onClick={() => setView('account')} className="w-9 h-9 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400">
                <UserIcon size={18} />
             </button>
         </div>
      </header>

      <main className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col max-w-5xl mx-auto w-full">
         {view === 'dashboard' && (
           <div className="space-y-6">
              <h1 className="text-2xl font-bold">Hola, {user.displayName}</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {clients.map(c => (
                    <div key={c.id} onClick={() => { setSelectedClient(c); setView('client'); }} className="bg-zinc-900 p-4 rounded-xl border border-zinc-800 flex justify-between items-center cursor-pointer hover:border-zinc-600">
                        <div>
                          <h4 className="font-bold">{c.name}</h4>
                          <p className="text-xs text-zinc-500">{c.mainGoal}</p>
                        </div>
                        <ChevronRight size={18} className="text-zinc-500"/>
                    </div>
                  ))}
              </div>
           </div>
         )}
         
         {view === 'account' && (
           <div className="p-6 bg-zinc-900 rounded-2xl space-y-6">
              <h2 className="text-xl font-bold">Cuenta</h2>
              <p className="text-zinc-400">{user.email}</p>
              <button onClick={() => dbService.signOut().then(() => window.location.reload())} className="text-red-500 flex items-center gap-2">
                <LogOut size={18}/> Cerrar Sesión
              </button>
           </div>
         )}
      </main>
    </div>
  );
};

export default App;
