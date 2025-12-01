import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  Activity, 
  Dumbbell, 
  TrendingUp, 
  Settings, 
  LogOut, 
  Plus, 
  Crown, 
  ChevronRight, 
  Search,
  CheckCircle2,
  Lock,
  Menu,
  X,
  Sparkles,
  Calendar,
  Loader2
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Client, Routine, User, ProgressLog } from './types';
import { generateWorkoutRoutine } from './services/geminiService';
import { auth, db } from './services/firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  updateProfile
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc,
  serverTimestamp
} from 'firebase/firestore';

// --- COMPONENTS ---

// 1. Auth View (Real Firebase)
const AuthView = ({ onLogin }: { onLogin: () => void }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!auth) {
        setError("Firebase no está configurado. Revisa services/firebase.ts");
        setIsLoading(false);
        return;
    }

    try {
      if (isRegistering) {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Set default display name based on email
        await updateProfile(userCredential.user, {
            displayName: email.split('@')[0]
        });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      // Auth listener in App component will handle the state update
    } catch (err: any) {
      console.error(err);
      let msg = "Error de autenticación";
      if (err.code === 'auth/invalid-credential') msg = "Credenciales incorrectas";
      if (err.code === 'auth/email-already-in-use') msg = "Este correo ya está registrado";
      if (err.code === 'auth/weak-password') msg = "La contraseña es muy débil";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-mvp-black flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-mvp-lightgray rounded-3xl p-8 border border-zinc-800 shadow-2xl animate-fadeIn">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-white tracking-tighter mb-2">MVP<span className="text-mvp-gold">TRAINER</span></h1>
          <p className="text-zinc-400">Plataforma de Entrenamiento Profesional</p>
        </div>

        <form onSubmit={handleAuth} className="space-y-6">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-500 text-sm p-3 rounded-xl text-center">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Correo Electrónico</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-mvp-gold transition-colors"
              placeholder="entrenador@ejemplo.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-2">Contraseña</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-mvp-gold transition-colors"
              placeholder="••••••••"
              required
            />
          </div>
          
          <button 
            type="submit" 
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-mvp-gold to-mvp-orange text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-orange-500/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center"
          >
            {isLoading ? <Loader2 className="animate-spin" /> : (isRegistering ? 'Crear Cuenta' : 'Iniciar Sesión')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-zinc-500 text-sm">
            {isRegistering ? "¿Ya tienes cuenta? " : "¿No tienes cuenta? "}
            <button 
                onClick={() => { setError(''); setIsRegistering(!isRegistering); }}
                className="text-mvp-gold cursor-pointer hover:underline font-bold"
            >
                {isRegistering ? "Inicia Sesión" : "Regístrate aquí"}
            </button>
          </p>
        </div>
        
        {!auth && (
             <div className="mt-8 pt-4 border-t border-zinc-800 text-center">
                <p className="text-xs text-yellow-500 bg-yellow-900/20 p-2 rounded border border-yellow-700/50">
                    ⚠️ Modo Demo: Configura services/firebase.ts para activar el login real.
                </p>
             </div>
        )}
      </div>
    </div>
  );
};

// 2. Dashboard Components
const StatCard = ({ label, value, icon: Icon, trend }: { label: string, value: string | number, icon: any, trend?: string }) => (
  <div className="bg-mvp-lightgray p-6 rounded-2xl border border-zinc-800 flex flex-col justify-between h-32 relative overflow-hidden group hover:border-zinc-700 transition-colors">
    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
      <Icon size={64} className="text-mvp-gold" />
    </div>
    <div className="flex items-center justify-between z-10">
      <h3 className="text-zinc-400 text-sm font-medium">{label}</h3>
      <Icon size={20} className="text-mvp-gold" />
    </div>
    <div className="z-10">
      <span className="text-3xl font-bold text-white">{value}</span>
      {trend && <span className="text-xs text-green-500 ml-2">{trend}</span>}
    </div>
  </div>
);

// 3. Client Detail View
const ClientDetail = ({ client, onBack, onAddRoutine }: { client: Client, onBack: () => void, onAddRoutine: (c: Client) => void }) => {
  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center space-x-4 mb-6">
        <button onClick={onBack} className="p-2 hover:bg-zinc-800 rounded-full transition-colors text-zinc-400 hover:text-white">
          <ChevronRight className="rotate-180" />
        </button>
        <img src={client.avatarUrl} alt={client.name} className="w-16 h-16 rounded-full border-2 border-mvp-gold object-cover" />
        <div>
          <h2 className="text-2xl font-bold text-white">{client.name}</h2>
          <div className="flex items-center space-x-2 text-zinc-400 text-sm">
            <span>{client.goal}</span>
            <span className="w-1 h-1 bg-zinc-600 rounded-full"></span>
            <span className={client.status === 'active' ? 'text-green-500' : 'text-zinc-500'}>
              {client.status === 'active' ? 'Activo' : 'Inactivo'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress Chart */}
        <div className="lg:col-span-2 bg-mvp-lightgray rounded-2xl p-6 border border-zinc-800">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center">
            <Activity className="mr-2 text-mvp-gold" size={20} />
            Progreso de Peso (kg)
          </h3>
          <div className="h-64 w-full">
            {client.progress && client.progress.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={client.progress}>
                    <defs>
                    <linearGradient id="colorWeight" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                    </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="date" stroke="#71717a" tick={{fontSize: 12}} />
                    <YAxis stroke="#71717a" domain={['auto', 'auto']} tick={{fontSize: 12}} />
                    <Tooltip 
                    contentStyle={{ backgroundColor: '#18181b', border: '1px solid #3f3f46', borderRadius: '8px' }}
                    itemStyle={{ color: '#f59e0b' }}
                    />
                    <Area type="monotone" dataKey="weight" stroke="#f59e0b" fillOpacity={1} fill="url(#colorWeight)" />
                </AreaChart>
                </ResponsiveContainer>
            ) : (
                <div className="h-full flex items-center justify-center text-zinc-500 text-sm">
                    Sin datos de progreso aún.
                </div>
            )}
          </div>
        </div>

        {/* Routines List */}
        <div className="bg-mvp-lightgray rounded-2xl p-6 border border-zinc-800 flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-white flex items-center">
              <Dumbbell className="mr-2 text-mvp-orange" size={20} />
              Rutinas
            </h3>
            <button 
              onClick={() => onAddRoutine(client)}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-1.5 rounded-full transition-colors flex items-center"
            >
              <Plus size={14} className="mr-1" /> Nueva
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar h-64">
            {!client.routines || client.routines.length === 0 ? (
              <div className="text-center text-zinc-500 py-8">
                <p>No hay rutinas asignadas.</p>
                <p className="text-xs mt-1">Usa la IA para generar una.</p>
              </div>
            ) : (
              client.routines.map(routine => (
                <div key={routine.id} className="bg-zinc-900/50 p-4 rounded-xl border border-zinc-800 hover:border-mvp-gold/50 transition-colors cursor-pointer">
                  <h4 className="font-semibold text-white">{routine.name}</h4>
                  <p className="text-xs text-zinc-400 mt-1 line-clamp-1">{routine.description}</p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {routine.tags.map(tag => (
                      <span key={tag} className="text-[10px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded-md">{tag}</span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// 4. Routine Generator
const RoutineGenerator = ({ client, onClose, onSave }: { client: Client, onClose: () => void, onSave: (r: Routine) => void }) => {
  const [goal, setGoal] = useState(client.goal);
  const [fitnessLevel, setFitnessLevel] = useState('Intermedio');
  const [equipment, setEquipment] = useState('Gimnasio Completo');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedRoutine, setGeneratedRoutine] = useState<Partial<Routine> | null>(null);

  const handleGenerate = async () => {
    setIsGenerating(true);
    const result = await generateWorkoutRoutine(goal, fitnessLevel, equipment);
    setGeneratedRoutine(result);
    setIsGenerating(false);
  };

  const handleSave = () => {
    if (generatedRoutine) {
      const newRoutine: Routine = {
        id: Math.random().toString(36).substr(2, 9),
        name: generatedRoutine.name || 'Rutina Personalizada',
        description: generatedRoutine.description || '',
        exercises: generatedRoutine.exercises || [],
        tags: generatedRoutine.tags || [],
      };
      onSave(newRoutine);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-mvp-lightgray w-full max-w-2xl rounded-3xl border border-zinc-700 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-zinc-700 flex justify-between items-center bg-zinc-900">
          <h3 className="text-xl font-bold text-white flex items-center">
            <Sparkles className="mr-2 text-mvp-gold" /> Constructor de Rutinas IA
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full transition-colors">
            <X size={20} className="text-zinc-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
          {!generatedRoutine ? (
            <div className="space-y-4">
               <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Objetivo Principal</label>
                <input 
                  type="text" 
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-mvp-gold"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Nivel de Condición Física</label>
                  <select 
                    value={fitnessLevel}
                    onChange={(e) => setFitnessLevel(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-mvp-gold"
                  >
                    <option value="Principiante">Principiante</option>
                    <option value="Intermedio">Intermedio</option>
                    <option value="Avanzado">Avanzado</option>
                    <option value="Atleta">Atleta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">Equipamiento</label>
                  <select 
                    value={equipment}
                    onChange={(e) => setEquipment(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-mvp-gold"
                  >
                    <option value="Gimnasio Completo">Gimnasio Completo</option>
                    <option value="Solo Mancuernas">Solo Mancuernas</option>
                    <option value="Peso Corporal">Peso Corporal</option>
                    <option value="Gimnasio en Casa">Gimnasio en Casa</option>
                  </select>
                </div>
              </div>

              <div className="bg-mvp-gold/10 border border-mvp-gold/20 p-4 rounded-xl mt-4">
                <p className="text-sm text-mvp-gold flex items-center">
                  <TrendingUp size={16} className="mr-2" />
                  Gemini AI analizará las necesidades de tu cliente y creará un programa equilibrado.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4 animate-fadeIn">
              <div className="bg-zinc-900 p-4 rounded-xl border border-zinc-800">
                <h4 className="text-xl font-bold text-white mb-2">{generatedRoutine.name}</h4>
                <p className="text-zinc-400 text-sm mb-4">{generatedRoutine.description}</p>
                <div className="flex flex-wrap gap-2 mb-4">
                   {generatedRoutine.tags?.map(t => <span key={t} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-1 rounded">{t}</span>)}
                </div>
                <div className="space-y-2">
                  {generatedRoutine.exercises?.map((ex, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-zinc-800/50 p-3 rounded-lg border border-zinc-700/50">
                      <div>
                        <p className="font-semibold text-white">{ex.name}</p>
                        <p className="text-xs text-zinc-500">{ex.notes}</p>
                      </div>
                      <div className="text-right text-sm text-mvp-gold">
                        <p>{ex.sets} series</p>
                        <p>{ex.reps} reps</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-zinc-700 bg-zinc-900">
          {!generatedRoutine ? (
            <button 
              onClick={handleGenerate}
              disabled={isGenerating}
              className="w-full bg-gradient-to-r from-mvp-gold to-mvp-orange text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-orange-500/20 transition-all flex justify-center items-center"
            >
              {isGenerating ? (
                <span className="animate-pulse">Analizando Perfil...</span>
              ) : (
                <>
                  <Sparkles size={18} className="mr-2" /> Generar Rutina
                </>
              )}
            </button>
          ) : (
            <div className="flex space-x-4">
              <button 
                onClick={() => setGeneratedRoutine(null)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl transition-colors"
              >
                Descartar
              </button>
              <button 
                onClick={handleSave}
                className="flex-1 bg-gradient-to-r from-mvp-gold to-mvp-orange text-white font-bold py-3 rounded-xl shadow-lg transition-all"
              >
                Guardar y Asignar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// 5. Subscription Modal
const ProModal = ({ onClose, onUpgrade }: { onClose: () => void, onUpgrade: () => void }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fadeIn">
    <div className="bg-gradient-to-br from-zinc-900 to-zinc-950 w-full max-w-md rounded-3xl border border-mvp-gold/30 shadow-2xl overflow-hidden relative">
      <div className="absolute top-0 w-full h-1 bg-gradient-to-r from-transparent via-mvp-gold to-transparent"></div>
      
      <div className="p-8 text-center">
        <div className="w-16 h-16 bg-mvp-gold/20 rounded-full flex items-center justify-center mx-auto mb-6">
          <Crown size={32} className="text-mvp-gold" />
        </div>
        
        <h2 className="text-3xl font-extrabold text-white mb-2">Hazte PRO</h2>
        <p className="text-zinc-400 mb-8">Desbloquea todo el potencial de MVP Trainer.</p>
        
        <div className="space-y-4 mb-8 text-left">
          <div className="flex items-center text-zinc-300">
            <CheckCircle2 size={20} className="text-mvp-gold mr-3" />
            <span>Clientes Ilimitados</span>
          </div>
          <div className="flex items-center text-zinc-300">
            <CheckCircle2 size={20} className="text-mvp-gold mr-3" />
            <span>Analíticas Avanzadas</span>
          </div>
          <div className="flex items-center text-zinc-300">
            <CheckCircle2 size={20} className="text-mvp-gold mr-3" />
            <span>Generación IA Prioritaria</span>
          </div>
          <div className="flex items-center text-zinc-300">
            <CheckCircle2 size={20} className="text-mvp-gold mr-3" />
            <span>Marca Personalizada</span>
          </div>
        </div>

        <button 
          onClick={onUpgrade}
          className="w-full bg-gradient-to-r from-mvp-gold to-mvp-orange text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-orange-500/30 transition-all transform hover:scale-[1.02] mb-4"
        >
          Suscribirse - $29.99/mes
        </button>
        
        <button onClick={onClose} className="text-zinc-500 text-sm hover:text-white transition-colors">
          No gracias, seguiré con el plan básico.
        </button>
      </div>
    </div>
  </div>
);

// --- MAIN APP ---
export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'clients' | 'settings'>('dashboard');
  const [showProModal, setShowProModal] = useState(false);
  const [showRoutineBuilder, setShowRoutineBuilder] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // --- FIREBASE LISTENERS ---
  
  // 1. Auth Listener
  useEffect(() => {
    if (!auth) {
        setIsAuthChecking(false);
        return;
    }
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || 'Entrenador',
          isPro: false, // Default. In real app, fetch this from 'users' collection
          photoURL: firebaseUser.photoURL || undefined
        });
      } else {
        setUser(null);
      }
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Clients Listener (Firestore)
  useEffect(() => {
    if (!user || !db) {
        setClients([]); // Clear clients if logged out
        return;
    }

    const q = query(collection(db, 'clients'), where('trainerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedClients: Client[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Client));
      setClients(fetchedClients);
    }, (error) => {
        console.error("Error fetching clients:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Stats
  const activeClients = clients.filter(c => c.status === 'active').length;
  const clientLimit = user?.isPro ? 9999 : 5;
  
  // Navigation Handler
  const NavItem = ({ view, icon: Icon, label }: { view: string, icon: any, label: string }) => (
    <button 
      onClick={() => {
        setCurrentView(view as any);
        setSelectedClient(null);
        setIsMobileMenuOpen(false);
      }}
      className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all ${
        currentView === view && !selectedClient
          ? 'bg-mvp-gold text-white font-bold shadow-lg shadow-amber-500/20' 
          : 'text-zinc-400 hover:bg-zinc-900 hover:text-white'
      }`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );

  const handleAddClient = async () => {
    if (!user || !db) return;
    if (clients.length >= clientLimit) {
      setShowProModal(true);
      return;
    }

    try {
      const newClientData = {
        name: 'Nuevo Cliente',
        email: 'cliente@ejemplo.com',
        status: 'active',
        goal: 'Fitness General',
        joinedAt: new Date().toISOString().split('T')[0],
        avatarUrl: `https://picsum.photos/200/200?random=${Date.now()}`,
        progress: [],
        routines: [],
        trainerId: user.uid,
        createdAt: serverTimestamp()
      };
      
      await addDoc(collection(db, 'clients'), newClientData);
      // Listener will update UI automatically
    } catch (e) {
      console.error("Error adding client", e);
      alert("Error creando cliente. Verifica tu conexión.");
    }
  };

  const handleRoutineSave = async (routine: Routine) => {
    if (selectedClient && db) {
      try {
        const clientRef = doc(db, 'clients', selectedClient.id);
        const updatedRoutines = [routine, ...(selectedClient.routines || [])];
        
        await updateDoc(clientRef, {
            routines: updatedRoutines
        });
        
        // Optimistic update for selected view
        setSelectedClient({
            ...selectedClient,
            routines: updatedRoutines
        });
      } catch (e) {
        console.error("Error saving routine", e);
      }
    }
  };

  const handleLogout = async () => {
    if (auth) await signOut(auth);
  };

  if (isAuthChecking) {
    return (
        <div className="min-h-screen bg-mvp-black flex items-center justify-center text-mvp-gold">
            <Loader2 className="animate-spin w-12 h-12" />
        </div>
    );
  }

  if (!user) {
    return <AuthView onLogin={() => {}} />;
  }

  // Helper for view titles
  const getViewTitle = (view: string) => {
    switch(view) {
      case 'dashboard': return 'Panel';
      case 'clients': return 'Clientes';
      case 'settings': return 'Ajustes';
      default: return view;
    }
  };

  return (
    <div className="flex h-screen bg-mvp-black overflow-hidden selection:bg-mvp-gold selection:text-white">
      {/* Sidebar (Desktop) */}
      <aside className="hidden md:flex w-64 flex-col bg-mvp-black border-r border-zinc-900 p-6">
        <div className="mb-10 flex items-center space-x-2">
           <div className="w-8 h-8 bg-gradient-to-br from-mvp-gold to-mvp-orange rounded-lg flex items-center justify-center font-bold text-white">M</div>
           <span className="text-xl font-extrabold tracking-tight text-white">MVP<span className="text-mvp-gold">TRAINER</span></span>
        </div>
        
        <nav className="flex-1 space-y-2">
          <NavItem view="dashboard" icon={Activity} label="Panel" />
          <NavItem view="clients" icon={Users} label="Clientes" />
          <NavItem view="settings" icon={Settings} label="Ajustes" />
        </nav>

        {!user.isPro && (
          <div className="bg-zinc-900 rounded-2xl p-4 mb-6 border border-zinc-800">
            <div className="flex justify-between text-sm mb-2 text-zinc-400">
              <span>Clientes</span>
              <span>{activeClients} / {clientLimit}</span>
            </div>
            <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-mvp-gold h-full rounded-full transition-all duration-500" 
                style={{ width: `${(activeClients / clientLimit) * 100}%` }}
              ></div>
            </div>
            <button 
              onClick={() => setShowProModal(true)}
              className="mt-4 w-full py-2 bg-gradient-to-r from-zinc-800 to-zinc-700 hover:from-mvp-gold hover:to-mvp-orange text-white text-xs font-bold rounded-lg transition-all"
            >
              Mejorar a PRO
            </button>
          </div>
        )}

        <button 
          onClick={handleLogout}
          className="flex items-center space-x-3 px-4 py-3 text-zinc-500 hover:text-red-500 transition-colors"
        >
          <LogOut size={20} />
          <span>Cerrar Sesión</span>
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-mvp-black border-b border-zinc-900">
           <div className="flex items-center space-x-2">
             <div className="w-8 h-8 bg-gradient-to-br from-mvp-gold to-mvp-orange rounded-lg flex items-center justify-center font-bold text-white">M</div>
           </div>
           <button onClick={() => setIsMobileMenuOpen(true)} className="text-white">
             <Menu size={24} />
           </button>
        </header>

        {/* Mobile Menu Overlay */}
        {isMobileMenuOpen && (
          <div className="absolute inset-0 z-50 bg-mvp-black/95 p-6 flex flex-col animate-fadeIn md:hidden">
            <div className="flex justify-end mb-8">
              <button onClick={() => setIsMobileMenuOpen(false)}><X size={24} className="text-white"/></button>
            </div>
            <nav className="space-y-4 text-lg">
              <NavItem view="dashboard" icon={Activity} label="Panel" />
              <NavItem view="clients" icon={Users} label="Clientes" />
              <NavItem view="settings" icon={Settings} label="Ajustes" />
              <button onClick={handleLogout} className="flex items-center space-x-3 text-red-500 pt-4">
                  <LogOut size={20} /> <span>Cerrar Sesión</span>
              </button>
            </nav>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 lg:p-10 scroll-smooth">
          {/* Header Area */}
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-white">
              {selectedClient ? 'Perfil del Cliente' : getViewTitle(currentView)}
            </h1>
            <div className="flex items-center space-x-4">
              <div className="hidden md:flex items-center space-x-2 bg-zinc-900 px-4 py-2 rounded-full border border-zinc-800">
                <Search size={16} className="text-zinc-500" />
                <input placeholder="Buscar..." className="bg-transparent border-none focus:outline-none text-sm text-white w-32 lg:w-48" />
              </div>
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-mvp-gold to-mvp-orange flex items-center justify-center font-bold text-white cursor-pointer shadow-lg shadow-orange-500/20">
                {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
              </div>
            </div>
          </div>

          {/* VIEW SWITCHER */}
          {selectedClient ? (
            <ClientDetail 
              client={selectedClient} 
              onBack={() => setSelectedClient(null)} 
              onAddRoutine={() => setShowRoutineBuilder(true)}
            />
          ) : (
            <>
              {currentView === 'dashboard' && (
                <div className="space-y-8 animate-slideUp">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <StatCard label="Clientes Activos" value={activeClients} icon={Users} trend="" />
                    <StatCard label="Entrenamientos Completados" value="0" icon={CheckCircle2} />
                    <StatCard label="Ingresos Mensuales" value="$0" icon={TrendingUp} />
                    <StatCard label="Planes Pendientes" value="0" icon={Calendar} />
                  </div>

                  <div className="bg-mvp-lightgray rounded-3xl p-8 border border-zinc-800 text-center py-12">
                     <p className="text-zinc-500">No hay actividad reciente.</p>
                     <button onClick={() => setCurrentView('clients')} className="text-mvp-gold mt-2 hover:underline">
                         Empieza añadiendo clientes
                     </button>
                  </div>
                </div>
              )}

              {currentView === 'clients' && (
                <div className="animate-slideUp">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <button 
                      onClick={handleAddClient}
                      className="flex flex-col items-center justify-center h-48 rounded-2xl border-2 border-dashed border-zinc-800 hover:border-mvp-gold hover:bg-zinc-900/50 transition-all group"
                    >
                      <div className="w-12 h-12 rounded-full bg-zinc-800 flex items-center justify-center mb-3 group-hover:bg-mvp-gold group-hover:text-white transition-colors">
                        <Plus size={24} className="text-zinc-400 group-hover:text-white" />
                      </div>
                      <span className="text-zinc-400 font-medium group-hover:text-white">Añadir Nuevo Cliente</span>
                    </button>

                    {clients.map(client => (
                      <div 
                        key={client.id} 
                        onClick={() => setSelectedClient(client)}
                        className="bg-mvp-lightgray p-6 rounded-2xl border border-zinc-800 hover:border-mvp-gold/50 transition-all cursor-pointer group relative overflow-hidden"
                      >
                         <div className="absolute top-0 left-0 w-1 h-full bg-mvp-gold opacity-0 group-hover:opacity-100 transition-opacity"></div>
                         <div className="flex items-center space-x-4 mb-4">
                           <img src={client.avatarUrl} alt={client.name} className="w-14 h-14 rounded-full border border-zinc-700 object-cover" />
                           <div>
                             <h3 className="text-white font-bold text-lg">{client.name}</h3>
                             <p className="text-zinc-500 text-sm">{client.email}</p>
                           </div>
                         </div>
                         <div className="flex justify-between items-center text-sm">
                           <span className="bg-zinc-900 text-zinc-300 px-3 py-1 rounded-full">{client.goal}</span>
                           <span className={`flex items-center ${client.status === 'active' ? 'text-green-500' : 'text-red-500'}`}>
                             <span className={`w-2 h-2 rounded-full mr-2 ${client.status === 'active' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                             {client.status === 'active' ? 'Activo' : 'Inactivo'}
                           </span>
                         </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {currentView === 'settings' && (
                <div className="bg-mvp-lightgray rounded-3xl p-8 border border-zinc-800 max-w-2xl animate-slideUp">
                  <h2 className="text-2xl font-bold text-white mb-6">Ajustes de Cuenta</h2>
                  
                  <div className="space-y-6">
                    <div className="flex items-center justify-between pb-6 border-b border-zinc-800">
                      <div>
                        <p className="text-white font-medium">Plan de Suscripción</p>
                        <p className="text-zinc-500 text-sm">{user.isPro ? 'MVP PRO' : 'Inicio Gratuito'}</p>
                      </div>
                      {user.isPro ? (
                        <span className="bg-mvp-gold text-black font-bold px-4 py-2 rounded-lg text-sm">Activo</span>
                      ) : (
                        <button onClick={() => setShowProModal(true)} className="text-mvp-gold hover:underline text-sm font-bold">Mejorar</button>
                      )}
                    </div>

                    <div className="flex items-center justify-between pb-6 border-b border-zinc-800">
                      <div>
                        <p className="text-white font-medium">Correo</p>
                        <p className="text-zinc-500 text-sm">{user.email}</p>
                      </div>
                    </div>

                    <div className="pt-2">
                       <p className="text-zinc-600 text-xs">Versión 1.0.0 (Web PWA)</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* MODALS */}
      {showProModal && <ProModal onClose={() => setShowProModal(false)} onUpgrade={() => { /* In real app, call RevenueCat here */ setShowProModal(false); }} />}
      {showRoutineBuilder && selectedClient && (
        <RoutineGenerator 
          client={selectedClient} 
          onClose={() => setShowRoutineBuilder(false)} 
          onSave={handleRoutineSave} 
        />
      )}
    </div>
  );
}