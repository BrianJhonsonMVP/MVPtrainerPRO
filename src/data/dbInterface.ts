
import { Client, User, Routine, DietPlan } from '../types';

export interface IDBProvider {
  name: string;
  // Auth
  signUp: (email: string, pass: string) => Promise<any>;
  signIn: (email: string, pass: string) => Promise<any>;
  signOut: () => Promise<void>;
  getCurrentUser: (forceFresh?: boolean) => Promise<User | null>;
  onAuthStateChanged: (callback: (user: User | null, event?: string) => void) => () => void;
  
  // Clients
  getClients: (trainerId: string) => Promise<Client[]>;
  subscribeToClients: (trainerId: string, callback: (clients: Client[]) => void, onStatus?: (status: string) => void) => () => void;
  createClient: (trainerId: string, data: any) => Promise<Client>;
  updateClient: (clientId: string, data: any) => Promise<void>;
  deleteClient: (clientId: string) => Promise<void>;
  archiveRoutine: (routineId: string) => Promise<void>;
  archiveDiet: (dietId: string) => Promise<void>;
  
  // User Profile
  updateUser: (userId: string, data: any) => Promise<any>;
  getProfile: (trainerId: string) => Promise<any>;
  
  // Assets
  // Routines & Diets
  saveRoutine: (trainerId: string, clientId: string, routine: Routine) => Promise<void>;
  saveDiet: (trainerId: string, clientId: string, diet: DietPlan) => Promise<void>;
  getRoutines: (clientId: string) => Promise<Routine[]>;
  getDiet: (clientId: string) => Promise<DietPlan | null>;

  // Trainer Usage
  getOrCreateTrainerUsage: (trainerId: string) => Promise<any>;
  incrementTrainerUsage: (trainerId: string, type: 'clients' | 'routines' | 'diets') => Promise<any>;
  getTotalRoutinesCount: (trainerId: string) => Promise<number>;
  getTotalDietsCount: (trainerId: string) => Promise<number>;
}
