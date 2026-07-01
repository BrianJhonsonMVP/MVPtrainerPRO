
import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Users, Activity, Dumbbell, Crown, ChevronRight, Menu, X, 
  Sparkles, Loader2, AlertCircle, DollarSign, 
  Edit2, Save, User as UserIcon, Clock, Trash2, Banknote, 
  AlertTriangle, ChevronDown, LogOut, Plus, ChevronUp, Flame, Zap, Utensils, Check, MessageSquare, Lock, Calendar, Copy, Timer, MapPin
} from 'lucide-react';
import { Client, Routine, User as AppUser, DietPlan, ClientPaymentInfo, PlanInterval, UserSubscription } from './types';
import { generateWorkoutRoutine, generateDietPlan } from './services/geminiService';
import { supabase, isSupabaseEnabled } from './services/supabaseClient';
import { dbProvider } from './data';
import { checkLimit, checkAndResetUsage, getPlanStatusLabel, LIMITS, clearStaleUserCache } from './services/subscriptionUtils';
import {
  canUseFeature,
  registerUsage,
  shouldShowUpgradeBanner,
  normalizeSubscription,
  resetWeeklyUsageIfNeeded
} from './services/subscriptionLogic';
import { applyBrandingToTheme } from './services/brandingService';
import BrandingSettings from './components/BrandingSettings';
import DailySchedule from './components/DailySchedule';
import { checkReminders, requestNotificationPermission } from './utils/reminderEngine';
import PaymentCalendar from './components/PaymentCalendar';
import TrainerLandingEditor from './components/TrainerLandingEditor';
import TrainerPublicPage from './components/TrainerPublicPage';
import { COUNTRIES } from './data/countries';

// --- HELPERS ---
const convertTo12Hour = (time24: string) => {
    if (!time24) return null;
    const [hours, minutes] = time24.split(':');
    let h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    h = h ? h : 12; // the hour '0' should be '12'
    const strTime = (h < 10 ? '0' + h : h) + ':' + minutes + ' ' + ampm;
    return strTime;
};

const convertTo24Hour = (time12: string | null) => {
    if (!time12) return '';
    try {
        const [time, modifier] = time12.split(' ');
        let [hours, minutes] = time.split(':');
        if (hours === '12') hours = '00';
        if (modifier === 'PM') hours = String(parseInt(hours, 10) + 12);
        return `${hours.padStart(2, '0')}:${minutes}`;
    } catch (e) {
        return '';
    }
};

const ExerciseItem = ({ ex }: { ex: any }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="bg-zinc-850 p-4 rounded-xl border border-zinc-800 hover:border-zinc-700 transition-all">
      <div className="flex justify-between items-start gap-3">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <h5 className="font-bold text-zinc-100 text-sm">{ex.name}</h5>
            {ex.muscleFocus && (
              <span className="text-[9px] bg-mvp-gold/10 text-mvp-gold px-1.5 py-0.5 rounded border border-mvp-gold/20 font-bold uppercase tracking-tight">
                {ex.muscleFocus}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
            {ex.rest && (
              <span className="flex items-center gap-1">
                <Timer size={12} className="text-zinc-500" /> Descanso: {ex.rest}
              </span>
            )}
            {ex.notes && (
              <span className="flex items-center gap-1 italic text-zinc-500">
                <MessageSquare size={12} className="text-zinc-600" /> {ex.notes}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div className="flex items-center gap-1.5 text-xs font-mono text-zinc-100 bg-black/40 px-2 py-1 rounded border border-zinc-800">
            <span className="font-extrabold text-white">{ex.sets}</span>
            <span className="text-zinc-600">x</span>
            <span className="text-mvp-gold font-bold">{ex.reps}</span>
          </div>
          {(ex.howTo || ex.commonMistake) && (
            <button 
              onClick={() => setIsOpen(!isOpen)} 
              className="text-[10px] text-mvp-gold hover:text-white flex items-center gap-1 font-bold mt-1 bg-mvp-gold/5 hover:bg-mvp-gold/20 px-2 py-0.5 rounded border border-mvp-gold/10 transition-all select-none whitespace-nowrap"
            >
              {isOpen ? "Ocultar guía" : "Cómo hacerlo"} {isOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="mt-3 pt-3 border-t border-zinc-800/80 text-xs text-zinc-300 space-y-2.5 animate-fadeIn">
          {ex.howTo && (
            <div>
              <p className="text-mvp-gold font-bold uppercase tracking-wider text-[9px] mb-1">Guía Paso a Paso:</p>
              <p className="leading-relaxed pl-2 border-l border-mvp-gold/30 text-zinc-400 text-xs">{ex.howTo}</p>
            </div>
          )}
          {ex.commonMistake && (
            <div>
              <p className="text-red-400 font-bold uppercase tracking-wider text-[9px] mb-1">Error Común a Evitar:</p>
              <p className="leading-relaxed pl-2 border-l border-red-500/30 text-zinc-400 text-xs">{ex.commonMistake}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const groupExercisesByDay = (exercises: any[], days?: any[]) => {
    const grouped: Record<string, any[]> = {};
    
    // Si viene en formato días estructurado (nuevo estándar AI)
    if (Array.isArray(days) && days.length > 0) {
        days.forEach(d => {
            const dayName = d.day || d.name || 'Otros';
            if (!grouped[dayName]) grouped[dayName] = [];
            if (Array.isArray(d.exercises)) {
                grouped[dayName].push(...d.exercises);
            } else if (Array.isArray(d.workouts)) {
                grouped[dayName].push(...d.workouts);
            }
        });
        return grouped;
    }

    // Formato antiguo: lista plana con propiedad .day
    (Array.isArray(exercises) ? exercises : []).forEach(ex => {
        const day = ex.day || 'Otros';
        if (!grouped[day]) grouped[day] = [];
        grouped[day].push(ex);
    });
    return grouped;
};

const handleShare = async (title: string, text: string) => {
    if (navigator.share) {
        try {
            await navigator.share({ title, text });
        } catch (e) {
            // Fallback to clipboard
            navigator.clipboard.writeText(text);
        }
    } else {
        navigator.clipboard.writeText(text);
    }
};

const handleWhatsAppShare = (text: string) => {
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
};

// --- COMPONENTS ---

const UsageProgress = ({ current, max, label, onUpgrade }: { current: number, max: number, label: string, onUpgrade: () => void }) => {
  const percentage = Math.min((current / max) * 100, 100);
  const isFull = current >= max;
  const isNear = current >= max - 1;

  return (
    <div className="w-full mb-3">
      <div className="flex justify-between items-end mb-1">
        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Uso {label}</span>
        <div className="flex items-center text-xs">
           {isFull && <Lock size={10} className="text-red-500 mr-1" />}
           <span className={isFull ? "text-red-500 font-bold" : isNear ? "text-amber-500" : "text-zinc-400"}>
             {current}/{max === Infinity ? '∞' : max}
           </span>
        </div>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden w-full">
        <div 
          className={`h-full transition-all duration-500 ${isFull ? 'bg-red-500' : isNear ? 'bg-amber-500' : 'bg-mvp-gold'}`} 
          style={{ width: `${percentage}%` }}
        />
      </div>
      {(isNear || isFull) && max !== Infinity && (
        <button 
          onClick={onUpgrade} 
          className={`text-[10px] mt-1 w-full text-left flex items-center hover:underline ${isFull ? 'text-red-400' : 'text-amber-400'}`}
        >
          {isFull ? 'Límite alcanzado. Desbloquear PRO' : 'Cerca del límite. Mejorar a PRO'}
        </button>
      )}
    </div>
  );
};

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

// --- REDESIGNED PAYWALL COMPONENT ---
const PaywallPro = ({ onClose, user, onShowToast }: { onClose: () => void, user: AppUser, onShowToast: (t: any) => void }) => {
    const [loading, setLoading] = useState(false);

    const handleUpgrade = async (interval: PlanInterval) => {
        setLoading(true);
        try {
            if (!isSupabaseEnabled()) {
                onShowToast({ title: "Error", message: "Debes conectar Supabase para realizar pagos reales.", type: 'error' });
                return;
            }

            const { data, error } = await supabase!.functions.invoke('create-checkout-session', {
                body: { 
                    interval,
                    successUrl: window.location.origin + '?session_id={CHECKOUT_SESSION_ID}',
                    cancelUrl: window.location.origin
                }
            });

            if (error) throw error;
            if (data?.url) {
                window.location.href = data.url;
            } else {
                throw new Error("No se recibió URL de checkout");
            }
        } catch (e) {
            console.error("Stripe Error:", e);
            onShowToast({ title: "Error de Pago", message: "Error al iniciar el pago. Verifica tu conexión a Supabase.", type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm animate-fadeIn overflow-y-auto">
        <div className="w-full max-w-4xl bg-zinc-950 rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl relative my-auto">
          <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white z-20 bg-black/50 p-2 rounded-full"><X size={20} /></button>
          
          <div className="relative h-64 bg-gradient-to-r from-mvp-gold/20 to-orange-500/20 flex items-center justify-center">
             <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?ixlib=rb-4.0.3&auto=format&fit=crop&w=1920&q=80')] bg-cover bg-center opacity-30"></div>
             <div className="relative z-10 text-center p-6">
                <div className="inline-flex items-center space-x-2 bg-black/50 text-mvp-gold border border-mvp-gold/50 rounded-full px-4 py-1.5 mb-4">
                    <Crown size={16} />
                    <span className="text-sm font-bold tracking-widest uppercase">MVP PRO</span>
                </div>
                <h2 className="text-4xl font-extrabold text-white mb-2">Desbloquea tu potencial ilimitado</h2>
                <p className="text-zinc-300 text-lg">Lleva tu gestión de entrenamiento al siguiente nivel.</p>
             </div>
          </div>

          <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  <div className="flex flex-col items-center text-center p-4">
                      <div className="bg-zinc-900 p-3 rounded-full mb-3"><Users size={24} className="text-mvp-gold"/></div>
                      <h4 className="font-bold text-white">Clientes Ilimitados</h4>
                      <p className="text-sm text-zinc-500">Gestiona toda tu cartera sin restricciones.</p>
                  </div>
                  <div className="flex flex-col items-center text-center p-4">
                      <div className="bg-zinc-900 p-3 rounded-full mb-3"><Sparkles size={24} className="text-purple-400"/></div>
                      <h4 className="font-bold text-white">IA Ilimitada</h4>
                      <p className="text-sm text-zinc-500">Rutinas y dietas infinitas.</p>
                  </div>
                  <div className="flex flex-col items-center text-center p-4">
                      <div className="bg-zinc-900 p-3 rounded-full mb-3"><Flame size={24} className="text-orange-500"/></div>
                      <h4 className="font-bold text-white">Branding PRO</h4>
                      <p className="text-sm text-zinc-500">Tu marca, tu landing page.</p>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button onClick={() => handleUpgrade('monthly')} className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-4 rounded-xl transition-all">
                      <div className="text-sm text-zinc-400 mb-1">Mensual</div>
                      <div className="text-2xl">$14.99</div>
                  </button>
                  <button onClick={() => handleUpgrade('semiannual')} className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-4 rounded-xl transition-all">
                      <div className="text-sm text-zinc-400 mb-1">6 Meses</div>
                      <div className="text-2xl">$79.99</div>
                  </button>
                  <button onClick={() => handleUpgrade('yearly')} className="bg-gradient-to-r from-mvp-gold to-orange-500 hover:to-orange-400 text-black font-bold py-4 rounded-xl transition-all shadow-lg shadow-mvp-gold/20">
                      <div className="text-sm opacity-80 mb-1">Anual (Ahorras 35%)</div>
                      <div className="text-2xl">$149.99</div>
                  </button>
              </div>
          </div>
        </div>
      </div>
    );
};

const ConfirmModal = ({ 
    isOpen, 
    title, 
    message, 
    onConfirm, 
    onCancel, 
    confirmText = "Eliminar", 
    cancelText = "Cancelar",
    type = 'danger'
}: { 
    isOpen: boolean, 
    title: string, 
    message: string, 
    onConfirm: () => void, 
    onCancel: () => void,
    confirmText?: string,
    cancelText?: string,
    type?: 'danger' | 'warning'
}) => {
    if (!isOpen) return null;
    
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-zinc-900 w-full max-w-sm rounded-3xl border border-zinc-800 p-6 shadow-2xl animate-scaleIn">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${type === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-amber-500/10 text-amber-500'}`}>
                    {type === 'danger' ? <Trash2 size={24} /> : <AlertTriangle size={24} />}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
                <p className="text-zinc-400 text-sm mb-6 leading-relaxed">{message}</p>
                <div className="flex gap-3">
                    <button 
                        onClick={onCancel} 
                        className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button 
                        onClick={() => {
                            onConfirm();
                            onCancel();
                        }} 
                        className={`flex-1 font-bold py-3 rounded-xl transition-colors ${type === 'danger' ? 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20' : 'bg-mvp-gold hover:bg-amber-600 text-black'}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AuthView = ({ onLoginSuccess }: { onLoginSuccess: (user: AppUser) => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmMsg, setConfirmMsg] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(''); setConfirmMsg('');
    console.log("Auth attempt:", { email, isRegistering });
    try {
      const res = isRegistering ? await dbProvider.signUp(email, password) : await dbProvider.signIn(email, password);
      if (res.message === 'CONFIRM_EMAIL') {
          setConfirmMsg(res.detail);
      } else if (res.user) {
          clearStaleUserCache(res.user.uid);
          onLoginSuccess(res.user);
      }
    } catch (err: any) {
      console.error("Auth error details:", err);
      setError(err.message || err.error_description || 'Error desconocido al autenticar');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-8 border border-zinc-800 animate-fadeIn">
        <h1 className="text-3xl font-extrabold text-white mb-2 text-center">MVP<span className="text-mvp-gold">TRAINER</span></h1>
        <p className="text-zinc-500 text-center mb-8">Gestión profesional para entrenadores</p>
        <form onSubmit={handleAuth} className="space-y-4">
          {error && <div className="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded">{error}</div>}
          {confirmMsg && <div className="text-amber-500 text-sm text-center bg-amber-500/10 p-3 rounded border border-amber-500/20">{confirmMsg}</div>}
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 outline-none focus:border-mvp-gold" placeholder="Email" required />
          <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 outline-none focus:border-mvp-gold" placeholder="Contraseña" required />
          <button type="submit" disabled={loading} className="w-full bg-mvp-gold text-black font-bold py-3 rounded-xl flex justify-center">
            {loading ? <Loader2 className="animate-spin"/> : (isRegistering ? 'Crear Cuenta (15 Días Trial)' : 'Entrar')}
          </button>
        </form>
        <button onClick={() => setIsRegistering(!isRegistering)} className="w-full text-center mt-4 text-sm text-zinc-400 hover:text-white">
          {isRegistering ? '¿Ya tienes cuenta? Entra aquí' : '¿Nuevo? Crea una cuenta gratis'}
        </button>
      </div>
    </div>
  );
};

// --- ACCOUNT VIEW ---

const AccountView = ({ user, clients, onShowPaywall, onBack, onUpdateUser, requestConfirm, onShowToast, onLogout }: { user: AppUser, clients: Client[], onShowPaywall: () => void, onBack: () => void, onUpdateUser: (u: AppUser) => void, requestConfirm: (config: any) => void, onShowToast: (t: any) => void, onLogout?: () => void }) => {
  const planStatus = user ? getPlanStatusLabel(user) : null;
  const isPro = user?.subscription?.type === 'pro';

  // Limits
  const clientLimit = isPro ? Infinity : LIMITS.FREE_CLIENTS;
  const routineLimit = isPro ? Infinity : LIMITS.FREE_ROUTINES_WEEKLY;
  const dietLimit = isPro ? Infinity : LIMITS.FREE_DIETS_WEEKLY;

  const safeLogout = async () => {
    if (onLogout) {
      onLogout();
    } else {
      localStorage.removeItem('mvptrainer_cached_user');
      await dbProvider.signOut();
      window.location.reload();
    }
  };

  return (
    <div className="animate-fadeIn max-w-2xl mx-auto w-full pb-20">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack} className="p-2 bg-zinc-900 rounded-full text-zinc-400 hover:text-white"><ChevronRight className="rotate-180"/></button>
        <h2 className="text-2xl font-bold text-white">Mi Cuenta</h2>
      </div>

      <div className="space-y-6">
        {/* Profile Card */}
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 flex items-center gap-4">
          <div className="w-16 h-16 bg-gradient-to-br from-zinc-800 to-black rounded-full flex items-center justify-center border border-zinc-700">
             <UserIcon size={32} className="text-zinc-500" />
          </div>
          <div>
            <h3 className="font-bold text-white text-lg">{user.displayName}</h3>
            <p className="text-zinc-500 text-sm">{user.email}</p>
          </div>
        </div>

        {/* Migration Card */}
        {dbProvider.name === 'Supabase Cloud' && (
            <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800">
                <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                    <Sparkles size={18} className="text-mvp-gold"/> Migración de Datos
                </h4>
                <p className="text-sm text-zinc-500 mb-4">
                    Importa tus clientes locales de la versión demo a tu cuenta en la nube.
                </p>
                <button 
                    onClick={async () => {
                        requestConfirm({
                            title: "¿Importar datos locales?",
                            message: "Esto importará tus clientes locales de la versión demo a tu cuenta en la nube. ¿Deseas continuar?",
                            type: 'warning',
                            onConfirm: async () => {
                                const localClients = JSON.parse(localStorage.getItem('mvp_v2_clients_collection') || '[]');
                                if (localClients.length === 0) return onShowToast({ title: "Sin datos", message: "No hay datos locales.", type: 'warning' });
                                let count = 0;
                                for (const c of localClients) {
                                    const existing = clients.find(ec => ec.email === c.email);
                                    if (!existing) {
                                        await dbProvider.createClient(user.uid, c);
                                        count++;
                                    }
                                }
                                onShowToast({ title: "Migración exitosa", message: `${count} clientes importados.`, type: 'success' });
                            }
                        });
                    }}
                    className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-bold py-2 px-4 rounded-lg border border-zinc-700 flex items-center gap-2 transition-colors"
                >
                    <Copy size={16}/> Importar Datos Demo
                </button>
            </div>
        )}

        {/* Plan Status */}
        <div className="bg-zinc-900 p-6 rounded-2xl border border-zinc-800 relative overflow-hidden">
           {isPro && (
             <div className="absolute top-0 right-0 p-4 opacity-10">
               <Crown size={120} className="text-mvp-gold" />
             </div>
           )}
           
           <div className="relative z-10">
             <div className="flex justify-between items-start mb-4">
               <div>
                 <span className="text-zinc-500 text-xs font-bold uppercase tracking-wider">Plan Actual</span>
                 <div className="flex items-center gap-2 mt-1">
                   <h2 className={`text-2xl font-black ${planStatus.color}`}>{planStatus.label}</h2>
                   {!isPro && <span className="text-xs bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded">Básico</span>}
                 </div>
                 <p className="text-sm text-zinc-400 mt-2">{planStatus.detail}</p>
               </div>
               {isPro ? (
                  <div className="bg-mvp-gold/20 text-mvp-gold p-3 rounded-xl"><Crown size={24}/></div>
               ) : (
                  <button onClick={onShowPaywall} className="bg-mvp-gold hover:bg-amber-600 text-black font-bold px-4 py-2 rounded-xl text-sm transition-colors">
                    Mejorar a PRO
                  </button>
               )}
             </div>

             <div className="h-px bg-zinc-800 my-4" />

             <h4 className="font-bold text-white text-sm mb-4">Uso y Límites</h4>
             <div className="space-y-4">
               {!isPro ? (
                 <>
                   <UsageProgress 
                      current={user?.trainerUsage?.clients_created_total || 0} 
                      max={2} 
                      label="Clientes Históricos" 
                      onUpgrade={onShowPaywall}
                   />
                   <UsageProgress 
                      current={user?.trainerUsage?.ai_routines_generated_total || 0} 
                      max={2} 
                      label="Rutinas IA Históricas" 
                      onUpgrade={onShowPaywall}
                   />
                   <UsageProgress 
                      current={user?.trainerUsage?.ai_diets_generated_total || 0} 
                      max={2} 
                      label="Dietas IA Históricas" 
                      onUpgrade={onShowPaywall}
                   />
                 </>
               ) : (
                 <>
                   <UsageProgress 
                      current={clients.length} 
                      max={clientLimit} 
                      label="Clientes Activos" 
                      onUpgrade={onShowPaywall}
                   />
                   <UsageProgress 
                      current={user?.subscription?.usage?.routinesGenerated || 0} 
                      max={routineLimit} 
                      label="Rutinas IA (Semanal)" 
                      onUpgrade={onShowPaywall}
                   />
                   <UsageProgress 
                      current={user?.subscription?.usage?.dietsGenerated || 0} 
                      max={dietLimit} 
                      label="Dietas IA (Semanal)" 
                      onUpgrade={onShowPaywall}
                   />
                 </>
               )}
             </div>
           </div>
        </div>
        
        {/* BRANDING SECTION */}
        <BrandingSettings 
            user={user} 
            onUpdateUser={onUpdateUser} 
            onShowPaywall={onShowPaywall} 
            requestConfirm={requestConfirm}
        />
        
        {/* TRAINER LANDING EDITOR LINK */}
         <div className="bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden">
             <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
                 <div className="flex items-center gap-3">
                     <div className="bg-blue-500/20 text-blue-400 p-2 rounded-lg"><Calendar size={20}/></div>
                     <div>
                         <h4 className="font-bold text-white">Mi Página Pública</h4>
                         <p className="text-xs text-zinc-500">Configura tu landing page para clientes.</p>
                     </div>
                 </div>
                 {isPro ? (
                     <div className="text-xs bg-green-500/10 text-green-500 px-2 py-1 rounded border border-green-500/20 font-bold">ACTIVO</div>
                 ) : (
                     <div className="text-xs bg-zinc-800 text-zinc-500 px-2 py-1 rounded border border-zinc-700"><Lock size={12} className="inline mr-1"/> PRO</div>
                 )}
             </div>
             <TrainerLandingEditor 
                user={user}
                onUpdateUser={onUpdateUser}
                onShowPaywall={onShowPaywall}
             />
         </div>

        <div className="text-center pt-4">
             <button onClick={safeLogout} className="text-red-500 hover:text-red-400 text-sm font-bold flex items-center justify-center gap-2 mx-auto py-2">
                <LogOut size={16}/> Cerrar Sesión
             </button>
        </div>
      </div>
    </div>
  );
};

// --- CLIENT DETAIL VIEW ---

type TabType = 'profile' | 'agenda' | 'routines' | 'nutrition' | 'payments';

const ClientDetail = ({ client, user, onBack, onUpdate, onDelete, onShowPaywall, onShowToast, onEdit, onUserUsageUpdate, requestConfirm, onRefreshCounts }: any) => {
    const [activeTab, setActiveTab] = useState<TabType>('profile');
    const [isGenerating, setIsGenerating] = useState(false);
    const [expandedRoutine, setExpandedRoutine] = useState<string | null>(null);
    const [expandedDietDay, setExpandedDietDay] = useState<string | null>(null);
    
    // Local state for routines and diets (fetched separately)
    const [clientRoutines, setClientRoutines] = useState<Routine[]>([]);
    const [clientDiet, setClientDiet] = useState<DietPlan | null>(null);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Agenda State
    const [isEditingAgenda, setIsEditingAgenda] = useState(false);
    const [agendaForm, setAgendaForm] = useState<{ days: string[], startTime: string, endTime: string }>({ 
        days: client.trainingDays || [], 
        startTime: '07:00', 
        endTime: '08:00' 
    });

    // Payment Form State
    const [paymentForm, setPaymentForm] = useState<ClientPaymentInfo>({
        monthlyFee: client.paymentInfo?.monthlyFee ?? 0,
        status: client.paymentInfo?.status || 'sin_registro',
        paymentMethod: client.paymentInfo?.paymentMethod || 'efectivo',
        lastPaidAt: client.paymentInfo?.lastPaidAt || '',
        nextPaymentAt: client.paymentInfo?.nextPaymentAt || ''
    });

    useEffect(() => {
        const fetchData = async () => {
            setIsLoadingData(true);
            try {
                const routines = await dbProvider.getRoutines(client.id);
                const diet = await dbProvider.getDiet(client.id);
                setClientRoutines(routines);
                setClientDiet(diet);
            } catch (e) {
                console.error("Error loading client details:", e);
            } finally {
                setIsLoadingData(false);
            }
        };
        fetchData();

        setPaymentForm({
            monthlyFee: client.paymentInfo.monthlyFee || 0,
            status: client.paymentInfo.status || 'sin_registro',
            paymentMethod: client.paymentInfo.paymentMethod || 'efectivo',
            lastPaidAt: client.paymentInfo.lastPaidAt || '',
            nextPaymentAt: client.paymentInfo.nextPaymentAt || ''
        });
        
        // Parse training time range: "07:00 AM - 08:30 AM"
        let startTime = '07:00';
        let endTime = '08:00';
        if (client.trainingTime && client.trainingTime.includes(' - ')) {
            const parts = client.trainingTime.split(' - ');
            startTime = convertTo24Hour(parts[0]);
            endTime = convertTo24Hour(parts[1]);
        } else if (client.trainingTime) {
            startTime = convertTo24Hour(client.trainingTime);
        }

        setAgendaForm({
            days: client.trainingDays || [],
            startTime,
            endTime
        });
        setIsEditingAgenda(false);
    }, [client]);
    
    const handleAction = async (feature: 'generateRoutine' | 'generateDiet', callback: () => Promise<void>) => {
        const check = canUseFeature(user, feature, { clientId: client.id });
        if (!check.allowed) {
            onShowPaywall();
            if (check.reason) {
                onShowToast({ title: "Límite Alcanzado", message: check.reason, type: 'warning' });
            }
            return;
        }
        await callback();
    };

    const handleAddRoutine = () => handleAction('generateRoutine', async () => {
        setIsGenerating(true);
        const routineData = await generateWorkoutRoutine(client);
        if (routineData) {
            const newRoutine: any = {
                name: routineData.name || "Rutina Semanal IA",
                description: routineData.description || "",
                exercises: routineData.exercises as any[] || [],
                tags: routineData.tags || [],
                source: routineData.source || "fallback"
            };
            
            try {
                await dbProvider.saveRoutine(user.uid, client.id, newRoutine);
                
                // Refetch immediately to get the UUID assigned by Supabase
                const routines = await dbProvider.getRoutines(client.id);
                setClientRoutines(routines);
                
                if (onRefreshCounts) {
                    onRefreshCounts();
                }
                
                const updatedUser = registerUsage(user, 'generateRoutine', { clientId: client.id });
                if (newRoutine.source === 'ai') {
                    updatedUser.trainerUsage = {
                        ...(updatedUser.trainerUsage || {}),
                        trainer_id: user.uid,
                        ai_routines_generated_total: ((updatedUser.trainerUsage?.ai_routines_generated_total) || 0) + 1
                    } as any;
                }
                onUserUsageUpdate(updatedUser);
                
                // Expand the most recent routine
                if (routines.length > 0) {
                    setExpandedRoutine(routines[0].id);
                }
                
                onShowToast({ title: "Éxito", message: "Rutina generada y guardada", type: 'success' });
            } catch (e) {
                console.error("Error saving routine:", e);
                onShowToast({ title: "Error", message: "No se pudo guardar la rutina.", type: 'error' });
            }
        } else {
             onShowToast({ title: "Error", message: "Error al generar la rutina. Intenta de nuevo.", type: 'error' });
        }
        setIsGenerating(false);
    });

    const handleAddDiet = () => handleAction('generateDiet', async () => {
        setIsGenerating(true);
        const plan = await generateDietPlan(client);
        if (plan) {
            try {
                await dbProvider.saveDiet(user.uid, client.id, plan);
                const savedDiet = await dbProvider.getDiet(client.id);
                setClientDiet(savedDiet || plan);
                
                if (onRefreshCounts) {
                    onRefreshCounts();
                }
                
                const updatedUser = registerUsage(user, 'generateDiet', { clientId: client.id });
                if (plan.source === 'ai') {
                    updatedUser.trainerUsage = {
                        ...(updatedUser.trainerUsage || {}),
                        trainer_id: user.uid,
                        ai_diets_generated_total: ((updatedUser.trainerUsage?.ai_diets_generated_total) || 0) + 1
                    } as any;
                }
                // No persistimos subscription en profiles porque la columna no existe
                onUserUsageUpdate(updatedUser);
                onShowToast({ title: "Éxito", message: "Dieta generada y guardada", type: 'success' });
            } catch (e) {
                console.error("Error saving diet:", e);
                onShowToast({ title: "Error", message: "No se pudo guardar la dieta.", type: 'error' });
            }
        } else {
            onShowToast({ title: "Error", message: "No se pudo generar la dieta. Intenta de nuevo.", type: 'error' });
        }
        setIsGenerating(false);
    });

    const handleWhatsAppShare = (type: 'routine' | 'diet', content: Routine | DietPlan) => {
        let text = "";
        if (type === 'routine') {
            const routine = content as Routine;
            const exercises = routine.exercises || (routine as any).workouts || [];
            const grouped = groupExercisesByDay(exercises, routine.days);
            text = `🏋️‍♂️ *RUTINA: ${routine.title || routine.name}*\n${routine.summary || routine.description}\n\n`;
            Object.keys(grouped).forEach(day => {
                text += `📅 *${day.toUpperCase()}*\n`;
                grouped[day].forEach(ex => {
                    text += `- ${ex.name}\n  ${ex.sets} series x ${ex.reps}`;
                    if (ex.rest) text += ` | 🕒 Descanso: ${ex.rest}`;
                    if (ex.notes) text += ` | 📝 ${ex.notes}`;
                    text += `\n`;
                });
                text += `\n`;
            });
            
            if (Array.isArray(routine.recommendations) && routine.recommendations.length > 0) {
                text += `💡 *RECOMENDACIONES*\n${routine.recommendations.map(r => `- ${r}`).join('\n')}\n\n`;
            }
            
            text += `¡A entrenar! 💪`;
        } else {
            const diet = content as DietPlan;
            text = `🥗 *PLAN NUTRICIONAL: ${diet.title}*\n`;
            text += `🎯 Objetivos diarios: ${diet.totalKcal} kcal | P:${diet.totalProtein}g | C:${diet.totalCarbs}g | G:${diet.totalFats}g\n`;
            if(diet.summary || diet.notes) text += `ℹ️ Nota: ${diet.summary || diet.notes}\n\n`;

            (Array.isArray(diet.days) ? diet.days : []).forEach(d => {
                text += `📅 *${d.day.toUpperCase()}*\n`;
                (Array.isArray(d.meals) ? d.meals : []).forEach(m => {
                    text += `- *${m.timeOfDay}:* ${m.name} (${m.description})\n`;
                });
                text += `\n`;
            });

            if (Array.isArray(diet.recommendations) && diet.recommendations.length > 0) {
                text += `💡 *RECOMENDACIONES*\n${diet.recommendations.map(r => `- ${r}`).join('\n')}\n\n`;
            }

            text += `¡Buen provecho! 🥑`;
        }

        const phone = client.phone ? client.phone.replace(/\D/g, '') : '';
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
        onShowToast({ title: "WhatsApp Abierto", message: "Envía el plan ahora 📲", type: 'success' });
    };

    const handleSavePayments = async () => {
        if (isNaN(paymentForm.monthlyFee)) {
            onShowToast({ title: "Error", message: "El monto debe ser numérico.", type: 'error' });
            return;
        }
        await onUpdate({ paymentInfo: paymentForm });
        onShowToast({ title: "Guardado", message: "Información de pago actualizada.", type: 'success' });
    };

    const handleGeneratePaymentMessage = () => {
        const methodLabel = paymentForm.paymentMethod.charAt(0).toUpperCase() + paymentForm.paymentMethod.slice(1);
        const dateLabel = paymentForm.nextPaymentAt ? new Date(paymentForm.nextPaymentAt).toLocaleDateString('es-ES') : 'Pendiente';
        const message = `Hola ${client.name} 👋\nTe recuerdo tu mensualidad de entrenamiento personal.\n\nMonto: $${paymentForm.monthlyFee}\nMétodo de pago: ${methodLabel}\nPróxima fecha de pago: ${dateLabel}\n\nGracias por confiar en tu entrenador 🙌`;
        
        const phone = client.phone ? client.phone.replace(/\D/g, '') : '';
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
        onShowToast({ title: "Enviando Recordatorio", message: "WhatsApp se abrirá en breve 📲", type: 'success' });
    };

    const handleSaveAgenda = async () => {
        if (agendaForm.days.length === 0) {
            onShowToast({ title: "Error", message: "Debes seleccionar al menos un día.", type: 'error' });
            return;
        }
        if (agendaForm.startTime >= agendaForm.endTime) {
            onShowToast({ title: "Error", message: "La hora de fin debe ser posterior a la de inicio.", type: 'error' });
            return;
        }
        await onUpdate({
            trainingDays: agendaForm.days,
            trainingTime: `${convertTo12Hour(agendaForm.startTime + ':00')} - ${convertTo12Hour(agendaForm.endTime + ':00')}`
        });
        setIsEditingAgenda(false);
        onShowToast({ title: "Éxito", message: "Agenda actualizada.", type: 'success' });
    };

    const toggleAgendaDay = (day: string) => {
        setAgendaForm(prev => ({
            ...prev,
            days: prev.days.includes(day) ? prev.days.filter(d => d !== day) : [...prev.days, day]
        }));
    };

    const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const routinesUsed = user?.subscription?.usage?.aiRoutinesByClient?.[client.id] || 0;
    const dietsUsed = user?.subscription?.usage?.aiDietsByClient?.[client.id] || 0;
    const isPro = user?.subscription?.type === 'pro';

    return (
        <div className="flex flex-col h-full animate-fadeIn">
            {/* Header Cliente */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className="p-2 bg-zinc-900 rounded-full text-zinc-400 hover:text-white"><ChevronRight className="rotate-180"/></button>
                    <img src={client.avatarUrl} className="w-14 h-14 rounded-full border border-mvp-gold object-cover" />
                    <div>
                        <h2 className="text-xl font-bold text-white">{client.name}</h2>
                        <span className="text-xs text-mvp-gold bg-mvp-gold/10 px-2 py-0.5 rounded border border-mvp-gold/20">{client.mainGoal}</span>
                    </div>
                </div>
                <button 
                  onClick={() => {
                    console.log("Trash icon clicked in ClientDetail");
                    onDelete();
                  }} 
                  className="relative z-50 text-red-500 p-2 hover:bg-red-500/10 rounded-full bg-zinc-900 shadow-sm border border-zinc-800"
                >
                  <Trash2 size={18}/>
                </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-zinc-800 mb-6 overflow-x-auto">
                {(['profile', 'agenda', 'routines', 'nutrition', 'payments'] as const).map(tab => (
                    <button 
                        key={tab} 
                        onClick={() => setActiveTab(tab)}
                        className={`px-4 py-3 text-sm font-bold capitalize border-b-2 transition-colors ${activeTab === tab ? 'border-mvp-gold text-white' : 'border-transparent text-zinc-500'}`}
                    >
                        {tab === 'profile' ? 'Perfil' : tab === 'agenda' ? 'Agenda' : tab === 'routines' ? 'Rutinas' : tab === 'nutrition' ? 'Dieta' : 'Pagos'}
                    </button>
                ))}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar pb-20">
                {activeTab === 'profile' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800"><span className="text-zinc-500 text-xs">Peso</span><p className="text-xl font-bold text-white">{client.weight || '-'} kg</p></div>
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800"><span className="text-zinc-500 text-xs">Altura</span><p className="text-xl font-bold text-white">{client.height || '-'} cm</p></div>
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800"><span className="text-zinc-500 text-xs">Edad</span><p className="text-xl font-bold text-white">{client.age || '-'} años</p></div>
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800"><span className="text-zinc-500 text-xs">Nivel</span><p className="text-xl font-bold text-white capitalize">{client.experienceLevel || '-'}</p></div>
                        </div>
                        <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                            <h3 className="text-sm font-bold text-zinc-400 mb-3 uppercase">Objetivos</h3>
                            <div className="flex flex-wrap gap-2">
                                {(Array.isArray(client.goals) ? client.goals : []).length > 0 ? client.goals.map((g: string, i: number) => (
                                    <span key={i} className="bg-zinc-800 text-zinc-200 px-3 py-1 rounded-full text-xs border border-zinc-700">{g}</span>
                                )) : <span className="text-zinc-500 text-sm">Sin objetivos definidos</span>}
                            </div>
                        </div>
                        <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                            <h3 className="text-sm font-bold text-zinc-400 mb-3 uppercase">Ubicación</h3>
                            <div className="flex items-center gap-2 text-white">
                                <MapPin size={16} className="text-mvp-gold" />
                                <span>{client.country || 'No especificado'}</span>
                            </div>
                        </div>
                        <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                            <h3 className="text-sm font-bold text-zinc-400 mb-3 uppercase">Contacto</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between"><span className="text-zinc-500">Email</span> <span className="text-white">{client.email || '-'}</span></div>
                                <div className="flex justify-between"><span className="text-zinc-500">Teléfono</span> <span className="text-white">{client.phone || '-'}</span></div>
                            </div>
                        </div>
                         <button onClick={onEdit} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-4"><Edit2 size={16}/> Editar Perfil</button>
                    </div>
                )}
                {activeTab === 'agenda' && (
                    <div className="space-y-6 animate-fadeIn">
                        {!isEditingAgenda ? (
                            <div className="bg-zinc-900 p-8 rounded-xl border border-zinc-800 text-center flex flex-col items-center justify-center">
                                <div className="bg-mvp-gold/10 p-4 rounded-full mb-4"><Clock className="text-mvp-gold" size={32}/></div>
                                <h3 className="text-3xl font-bold text-white mb-2">{client.trainingTime || client.trainingHour || "Hora no definida"}</h3>
                                <p className="text-zinc-400 text-sm mb-8 leading-relaxed max-w-xs">{client.trainingDays && client.trainingDays.length > 0 ? client.trainingDays.join(', ') : "Días de entrenamiento no asignados"}</p>
                                <button onClick={() => { setAgendaForm({ days: client.trainingDays || [], time24: convertTo24Hour(client.trainingTime || client.trainingHour || null) }); setIsEditingAgenda(true); }} className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold px-6 py-3 rounded-xl flex items-center gap-2 transition-colors border border-zinc-700"><Edit2 size={16}/> Editar Agenda</button>
                            </div>
                        ) : (
                            <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 animate-slideUp">
                                <div className="flex items-center gap-2 mb-4"><Calendar className="text-mvp-gold" size={20}/><h3 className="text-white font-bold">Editar Horario</h3></div>
                                <div className="mb-6">
                                    <label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">Horario de Entrenamiento</label>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-black border border-zinc-700 rounded-xl p-3">
                                            <span className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Inicio</span>
                                            <input 
                                                type="time" 
                                                value={agendaForm.startTime} 
                                                onChange={e => setAgendaForm({...agendaForm, startTime: e.target.value})}
                                                className="w-full bg-transparent text-white outline-none font-bold text-lg"
                                            />
                                        </div>
                                        <div className="bg-black border border-zinc-700 rounded-xl p-3">
                                            <span className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Fin</span>
                                            <input 
                                                type="time" 
                                                value={agendaForm.endTime} 
                                                onChange={e => setAgendaForm({...agendaForm, endTime: e.target.value})}
                                                className="w-full bg-transparent text-white outline-none font-bold text-lg"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="mb-8"><label className="text-xs text-zinc-500 font-bold uppercase mb-3 block">Días de Entrenamiento</label><div className="grid grid-cols-2 gap-2">{WEEKDAYS.map(day => { const isSelected = agendaForm.days.includes(day); return ( <button key={day} onClick={() => toggleAgendaDay(day)} className={`py-3 px-4 rounded-lg text-sm font-semibold flex justify-between items-center transition-all ${isSelected ? 'bg-mvp-gold text-black border border-mvp-gold' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'}`}>{day}{isSelected && <Check size={16} className="stroke-[3px]" />}</button>);})}</div></div>
                                <div className="flex gap-3"><button onClick={() => setIsEditingAgenda(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-colors">Cancelar</button><button onClick={handleSaveAgenda} className="flex-1 bg-mvp-gold hover:bg-amber-600 text-black font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"><Save size={18}/> Guardar</button></div>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'routines' && (
                    <div className="space-y-4">
                         <div className="flex justify-between items-center"><h3 className="font-bold text-white">Entrenamientos</h3>{!isPro && (<div className="text-xs text-amber-500 bg-amber-900/20 px-2 py-1 rounded">{routinesUsed}/1 esta semana</div>)}</div>
                        <button onClick={handleAddRoutine} disabled={isGenerating} className="w-full py-4 border border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:text-white hover:border-mvp-gold flex justify-center items-center gap-2 transition-colors">{isGenerating ? <Loader2 className="animate-spin"/> : <><Sparkles size={16}/> Generar Plan de Entrenamiento</>}</button>
                        {isLoadingData ? (<div className="text-center py-8"><Loader2 className="animate-spin mx-auto text-zinc-500"/></div>) : (
                          <>
                            {(Array.isArray(clientRoutines) ? clientRoutines : []).length === 0 && !isGenerating && (<div className="text-center py-8"><p className="text-zinc-500 text-sm">No hay rutinas guardadas.</p></div>)}
                            {(Array.isArray(clientRoutines) ? clientRoutines : []).slice().reverse().map((r: Routine, rIdx: number) => {
                                const isExpanded = expandedRoutine === r.id;
                            const groupedExercises = isExpanded ? groupExercisesByDay(r.exercises || (r as any).workouts, r.days) : {};
                            return (
                                <div key={r.id || `routine-${rIdx}`} className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden transition-all duration-300">
                                    <div onClick={() => setExpandedRoutine(isExpanded ? null : r.id)} className="p-4 cursor-pointer hover:bg-zinc-800/50 flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-white text-lg">{r.title || r.name}</h4>
                                                {(r as any).source === 'ai' && <span className="text-[9px] bg-mvp-gold/20 text-mvp-gold px-1.5 py-0.5 rounded border border-mvp-gold/30 uppercase font-bold tracking-tighter">🟢 IA PRO</span>}
                                                {(r as any).source === 'fallback' && <span className="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700 uppercase">Pro Base</span>}
                                            </div>
                                            <p className="text-xs text-zinc-500 mt-1 line-clamp-1">{r.summary || r.description}</p>
                                            <div className="flex flex-wrap gap-2 mt-2">{(Array.isArray(r.tags) ? r.tags : []).map((tag, i) => (<span key={`${r.id}-tag-${i}`} className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 border border-zinc-700 uppercase tracking-wider">{tag}</span>))}</div>
                                        </div>
                                        <div className="text-zinc-500 ml-4 mt-1">{isExpanded ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}</div>
                                    </div>
                                    {isExpanded && (
                                        <div className="border-t border-zinc-800 bg-black/20 p-4 animate-slideUp">
                                            {(r.exercises?.length === 0 && !(r as any).workouts?.length) ? (<p className="text-zinc-500 text-sm italic py-2">Esta rutina aún no tiene ejercicios generados. Intenta regenerarla.</p>) : (
                                                <div className="space-y-6">
                                                    {Object.keys(groupedExercises).map((dayName, dayIdx) => (
                                                        <div key={`${r.id}-${dayName}-${dayIdx}`} className="space-y-2">
                                                            <div className="flex items-center gap-2 text-mvp-gold font-bold uppercase text-xs tracking-wider border-b border-zinc-800 pb-1 mb-2"><Calendar size={12}/> {dayName}</div>
                                                            {(Array.isArray(groupedExercises[dayName]) ? groupedExercises[dayName] : []).map((ex, exIdx) => (
                                                                <div key={`${r.id}-${dayName}-${exIdx}`}>
                                                                    <ExerciseItem ex={ex} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ))}

                                                    {/* Warnings and Recommendations */}
                                                    {(Array.isArray(r.warnings) && r.warnings.length > 0) && (
                                                        <div className="mt-4 p-3 bg-red-950/20 border border-red-500/20 rounded-lg">
                                                            <h5 className="text-[10px] font-bold text-red-400 uppercase mb-2 flex items-center gap-1"><AlertTriangle size={10}/> Advertencias</h5>
                                                            <ul className="text-xs text-zinc-400 space-y-1">
                                                                {r.warnings.map((w, i) => <li key={`w-${i}`}>• {w}</li>)}
                                                            </ul>
                                                        </div>
                                                    )}
                                                    {(Array.isArray(r.recommendations) && r.recommendations.length > 0) && (
                                                        <div className="mt-4 p-3 bg-mvp-gold/5 border border-mvp-gold/10 rounded-lg">
                                                            <h5 className="text-[10px] font-bold text-mvp-gold uppercase mb-2 flex items-center gap-1"><Sparkles size={10}/> Recomendaciones</h5>
                                                            <ul className="text-xs text-zinc-400 space-y-1">
                                                                {r.recommendations.map((rec, i) => <li key={`rec-${i}`}>• {rec}</li>)}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    <div className="grid grid-cols-2 gap-3 mt-4">
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleWhatsAppShare('routine', r); }} 
                                                            className="bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20"
                                                        >
                                                            <MessageSquare size={16} /> WhatsApp
                                                        </button>
                                                        <button 
                                                            onClick={async (e) => { 
                                                                e.stopPropagation(); 
                                                                requestConfirm({
                                                                    title: "¿Eliminar rutina?",
                                                                    message: "¿Seguro que deseas eliminar esta rutina?",
                                                                    type: 'danger',
                                                                    onConfirm: async () => {
                                                                        try {
                                                                            console.log("Archiving routine:", r.id);
                                                                            onShowToast({ title: "Eliminando...", message: "Archivando rutina", type: 'info' });
                                                                            await dbProvider.archiveRoutine(r.id);
                                                                            onRefreshCounts && onRefreshCounts();
                                                                            setClientRoutines(prev => prev.filter(item => item.id !== r.id));
                                                                            onShowToast({ title: "Rutina Eliminada", message: "Se ha archivado correctamente", type: 'success' });
                                                                        } catch (err) {
                                                                            console.error("Routine delete error:", err);
                                                                            onShowToast({ title: "Error", message: "No se pudo eliminar", type: 'error' });
                                                                        }
                                                                    }
                                                                });
                                                            }} 
                                                            className="bg-zinc-800 hover:bg-red-950 text-zinc-400 hover:text-red-400 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all border border-zinc-700"
                                                        >
                                                            <Trash2 size={16} /> Eliminar
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                );
                            })}
                          </>
                        )}
                    </div>
                )}
                {activeTab === 'nutrition' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-white">Plan Nutricional</h3>
                            {!isPro && (<div className="text-xs text-amber-500 bg-amber-900/20 px-2 py-1 rounded">{dietsUsed}/1 esta semana</div>)}
                        </div>

                        {isLoadingData ? (<div className="text-center py-10"><Loader2 className="animate-spin mx-auto text-zinc-500"/></div>) : (
                          <>
                            {!clientDiet ? (
                                <div className="text-center py-10 bg-zinc-900/50 rounded-xl border border-dashed border-zinc-800">
                                    <Utensils size={40} className="mx-auto text-zinc-700 mb-4" />
                                    <p className="text-zinc-400 mb-6 max-w-xs mx-auto text-sm">Genera un plan de alimentación personalizado basado en los objetivos de tu cliente.</p>
                                    <button 
                                        onClick={handleAddDiet} 
                                        disabled={isGenerating} 
                                        className="bg-mvp-gold text-black px-6 py-3 rounded-xl text-sm font-bold hover:bg-amber-600 flex items-center gap-2 mx-auto disabled:opacity-50"
                                    >
                                        {isGenerating ? <Loader2 className="animate-spin"/> : <><Sparkles size={16}/> Generar Plan Nutricional</>}
                                    </button>
                                </div>
                            ) : (
                                <div className="animate-fadeIn space-y-4">
                                    {/* Header Card Diet */}
                                    <div className="bg-gradient-to-br from-zinc-900 to-black p-5 rounded-2xl border border-zinc-800 shadow-xl relative overflow-hidden">
                                         <div className="absolute top-0 right-0 w-32 h-32 bg-mvp-gold/5 blur-3xl rounded-full"></div>
                                         <div className="relative z-10">
                                            <div className="flex justify-between items-start mb-4">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-bold text-white text-lg">{clientDiet.title}</h4>
                                                        {(clientDiet as any).source === 'ai' && <span className="text-[9px] bg-mvp-gold/20 text-mvp-gold px-1.5 py-0.5 rounded border border-mvp-gold/30 uppercase font-bold tracking-tighter">🟢 IA PRO</span>}
                                                        {(clientDiet as any).source === 'fallback' && <span className="text-[9px] bg-zinc-800 text-zinc-500 px-1.5 py-0.5 rounded border border-zinc-700 uppercase">Pro Base</span>}
                                                    </div>
                                                    {(clientDiet.summary || clientDiet.notes) && <p className="text-xs text-zinc-500 mt-1 max-w-sm">{clientDiet.summary || clientDiet.notes}</p>}
                                                </div>
                                                <button onClick={async () => { 
                                                    requestConfirm({
                                                        title: "¿Eliminar dieta?",
                                                        message: "¿Eliminar este plan nutricional?",
                                                        type: 'danger',
                                                        onConfirm: async () => {
                                                            try {
                                                                console.log("Archiving diet:", clientDiet.id);
                                                                onShowToast({ title: "Eliminando...", message: "Archivando plan nutricional", type: 'info' });
                                                                if (!clientDiet?.id) {
                                                                     onShowToast({ title: "Error", message: "ID de dieta no válido o no guardado aún.", type: 'error' });
                                                                     return;
                                                                 }
                                                                 await dbProvider.archiveDiet(clientDiet.id); onRefreshCounts && onRefreshCounts();
                                                                 setClientDiet(null);
                                                                onShowToast({ title: "Plan Eliminado", message: "Dieta borrada correctamente", type: 'success' }); 
                                                            } catch (err) {
                                                                console.error("Diet delete error:", err);
                                                                onShowToast({ title: "Error", message: "No se pudo borrar el plan nutricional", type: 'error' }); 
                                                            }
                                                        }
                                                    });
                                                }} className="text-zinc-600 hover:text-red-500"><Trash2 size={16}/></button>
                                            </div>
                                                    <div className="grid grid-cols-4 gap-2 mb-4">
                                                <div className="bg-zinc-800/50 p-2 rounded-xl border border-zinc-700/50 text-center">
                                                    <Flame size={14} className="mx-auto text-orange-500 mb-1"/>
                                                    <span className="block text-lg font-bold text-white">{clientDiet.totalKcal || clientDiet.daily_calories}</span>
                                                    <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Kcal</span>
                                                </div>
                                                <div className="bg-zinc-800/50 p-2 rounded-xl border border-zinc-700/50 text-center">
                                                    <Utensils size={14} className="mx-auto text-red-400 mb-1"/>
                                                    <span className="block text-lg font-bold text-white">{clientDiet.totalProtein || 0}g</span>
                                                    <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Prot</span>
                                                </div>
                                                <div className="bg-zinc-800/50 p-2 rounded-xl border border-zinc-700/50 text-center">
                                                    <Zap size={14} className="mx-auto text-amber-300 mb-1"/>
                                                    <span className="block text-lg font-bold text-white">{clientDiet.totalCarbs || 0}g</span>
                                                    <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Carb</span>
                                                </div>
                                                <div className="bg-zinc-800/50 p-2 rounded-xl border border-zinc-700/50 text-center">
                                                    <div className="w-3.5 h-3.5 mx-auto bg-blue-400 rounded-full mb-1 opacity-80"></div>
                                                    <span className="block text-lg font-bold text-white">{clientDiet.totalFats || 0}g</span>
                                                    <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Grasa</span>
                                                </div>
                                            </div>

                                            {/* Warnings and Recommendations (Diet) */}
                                            {(Array.isArray(clientDiet.warnings) && clientDiet.warnings.length > 0) && (
                                                <div className="mb-4 p-3 bg-red-950/20 border border-red-500/20 rounded-lg">
                                                    <h5 className="text-[10px] font-bold text-red-400 uppercase mb-2 flex items-center gap-1"><AlertTriangle size={10}/> Advertencias</h5>
                                                    <ul className="text-xs text-zinc-400 space-y-1">
                                                        {clientDiet.warnings.map((w, i) => <li key={`dw-${i}`}>• {w}</li>)}
                                                    </ul>
                                                </div>
                                            )}
                                            {(Array.isArray(clientDiet.recommendations) && clientDiet.recommendations.length > 0) && (
                                                <div className="mb-4 p-3 bg-mvp-gold/5 border border-mvp-gold/10 rounded-lg">
                                                    <h5 className="text-[10px] font-bold text-mvp-gold uppercase mb-2 flex items-center gap-1"><Sparkles size={10}/> Recomendaciones</h5>
                                                    <ul className="text-xs text-zinc-400 space-y-1">
                                                        {clientDiet.recommendations.map((rec, i) => <li key={`drec-${i}`}>• {rec}</li>)}
                                                    </ul>
                                                </div>
                                            )}

                                            <div className="grid grid-cols-2 gap-3 mt-4">
                                                <button 
                                                    onClick={() => handleWhatsAppShare('diet', clientDiet!)} 
                                                    className="bg-green-600 hover:bg-green-500 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20"
                                                >
                                                    <MessageSquare size={16} /> WhatsApp
                                                </button>
                                                <button 
                                                    onClick={() => {
                                                        const diet = clientDiet!;
                                                        let message = `🥗 *PLAN NUTRICIONAL: ${diet.title}*\n`;
                                                        message += `🎯 Objetivos diarios: ${diet.totalKcal || (diet as any).daily_calories} kcal | P:${diet.totalProtein}g | C:${diet.totalCarbs}g | G:${diet.totalFats}g\n`;
                                                        if(diet.summary || diet.notes) message += `ℹ️ Nota: ${diet.summary || diet.notes}\n\n`;

                                                        (Array.isArray(diet.days) ? diet.days : []).forEach(d => {
                                                            message += `📅 *${d.day.toUpperCase()}*\n`;
                                                            (Array.isArray(d.meals) ? d.meals : []).forEach(m => {
                                                                message += `- *${m.timeOfDay}:* ${m.name} (${m.description})\n`;
                                                            });
                                                            message += `\n`;
                                                        });
                                                        message += `¡Buen provecho! 🥑`;
                                                        navigator.clipboard.writeText(message);
                                                        onShowToast({ title: "Dieta Semanal Copiada", message: "Lista para pegar 📲", type: 'success' });
                                                    }} 
                                                    className="bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all border border-zinc-700"
                                                >
                                                    <Copy size={16} /> Copiar
                                                </button>
                                            </div>
                                         </div>
                                    </div>

                                    {/* Weekly Days Accordion */}
                                    <div className="space-y-3">
                                        {(Array.isArray(clientDiet.days) ? clientDiet.days : []).length === 0 && (Array.isArray(clientDiet.meals) ? clientDiet.meals : []).length > 0 && (
                                            <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4 space-y-4">
                                                <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider mb-2">Plan General</h4>
                                                {(Array.isArray(clientDiet.meals) ? clientDiet.meals : []).map((meal: any, idx: number) => (
                                                    <div key={`flat-meal-${idx}`} className="flex gap-4 text-sm border-l-2 border-zinc-700 pl-4 py-1">
                                                        <span className="font-bold text-zinc-400 min-w-[70px] text-xs uppercase pt-0.5">{meal.timeOfDay || `Comida ${idx+1}`}</span>
                                                        <div>
                                                            <p className="font-bold text-zinc-200">{meal.name}</p>
                                                            <p className="text-zinc-400 text-xs mt-1">{meal.description}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {(Array.isArray(clientDiet.days) ? clientDiet.days : []).map((dayPlan: any, i: number) => { 
                                            const isExpanded = expandedDietDay === dayPlan.day; 
                                            return ( 
                                                <div key={dayPlan.day || `day-${i}`} className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
                                                    <button 
                                                        onClick={() => setExpandedDietDay(isExpanded ? null : dayPlan.day)} 
                                                        className="w-full p-4 flex justify-between items-center hover:bg-zinc-800/50 transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <Calendar size={16} className="text-mvp-gold" />
                                                            <span className="font-bold text-white capitalize">{dayPlan.day}</span>
                                                        </div>
                                                        {isExpanded ? <ChevronUp size={18} className="text-zinc-500"/> : <ChevronDown size={18} className="text-zinc-500"/>}
                                                    </button>
                                                    
                                                    {isExpanded && (
                                                        <div className="p-4 bg-black/20 border-t border-zinc-800 space-y-4 animate-slideUp">
                                                            {(Array.isArray(dayPlan.meals) ? dayPlan.meals : []).map((meal: any, idx: number) => (
                                                                <div key={`${dayPlan.day}-meal-${idx}`} className="flex gap-4 text-sm border-l-2 border-zinc-800 pl-4 py-1">
                                                                    <span className="font-bold text-mvp-gold min-w-[70px] text-xs uppercase tracking-wide pt-0.5">{meal.timeOfDay}</span>
                                                                    <div>
                                                                        <p className="font-bold text-zinc-200">{meal.name}</p>
                                                                        <p className="text-zinc-400 text-xs mt-1">{meal.description}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                          </>
                        )}
                    </div>
                )}
                {activeTab === 'payments' && (
                     <div className="space-y-6 animate-fadeIn pb-10">
                        {/* Summary Status Card */}
                        <div className={`p-6 rounded-2xl border flex items-center justify-between shadow-lg ${
                            paymentForm.status === 'al_dia' ? 'bg-green-600/10 border-green-500/50' : 
                            paymentForm.status === 'pendiente' ? 'bg-amber-600/10 border-amber-500/50' : 
                            'bg-red-600/10 border-red-500/50'
                        }`}>
                            <div>
                                <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500 mb-1 block">Estado actual</span>
                                <div className="flex items-center gap-2">
                                    <div className={`w-3 h-3 rounded-full animate-pulse ${
                                        paymentForm.status === 'al_dia' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 
                                        paymentForm.status === 'pendiente' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 
                                        'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                                    }`}></div>
                                    <h3 className="text-2xl font-black text-white capitalize">{paymentForm.status === 'sin_registro' ? 'Sin Registro' : paymentForm.status.replace('_', ' ')}</h3>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500 mb-1 block">Mensualidad</span>
                                <p className="text-3xl font-black text-white">${paymentForm.monthlyFee}</p>
                            </div>
                        </div>

                        {/* Dates Info */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                                <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500 block mb-2">Último Pago</span>
                                <div className="flex items-center gap-2 text-white font-bold">
                                    <Calendar size={14} className="text-zinc-500" />
                                    {paymentForm.lastPaidAt ? new Date(paymentForm.lastPaidAt).toLocaleDateString('es-ES') : 'N/A'}
                                </div>
                            </div>
                            <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                                <span className="text-[10px] uppercase font-black tracking-widest text-zinc-500 block mb-2">Próximo Cobro</span>
                                <div className="flex items-center gap-2 text-white font-bold">
                                    <Clock size={14} className="text-mvp-gold" />
                                    {paymentForm.nextPaymentAt ? new Date(paymentForm.nextPaymentAt).toLocaleDateString('es-ES') : 'N/A'}
                                </div>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={async () => {
                                    const now = new Date();
                                    const nextMonth = new Date(now);
                                    nextMonth.setMonth(now.getMonth() + 1);
                                    const updated = {
                                        ...paymentForm,
                                        status: 'al_dia' as const,
                                        lastPaidAt: now.toISOString(),
                                        nextPaymentAt: nextMonth.toISOString()
                                    };
                                    setPaymentForm(updated);
                                    await onUpdate({ paymentInfo: updated });
                                    onShowToast({ title: "Pago Registrado", message: "Cliente al día por 1 mes más.", type: 'success' });
                                }}
                                className="w-full bg-green-600 hover:bg-green-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-green-900/20"
                            >
                                <Check size={20} /> Marcar como Pagado Hoy
                            </button>
                            <button 
                                onClick={handleGeneratePaymentMessage}
                                className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-3 transition-all border border-zinc-700"
                            >
                                <MessageSquare size={20} /> Recordatorio de WhatsApp
                            </button>
                        </div>

                        {/* Edit Form (Hidden by default or accordion) */}
                        <div className="pt-6 border-t border-zinc-800">
                            <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Ajustes Manuales</h4>
                            <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 space-y-4">
                                <div>
                                    <label className="text-[10px] text-zinc-500 font-black uppercase mb-2 block tracking-widest">Monto de Mensualidad</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold">$</span>
                                        <input 
                                            type="number" 
                                            value={paymentForm.monthlyFee} 
                                            onChange={(e) => setPaymentForm({...paymentForm, monthlyFee: Number(e.target.value)})} 
                                            className="w-full bg-black border border-zinc-700 text-white rounded-xl pl-8 pr-4 py-3 focus:border-mvp-gold outline-none font-bold"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase mb-2 block">Estado</label>
                                        <select 
                                            value={paymentForm.status} 
                                            onChange={(e) => setPaymentForm({...paymentForm, status: e.target.value as any})} 
                                            className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none capitalize text-sm"
                                        >
                                            <option value="sin_registro">Sin Registro</option>
                                            <option value="al_dia">Al Día</option>
                                            <option value="pendiente">Pendiente</option>
                                            <option value="atrasado">Atrasado</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase mb-2 block">Método</label>
                                        <select 
                                            value={paymentForm.paymentMethod} 
                                            onChange={(e) => setPaymentForm({...paymentForm, paymentMethod: e.target.value as any})} 
                                            className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none capitalize text-sm"
                                        >
                                            <option value="efectivo">Efectivo</option>
                                            <option value="yape">Yape</option>
                                            <option value="plin">Plin</option>
                                            <option value="transferencia">Transferencia</option>
                                            <option value="tarjeta">Tarjeta</option>
                                            <option value="otro">Otro</option>
                                        </select>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase mb-2 block">Último Pago</label>
                                        <input 
                                            type="date" 
                                            value={paymentForm.lastPaidAt ? paymentForm.lastPaidAt.split('T')[0] : ''} 
                                            onChange={(e) => setPaymentForm({...paymentForm, lastPaidAt: e.target.value ? new Date(e.target.value).toISOString() : ''})} 
                                            className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none text-xs"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-zinc-500 font-bold uppercase mb-2 block">Próximo Pago</label>
                                        <input 
                                            type="date" 
                                            value={paymentForm.nextPaymentAt ? paymentForm.nextPaymentAt.split('T')[0] : ''} 
                                            onChange={(e) => setPaymentForm({...paymentForm, nextPaymentAt: e.target.value ? new Date(e.target.value).toISOString() : ''})} 
                                            className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none text-xs"
                                        />
                                    </div>
                                </div>
                                <button onClick={handleSavePayments} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 border border-zinc-700">
                                    <Save size={16} /> Aplicar Ajustes
                                </button>
                            </div>
                        </div>
                     </div>
                )}
            </div>
        </div>
    );
};

// --- CLIENT FORM MODAL (CREATE / EDIT) ---

const ClientFormModal = ({ onClose, onSubmit, initialData, onShowToast }: { onClose: () => void, onSubmit: (data: any) => void, initialData?: Client, onShowToast: (t: any) => void }) => {
    // --- STATE FOR FORM ---
    const [formData, setFormData] = useState({
        name: '', email: '', phone: '', fee: '',
        gender: 'male',
        age: '', weight: '', height: '',
        experienceLevel: 'beginner',
        country: 'Perú',
        goals: [] as string[],
        trainingDays: [] as string[],
        trainingStartTime: '07:00',
        trainingEndTime: '08:00'
    });

    const [errors, setErrors] = useState<Record<string, string>>({});

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name || '',
                email: initialData.email || '',
                phone: initialData.phone || '',
                fee: initialData.paymentInfo?.monthlyFee !== undefined ? String(initialData.paymentInfo.monthlyFee) : '0',
                gender: initialData.gender || 'male',
                age: initialData.age !== undefined && initialData.age !== null ? String(initialData.age) : '',
                weight: initialData.weight !== undefined && initialData.weight !== null ? String(initialData.weight) : '',
                height: initialData.height !== undefined && initialData.height !== null ? String(initialData.height) : '',
                experienceLevel: initialData.experienceLevel || 'beginner',
                country: initialData.country || 'Perú',
                goals: initialData.goals || [],
                trainingDays: initialData.trainingDays || [],
                trainingStartTime: '07:00',
                trainingEndTime: '08:00'
            });
        }
    }, [initialData]);

    const GOALS_LIST = [
        "Bajar grasa", "Ganar músculo", "Tonificar", 
        "Glúteos y piernas", "Abdomen marcado", 
        "Mejorar resistencia", "Aumentar fuerza", 
        "Entrenamiento en casa", "Salud general"
    ];

    const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

    // --- HELPERS ---
    const toggleGoal = (goal: string) => {
        setFormData(prev => ({
            ...prev,
            goals: prev.goals.includes(goal) 
                ? prev.goals.filter(g => g !== goal) 
                : [...prev.goals, goal]
        }));
        if (errors.goals) setErrors(prev => ({ ...prev, goals: "" }));
    };

    const toggleDay = (day: string) => {
        setFormData(prev => ({
            ...prev,
            trainingDays: prev.trainingDays.includes(day)
                ? prev.trainingDays.filter(d => d !== day)
                : [...prev.trainingDays, day]
        }));
        if (errors.trainingDays) setErrors(prev => ({ ...prev, trainingDays: "" }));
    };

    const generateTimeSlots = () => {
        const slots = [];
        for (let hour = 0; hour < 24; hour++) {
            for (let minute = 0; minute < 60; minute += 15) {
                const time24 = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                const time12 = convertTo12Hour(`${time24}:00`);
                slots.push({ value: time24, label: time12 });
            }
        }
        return slots;
    };
    const timeSlots = generateTimeSlots();

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        console.log("CLICK CREATE/SAVE CLIENT", formData);
        
        const newErrors: Record<string, string> = {};
        
        // 1. Name validation
        if (!formData.name || formData.name.trim().length < 2) {
            newErrors.name = "El nombre es obligatorio y debe tener al menos 2 caracteres reales.";
        }
        
        // 2. Email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!formData.email || !emailRegex.test(formData.email.trim())) {
            newErrors.email = "Ingresa un correo electrónico obligatorio y válido.";
        }
        
        // 3. Phone validation
        const cleanPhone = formData.phone.replace(/\D/g, "");
        if (!formData.phone || cleanPhone.length < 7) {
            newErrors.phone = "El teléfono es obligatorio y debe tener un mínimo de 7 dígitos.";
        }
        
        // 4. Age validation
        const ageNum = Number(formData.age);
        if (formData.age === "" || isNaN(ageNum) || ageNum < 12 || ageNum > 90) {
            newErrors.age = "La edad es obligatoria (debe tener entre 12 y 90 años).";
        }
        
        // 5. Weight validation
        const weightNum = Number(formData.weight);
        if (formData.weight === "" || isNaN(weightNum) || weightNum < 30 || weightNum > 250) {
            newErrors.weight = "El peso es obligatorio (debe estar entre 30 y 250 kg).";
        }
        
        // 6. Height validation
        const heightNum = Number(formData.height);
        if (formData.height === "" || isNaN(heightNum) || heightNum < 100 || heightNum > 230) {
            newErrors.height = "La altura es obligatoria (debe estar entre 100 y 230 cm).";
        }
        
        // 7. Country validation
        if (!formData.country) {
            newErrors.country = "El país es obligatorio.";
        }
        
        // 8. Experience validation
        if (!formData.experienceLevel) {
            newErrors.experienceLevel = "El nivel de experiencia es obligatorio.";
        }
        
        // 9. Goals validation
        if (formData.goals.length === 0) {
            newErrors.goals = "Debes seleccionar al menos 1 objetivo.";
        }
        
        // 10. Training Days validation
        if (formData.trainingDays.length === 0) {
            newErrors.trainingDays = "Debes seleccionar al menos 1 día de entrenamiento.";
        }
        
        // 11. Schedule times validation
        if (!formData.trainingStartTime || !formData.trainingEndTime) {
            newErrors.trainingTime = "Los horarios de inicio y fin son obligatorios.";
        } else if (formData.trainingStartTime >= formData.trainingEndTime) {
            newErrors.trainingTime = "La hora de fin debe ser posterior a la hora de inicio.";
        }
        
        // 12. Fee validation
        if (!initialData) {
            const feeNum = Number(formData.fee);
            if (formData.fee === "" || isNaN(feeNum) || feeNum < 0) {
                newErrors.fee = "La mensualidad es obligatoria y debe ser mayor o igual a 0.";
            }
        }
        
        if (Object.keys(newErrors).length > 0) {
            console.log("FORM VALIDATION FAILED:", newErrors);
            setErrors(newErrors);
            onShowToast({ title: "Datos Incompletos", message: "Corrige los errores resaltados en rojo para continuar.", type: 'warning' });
            
            // Focus and scroll first error
            setTimeout(() => {
                const firstErrorField = document.querySelector('.border-red-500, [id^="error-container-"]');
                if (firstErrorField) {
                    firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    const inputEl = firstErrorField.querySelector('input, select') || firstErrorField;
                    if (inputEl instanceof HTMLInputElement || inputEl instanceof HTMLSelectElement) {
                        inputEl.focus();
                    }
                }
            }, 100);
            return;
        }

        console.log("FORM VALIDATION PASSED");

        const payload = {
            name: formData.name.trim(),
            email: formData.email.trim(),
            phone: formData.phone.trim(),
            gender: formData.gender,
            age: formData.age ? Number(formData.age) : null,
            weight: formData.weight ? Number(formData.weight) : null,
            height: formData.height ? Number(formData.height) : null,
            experienceLevel: formData.experienceLevel,
            country: formData.country,
            goals: formData.goals,
            trainingDays: formData.trainingDays,
            trainingTime: `${convertTo12Hour(formData.trainingStartTime + ':00')} - ${convertTo12Hour(formData.trainingEndTime + ':00')}`,
            paymentInfo: { 
                monthlyFee: Number(formData.fee || 0), 
                status: initialData?.paymentInfo?.status || 'sin_registro' as const, 
                paymentMethod: initialData?.paymentInfo?.paymentMethod || 'efectivo' as const, 
                lastPaidAt: initialData?.paymentInfo?.lastPaidAt || null,
                nextPaymentAt: initialData?.paymentInfo?.nextPaymentAt || null 
            }
        };
        console.log("PAYLOAD READY", payload);

        onSubmit(payload);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
            <div className="bg-zinc-900 w-full max-w-lg sm:rounded-3xl rounded-t-3xl border border-zinc-800 max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-zinc-800 flex justify-between items-center">
                    <h3 className="text-xl font-bold text-white">{initialData ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
                    <button onClick={onClose} className="p-1 hover:bg-zinc-800 rounded-full"><X size={20}/></button>
                </div>
                
                <form onSubmit={handleSubmit} className="p-6 overflow-y-auto custom-scrollbar space-y-6">
                    {/* Section: Datos Básicos */}
                    <div className="space-y-4">
                         <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">Datos Personales</h4>
                         <div>
                             <input 
                                value={formData.name} 
                                onChange={e => {
                                    setFormData({...formData, name: e.target.value});
                                    if (errors.name) setErrors(prev => ({ ...prev, name: "" }));
                                }}
                                className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${
                                    errors.name ? 'border-red-500 focus:border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'
                                }`} 
                                placeholder="Nombre Completo *" 
                             />
                             {errors.name && <p className="text-red-500 text-xs mt-1 font-semibold">{errors.name}</p>}
                         </div>
                         <div className="grid grid-cols-2 gap-4">
                            <div>
                                <input 
                                    type="email" 
                                    value={formData.email} 
                                    onChange={e => {
                                        setFormData({...formData, email: e.target.value});
                                        if (errors.email) setErrors(prev => ({ ...prev, email: "" }));
                                    }}
                                    className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${
                                        errors.email ? 'border-red-500 focus:border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'
                                    }`} 
                                    placeholder="Email *" 
                                />
                                {errors.email && <p className="text-red-500 text-[11px] mt-1 font-semibold leading-tight">{errors.email}</p>}
                            </div>
                            <div>
                                <input 
                                    value={formData.phone} 
                                    onChange={e => {
                                        setFormData({...formData, phone: e.target.value});
                                        if (errors.phone) setErrors(prev => ({ ...prev, phone: "" }));
                                    }}
                                    className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${
                                        errors.phone ? 'border-red-500 focus:border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'
                                    }`} 
                                    placeholder="Teléfono (mín. 7 dígitos) *" 
                                />
                                {errors.phone && <p className="text-red-500 text-[11px] mt-1 font-semibold leading-tight">{errors.phone}</p>}
                            </div>
                         </div>
                         {/* Country Selector */}
                         <div>
                            <label className="text-[10px] text-zinc-500 font-bold mb-1 block">País (para dieta local) *</label>
                            <select 
                                value={formData.country} 
                                onChange={e => {
                                    setFormData({...formData, country: e.target.value});
                                    if (errors.country) setErrors(prev => ({ ...prev, country: "" }));
                                }}
                                className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${
                                    errors.country ? 'border-red-500 focus:border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'
                                }`}
                            >
                                <option value="">Seleccione un País</option>
                                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            {errors.country && <p className="text-red-500 text-xs mt-1 font-semibold">{errors.country}</p>}
                         </div>
                    </div>

                    {/* Section: Perfil Físico */}
                    <div className="space-y-4">
                         <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">Perfil Físico</h4>
                         <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">Sexo</label>
                                <select 
                                    value={formData.gender} onChange={e => setFormData({...formData, gender: e.target.value})}
                                    className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none"
                                >
                                    <option value="male">Hombre</option>
                                    <option value="female">Mujer</option>
                                    <option value="other">Otro</option>
                                </select>
                             </div>
                             <div>
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">Edad (12-90) *</label>
                                <input 
                                    type="number" inputMode="decimal" value={formData.age} onChange={e => { setFormData({...formData, age: e.target.value}); if (errors.age) setErrors(prev => ({ ...prev, age: "" })); }}
                                    className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${errors.age ? 'border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'}`} 
                                    placeholder="Años" 
                                />
                                {errors.age && <p className="text-red-500 text-[11px] mt-1 font-semibold leading-tight">{errors.age}</p>}
                             </div>
                             <div>
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">Peso (30-250 kg) *</label>
                                <input 
                                    type="number" inputMode="decimal" value={formData.weight} onChange={e => { setFormData({...formData, weight: e.target.value}); if (errors.weight) setErrors(prev => ({ ...prev, weight: "" })); }}
                                    className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${errors.weight ? 'border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'}`} 
                                    placeholder="kg" 
                                />
                                {errors.weight && <p className="text-red-500 text-[11px] mt-1 font-semibold leading-tight">{errors.weight}</p>}
                             </div>
                             <div>
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">Altura (100-230 cm) *</label>
                                <input 
                                    type="number" inputMode="decimal" value={formData.height} onChange={e => { setFormData({...formData, height: e.target.value}); if (errors.height) setErrors(prev => ({ ...prev, height: "" })); }}
                                    className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors ${errors.height ? 'border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'}`} 
                                    placeholder="cm" 
                                />
                                {errors.height && <p className="text-red-500 text-[11px] mt-1 font-semibold leading-tight">{errors.height}</p>}
                             </div>
                         </div>
                         <div>
                             <label className="text-[10px] text-zinc-500 font-bold mb-1 block">Nivel de Experiencia *</label>
                             <select 
                                value={formData.experienceLevel} onChange={e => { setFormData({...formData, experienceLevel: e.target.value}); if (errors.experienceLevel) setErrors(prev => ({ ...prev, experienceLevel: "" })); }}
                                className={`w-full bg-black border text-white rounded-xl px-4 py-3 outline-none transition-colors capitalize ${errors.experienceLevel ? 'border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'}`}
                             >
                                 <option value="beginner">Principiante</option>
                                 <option value="intermediate">Intermedio</option>
                                 <option value="advanced">Avanzado</option>
                             </select>
                         </div>
                    </div>

                    {/* Section: Objetivos */}
                    <div className="space-y-4" id="error-container-goals">
                         <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">Objetivos *</h4>
                         {errors.goals && <p className="text-red-500 text-xs font-semibold">{errors.goals}</p>}
                         <div className={`flex flex-wrap gap-2 p-2 rounded-xl transition-all ${errors.goals ? 'border border-red-500 bg-red-950/10' : ''}`}>
                            {GOALS_LIST.map(goal => {
                                const isSelected = formData.goals.includes(goal);
                                return (
                                    <button 
                                        type="button"
                                        key={goal}
                                        onClick={() => toggleGoal(goal)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                            isSelected 
                                            ? 'bg-mvp-gold border-mvp-gold text-black' 
                                            : 'bg-black border-zinc-700 text-zinc-400 hover:border-zinc-500'
                                        }`}
                                    >
                                        {goal}
                                    </button>
                                );
                            })}
                         </div>
                    </div>

                    {/* Section: Agenda */}
                    <div className="space-y-4" id="error-container-agenda">
                         <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">Agenda</h4>
                         <div>
                            <label className="text-[10px] text-zinc-500 font-bold mb-2 block">Días de Entrenamiento *</label>
                            {errors.trainingDays && <p className="text-red-500 text-xs font-semibold mb-2">{errors.trainingDays}</p>}
                            <div className={`flex justify-between gap-1 p-2 rounded-xl transition-all ${errors.trainingDays ? 'border border-red-500 bg-red-950/10' : ''}`}>
                                {WEEKDAYS.map(day => {
                                    const isSelected = formData.trainingDays.includes(day);
                                    return (
                                        <button 
                                            type="button"
                                            key={day}
                                            onClick={() => toggleDay(day)}
                                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold transition-all ${
                                                isSelected 
                                                ? 'bg-mvp-gold text-black scale-105' 
                                                : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                                            }`}
                                        >
                                            {day.charAt(0)}
                                        </button>
                                    );
                                })}
                            </div>
                         </div>
                         <div>
                            <label className="text-[10px] text-zinc-500 font-bold mb-1 block">Horario de Entrenamiento (Inicio / Fin) *</label>
                            {errors.trainingTime && <p className="text-red-500 text-xs font-semibold mb-2">{errors.trainingTime}</p>}
                            <div className={`grid grid-cols-2 gap-3 p-1.5 rounded-xl transition-all ${errors.trainingTime ? 'border border-red-500 bg-red-950/10' : ''}`}>
                                <div className="bg-black border border-zinc-700 rounded-xl p-3 focus-within:border-mvp-gold transition-colors">
                                    <span className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Inicio</span>
                                    <input 
                                        type="time" 
                                        value={formData.trainingStartTime}
                                        onChange={e => {
                                            setFormData({...formData, trainingStartTime: e.target.value});
                                            if (errors.trainingTime) setErrors(prev => ({ ...prev, trainingTime: "" }));
                                        }}
                                        className="w-full bg-transparent text-white outline-none font-bold text-lg"
                                    />
                                </div>
                                <div className="bg-black border border-zinc-700 rounded-xl p-3 focus-within:border-mvp-gold transition-colors">
                                    <span className="text-[10px] text-zinc-500 font-bold uppercase block mb-1">Fin</span>
                                    <input 
                                        type="time" 
                                        value={formData.trainingEndTime}
                                        onChange={e => {
                                            setFormData({...formData, trainingEndTime: e.target.value});
                                            if (errors.trainingTime) setErrors(prev => ({ ...prev, trainingTime: "" }));
                                        }}
                                        className="w-full bg-transparent text-white outline-none font-bold text-lg"
                                    />
                                </div>
                            </div>
                         </div>
                    </div>

                    {/* Section: Pago (Solo visible al crear, al editar se usa la tab de pagos) */}
                    {!initialData && (
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">Plan de Pago *</h4>
                            <div>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
                                    <input 
                                        type="number" 
                                        value={formData.fee} 
                                        onChange={e => {
                                            setFormData({...formData, fee: e.target.value});
                                            if (errors.fee) setErrors(prev => ({ ...prev, fee: "" }));
                                        }}
                                        className={`w-full bg-black border text-white rounded-xl pl-8 pr-4 py-3 outline-none transition-colors ${
                                            errors.fee ? 'border-red-500 focus:border-red-500 bg-red-950/20' : 'border-zinc-700 focus:border-mvp-gold'
                                        }`} 
                                        placeholder="Mensualidad *" 
                                    />
                                </div>
                                {errors.fee && <p className="text-red-500 text-xs mt-1 font-semibold">{errors.fee}</p>}
                            </div>
                        </div>
                    )}
                </form>

                <div className="p-6 border-t border-zinc-800 flex gap-3 bg-zinc-900 rounded-b-3xl">
                    <button type="button" onClick={onClose} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-colors">Cancelar</button>
                    <button type="button" onClick={handleSubmit} className="flex-1 bg-mvp-gold hover:bg-amber-600 text-black font-bold py-3 rounded-xl transition-colors">
                        {initialData ? 'Guardar Cambios' : 'Crear Cliente'}
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- MAIN APP COMPONENT ---

// --- CONSTANTS & HELPERS ---
const GLOBAL_AUTH_INIT = { done: false };

const App = () => {
  
  // Realtime subscription guards to prevent multiple concurrent channels
  const realtimeSubscribedRef = useRef<string | null>(null);
  const realtimeUnsubscribeRef = useRef<(() => void) | null>(null);
  
  // 1. Auth Cache Persistence - Load from storage early
  const [user, _setUserRaw] = useState<AppUser | null>(() => {
    try {
      const cached = localStorage.getItem('mvptrainer_cached_user');
      if (cached) {
        if ((import.meta as any).env?.DEV) {
          console.log("AUTH CACHE RESTORED");
        }
        return JSON.parse(cached);
      }
    } catch (e) {
      if ((import.meta as any).env?.DEV) {
        console.warn("Failed to load cached user", e);
      }
    }
    return null;
  });

  const setUser = (newValue: any) => {
    _setUserRaw(prev => {
      const resolvedNewUser = typeof newValue === 'function' ? newValue(prev) : newValue;
      if (!prev && !resolvedNewUser) {
        return null;
      }
      if (prev && resolvedNewUser) {
        const isIdentical = prev.uid === resolvedNewUser.uid &&
                            prev.subscription?.type === resolvedNewUser.subscription?.type &&
                            JSON.stringify(prev.trainerUsage) === JSON.stringify(resolvedNewUser.trainerUsage);
        if (isIdentical) {
          if ((import.meta as any).env?.DEV) {
              console.log("SKIP USER UPDATE: identical user state");
          }
          return prev;
        }
      }
      return resolvedNewUser;
    });
  };

  const [clients, _setClientsRaw] = useState<Client[]>(() => {
    try {
      const cachedUserString = localStorage.getItem('mvptrainer_cached_user');
      if (cachedUserString) {
        const cachedUser = JSON.parse(cachedUserString);
        if (cachedUser?.uid) {
          const cachedClients = localStorage.getItem(`mvptrainer_cached_clients_${cachedUser.uid}`);
          if (cachedClients) {
            if ((import.meta as any).env?.DEV) {
              console.log("CLIENTS CACHE RESTORED");
            }
            return JSON.parse(cachedClients);
          }
        }
      }
    } catch (e) {
      if ((import.meta as any).env?.DEV) {
        console.warn("Failed to load cached clients", e);
      }
    }
    return [];
  });

  const setClients = (newValue: any) => {
    _setClientsRaw(prev => {
      const resolved = typeof newValue === 'function' ? newValue(prev) : newValue;
      if (JSON.stringify(prev) === JSON.stringify(resolved)) {
        return prev;
      }
      try {
        const activeUser = latestUserRef.current;
        if (activeUser?.uid && Array.isArray(resolved)) {
          localStorage.setItem(`mvptrainer_cached_clients_${activeUser.uid}`, JSON.stringify(resolved));
        }
      } catch (e) {
        if ((import.meta as any).env?.DEV) {
          console.warn("Failed to write clients cache", e);
        }
      }
      return resolved;
    });
  };

  const [dbRoutinesCount, setDbRoutinesCount] = useState<number>(0);
  const [dbDietsCount, setDbDietsCount] = useState<number>(0);

  const [loading, _setLoadingRaw] = useState(() => {
    try {
      const cached = localStorage.getItem('mvptrainer_cached_user');
      if (cached) return false; // Instantly load if user exists in cache
    } catch (e) {}
    return true;
  });
  const setLoading = (val: boolean) => {
    _setLoadingRaw(prev => prev === val ? prev : val);
  };

  const [isSyncingSession, _setIsSyncingSessionRaw] = useState(() => {
    try {
      const cached = localStorage.getItem('mvptrainer_cached_user');
      if (cached) return true; // Start with syncing active if we are displaying cache
    } catch (e) {}
    return false;
  });
  const setIsSyncingSession = (val: boolean) => {
    _setIsSyncingSessionRaw(prev => prev === val ? prev : val);
  };

  const [authChecked, _setAuthCheckedRaw] = useState(() => {
    try {
      const cached = localStorage.getItem('mvptrainer_cached_user');
      if (cached) return true; // Instantly mark checked if cache exists
    } catch (e) {}
    return false;
  });
  const setAuthChecked = (val: boolean) => {
    _setAuthCheckedRaw(prev => prev === val ? prev : val);
  };

  const hasInitializedAuth = useRef(false);
  const authTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const [isReconnecting, _setIsReconnectingRaw] = useState(false);
  const setIsReconnecting = (val: boolean) => {
    _setIsReconnectingRaw(prev => prev === val ? prev : val);
  };

  const [isRecoveringSession, setIsRecoveringSession] = useState(false);
  const lastValidUserRef = useRef<AppUser | null>(user);
  const stableTrainerIdRef = useRef<string | null>(user?.uid || null);

  const [clientsLoading, _setClientsLoadingRaw] = useState(() => {
    try {
      const cachedUser = localStorage.getItem('mvptrainer_cached_user');
      if (cachedUser) {
        const pars = JSON.parse(cachedUser);
        if (pars?.uid) {
          const cachedClients = localStorage.getItem(`mvptrainer_cached_clients_${pars.uid}`);
          if (cachedClients && JSON.parse(cachedClients).length > 0) {
            return false; // Already have cached clients, do not show skeleton initially
          }
        }
      }
    } catch (e) {}
    return true;
  });
  const setClientsLoading = (val: boolean) => {
    _setClientsLoadingRaw(prev => prev === val ? prev : val);
  };

  // Keep track of successful initial load of clients
  const clientsLoadedOnceRef = useRef(false);

  const latestUserRef = useRef<AppUser | null>(user);
  const latestClientsRef = useRef<Client[]>(clients);

  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  useEffect(() => {
    latestClientsRef.current = clients;
  }, [clients]);

  useEffect(() => {
    if (clients && clients.length >= 0 && authChecked && user) {
      clientsLoadedOnceRef.current = true;
    }
  }, [clients, authChecked, user]);

  // Network connection listener (online/offline)
  useEffect(() => {
    const handleOnline = () => {
      console.log("App online network restored");
      setIsReconnecting(false);
    };
    const handleOffline = () => {
      console.log("App offline network lost");
      if (clientsLoadedOnceRef.current) {
        setIsReconnecting(true);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    if (!navigator.onLine && clientsLoadedOnceRef.current) {
      setIsReconnecting(true);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const fetchCounts = async () => {
    const tId = stableTrainerIdRef.current;
    if (tId) {
      try {
        const [rCount, dCount] = await Promise.all([
          dbProvider.getTotalRoutinesCount(tId),
          dbProvider.getTotalDietsCount(tId)
        ]);
        setDbRoutinesCount(rCount);
        setDbDietsCount(dCount);
      } catch (e) {
        console.error("Error fetching total counts:", e);
      }
    }
  };

  useEffect(() => {
    if (user && clients) {
      fetchCounts();
    }
  }, [user?.uid, clients]);

  useEffect(() => {
    if (user) {
      lastValidUserRef.current = user;
      stableTrainerIdRef.current = user.uid;
    }
  }, [user]);

  const [authStatus, _setAuthStatusRaw] = useState<'loading' | 'authenticated' | 'unauthenticated' | 'degraded'>('loading');
  const setAuthStatus = (val: 'loading' | 'authenticated' | 'unauthenticated' | 'degraded') => {
    _setAuthStatusRaw(prev => prev === val ? prev : val);
  };
  const [view, setView] = useState<'dashboard' | 'client' | 'account' | 'day' | 'payments'>('dashboard');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [toast, setToast] = useState<any>(null);

  const handleLogout = async () => {
    if ((import.meta as any).env?.DEV) {
      console.log("REAL SIGN OUT initiated manually.");
    }
    if (user?.uid) {
      try {
        localStorage.removeItem(`mvptrainer_cached_clients_${user.uid}`);
      } catch (e) {}
    }
    clearStaleUserCache(user?.uid);
    lastValidUserRef.current = null;
    stableTrainerIdRef.current = null;
    if (realtimeUnsubscribeRef.current) {
      realtimeUnsubscribeRef.current();
      realtimeUnsubscribeRef.current = null;
      realtimeSubscribedRef.current = null;
    }
    setUser(null);
    setAuthStatus('unauthenticated');
    await dbProvider.signOut();
  };

  // Banner State
  const [lastBannerShownAt, setLastBannerShownAt] = useState<number | null>(null);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  
  // Public Route Handling Check
  const [isPublicRoute, setIsPublicRoute] = useState(false);
  const [publicTrainerId, setPublicTrainerId] = useState<string | null>(null);

  // Check URL on load for public profile or checkout redirections
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const trainerId = urlParams.get('trainerId');
    const sessionId = urlParams.get('session_id');
    
    if (sessionId) {
        console.log("Returned from payment success! Clearing stale user cache...");
        clearStaleUserCache();
        // Limpiar URL para no re-ejecutar en subsecuentes recargas
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    if (trainerId) {
        setIsPublicRoute(true);
        setPublicTrainerId(trainerId);
        setLoading(false); // Stop loading main app
    }
  }, []);

  // Auth & Data Subscription (Only if NOT public route)
  useEffect(() => {
    if (isPublicRoute) return;
    
    let mounted = true;

    const initAuth = async () => {
      if (GLOBAL_AUTH_INIT.done) {
          if ((import.meta as any).env?.DEV) {
              console.log("AUTH INIT: Already initialized (Singleton guard)");
          }
          return;
      }
      GLOBAL_AUTH_INIT.done = true;
      if ((import.meta as any).env?.DEV) {
          console.log("AUTH INIT START");
      }
      
      const timeoutId = setTimeout(() => {
        if (mounted) {
          if ((import.meta as any).env?.DEV) {
              console.warn("AUTH INIT TIMEOUT RECOVERED: using cache if available");
          }
          if (!navigator.onLine) {
            setIsReconnecting(true);
          }
          if (user) {
            setLoading(false);
            setAuthChecked(true);
          }
        }
      }, 3500);

      const safetyTimeout = new Promise(resolve => 
        setTimeout(() => resolve("timeout"), 12000)
      );

      try {
        if ((import.meta as any).env?.DEV) {
            console.log("App init: Starting race...");
        }
        const result = await Promise.race([
          dbProvider.getCurrentUser(),
          safetyTimeout
        ]);

        if (!mounted) {
            if ((import.meta as any).env?.DEV) {
                console.log("AUTH INIT: Component unmounted during init, ignoring result");
            }
            return;
        }

        if ((import.meta as any).env?.DEV) {
            console.log("AUTH INIT RESULT:", result === "timeout" ? "TIMEOUT" : (result ? "User found" : "No user"));
        }

        if (result === "timeout") {
          if ((import.meta as any).env?.DEV) {
              console.error("AUTH INIT TIMEOUT: App survived. Keeping cache.");
          }
          if (!navigator.onLine) {
            setIsReconnecting(true);
          }
          setIsRecoveringSession(true);
          if (!user) {
            setAuthStatus('degraded');
          } else {
             setAuthStatus('authenticated');
          }
          setAuthChecked(true);
          setLoading(false);
          return;
        }

        clearTimeout(timeoutId);
        setIsReconnecting(false);

        if (result) {
          if ((import.meta as any).env?.DEV) {
              console.log("AUTH INIT: User found, setting authenticated");
          }
          const now = new Date();
          let normalizedUser = normalizeSubscription(result as any, now);
          normalizedUser = resetWeeklyUsageIfNeeded(normalizedUser, now);
          
          setUser(normalizedUser);
          localStorage.setItem('mvptrainer_cached_user', JSON.stringify(normalizedUser));
          
          setAuthStatus('authenticated');
          applyBrandingToTheme(normalizedUser.branding);
          requestNotificationPermission();
        } else {
          // Si getSession/getCurrentUser falla pero ya hay un usuario en caché local, NO destruirlo
          const cached = localStorage.getItem('mvptrainer_cached_user');
          if (cached) {
            if ((import.meta as any).env?.DEV) {
              console.warn("TEMP SESSION LOSS IGNORED: No user returned during init, but active cached session found. Keeping state.");
            }
            if (!navigator.onLine) {
              setIsReconnecting(true);
            }
            setIsRecoveringSession(true);
            setAuthStatus('authenticated');
          } else {
            if ((import.meta as any).env?.DEV) {
                console.log("AUTH INIT (REAL NULL): No user found and no local cache, setting unauthenticated");
            }
            setUser(null);
            localStorage.removeItem('mvptrainer_cached_user');
            setAuthStatus('unauthenticated');
          }
        }
      } catch (error) {
        if ((import.meta as any).env?.DEV) {
            console.error("AUTH INIT ERROR:", error);
        }
      } finally {
        if (mounted) {
          setAuthChecked(true);
          setLoading(false);
          setIsSyncingSession(false);
        }
      }
    };

    initAuth();

    // Suscripción permanente a cambios de auth
    const unsubAuth = dbProvider.onAuthStateChanged((u, event) => {
      if (!mounted) return;
      if ((import.meta as any).env?.DEV) {
          console.log(`AUTH EVENT (Live): ${event}`, u ? "User found" : "No user");
      }
      
      if (u) {
          // Si Supabase auth lanza SIGNED_IN repetido: ignorar completamente el evento si uid coincide y ya hay clientes cargados/en proceso.
          if (event === 'SIGNED_IN' && latestUserRef.current && latestUserRef.current.uid === u.uid && latestClientsRef.current && latestClientsRef.current.length > 0) {
              if ((import.meta as any).env?.DEV) {
                  console.log("AUTH EVENT IGNORED: Already SIGNED_IN with identical user and data loaded.");
              }
              return;
          }

          // Si llega un usuario válido, cancelamos cualquier flag de reconexión/recuperación
          if (isRecoveringSession || isReconnecting) {
              if ((import.meta as any).env?.DEV) {
                  console.log("SESSION RECOVERED: Connection/session re-established successfully.");
              }
          }
          setIsReconnecting(false);
          setIsRecoveringSession(false);

          const now = new Date();
          let normalizedUser = normalizeSubscription(u, now);
          normalizedUser = resetWeeklyUsageIfNeeded(normalizedUser, now);
          
          setUser(normalizedUser);
          localStorage.setItem('mvptrainer_cached_user', JSON.stringify(normalizedUser));
          setAuthStatus('authenticated');
          setAuthChecked(true);
          setLoading(false);
      } else {
          // Si u es null, evaluamos según la regla estricta:
          // SOLO ejecutar logout cuando event === "SIGNED_OUT" o "USER_DELETED"
          if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
              if ((import.meta as any).env?.DEV) {
                  console.log("REAL SIGN OUT: Auth system confirms exit event.");
              }
              const currentUserId = latestUserRef.current?.uid;
              if (currentUserId) {
                try {
                  localStorage.removeItem(`mvptrainer_cached_clients_${currentUserId}`);
                } catch(e) {}
              }
              if (realtimeUnsubscribeRef.current) {
                realtimeUnsubscribeRef.current();
                realtimeUnsubscribeRef.current = null;
                realtimeSubscribedRef.current = null;
              }
              setUser(null);
              localStorage.removeItem('mvptrainer_cached_user');
              lastValidUserRef.current = null;
              stableTrainerIdRef.current = null;
              setAuthStatus('unauthenticated');
              setAuthChecked(true);
              setLoading(false);
              setIsReconnecting(false);
              setIsRecoveringSession(false);
          } else {
              // Cualquier otro tipo de evento (flickers, reconnect, timeout, token_refreshed, initial_session null, unknown)
              if ((import.meta as any).env?.DEV) {
                  console.warn(`TEMP SESSION LOSS IGNORED: Event ${event} reported session status change, but SIGNED_OUT was not received. Keeping local state active.`);
              }
              // Solo activar reconnect ante pérdida REAL de red (offline)
              if (!navigator.onLine) {
                  setIsReconnecting(true);
              }
              setIsRecoveringSession(true);
              setAuthChecked(true);
              setLoading(false);
          }
      }
    });

    return () => {
        mounted = false;
        unsubAuth();
    };
  }, [isPublicRoute]);

  useEffect(() => {
    const trainerId = user?.uid;
    if (!trainerId || isPublicRoute) {
      if (realtimeUnsubscribeRef.current) {
        if ((import.meta as any).env?.DEV) {
          console.log("REALTIME CLEANUP: no active trainer ID or public route");
        }
        realtimeUnsubscribeRef.current();
        realtimeUnsubscribeRef.current = null;
        realtimeSubscribedRef.current = null;
      }
      return;
    }

    if (realtimeSubscribedRef.current === trainerId) {
      if ((import.meta as any).env?.DEV) {
        console.log("REALTIME: already active for stable ID, skipping re-subscription:", trainerId);
      }
      return;
    }

    if (realtimeUnsubscribeRef.current) {
      if ((import.meta as any).env?.DEV) {
        console.log("REALTIME: trainer ID changed, cleaning up existing channel...");
      }
      realtimeUnsubscribeRef.current();
    }

    if ((import.meta as any).env?.DEV) {
      console.log("REALTIME KEPT ALIVE: Subscribing to clients for stable trainer ID:", trainerId);
    }
    
    setClientsLoading(true);

    const unsubClients = dbProvider.subscribeToClients(
      trainerId, 
      (data) => {
        setClients(data);
        setClientsLoading(false);
      },
      (status) => {
        if (status === 'SUBSCRIBED') {
          setIsReconnecting(false);
          setClientsLoading(false);
        } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
          if (clientsLoadedOnceRef.current) {
            setIsReconnecting(true);
          }
          setClientsLoading(false);
        }
      }
    );
    realtimeSubscribedRef.current = trainerId;
    realtimeUnsubscribeRef.current = unsubClients;

    return () => {
      // Intentionally bypassed to maintain live connection across React StrictMode & normal views re-rendering
      // Complete teardown of subscriptions ONLY happens on real LOGOUT (SIGNED_OUT/USER_DELETED) or real trainer ID changes.
    };
  }, [user?.uid, isPublicRoute]);

  // Auto-clear reconnecting banner if user is valid, clients are loaded, and app is operational
  useEffect(() => {
    if (user && clients && clients.length >= 0 && isReconnecting) {
      const timer = setTimeout(() => {
        console.log("Auto-clearing reconnecting banner because user is valid and clients loaded.");
        setIsReconnecting(false);
        setIsRecoveringSession(false);
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [user, clients, isReconnecting]);

  // Upgrade Banner Timer
  useEffect(() => {
    if (!user || isPublicRoute) return;
    const checkBanner = () => {
        const nowTs = Date.now();
        if (shouldShowUpgradeBanner(user, lastBannerShownAt, nowTs)) {
            setShowUpgradeBanner(true);
            setLastBannerShownAt(nowTs);
        }
    };
    checkBanner();
    const interval = setInterval(checkBanner, 60 * 1000);
    return () => clearInterval(interval);
  }, [user, lastBannerShownAt, isPublicRoute]);

  // REMINDER ENGINE
  useEffect(() => {
    if (!user || clients.length === 0 || isPublicRoute) return;
    
    // Correr inmediatamente
    checkReminders(user, clients, setToast);

    // Correr cada minuto
    const interval = setInterval(() => {
        checkReminders(user, clients, setToast);
    }, 60 * 1000);

    return () => clearInterval(interval);
  }, [user, clients, isPublicRoute]);

  // RENDER PUBLIC PAGE
  if (isPublicRoute && publicTrainerId) {
      return <TrainerPublicPage trainerId={publicTrainerId} />;
  }

  // Derived State
  const planStatus = user ? getPlanStatusLabel(user) : null;

  const handleSaveClient = async (formData: any) => {
      if (!user) {
          console.error("CREATE CLIENT ERROR: No user session");
          setToast({ title: 'Error', message: 'No hay sesión activa', type: 'error' });
          return;
      }

      if (editingClient) {
          // UPDATE MODE
          try {
              await dbProvider.updateClient(editingClient.id, formData);
              const updated = { ...editingClient, ...formData };
              
              // Actualizar estado local inmediatamente
              setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
              
              setSelectedClient(updated);
              setToast({ title: 'Éxito', message: 'Perfil actualizado', type: 'success' });
              setIsClientModalOpen(false);
              setEditingClient(null);
          } catch (e) {
              console.error("UPDATE CLIENT ERROR:", e);
              setToast({ title: 'Error', message: 'No se pudo actualizar', type: 'error' });
          }
      } else {
          // CREATE MODE with Limit Check
          const check = canUseFeature(user, 'createClient');
          if (!check.allowed) {
              console.log("CREATE CLIENT FAILED: Limit reached", check.reason);
              setShowPaywall(true);
              if (check.reason) setToast({ title: "Límite Alcanzado", message: check.reason, type: 'warning' });
              return;
          }

          try {
              console.log("CALLING createClient", formData);
              const newClient = await dbProvider.createClient(user.uid, formData);
              console.log("CREATE CLIENT SUCCESS", newClient);
              
              // Actualizar estado local inmediatamente (Opción B)
              setClients(prev => [newClient, ...prev]);
              console.log("CLIENTS AFTER INSERT:", [newClient, ...clients]);

              // Incrementar contador local de clientes creados para reaccionar inmediatamente en la UI
              const updatedUser = {
                  ...user,
                  trainerUsage: {
                      ...user.trainerUsage,
                      clients_created_total: (user.trainerUsage?.clients_created_total || 0) + 1
                  }
              } as any;
              setUser(updatedUser);
              localStorage.setItem('mvptrainer_cached_user', JSON.stringify(updatedUser));

              setIsClientModalOpen(false);
              setToast({ title: 'Éxito', message: 'Cliente creado correctamente', type: 'success' });
          } catch (e) {
              console.error("CREATE CLIENT ERROR:", e);
              setToast({ title: 'Error', message: 'No se pudo crear el cliente. Intenta de nuevo.', type: 'error' });
          }
      }
  };

  const handleDeleteClient = (clientId: string) => {
    setConfirmConfig({
        isOpen: true,
        title: "¿Eliminar cliente?",
        message: "¿Seguro que deseas eliminar este cliente? Se mantendrá en el historial pero no aparecerá en tu lista principal.",
        type: 'danger',
        onConfirm: () => executeDeleteClient(clientId)
    });
  };

  const executeDeleteClient = async (clientId: string) => {
    console.log("HANDLE DELETE CLIENT START:", clientId);
    setConfirmConfig(prev => ({ ...prev, isOpen: false }));

    try {
        setToast({ title: "Eliminando...", message: "Procesando baja del cliente", type: 'info' });
        await dbProvider.deleteClient(clientId);
        console.log("HANDLE DELETE CLIENT SUCCESS:", clientId);
        
        // Actualizar estado local inmediatamente
        setClients(prev => prev.filter(c => c.id !== clientId));
        setView('dashboard');
        setSelectedClient(null);
        
        setToast({ title: "Cliente Eliminado", message: "El cliente ha sido archivado correctamente", type: 'success' });
        
        // Re-fetch explícito de clientes para asegurar sincronización
        if (user) {
            const refreshed = await dbProvider.getClients(user.uid);
            setClients(refreshed);
            
            // Forzar actualización del perfil de entrenador para sincronizar límites e historial sin caché obsoleta
            try {
                const freshUser = await dbProvider.getCurrentUser(true);
                if (freshUser) {
                    const now = new Date();
                    let normalizedUser = normalizeSubscription(freshUser, now);
                    normalizedUser = resetWeeklyUsageIfNeeded(normalizedUser, now);
                    setUser(normalizedUser);
                    localStorage.setItem('mvptrainer_cached_user', JSON.stringify(normalizedUser));
                    console.log("USER PROFILE SYNC AFTER DELETE SUCCESSFUL");
                }
            } catch (err) {
                console.warn("Could not force refresh user profile after delete:", err);
            }
        }
    } catch (e) {
        console.error("HANDLE DELETE CLIENT ERROR:", e);
        setToast({ title: "Error", message: "No se pudo eliminar el cliente. Verifica tu conexión.", type: 'error' });
    }
  };

  const handleClientUpdate = async (data: Partial<Client>) => {
      if (selectedClient) {
          await dbProvider.updateClient(selectedClient.id, data);
          const updated = { ...selectedClient, ...data };
          setSelectedClient(updated);
          setClients(prev => prev.map(c => c.id === updated.id ? updated : c));
      }
  };
  
  const handleUserUpdate = (updatedUser: AppUser) => {
      setUser(updatedUser);
      localStorage.setItem('mvptrainer_cached_user', JSON.stringify(updatedUser));
      // Actualizar tema inmediatamente si se actualiza el usuario (ej. branding)
      if (updatedUser.branding) {
          applyBrandingToTheme(updatedUser.branding);
      }
      fetchCounts();
  };

  if (loading || !authChecked) {
    return (
        <div className="h-screen bg-black flex items-center justify-center text-white flex-col gap-6">
            <Loader2 className="animate-spin text-mvp-gold" />
            <div className="flex flex-col items-center gap-2 animate-fadeIn text-center px-6">
                <p className="text-zinc-400 text-sm font-medium">
                    {isReconnecting ? "Optimizando conexión..." : "Cargando tu cuenta..."}
                </p>
                {isReconnecting && (
                    <p className="text-zinc-600 text-[11px] max-w-[200px]">
                        Estamos restaurando tu sesión local para cargar más rápido.
                    </p>
                )}
                <button 
                    onClick={() => window.location.reload()}
                    className="mt-6 text-[10px] text-zinc-500 hover:text-mvp-gold transition-colors uppercase tracking-widest font-bold"
                >
                    Reiniciar App
                </button>
            </div>
        </div>
    );
  }

  if (authStatus === 'degraded' && !user && !isPublicRoute) {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <div className="text-center max-w-sm animate-fadeIn">
                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
                    <AlertTriangle size={32} className="text-amber-500" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Error de Conexión</h2>
                <p className="text-zinc-500 text-sm mb-8 leading-relaxed">
                    Estamos teniendo problemas para verificar tu sesión. Esto puede deberse a una conexión inestable o restricciones de red.
                </p>
                <div className="space-y-3">
                    <button 
                        onClick={() => window.location.reload()} 
                        className="w-full bg-mvp-gold text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-mvp-gold/20"
                    >
                        <Zap size={18}/> Reintentar conexión
                    </button>
                    <button 
                        onClick={() => setAuthStatus('unauthenticated')} 
                        className="w-full bg-zinc-900 text-zinc-400 font-bold py-3 rounded-xl hover:text-white transition-colors"
                    >
                        Ir al login directamente
                    </button>
                </div>
                <p className="text-[10px] text-zinc-600 mt-8 uppercase tracking-widest">MVP Trainer Pro Safety System</p>
            </div>
        </div>
    );
  }

  // Overlay de Reconexión (si tenemos usuario pero la red falla)
  const ReconnectingOverlay = () => (
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] bg-zinc-900 border border-amber-500/30 px-4 py-3 rounded-2xl flex items-center gap-3 shadow-2xl shadow-black"
      >
          <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
          <p className="text-white text-sm font-medium">Reconectando con el servidor...</p>
      </motion.div>
  );
  
  if (!user) return <AuthView onLoginSuccess={setUser} />;

  const showReconnecting = isReconnecting && (loading || !realtimeSubscribedRef.current);

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-hidden flex flex-col">
      {showReconnecting && <ReconnectingOverlay />}
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      {showPaywall && <PaywallPro onClose={() => setShowPaywall(false)} user={user} onShowToast={(t: any) => setToast(t)} />}
      
      <ConfirmModal 
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        onConfirm={confirmConfig.onConfirm}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        type={confirmConfig.type}
      />

      {/* Header */}
      <header className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex justify-between items-center backdrop-blur-md z-10">
         <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
            {user.branding?.logoUrl ? (
                <img src={user.branding.logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain bg-white/10" />
            ) : (
                <div className="w-8 h-8 bg-gradient-to-tr from-mvp-gold to-orange-600 rounded-lg flex items-center justify-center text-black font-bold">M</div>
            )}
            
            <span className="font-bold tracking-tighter hidden md:inline truncate max-w-[150px]">
                {user.branding?.brandName || (
                    <>MVP<span className="text-mvp-gold">TRAINER</span></>
                )}
            </span>
            {isSyncingSession && (
                <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 text-[10px] text-amber-400 font-semibold border border-amber-500/20 animate-pulse">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                    Sincronizando datos...
                </span>
            )}
         </div>
         <div className="flex items-center gap-3">
             {/* New Agenda Button */}
             <button 
                onClick={() => {
                    const check = canUseFeature(user, 'agenda');
                    if (!check.allowed) {
                        setShowPaywall(true);
                        setToast({ title: "Acceso PRO", message: check.reason, type: 'warning' });
                        return;
                    }
                    setView('day');
                }}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${view === 'day' ? 'bg-mvp-gold text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'}`}
                title="Mi Día"
             >
                <Calendar size={18} />
             </button>
             
             {/* Payments Button */}
             <button 
                onClick={() => {
                    const check = canUseFeature(user, 'payments');
                    if (!check.allowed) {
                        setShowPaywall(true);
                        setToast({ title: "Acceso PRO", message: check.reason, type: 'warning' });
                        return;
                    }
                    setView('payments');
                }}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${view === 'payments' ? 'bg-mvp-gold text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'}`}
                title="Pagos"
             >
                <Banknote size={18} />
             </button>

             {/* Plan Badge - Clickable to go to Account */}
             {planStatus && (
                 <button 
                    onClick={() => setView('account')}
                    className={`flex flex-col items-end px-3 py-1 rounded-lg border border-transparent ${planStatus.bg} hover:opacity-80 transition-opacity`}
                 >
                     <span className={`text-[10px] font-extrabold tracking-widest ${planStatus.color}`}>{planStatus.label}</span>
                     <span className="text-[10px] text-zinc-400">{planStatus.detail}</span>
                 </button>
             )}
             <button onClick={() => setView('account')} className="w-9 h-9 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-700">
                <UserIcon size={18} />
             </button>
             <button onClick={handleLogout} className="w-9 h-9 bg-zinc-800 rounded-full flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-zinc-700" title="Cerrar Sesión">
                <LogOut size={18} />
             </button>
         </div>
      </header>

      <main className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col max-w-5xl mx-auto w-full">
         
         {/* UPGRADE BANNER (Conditional) */}
         {showUpgradeBanner && user?.subscription?.type === 'free' && view === 'dashboard' && (
            <div className="bg-gradient-to-r from-zinc-900 to-black border border-mvp-gold/30 text-sm text-zinc-200 px-4 py-3 flex flex-col sm:flex-row justify-between items-center rounded-xl mb-6 shadow-lg animate-fadeIn gap-3">
                <div className="flex items-center gap-3">
                    <div className="bg-mvp-gold/20 p-2 rounded-full text-mvp-gold"><Crown size={16}/></div>
                    <span>
                    Desbloquea <strong>clientes ilimitados</strong> y generación IA sin restricciones.
                    </span>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowUpgradeBanner(false)}
                        className="text-zinc-500 hover:text-white px-2 py-1 text-xs"
                    >
                        Cerrar
                    </button>
                    <button
                    onClick={() => {
                        setShowUpgradeBanner(false);
                        setShowPaywall(true);
                    }}
                    className="bg-mvp-gold hover:bg-amber-600 text-black font-bold px-4 py-2 rounded-lg text-xs transition-colors"
                    >
                    Ver Planes
                    </button>
                </div>
            </div>
         )}

         {view === 'dashboard' ? (
             <div className="space-y-6 animate-fadeIn overflow-y-auto pb-20 custom-scrollbar">
                 <div className="flex justify-between items-end">
                     <div>
                        <h1 className="text-2xl font-bold text-white">Hola, {user.displayName}</h1>
                        <p className="text-zinc-500 text-sm">Resumen de tu negocio.</p>
                     </div>
                     <button 
                        onClick={() => {
                             const check = canUseFeature(user, 'createClient');
                             if (!check.allowed) {
                                 setShowPaywall(true);
                                 setToast({ title: "Límite Alcanzado", message: check.reason || "Límite de clientes alcanzado.", type: 'warning' });
                                 return;
                             }
                             setEditingClient(null);
                             setIsClientModalOpen(true);
                         }}
                         className="bg-mvp-gold hover:bg-amber-600 text-black font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
                      >
                         <Plus size={18} /> <span className="hidden sm:inline">Nuevo Cliente</span>
                      </button>
                  </div>

                  {/* Stats Cards */}
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 flex flex-col justify-between min-h-[110px]">
                         <div className="flex justify-between items-center mb-2">
                             <Users size={16} className="text-mvp-gold" />
                             <span className="text-xs text-zinc-500 font-medium font-sans">Clientes</span>
                         </div>
                          <span className="text-2xl font-bold text-white">{clients.length}</span>
                      </div>
                     <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 flex flex-col justify-between min-h-[110px]">
                         <div className="flex justify-between items-center mb-2">
                             <DollarSign size={16} className="text-green-400" />
                             <span className="text-xs text-zinc-500 font-medium font-sans">Ingresos</span>
                         </div>
                         <span className="text-2xl font-bold text-white">
                             ${clients.reduce((acc, c) => acc + (Number(c.paymentInfo.monthlyFee) || 0), 0)}
                         </span>
                     </div>
                     <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 flex flex-col justify-between min-h-[110px]">
                         <div className="flex justify-between items-center mb-2">
                             <Dumbbell size={16} className="text-blue-400" />
                             <span className="text-xs text-zinc-500 font-medium font-sans">Rutinas</span>
                         </div>
                         <span className="text-2xl font-bold text-white">
                             {dbRoutinesCount}
                         </span>
                     </div>
                     <div className="bg-zinc-900 p-5 rounded-2xl border border-zinc-800 flex flex-col justify-between min-h-[110px]">
                         <div className="flex justify-between items-center mb-2">
                             <Utensils size={16} className="text-orange-400" />
                             <span className="text-xs text-zinc-500 font-medium font-sans">Dietas</span>
                         </div>
                         <span className="text-2xl font-bold text-white">
                             {dbDietsCount}
                         </span>
                     </div>
                  </div>

                  {/* Clients List */}
                  <div>
                      <h3 className="font-bold text-white mb-4">Mis Clientes</h3>
                      {clientsLoading ? (
                          <div className="space-y-3">
                              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl animate-pulse flex items-center justify-between">
                                  <div className="flex items-center gap-3 w-full">
                                      <div className="w-10 h-10 rounded-full bg-zinc-800" />
                                      <div className="space-y-2 w-1/3">
                                          <div className="h-4 bg-zinc-800 rounded w-full" />
                                          <div className="h-3 bg-zinc-800 rounded w-2/3" />
                                      </div>
                                  </div>
                              </div>
                              <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl animate-pulse flex items-center justify-between">
                                  <div className="flex items-center gap-3 w-full">
                                      <div className="w-10 h-10 rounded-full bg-zinc-800" />
                                      <div className="space-y-2 w-1/3">
                                          <div className="h-4 bg-zinc-800 rounded w-full" />
                                          <div className="h-3 bg-zinc-800 rounded w-2/3" />
                                      </div>
                                  </div>
                              </div>
                          </div>
                      ) : (authChecked && !clientsLoading && clients.length === 0) ? (
                          <div className="text-center py-10 border border-dashed border-zinc-800 rounded-2xl">
                              <p className="text-zinc-500">No tienes clientes aún.</p>
                          </div>
                      ) : (
                          <div className="space-y-2">
                              {clients.map(client => (
                                  <div 
                                     key={client.id} 
                                     onClick={() => { setSelectedClient(client); setView('client'); }}
                                     className="bg-zinc-900 hover:bg-zinc-800 p-4 rounded-xl border border-zinc-800 cursor-pointer flex items-center justify-between transition-colors group"
                                  >
                                      <div className="flex items-center gap-3">
                                          <img src={client.avatarUrl} className="w-10 h-10 rounded-full bg-zinc-800 object-cover" />
                                          <div>
                                              <h4 className="font-bold text-white text-sm group-hover:text-mvp-gold">{client.name}</h4>
                                              <p className="text-xs text-zinc-500">{client.mainGoal}</p>
                                          </div>
                                      </div>
                                      <div className="flex items-center gap-3">
                                          {/* Status Dot */}
                                          <div className={`w-2.5 h-2.5 rounded-full ${
                                             client.paymentInfo.status === 'al_dia' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 
                                             client.paymentInfo.status === 'pendiente' ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]' : 
                                             client.paymentInfo.status === 'atrasado' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 
                                             'bg-zinc-600'
                                          }`}></div>
                                          <ChevronRight size={16} className="text-zinc-600"/>
                                      </div>
                                  </div>
                               ))}
                          </div>
                      )}
                  </div>
             </div>
         ) : view === 'client' ? (
             <ClientDetail 
                client={selectedClient} 
                user={user}
                onBack={() => { setView('dashboard'); setSelectedClient(null); }}
                onUpdate={handleClientUpdate}
                onDelete={() => selectedClient && handleDeleteClient(selectedClient.id)}
                onEdit={() => {
                    setEditingClient(selectedClient);
                    setIsClientModalOpen(true);
                }}
                onShowPaywall={() => setShowPaywall(true)}
                onShowToast={(t: any) => setToast(t)}
                onUserUsageUpdate={handleUserUpdate}
                requestConfirm={(config: any) => setConfirmConfig({ ...config, isOpen: true })}
                onRefreshCounts={fetchCounts}
             />
         ) : view === 'day' ? (
            <DailySchedule 
                user={user}
                clients={clients}
                onOpenClient={(client: Client) => { setSelectedClient(client); setView('client'); }}
                onShowPaywall={() => setShowPaywall(true)}
            />
         ) : view === 'payments' ? (
            <PaymentCalendar 
                user={user}
                clients={clients}
            />
         ) : (
             <AccountView 
                user={user} 
                clients={clients} 
                onShowPaywall={() => setShowPaywall(true)} 
                onBack={() => setView('dashboard')}
                onUpdateUser={handleUserUpdate}
                requestConfirm={(config: any) => setConfirmConfig({ ...config, isOpen: true })}
                onShowToast={(t: any) => setToast(t)}
                onLogout={handleLogout}
             />
         )}
      </main>
      
      {/* Client Form Modal (Create or Edit) */}
      {isClientModalOpen && (
          <ClientFormModal 
            onClose={() => { setIsClientModalOpen(false); setEditingClient(null); }} 
            onSubmit={handleSaveClient} 
            initialData={editingClient || undefined}
            onShowToast={(t: any) => setToast(t)}
          />
      )}
    </div>
  );
};

export default App;
