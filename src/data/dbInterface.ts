
import { BillingRecord, Client, User, Routine, DietPlan } from '../types';

export interface IDBProvider {
  name: string;
  // Auth
  signUp: (email: string, pass: string, options?: { displayName?: string }) => Promise<any>;
  signIn: (email: string, pass: string) => Promise<any>;
  signOut: () => Promise<void>;
  getCurrentUser: (forceFresh?: boolean) => Promise<User | null>;
  onAuthStateChanged: (callback: (user: User | null, event?: string) => void) => () => void;
  
  // Clients
  getClients: (trainerId: string) => Promise<Client[]>;
  subscribeToClients: (trainerId: string, callback: (clients: Client[]) => void, onStatus?: (status: string) => void) => () => void;
  subscribeToBillingRecords: (trainerId: string, callback: (records: BillingRecord[]) => void) => () => void;
  createClient: (trainerId: string, data: any) => Promise<Client & { updatedUsage?: any }>;
  updateClient: (clientId: string, data: any) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  getBillingRecords: (trainerId: string) => Promise<BillingRecord[]>;
  archiveRoutine: (routineId: string) => Promise<void>;
  archiveDiet: (dietId: string) => Promise<void>;
  
  // User Profile
  updateUser: (userId: string, data: any) => Promise<any>;
  getProfile: (trainerId: string) => Promise<any>;
  
  // Assets
  // Routines & Diets
  saveRoutine: (trainerId: string, clientId: string, routine: Routine) => Promise<any>;
  saveDiet: (trainerId: string, clientId: string, diet: DietPlan) => Promise<any>;
  getRoutines: (clientId: string) => Promise<Routine[]>;
  getDiet: (clientId: string) => Promise<DietPlan | null>;
  getDiets: (clientId: string) => Promise<DietPlan[]>;

  // Trainer Usage
  getOrCreateTrainerUsage: (trainerId: string) => Promise<any>;
  incrementTrainerUsage: (trainerId: string, type: 'clients' | 'routines' | 'diets') => Promise<any>;
  getTotalRoutinesCount: (trainerId: string) => Promise<number>;
  getTotalDietsCount: (trainerId: string) => Promise<number>;
}
