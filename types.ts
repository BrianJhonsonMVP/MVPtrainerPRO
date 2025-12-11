
export type SubscriptionType = 'trial' | 'free' | 'pro';
export type PlanInterval = 'monthly' | 'semiannual' | 'yearly';

// Actualizado según requerimiento
export type PaymentMethod = 'efectivo' | 'yape' | 'plin' | 'transferencia' | 'tarjeta' | 'otro';
export type PaymentStatus = 'sin_registro' | 'al_dia' | 'pendiente' | 'atrasado';

export interface SubscriptionUsage {
  weekStart: string; // ISO date (Lunes de la semana actual)
  aiRoutinesByClient: Record<string, number>; // clientId -> count
  aiDietsByClient: Record<string, number>;    // clientId -> count
  // Mantener legacy por si acaso
  routinesGenerated?: number;
  dietsGenerated?: number;
  lastReset?: string;
}

export interface UserSubscription {
  type: SubscriptionType;
  isActive: boolean;
  trialEndsAt?: string | null;  // ISO Date (Solo Trial)
  expiresAt?: string | null;    // ISO Date (Solo PRO)
  upgradedAt?: string | null;   // ISO Date (Cuando pasó a PRO)
  planInterval?: PlanInterval;  // El plan que compró
  usage: SubscriptionUsage;
}

export interface BrandingConfig {
  brandName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface PublicProfile {
  description: string;
  services: string[];
  targets: string[];
  whatsAppNumber: string;
  backgroundColor: string;
  profileImageUrl: string;
  galleryImages: string[];
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  createdAt: string;
  subscription: UserSubscription;
  branding?: BrandingConfig;
  publicProfile?: PublicProfile;
}

export interface ScheduleItem {
  day: string; // "Lunes", "Martes"...
  time: string; // "07:00"
}

export interface ClientPaymentInfo {
  monthlyFee: number;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  lastPaidAt: string | null;    // ISO Date
  nextPaymentAt: string | null; // ISO Date
}

// Estructura de Rutina
export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  rest?: string;
  notes?: string;
  day?: string;
}

export interface Routine {
  id: string;
  name: string;
  description: string;
  exercises: Exercise[];
  tags: string[];
}

// --- ESTRUCTURA DE DIETA V2 (SEMANAL) ---
export type MealTime = 'Desayuno' | 'Snack' | 'Almuerzo' | 'Merienda' | 'Cena';

export interface DietMeal {
  name: string; // Nombre corto del plato
  timeOfDay: MealTime;
  description: string; // Ingredientes o explicación
}

export interface DietDay {
  day: string; // 'Lunes', 'Martes', etc.
  meals: DietMeal[];
}

export interface DietPlan {
  title: string;
  // Macros generales (Objetivos diarios promedio)
  totalKcal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  days: DietDay[];
  notes?: string;
}

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Client {
  id: string;
  trainerId: string;

  // Datos Personales
  name: string;
  email?: string;
  phone?: string;
  gender: 'male' | 'female' | 'other';
  age: number | null;
  country?: string; // País del cliente
  avatarUrl: string;

  // Datos Físicos
  weight: number | null;
  height: number | null;
  experienceLevel: ExperienceLevel;

  // Objetivos
  mainGoal: string;
  goals: string[];
  secondaryGoals?: string[]; // Deprecado

  // Entrenamiento
  trainingDays: string[];
  trainingHour?: string;
  trainingTime: string | null;
  schedule?: ScheduleItem[];

  // IA Data
  routines: Routine[];
  dietPlan?: DietPlan | null;

  // Pagos
  paymentInfo: ClientPaymentInfo;

  status: 'active' | 'inactive';
  createdAt: string;
  joinedAt: string;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  requiresUpgrade?: boolean;
}
