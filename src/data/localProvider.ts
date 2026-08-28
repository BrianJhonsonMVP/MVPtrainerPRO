
import { IDBProvider } from './dbInterface';
import { Client, User } from '../types';
import { getWeekStartISO } from '../services/subscriptionLogic';

const KEYS = {
  USERS: 'mvp_local_users',
  SESSION: 'mvp_local_session'
};

const getStorage = (key: string) => JSON.parse(localStorage.getItem(key) || '[]');
const setStorage = (key: string, data: any) => localStorage.setItem(key, JSON.stringify(data));

export const localProvider: IDBProvider = {
  name: 'Local Demo',

  async signUp(email, pass, options) {
    const users = getStorage(KEYS.USERS);
    const newUser = {
      uid: `local_${Date.now()}`,
      email,
      displayName: options?.displayName || email.split('@')[0],
      createdAt: new Date().toISOString(),
      subscription: {
        type: 'trial',
        isActive: true,
        usage: { weekStart: getWeekStartISO(new Date()), aiRoutinesByClient: {}, aiDietsByClient: {} }
      }
    };
    users.push(newUser);
    setStorage(KEYS.USERS, users);
    localStorage.setItem(KEYS.SESSION, newUser.uid);
    return { user: newUser };
  },

  async signIn(email, pass) {
    const users = getStorage(KEYS.USERS);
    const user = users.find((u: any) => u.email === email);
    if (!user) throw new Error("Usuario local no encontrado");
    localStorage.setItem(KEYS.SESSION, user.uid);
    return { user };
  },

  async signOut() {
    localStorage.removeItem(KEYS.SESSION);
  },

  async getCurrentUser(forceFresh?: boolean) {
    const uid = localStorage.getItem(KEYS.SESSION);
    if (!uid) return null;
    const users = getStorage(KEYS.USERS);
    return users.find((u: any) => u.uid === uid) || null;
  },

  onAuthStateChanged(callback) {
    const check = () => {
      const uid = localStorage.getItem(KEYS.SESSION);
      if (uid) {
        const users = getStorage(KEYS.USERS);
        callback(users.find((u: any) => u.uid === uid) || null, 'SIGNED_IN');
      } else {
        callback(null, 'SIGNED_OUT');
      }
    };
    
    check();
    window.addEventListener('storage', check);
    return () => window.removeEventListener('storage', check);
  },

  async updateUser(uid, data) {
    const users = getStorage(KEYS.USERS);
    const idx = users.findIndex((u: any) => u.uid === uid);
    if (idx !== -1) {
      users[idx] = { ...users[idx], ...data };
      setStorage(KEYS.USERS, users);
      return users[idx];
    }
    return null;
  },

  async getProfile(uid) {
    const users = getStorage(KEYS.USERS);
    const user = users.find((u: any) => u.uid === uid);
    if (!user) return null;
    return {
        uid: user.uid,
        displayName: user.displayName,
        branding: user.branding,
        publicProfile: user.publicProfile
    };
  },

  async getClients(trainerId) { return []; },
  subscribeToClients(trainerId, callback, onStatus) { return () => {}; },
  async createClient(trainerId, data) { throw new Error("Not implemented"); },
  async updateClient(clientId, data) { throw new Error("Not implemented"); },
  async deleteClient(clientId) { throw new Error("Not implemented"); },
  async getBillingRecords(trainerId: string) { return []; },
  async archiveRoutine(routineId: string) { },
  async archiveDiet(dietId: string) { },
  async saveRoutine(trainerId: string, clientId: string, routine: any) { },
  async saveDiet(trainerId: string, clientId: string, diet: any) { },
  async getRoutines(clientId: string) { return []; },
  async getDiet(clientId: string) { return null; },
  async getDiets(clientId: string) { return []; },

  async getOrCreateTrainerUsage(trainerId: string) {
    const key = `local_trainer_usage_${trainerId}`;
    const usage = localStorage.getItem(key);
    if (usage) {
      try { return JSON.parse(usage); } catch { /* ignore */ }
    }
    const fallback = {
      trainer_id: trainerId,
      clients_created_total: 0,
      ai_routines_generated_total: 0,
      ai_diets_generated_total: 0
    };
    localStorage.setItem(key, JSON.stringify(fallback));
    return fallback;
  },

  async incrementTrainerUsage(trainerId: string, type: 'clients' | 'routines' | 'diets') {
    const current = await this.getOrCreateTrainerUsage(trainerId);
    if (type === 'clients') {
      current.clients_created_total = (current.clients_created_total || 0) + 1;
    } else if (type === 'routines') {
      current.ai_routines_generated_total = (current.ai_routines_generated_total || 0) + 1;
    } else if (type === 'diets') {
      current.ai_diets_generated_total = (current.ai_diets_generated_total || 0) + 1;
    }
    current.updated_at = new Date().toISOString();
    const key = `local_trainer_usage_${trainerId}`;
    localStorage.setItem(key, JSON.stringify(current));
    return current;
  },

  async getTotalRoutinesCount(trainerId: string) {
    return 0;
  },

  async getTotalDietsCount(trainerId: string) {
    return 0;
  }
};
