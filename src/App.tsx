
import React, { useState, useEffect } from 'react';
import { 
  Users, Activity, Dumbbell, Crown, ChevronRight, Menu, X, 
  Sparkles, Loader2, AlertCircle, DollarSign, 
  Edit2, Save, User as UserIcon, Clock, Trash2, Banknote, 
  AlertTriangle, ChevronDown, LogOut, Plus, ChevronUp, Flame, Zap, Utensils, Check, MessageSquare, Lock, Calendar, Copy, Timer, MapPin
} from 'lucide-react';
import { Client, Routine, User as AppUser, DietPlan, ClientPaymentInfo, PlanInterval } from './types';
import { generateWorkoutRoutine, generateDietPlan } from './services/geminiService';
import { 
  auth, db, signIn, signUp, signOutUser, onAuthStateChanged,
  subscribeToClients, createClient, updateDoc, deleteClient,
  doc, markUserAsPro, updateUserDoc
} from './services/firebase';
import { checkLimit, checkAndResetUsage, getPlanStatusLabel, LIMITS } from './services/subscriptionUtils';
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

const groupExercisesByDay = (exercises: any[]) => {
    const grouped: Record<string, any[]> = {};
    exercises.forEach(ex => {
        const day = ex.day || 'Otros';
        if (!grouped[day]) grouped[day] = [];
        grouped[day].push(ex);
    });
    return grouped;
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
const PaywallPro = ({ onClose, user }: { onClose: () => void, user: AppUser }) => {
    const [loading, setLoading] = useState(false);

    const handleUpgrade = async (interval: PlanInterval) => {
        setLoading(true);
        try {
            // Simulando proceso de pago y actualización en DB
            await new Promise(r => setTimeout(r, 1500));
            await markUserAsPro(user.uid, interval);
            onClose();
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/95 backdrop-blur-xl animate-fadeIn overflow-y-auto">
        <div className="w-full max-w-5xl bg-mvp-black rounded-3xl overflow-hidden border border-mvp-gold/20 shadow-2xl relative my-auto">
          <button onClick={onClose} className="absolute top-4 right-4 text-zinc-500 hover:text-white z-20"><X /></button>
          
          <div className="flex flex-col lg:flex-row min-h-[600px]">
              
              {/* LEFT SIDE: VALUE PROP */}
              <div className="lg:w-1/3 p-8 bg-gradient-to-br from-zinc-900 to-black relative flex flex-col justify-between">
                 <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
                 <div className="relative z-10">
                    <div className="inline-flex items-center space-x-2 bg-mvp-gold/20 text-mvp-gold border border-mvp-gold/30 rounded-full px-3 py-1 mb-6">
                        <Crown size={14} />
                        <span className="text-xs font-bold tracking-widest uppercase">MVP PRO</span>
                    </div>
                    <h2 className="text-3xl font-extrabold text-white mb-6 leading-tight">Elimina los límites.<br/>Escala tu negocio.</h2>
                    
                    <div className="space-y-6">
                        <div className="flex gap-4">
                            <div className="bg-zinc-800 p-2 rounded-lg h-fit"><Users size={20} className="text-mvp-gold"/></div>
                            <div>
                                <h4 className="font-bold text-white">Clientes Ilimitados</h4>
                                <p className="text-sm text-zinc-500">Gestiona toda tu cartera sin restricciones.</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="bg-zinc-800 p-2 rounded-lg h-fit"><Sparkles size={20} className="text-purple-400"/></div>
                            <div>
                                <h4 className="font-bold text-white">IA Ilimitada</h4>
                                <p className="text-sm text-zinc-500">Genera rutinas y dietas semanales infinitas.</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="bg-zinc-800 p-2 rounded-lg h-fit"><Calendar size={20} className="text-blue-400"/></div>
                            <div>
                                <h4 className="font-bold text-white">Agenda y Pagos</h4>
                                <p className="text-sm text-zinc-500">Organización profesional y control de cobros.</p>
                            </div>
                        </div>
                        <div className="flex gap-4">
                            <div className="bg-zinc-800 p-2 rounded-lg h-fit"><Flame size={20} className="text-orange-500"/></div>
                            <div>
                                <h4 className="font-bold text-white">Branding PRO</h4>
                                <p className="text-sm text-zinc-500">Tu logo, tus colores y tu propia landing page.</p>
                            </div>
                        </div>
                    </div>
                 </div>
                 <div className="relative z-10 mt-8">
                     <p className="text-xs text-zinc-600">Únete a más de 500 entrenadores que ya usan MVP Trainer Pro.</p>
                 </div>
              </div>

              {/* RIGHT SIDE: PRICING PLANS */}
              <div className="lg:w-2/3 p-8 bg-zinc-950 flex flex-col justify-center">
                 <h3 className="text-center text-xl font-bold text-white mb-8">Elige tu plan de crecimiento</h3>
                 
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                     {/* PLAN MENSUAL */}
                     <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col hover:border-zinc-600 transition-colors">
                         <h4 className="text-zinc-400 font-bold text-sm uppercase mb-2">Mensual</h4>
                         <div className="text-3xl font-bold text-white mb-1">$14.99</div>
                         <div className="text-xs text-zinc-500 mb-6">Facturado cada mes</div>
                         <button 
                            disabled={loading}
                            onClick={() => handleUpgrade('monthly')}
                            className="mt-auto w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                         >
                            Elegir Plan
                         </button>
                     </div>

                     {/* PLAN SEMESTRAL */}
                     <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col hover:border-zinc-600 transition-colors relative overflow-hidden">
                         <div className="absolute top-0 right-0 bg-green-500/20 text-green-500 text-[10px] font-bold px-2 py-1 rounded-bl-lg">AHORRA 10%</div>
                         <h4 className="text-zinc-400 font-bold text-sm uppercase mb-2">6 Meses</h4>
                         <div className="text-3xl font-bold text-white mb-1">$79.99</div>
                         <div className="text-xs text-zinc-500 mb-6">Equivale a $13.33/mes</div>
                         <button 
                            disabled={loading}
                            onClick={() => handleUpgrade('semiannual')}
                            className="mt-auto w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-colors text-sm"
                         >
                            Elegir Plan
                         </button>
                     </div>

                     {/* PLAN ANUAL */}
                     <div className="bg-zinc-900 border-2 border-mvp-gold rounded-2xl p-6 flex flex-col relative shadow-[0_0_20px_rgba(245,158,11,0.1)] transform md:-translate-y-4">
                         <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-mvp-gold text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide whitespace-nowrap">Mejor Valor</div>
                         <h4 className="text-mvp-gold font-bold text-sm uppercase mb-2">Anual</h4>
                         <div className="text-3xl font-bold text-white mb-1">$149.99</div>
                         <div className="text-xs text-zinc-500 mb-6">Equivale a $12.50/mes <span className="text-green-500 block font-bold">Ahorras 35%</span></div>
                         <button 
                            disabled={loading}
                            onClick={() => handleUpgrade('yearly')}
                            className="mt-auto w-full bg-gradient-to-r from-mvp-gold to-orange-500 hover:to-orange-400 text-white font-bold py-3 rounded-xl transition-all shadow-lg text-sm"
                         >
                            {loading ? <Loader2 className="animate-spin mx-auto"/> : 'Empezar Ahora'}
                         </button>
                     </div>
                 </div>

                 <p className="text-[10px] text-center text-zinc-600 mt-8">
                     Pagos seguros procesados externamente. Puedes cancelar tu suscripción en cualquier momento desde los ajustes de tu cuenta.
                 </p>
              </div>
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

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = isRegistering ? await signUp(email, password) : await signIn(email, password);
      if (res.user) onLoginSuccess(res.user);
    } catch (err: any) {
      setError(err.code === 'auth/email-already-in-use' ? 'Correo en uso' : 'Error de credenciales');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-8 border border-zinc-800 animate-fadeIn">
        <h1 className="text-3xl font-extrabold text-white mb-2 text-center">MVP<span className="text-mvp-gold">TRAINER</span></h1>
        <p className="text-zinc-500 text-center mb-8">Gestión profesional para entrenadores</p>
        <form onSubmit={handleAuth} className="space-y-4">
          {error && <div className="text-red-500 text-sm text-center bg-red-500/10 p-2 rounded">{error}</div>}
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

const AccountView = ({ user, clients, onShowPaywall, onBack, onUpdateUser }: { user: AppUser, clients: Client[], onShowPaywall: () => void, onBack: () => void, onUpdateUser: (u: AppUser) => void }) => {
  const planStatus = getPlanStatusLabel(user);
  const isPro = user.subscription.type === 'pro';

  // Limits
  const clientLimit = isPro ? Infinity : LIMITS.FREE_CLIENTS;
  const routineLimit = isPro ? Infinity : LIMITS.FREE_ROUTINES_WEEKLY;
  const dietLimit = isPro ? Infinity : LIMITS.FREE_DIETS_WEEKLY;

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
               <UsageProgress 
                  current={clients.length} 
                  max={clientLimit} 
                  label="Clientes Activos" 
                  onUpgrade={onShowPaywall}
               />
               <UsageProgress 
                  current={user.subscription.usage.routinesGenerated} 
                  max={routineLimit} 
                  label="Rutinas IA (Semanal)" 
                  onUpgrade={onShowPaywall}
               />
               <UsageProgress 
                  current={user.subscription.usage.dietsGenerated} 
                  max={dietLimit} 
                  label="Dietas IA (Semanal)" 
                  onUpgrade={onShowPaywall}
               />
             </div>
           </div>
        </div>
        
        {/* BRANDING SECTION */}
        <BrandingSettings 
            user={user} 
            onUpdateUser={onUpdateUser} 
            onShowPaywall={onShowPaywall} 
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
             <button onClick={signOutUser} className="text-red-500 hover:text-red-400 text-sm font-bold flex items-center justify-center gap-2 mx-auto py-2">
                <LogOut size={16}/> Cerrar Sesión
             </button>
        </div>
      </div>
    </div>
  );
};

// --- CLIENT DETAIL VIEW ---

type TabType = 'profile' | 'agenda' | 'routines' | 'nutrition' | 'payments';

const ClientDetail = ({ client, user, onBack, onUpdate, onDelete, onShowPaywall, onShowToast, onEdit, onUserUsageUpdate }: any) => {
    const [activeTab, setActiveTab] = useState<TabType>('profile');
    const [isGenerating, setIsGenerating] = useState(false);
    const [expandedRoutine, setExpandedRoutine] = useState<string | null>(null);
    const [expandedDietDay, setExpandedDietDay] = useState<string | null>(null);
    
    // Agenda State
    const [isEditingAgenda, setIsEditingAgenda] = useState(false);
    const [agendaForm, setAgendaForm] = useState<{ days: string[], time24: string }>({ days: [], time24: '' });

    // Payment Form State
    const [paymentForm, setPaymentForm] = useState<ClientPaymentInfo>({
        monthlyFee: client.paymentInfo.monthlyFee || 0,
        status: client.paymentInfo.status || 'sin_registro',
        paymentMethod: client.paymentInfo.paymentMethod || 'efectivo',
        lastPaidAt: client.paymentInfo.lastPaidAt || '',
        nextPaymentAt: client.paymentInfo.nextPaymentAt || ''
    });

    useEffect(() => {
        setPaymentForm({
            monthlyFee: client.paymentInfo.monthlyFee || 0,
            status: client.paymentInfo.status || 'sin_registro',
            paymentMethod: client.paymentInfo.paymentMethod || 'efectivo',
            lastPaidAt: client.paymentInfo.lastPaidAt || '',
            nextPaymentAt: client.paymentInfo.nextPaymentAt || ''
        });
        setAgendaForm({
            days: client.trainingDays || [],
            time24: convertTo24Hour(client.trainingTime || client.trainingHour || null)
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
            const newRoutine: Routine = {
                id: Date.now().toString(),
                name: routineData.name || "Rutina Semanal IA",
                description: routineData.description || "",
                exercises: routineData.exercises as any[] || [],
                tags: routineData.tags || []
            };
            const updatedRoutines = [...(client.routines || []), newRoutine];
            await onUpdate({ routines: updatedRoutines });
            const updatedUser = registerUsage(user, 'generateRoutine', { clientId: client.id });
            await updateUserDoc(user.uid, { subscription: updatedUser.subscription });
            onUserUsageUpdate(updatedUser);
            setExpandedRoutine(newRoutine.id);
        } else {
             onShowToast({ title: "Error", message: "Error al generar la rutina. Intenta de nuevo.", type: 'error' });
        }
        setIsGenerating(false);
    });

    const handleAddDiet = () => handleAction('generateDiet', async () => {
        setIsGenerating(true);
        const plan = await generateDietPlan(client);
        if (plan) {
            await onUpdate({ dietPlan: plan });
            const updatedUser = registerUsage(user, 'generateDiet', { clientId: client.id });
            await updateUserDoc(user.uid, { subscription: updatedUser.subscription });
            onUserUsageUpdate(updatedUser);
        } else {
            onShowToast({ title: "Error", message: "No se pudo generar la dieta. Intenta de nuevo.", type: 'error' });
        }
        setIsGenerating(false);
    });

    const handleCopyRoutine = (routine: Routine) => {
        const grouped = groupExercisesByDay(routine.exercises);
        let text = `🏋️‍♂️ *RUTINA: ${routine.name}*\n${routine.description}\n\n`;
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
        text += `¡A entrenar! 💪`;
        navigator.clipboard.writeText(text);
        onShowToast({ title: "Plan Semanal Copiado", message: "Lista para pegar en WhatsApp 📲", type: 'success' });
    };

    const handleCopyDiet = (diet: DietPlan) => {
        let message = `🥗 *PLAN NUTRICIONAL: ${diet.title}*\n`;
        message += `🎯 Objetivos diarios: ${diet.totalKcal} kcal | P:${diet.totalProtein}g | C:${diet.totalCarbs}g | G:${diet.totalFats}g\n`;
        if(diet.notes) message += `ℹ️ Nota: ${diet.notes}\n`;
        message += `\n`;

        diet.days.forEach(d => {
            message += `📅 *${d.day.toUpperCase()}*\n`;
            d.meals.forEach(m => {
                message += `- *${m.timeOfDay}:* ${m.name} (${m.description})\n`;
            });
            message += `\n`;
        });
        message += `¡Buen provecho! 🥑`;
        navigator.clipboard.writeText(message);
        onShowToast({ title: "Dieta Semanal Copiada", message: "Lista para pegar en WhatsApp 📲", type: 'success' });
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
        navigator.clipboard.writeText(message);
        onShowToast({ title: "Mensaje Copiado", message: "Pégalo en WhatsApp 📲", type: 'success' });
    };

    const handleSaveAgenda = async () => {
        if (agendaForm.days.length === 0) {
            onShowToast({ title: "Error", message: "Debes seleccionar al menos un día.", type: 'error' });
            return;
        }
        await onUpdate({
            trainingDays: agendaForm.days,
            trainingTime: convertTo12Hour(agendaForm.time24)
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
    const routinesUsed = user.subscription.usage.aiRoutinesByClient?.[client.id] || 0;
    const dietsUsed = user.subscription.usage.aiDietsByClient?.[client.id] || 0;
    const isPro = user.subscription.type === 'pro';

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
                <button onClick={onDelete} className="text-red-500 p-2 hover:bg-red-500/10 rounded-full"><Trash2 size={18}/></button>
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
                                {client.goals?.length > 0 ? client.goals.map((g: string, i: number) => (
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
                                <div className="mb-6"><label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">Hora Habitual</label><input type="time" value={agendaForm.time24} onChange={e => setAgendaForm({...agendaForm, time24: e.target.value})} className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none text-xl font-bold text-center"/></div>
                                <div className="mb-8"><label className="text-xs text-zinc-500 font-bold uppercase mb-3 block">Días de Entrenamiento</label><div className="grid grid-cols-2 gap-2">{WEEKDAYS.map(day => { const isSelected = agendaForm.days.includes(day); return ( <button key={day} onClick={() => toggleAgendaDay(day)} className={`py-3 px-4 rounded-lg text-sm font-semibold flex justify-between items-center transition-all ${isSelected ? 'bg-mvp-gold text-black border border-mvp-gold' : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'}`}>{day}{isSelected && <Check size={16} className="stroke-[3px]" />}</button>);})}</div></div>
                                <div className="flex gap-3"><button onClick={() => setIsEditingAgenda(false)} className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-colors">Cancelar</button><button onClick={handleSaveAgenda} className="flex-1 bg-mvp-gold hover:bg-amber-600 text-black font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"><Save size={18}/> Guardar</button></div>
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'routines' && (
                    <div className="space-y-4">
                         <div className="flex justify-between items-center"><h3 className="font-bold text-white">Entrenamientos</h3>{!isPro && (<div className="text-xs text-amber-500 bg-amber-900/20 px-2 py-1 rounded">{routinesUsed}/1 esta semana</div>)}</div>
                        <button onClick={handleAddRoutine} disabled={isGenerating} className="w-full py-4 border border-dashed border-zinc-700 rounded-xl text-zinc-400 hover:text-white hover:border-mvp-gold flex justify-center items-center gap-2 transition-colors">{isGenerating ? <Loader2 className="animate-spin"/> : <><Sparkles size={16}/> Generar Rutina Semanal IA</>}</button>
                        {client.routines.length === 0 && !isGenerating && (<div className="text-center py-8"><p className="text-zinc-500 text-sm">No hay rutinas guardadas.</p></div>)}
                        {client.routines.slice().reverse().map((r: Routine) => {
                            const isExpanded = expandedRoutine === r.id;
                            const groupedExercises = isExpanded ? groupExercisesByDay(r.exercises) : {};
                            return (
                                <div key={r.id} className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden transition-all duration-300">
                                    <div onClick={() => setExpandedRoutine(isExpanded ? null : r.id)} className="p-4 cursor-pointer hover:bg-zinc-800/50 flex justify-between items-start">
                                        <div className="flex-1"><h4 className="font-bold text-white text-lg">{r.name}</h4><p className="text-xs text-zinc-500 mt-1 line-clamp-1">{r.description}</p><div className="flex flex-wrap gap-2 mt-2">{r.tags.map((tag, i) => (<span key={i} className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 border border-zinc-700 uppercase tracking-wider">{tag}</span>))}</div></div>
                                        <div className="text-zinc-500 ml-4 mt-1">{isExpanded ? <ChevronUp size={20}/> : <ChevronDown size={20}/>}</div>
                                    </div>
                                    {isExpanded && (
                                        <div className="border-t border-zinc-800 bg-black/20 p-4 animate-slideUp">
                                            {r.exercises.length === 0 ? (<p className="text-zinc-500 text-sm italic py-2">Esta rutina aún no tiene ejercicios generados. Intenta regenerarla.</p>) : (
                                                <div className="space-y-6">
                                                    {Object.keys(groupedExercises).map((dayName, idx) => (
                                                        <div key={idx} className="space-y-2">
                                                            <div className="flex items-center gap-2 text-mvp-gold font-bold uppercase text-xs tracking-wider border-b border-zinc-800 pb-1 mb-2"><Calendar size={12}/> {dayName}</div>
                                                            {groupedExercises[dayName].map((ex, exIdx) => (
                                                                <div key={exIdx} className="bg-zinc-800/50 p-3 rounded-lg border border-zinc-800/50"><div className="flex justify-between items-start mb-2"><h5 className="font-bold text-zinc-200 text-sm">{ex.name}</h5><div className="flex items-center gap-2 text-xs font-mono text-zinc-300 bg-black/40 px-2 py-1 rounded"><span className="font-bold">{ex.sets}</span><span className="text-zinc-600">x</span><span>{ex.reps}</span></div></div><div className="flex flex-wrap gap-3 text-xs text-zinc-500">{ex.rest && (<span className="flex items-center gap-1"><Timer size={10} className="text-zinc-400"/> {ex.rest}</span>)}{ex.notes && (<span className="flex items-center gap-1 italic"><MessageSquare size={10} className="text-zinc-400"/> {ex.notes}</span>)}</div></div>
                                                            ))}
                                                        </div>
                                                    ))}
                                                    <button onClick={(e) => { e.stopPropagation(); handleCopyRoutine(r); }} className="w-full mt-4 bg-green-600/10 hover:bg-green-600/20 text-green-500 border border-green-600/30 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"><Copy size={16} /> Copiar Plan Semanal</button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
                {activeTab === 'nutrition' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="font-bold text-white">Plan Nutricional</h3>
                            {!isPro && (<div className="text-xs text-amber-500 bg-amber-900/20 px-2 py-1 rounded">{dietsUsed}/1 esta semana</div>)}
                        </div>

                        {!client.dietPlan ? (
                            <div className="text-center py-10 bg-zinc-900/50 rounded-xl border border-dashed border-zinc-800">
                                <Utensils size={40} className="mx-auto text-zinc-700 mb-4" />
                                <p className="text-zinc-400 mb-6 max-w-xs mx-auto text-sm">Genera un plan de alimentación personalizado basado en los objetivos de tu cliente.</p>
                                <button 
                                    onClick={handleAddDiet} 
                                    disabled={isGenerating} 
                                    className="bg-mvp-gold text-black px-6 py-3 rounded-xl text-sm font-bold hover:bg-amber-600 flex items-center gap-2 mx-auto disabled:opacity-50"
                                >
                                    {isGenerating ? <Loader2 className="animate-spin"/> : <><Sparkles size={16}/> Generar Dieta Semanal IA</>}
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
                                                <h4 className="font-bold text-white text-lg">{client.dietPlan.title}</h4>
                                                {client.dietPlan.notes && <p className="text-xs text-zinc-500 mt-1 max-w-sm">{client.dietPlan.notes}</p>}
                                            </div>
                                            <button onClick={() => { if(confirm("¿Eliminar dieta?")) onUpdate({ dietPlan: null }) }} className="text-zinc-600 hover:text-red-500"><Trash2 size={16}/></button>
                                        </div>
                                        
                                        {/* Macros Grid */}
                                        <div className="grid grid-cols-4 gap-2 mb-4">
                                            <div className="bg-zinc-800/50 p-2 rounded-xl border border-zinc-700/50 text-center">
                                                <Flame size={14} className="mx-auto text-orange-500 mb-1"/>
                                                <span className="block text-lg font-bold text-white">{client.dietPlan.totalKcal}</span>
                                                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Kcal</span>
                                            </div>
                                            <div className="bg-zinc-800/50 p-2 rounded-xl border border-zinc-700/50 text-center">
                                                <Utensils size={14} className="mx-auto text-red-400 mb-1"/>
                                                <span className="block text-lg font-bold text-white">{client.dietPlan.totalProtein}g</span>
                                                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Prot</span>
                                            </div>
                                            <div className="bg-zinc-800/50 p-2 rounded-xl border border-zinc-700/50 text-center">
                                                <Zap size={14} className="mx-auto text-amber-300 mb-1"/>
                                                <span className="block text-lg font-bold text-white">{client.dietPlan.totalCarbs || '-'}g</span>
                                                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Carb</span>
                                            </div>
                                            <div className="bg-zinc-800/50 p-2 rounded-xl border border-zinc-700/50 text-center">
                                                <div className="w-3.5 h-3.5 mx-auto bg-blue-400 rounded-full mb-1 opacity-80"></div>
                                                <span className="block text-lg font-bold text-white">{client.dietPlan.totalFats || '-'}g</span>
                                                <span className="text-[9px] text-zinc-500 uppercase font-bold tracking-wider">Grasa</span>
                                            </div>
                                        </div>

                                        <button 
                                            onClick={() => handleCopyDiet(client.dietPlan!)} 
                                            className="w-full bg-green-600/10 hover:bg-green-600/20 text-green-500 border border-green-600/30 py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                                        >
                                            <MessageSquare size={16} /> Copiar Dieta para WhatsApp
                                        </button>
                                     </div>
                                </div>

                                {/* Weekly Days Accordion */}
                                <div className="space-y-3">
                                    {client.dietPlan.days.map((dayPlan: any, i: number) => { 
                                        const isExpanded = expandedDietDay === dayPlan.day; 
                                        return ( 
                                            <div key={i} className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
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
                                                        {dayPlan.meals.map((meal: any, idx: number) => (
                                                            <div key={idx} className="flex gap-4 text-sm border-l-2 border-zinc-800 pl-4 py-1">
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
                    </div>
                )}
                {activeTab === 'payments' && (
                     <div className="space-y-4 animate-fadeIn">
                        <div className="bg-zinc-900 p-5 rounded-xl border border-zinc-800 space-y-4">
                            <div className="flex items-center gap-2 mb-2"><Banknote className="text-green-500" size={20}/><h3 className="text-white font-bold">Gestión de Cobro</h3></div>
                            <div><label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">Monto Mensual</label><div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">$</span><input type="number" value={paymentForm.monthlyFee} onChange={(e) => setPaymentForm({...paymentForm, monthlyFee: Number(e.target.value)})} className="w-full bg-black border border-zinc-700 text-white rounded-lg pl-8 pr-4 py-3 focus:border-mvp-gold outline-none"/></div></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">Estado</label><select value={paymentForm.status} onChange={(e) => setPaymentForm({...paymentForm, status: e.target.value as any})} className="w-full bg-black border border-zinc-700 text-white rounded-lg px-4 py-3 focus:border-mvp-gold outline-none capitalize"><option value="sin_registro">Sin Registro</option><option value="al_dia">Al Día</option><option value="pendiente">Pendiente</option><option value="atrasado">Atrasado</option></select></div><div><label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">Método</label><select value={paymentForm.paymentMethod} onChange={(e) => setPaymentForm({...paymentForm, paymentMethod: e.target.value as any})} className="w-full bg-black border border-zinc-700 text-white rounded-lg px-4 py-3 focus:border-mvp-gold outline-none capitalize"><option value="efectivo">Efectivo</option><option value="yape">Yape</option><option value="plin">Plin</option><option value="transferencia">Transferencia</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></select></div></div>
                            <div className="grid grid-cols-2 gap-4"><div><label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">Último Pago</label><input type="date" value={paymentForm.lastPaidAt ? paymentForm.lastPaidAt.split('T')[0] : ''} onChange={(e) => setPaymentForm({...paymentForm, lastPaidAt: e.target.value ? new Date(e.target.value).toISOString() : null})} className="w-full bg-black border border-zinc-700 text-white rounded-lg px-4 py-3 focus:border-mvp-gold outline-none text-sm"/></div><div><label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">Próximo Pago</label><input type="date" value={paymentForm.nextPaymentAt ? paymentForm.nextPaymentAt.split('T')[0] : ''} onChange={(e) => setPaymentForm({...paymentForm, nextPaymentAt: e.target.value ? new Date(e.target.value).toISOString() : null})} className="w-full bg-black border border-zinc-700 text-white rounded-lg px-4 py-3 focus:border-mvp-gold outline-none text-sm"/></div></div>
                            <button onClick={handleSavePayments} className="w-full bg-mvp-gold hover:bg-amber-600 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 mt-4"><Save size={18} /> Guardar Cambios</button>
                            <div className="h-px bg-zinc-800 my-4"></div>
                            <button onClick={handleGeneratePaymentMessage} className="w-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors border border-zinc-700"><MessageSquare size={18} /> Generar Mensaje de Cobro</button>
                        </div>
                     </div>
                )}
            </div>
        </div>
    );
};

// --- CLIENT FORM MODAL (CREATE / EDIT) ---

const ClientFormModal = ({ onClose, onSubmit, initialData }: { onClose: () => void, onSubmit: (data: any) => void, initialData?: Client }) => {
    // --- STATE FOR FORM ---
    const [formData, setFormData] = useState({
        name: '', email: '', phone: '', fee: '',
        gender: 'male',
        age: '', weight: '', height: '',
        experienceLevel: 'beginner',
        country: 'Perú',
        goals: [] as string[],
        trainingDays: [] as string[],
        trainingTime24: ''
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                name: initialData.name,
                email: initialData.email || '',
                phone: initialData.phone || '',
                fee: String(initialData.paymentInfo.monthlyFee),
                gender: initialData.gender,
                age: String(initialData.age || ''),
                weight: String(initialData.weight || ''),
                height: String(initialData.height || ''),
                experienceLevel: initialData.experienceLevel,
                country: initialData.country || 'Perú',
                goals: initialData.goals || [],
                trainingDays: initialData.trainingDays || [],
                trainingTime24: convertTo24Hour(initialData.trainingTime || initialData.trainingHour || null)
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
    };

    const toggleDay = (day: string) => {
        setFormData(prev => ({
            ...prev,
            trainingDays: prev.trainingDays.includes(day)
                ? prev.trainingDays.filter(d => d !== day)
                : [...prev.trainingDays, day]
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        
        // Prepare payload
        const payload = {
            name: formData.name,
            email: formData.email,
            phone: formData.phone,
            gender: formData.gender,
            age: formData.age ? Number(formData.age) : null,
            weight: formData.weight ? Number(formData.weight) : null,
            height: formData.height ? Number(formData.height) : null,
            experienceLevel: formData.experienceLevel,
            country: formData.country,
            goals: formData.goals,
            trainingDays: formData.trainingDays,
            trainingTime: convertTo12Hour(formData.trainingTime24),
            // Si es edición, usamos spread condicional para no sobreescribir paymentInfo con un default
            ...(initialData ? {} : {
                 paymentInfo: { 
                    monthlyFee: Number(formData.fee), 
                    status: 'sin_registro' as const, 
                    paymentMethod: 'efectivo' as const, 
                    lastPaidAt: null,
                    nextPaymentAt: null 
                }
            })
        };

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
                         <input 
                            value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})}
                            className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none" 
                            placeholder="Nombre Completo *" required 
                         />
                         <div className="grid grid-cols-2 gap-4">
                            <input 
                                type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                                className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none" 
                                placeholder="Email" 
                            />
                            <input 
                                value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})}
                                className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none" 
                                placeholder="Teléfono" 
                            />
                         </div>
                         {/* Country Selector */}
                         <div>
                            <label className="text-[10px] text-zinc-500 font-bold mb-1 block">País (para dieta local)</label>
                            <select 
                                value={formData.country} 
                                onChange={e => setFormData({...formData, country: e.target.value})}
                                className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none"
                            >
                                {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
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
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">Edad</label>
                                <input 
                                    type="number" value={formData.age} onChange={e => setFormData({...formData, age: e.target.value})}
                                    className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none" 
                                    placeholder="Años" 
                                />
                             </div>
                             <div>
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">Peso (kg)</label>
                                <input 
                                    type="number" value={formData.weight} onChange={e => setFormData({...formData, weight: e.target.value})}
                                    className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none" 
                                    placeholder="kg" 
                                />
                             </div>
                             <div>
                                <label className="text-[10px] text-zinc-500 font-bold mb-1 block">Altura (cm)</label>
                                <input 
                                    type="number" value={formData.height} onChange={e => setFormData({...formData, height: e.target.value})}
                                    className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none" 
                                    placeholder="cm" 
                                />
                             </div>
                         </div>
                         <div>
                             <label className="text-[10px] text-zinc-500 font-bold mb-1 block">Nivel de Experiencia</label>
                             <select 
                                value={formData.experienceLevel} onChange={e => setFormData({...formData, experienceLevel: e.target.value})}
                                className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none capitalize"
                             >
                                 <option value="beginner">Principiante</option>
                                 <option value="intermediate">Intermedio</option>
                                 <option value="advanced">Avanzado</option>
                             </select>
                         </div>
                    </div>

                    {/* Section: Objetivos */}
                    <div className="space-y-4">
                         <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">Objetivos</h4>
                         <div className="flex flex-wrap gap-2">
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
                    <div className="space-y-4">
                         <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">Agenda</h4>
                         <div>
                            <label className="text-[10px] text-zinc-500 font-bold mb-2 block">Días de Entrenamiento</label>
                            <div className="flex justify-between gap-1">
                                {WEEKDAYS.map(day => {
                                    const isSelected = formData.trainingDays.includes(day);
                                    return (
                                        <button 
                                            type="button"
                                            key={day}
                                            onClick={() => toggleDay(day)}
                                            className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-[10px] sm:text-xs font-bold transition-all ${
                                                isSelected 
                                                ? 'bg-mvp-gold text-black' 
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
                            <label className="text-[10px] text-zinc-500 font-bold mb-1 block">Hora Preferida</label>
                            <input 
                                type="time"
                                value={formData.trainingTime24}
                                onChange={e => setFormData({...formData, trainingTime24: e.target.value})}
                                className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none"
                            />
                         </div>
                    </div>

                    {/* Section: Pago (Solo visible al crear, al editar se usa la tab de pagos) */}
                    {!initialData && (
                        <div className="space-y-4">
                            <h4 className="text-xs font-bold text-mvp-gold uppercase tracking-wider">Plan de Pago</h4>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400">$</span>
                                <input 
                                    type="number" 
                                    value={formData.fee} onChange={e => setFormData({...formData, fee: e.target.value})}
                                    className="w-full bg-black border border-zinc-700 text-white rounded-xl pl-8 pr-4 py-3 focus:border-mvp-gold outline-none" 
                                    placeholder="Mensualidad *" required 
                                />
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

const App = () => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'dashboard' | 'client' | 'account' | 'day' | 'payments'>('dashboard');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [toast, setToast] = useState<any>(null);

  // Banner State
  const [lastBannerShownAt, setLastBannerShownAt] = useState<number | null>(null);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  
  // Public Route Handling Check
  const [isPublicRoute, setIsPublicRoute] = useState(false);
  const [publicTrainerId, setPublicTrainerId] = useState<string | null>(null);

  // Check URL on load for public profile
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const trainerId = urlParams.get('trainerId');
    if (trainerId) {
        setIsPublicRoute(true);
        setPublicTrainerId(trainerId);
        setLoading(false); // Stop loading main app
    }
  }, []);

  // Auth & Data Subscription (Only if NOT public route)
  useEffect(() => {
    if (isPublicRoute) return;

    const unsubAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
          const now = new Date();
          let normalizedUser = normalizeSubscription(u, now);
          normalizedUser = resetWeeklyUsageIfNeeded(normalizedUser, now);
          setUser(normalizedUser);
          
          // Apply Branding
          applyBrandingToTheme(normalizedUser.branding);

          // Pide permiso de notificación si el usuario interactúa (aunque aquí corre al inicio)
          requestNotificationPermission();
      } else {
          setUser(null);
      }
      setLoading(false);
    });
    return () => unsubAuth();
  }, [isPublicRoute]);

  useEffect(() => {
    if (user && !isPublicRoute) {
      const unsubClients = subscribeToClients(user.uid, (data) => setClients(data));
      return () => unsubClients();
    }
  }, [user, isPublicRoute]);

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
      if (!user) return;

      if (editingClient) {
          // UPDATE MODE
          try {
              const docRef = doc(db, 'clients', editingClient.id);
              await updateDoc(docRef, formData);
              const updated = { ...editingClient, ...formData };
              setSelectedClient(updated);
              setToast({ title: 'Éxito', message: 'Perfil actualizado', type: 'success' });
              setIsClientModalOpen(false);
              setEditingClient(null);
          } catch (e) {
              console.error(e);
              setToast({ title: 'Error', message: 'No se pudo actualizar', type: 'error' });
          }
      } else {
          // CREATE MODE with Limit Check
          const check = canUseFeature(user, 'createClient', { clientsCount: clients.length });
          if (!check.allowed) {
              setShowPaywall(true);
              if (check.reason) setToast({ title: "Límite Alcanzado", message: check.reason, type: 'warning' });
              return;
          }

          try {
              await createClient(user.uid, formData);
              setIsClientModalOpen(false);
              setToast({ title: 'Éxito', message: 'Cliente creado correctamente', type: 'success' });
          } catch (e) {
              console.error(e);
          }
      }
  };

  const handleClientUpdate = async (data: Partial<Client>) => {
      if (selectedClient) {
          const docRef = doc(db, 'clients', selectedClient.id);
          await updateDoc(docRef, data);
          setSelectedClient({ ...selectedClient, ...data });
      }
  };
  
  const handleUserUpdate = (updatedUser: AppUser) => {
      setUser(updatedUser);
      // Actualizar tema inmediatamente si se actualiza el usuario (ej. branding)
      if (updatedUser.branding) {
          applyBrandingToTheme(updatedUser.branding);
      }
  };

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white"><Loader2 className="animate-spin" /></div>;
  if (!user) return <AuthView onLoginSuccess={setUser} />;

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-hidden flex flex-col">
      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      {showPaywall && <PaywallPro onClose={() => setShowPaywall(false)} user={user} />}

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
         </div>
         <div className="flex items-center gap-3">
             {/* New Agenda Button */}
             <button 
                onClick={() => setView('day')}
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${view === 'day' ? 'bg-mvp-gold text-black' : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'}`}
                title="Mi Día"
             >
                <Calendar size={18} />
             </button>
             
             {/* Payments Button */}
             <button 
                onClick={() => setView('payments')}
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
         </div>
      </header>

      <main className="flex-1 p-4 md:p-6 overflow-hidden flex flex-col max-w-5xl mx-auto w-full">
         
         {/* UPGRADE BANNER (Conditional) */}
         {showUpgradeBanner && user.subscription.type === 'free' && view === 'dashboard' && (
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
                        onClick={() => { setEditingClient(null); setIsClientModalOpen(true); }}
                        className="bg-mvp-gold hover:bg-amber-600 text-black font-bold px-4 py-2 rounded-xl flex items-center gap-2 transition-colors"
                     >
                        <Plus size={18} /> <span className="hidden sm:inline">Nuevo Cliente</span>
                     </button>
                 </div>

                 {/* Stats Cards */}
                 <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                     <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
                         <div className="flex justify-between mb-2"><Users size={16} className="text-mvp-gold" /><span className="text-xs text-zinc-500">Clientes</span></div>
                         <span className="text-2xl font-bold text-white">{clients.length}</span>
                     </div>
                     <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
                         <div className="flex justify-between mb-2"><DollarSign size={16} className="text-green-500" /><span className="text-xs text-zinc-500">Ingresos</span></div>
                         <span className="text-2xl font-bold text-white">${clients.reduce((acc, c) => acc + (Number(c.paymentInfo.monthlyFee)||0), 0)}</span>
                     </div>
                     <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
                         <div className="flex justify-between mb-2"><Dumbbell size={16} className="text-blue-500" /><span className="text-xs text-zinc-500">Rutinas</span></div>
                         <span className="text-2xl font-bold text-white">{clients.reduce((acc,c) => acc + (c.routines?.length||0), 0)}</span>
                     </div>
                     <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
                         <div className="flex justify-between mb-2"><Activity size={16} className="text-purple-500" /><span className="text-xs text-zinc-500">Activos</span></div>
                         <span className="text-2xl font-bold text-white">{clients.filter(c => c.status === 'active').length}</span>
                     </div>
                 </div>

                 {/* Clients List */}
                 <div>
                     <h3 className="font-bold text-white mb-4">Mis Clientes</h3>
                     {clients.length === 0 ? (
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
                onDelete={async () => {
                    if(confirm("¿Eliminar cliente?")) {
                        await deleteClient(selectedClient!.id);
                        setView('dashboard');
                    }
                }}
                onEdit={() => {
                    setEditingClient(selectedClient);
                    setIsClientModalOpen(true);
                }}
                onShowPaywall={() => setShowPaywall(true)}
                onShowToast={(t: any) => setToast(t)}
                onUserUsageUpdate={handleUserUpdate}
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
             />
         )}
      </main>
      
      {/* Client Form Modal (Create or Edit) */}
      {isClientModalOpen && (
          <ClientFormModal 
            onClose={() => { setIsClientModalOpen(false); setEditingClient(null); }} 
            onSubmit={handleSaveClient} 
            initialData={editingClient || undefined}
          />
      )}
    </div>
  );
};

export default App;
