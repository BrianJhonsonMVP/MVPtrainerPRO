
import { Client, User, UserSubscription, PlanInterval } from "../types";
import { getWeekStartISO } from "./subscriptionLogic";

// --- PERSISTENCE LAYER (Simulating Firestore) ---
const STORAGE_KEYS = {
  USERS: 'mvp_v2_users_collection',
  CLIENTS: 'mvp_v2_clients_collection',
  SESSION: 'mvp_v2_auth_uid'
};

// --- MOCK FIREBASE INSTANCES ---
export const auth = { currentUser: null as User | null };
export const db = { type: "firestore-v2-mock" };

// --- HELPERS ---
// Robust JSON parsing to avoid Black Screen of Death
const getStorage = (key: string) => {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : [];
    } catch (e) {
        console.error(`Error parsing storage key ${key}`, e);
        return [];
    }
};

const setStorage = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

const getInitialSubscription = (): UserSubscription => {
  const now = new Date();
  const trialEnd = new Date(now);
  trialEnd.setDate(trialEnd.getDate() + 15); // 15 días Trial
  const weekStart = getWeekStartISO(now);

  return {
    type: 'trial',
    isActive: true,
    trialEndsAt: trialEnd.toISOString(),
    expiresAt: null,
    usage: {
      weekStart: weekStart,
      aiRoutinesByClient: {},
      aiDietsByClient: {},
      // Legacy fields initialized
      routinesGenerated: 0,
      dietsGenerated: 0,
      lastReset: now.toISOString()
    }
  };
};

// --- AUTH SERVICES ---

export const signUp = async (email: string, password: string) => {
  const users = getStorage(STORAGE_KEYS.USERS);
  const existing = users.find((u: User) => u.email === email);
  if (existing) throw { code: 'auth/email-already-in-use' };

  const newUser: User = {
    uid: `user_${Date.now()}`,
    email,
    displayName: email.split('@')[0],
    createdAt: new Date().toISOString(),
    subscription: getInitialSubscription()
  };

  users.push(newUser);
  setStorage(STORAGE_KEYS.USERS, users);
  
  // Auto login
  localStorage.setItem(STORAGE_KEYS.SESSION, newUser.uid);
  auth.currentUser = newUser;
  return { user: newUser };
};

export const signIn = async (email: string, password: string) => {
  const users = getStorage(STORAGE_KEYS.USERS);
  const user = users.find((u: User) => u.email === email);
  
  if (!user) throw { code: 'auth/invalid-credential' };
  
  // Password check mocked
  localStorage.setItem(STORAGE_KEYS.SESSION, user.uid);
  auth.currentUser = user;
  return { user };
};

export const signOutUser = async () => {
  localStorage.removeItem(STORAGE_KEYS.SESSION);
  auth.currentUser = null;
};

export const onAuthStateChanged = (authInstance: any, callback: (user: User | null) => void) => {
  // Check session on mount
  const uid = localStorage.getItem(STORAGE_KEYS.SESSION);
  if (uid) {
    const users = getStorage(STORAGE_KEYS.USERS);
    let user = users.find((u: User) => u.uid === uid);
    
    // MIGRATION V1 -> V2 logic
    if (user && !user.subscription) {
        // Migrar usuario antiguo
        user = { ...user, subscription: getInitialSubscription() };
        // Guardar la migración
        const index = users.findIndex((u: User) => u.uid === uid);
        users[index] = user;
        setStorage(STORAGE_KEYS.USERS, users);
    }
    
    // MIGRATION V2 -> V2.1 (Add new usage fields if missing)
    if (user && user.subscription && user.subscription.usage && !user.subscription.usage.aiRoutinesByClient) {
         const weekStart = getWeekStartISO(new Date());
         user.subscription.usage.weekStart = weekStart;
         user.subscription.usage.aiRoutinesByClient = {};
         user.subscription.usage.aiDietsByClient = {};
         const index = users.findIndex((u: User) => u.uid === uid);
         users[index] = user;
         setStorage(STORAGE_KEYS.USERS, users);
    }

    if (user) {
        authInstance.currentUser = user;
        callback(user);
    } else {
        callback(null);
    }
  } else {
    callback(null);
  }

  // Listener simple para cambios en localStorage (logout en otra tab)
  const listener = () => {
     const currentUid = localStorage.getItem(STORAGE_KEYS.SESSION);
     if (!currentUid) {
         authInstance.currentUser = null;
         callback(null);
     }
  };
  window.addEventListener('storage', listener);
  return () => window.removeEventListener('storage', listener);
};

// --- USER SERVICES ---

export const updateUserDoc = async (uid: string, data: Partial<User>) => {
  const users = getStorage(STORAGE_KEYS.USERS);
  const index = users.findIndex((u: User) => u.uid === uid);
  
  if (index !== -1) {
    const updatedUser = { 
        ...users[index], 
        ...data,
        // Deep merge subscription to avoid overwriting nested objects if partial
        subscription: data.subscription 
            ? { ...users[index].subscription, ...data.subscription } 
            : users[index].subscription
    };
    
    users[index] = updatedUser;
    setStorage(STORAGE_KEYS.USERS, users);
    
    // Update current session if matches
    if (auth.currentUser && auth.currentUser.uid === uid) {
        auth.currentUser = updatedUser;
    }
    return updatedUser;
  }
};

export const getTrainerProfileById = async (trainerId: string): Promise<Partial<User> | null> => {
    const users = getStorage(STORAGE_KEYS.USERS);
    const trainer = users.find((u: User) => u.uid === trainerId);
    
    if (!trainer) return null;

    // Retornar solo lo seguro para vista pública
    return {
        uid: trainer.uid,
        displayName: trainer.displayName,
        photoURL: trainer.photoURL,
        branding: trainer.branding,
        publicProfile: trainer.publicProfile
    };
};

export const markUserAsPro = async (uid: string, interval: PlanInterval = 'monthly'): Promise<User> => {
    const now = new Date();
    const expiryDate = new Date(now);

    // Calcular expiración según plan
    if (interval === 'monthly') {
        expiryDate.setMonth(expiryDate.getMonth() + 1);
    } else if (interval === 'semiannual') {
        expiryDate.setMonth(expiryDate.getMonth() + 6);
    } else if (interval === 'yearly') {
        expiryDate.setFullYear(expiryDate.getFullYear() + 1);
    }

    const proSubscription: Partial<UserSubscription> = {
        type: 'pro',
        isActive: true,
        expiresAt: expiryDate.toISOString(),
        upgradedAt: now.toISOString(),
        planInterval: interval,
    };

    const updated = await updateUserDoc(uid, { subscription: proSubscription as any });
    return updated!;
};

// --- CLIENT SERVICES ---

export const subscribeToClients = (trainerId: string, callback: (clients: Client[]) => void) => {
    // Initial fetch
    const fetch = () => {
        const allClients = getStorage(STORAGE_KEYS.CLIENTS);
        const myClients = allClients.filter((c: Client) => c.trainerId === trainerId);
        // Data healing for old clients
        const healedClients = myClients.map((c: Client) => ({
            ...c,
            paymentInfo: c.paymentInfo || { monthlyFee: 0, paymentMethod: 'efectivo', status: 'sin_registro' },
            routines: c.routines || [],
            country: c.country || 'Perú'
        }));
        callback(healedClients);
    };

    fetch();
    
    // Polling simulation for realtime updates
    const interval = setInterval(fetch, 1000);
    return () => clearInterval(interval);
};

export const createClient = async (trainerId: string, data: Partial<Client>) => {
    const allClients = getStorage(STORAGE_KEYS.CLIENTS);
    
    // Extraer objetivos para determinar el principal
    const clientGoals = data.goals || [];
    const mainGoalComputed = clientGoals.length > 0 ? clientGoals[0] : (data.mainGoal || 'Salud general');

    const newClient: Client = {
        id: `client_${Date.now()}`,
        trainerId,
        
        // Datos Personales
        name: data.name || 'Sin Nombre',
        email: data.email,
        phone: data.phone,
        gender: data.gender || 'male',
        age: data.age || null,
        country: data.country ?? 'Perú', // Default a Perú si no hay país
        avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(data.name || 'User')}&background=random`,

        // Datos Físicos
        weight: data.weight || null,
        height: data.height || null,
        experienceLevel: data.experienceLevel || 'beginner',

        // Objetivos
        mainGoal: mainGoalComputed,
        goals: clientGoals,
        // Fixed: removed non-existent secondaryGoals

        // Agenda
        trainingDays: data.trainingDays || [],
        trainingTime: data.trainingTime || null,
        // Fixed: removed non-existent schedule
        
        // Pagos
        paymentInfo: data.paymentInfo || {
            monthlyFee: 0,
            paymentMethod: 'efectivo',
            status: 'sin_registro',
            lastPaidAt: null,
            nextPaymentAt: null
        },
        
        status: 'active',
        createdAt: new Date().toISOString(),
        routines: [],
        dietPlan: undefined
    };

    allClients.push(newClient);
    setStorage(STORAGE_KEYS.CLIENTS, allClients);
    return newClient;
};

export const updateDoc = async (docRef: any, data: Partial<Client>) => {
    // docRef simulado { path: 'clients/id', id: 'id' }
    const clientId = docRef.id;
    const allClients = getStorage(STORAGE_KEYS.CLIENTS);
    const index = allClients.findIndex((c: Client) => c.id === clientId);

    if (index !== -1) {
        allClients[index] = { ...allClients[index], ...data };
        setStorage(STORAGE_KEYS.CLIENTS, allClients);
    }
};

export const deleteClient = async (clientId: string) => {
    const allClients = getStorage(STORAGE_KEYS.CLIENTS);
    const filtered = allClients.filter((c: Client) => c.id !== clientId);
    setStorage(STORAGE_KEYS.CLIENTS, filtered);
};

// --- UTILS COMPATIBILITY ---
export const doc = (db: any, col: string, id: string) => ({ path: `${col}/${id}`, id });
export const collection = (db: any, path: string) => ({ path });
export const addDoc = (col: any, data: any) => { /* Covered by createClient */ };

export const requestNotificationPermission = async () => {
    if ('Notification' in window) {
        const p = await Notification.requestPermission();
        return p === 'granted';
    }
    return false;
};
