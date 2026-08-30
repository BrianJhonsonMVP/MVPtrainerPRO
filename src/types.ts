
export type SubscriptionType = 'trial' | 'free' | 'pro';
export type PlanInterval = 'monthly' | 'semiannual' | 'yearly';
export type SubscriptionStatus = 'loading' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'expired' | 'free';
export type SubscriptionSource = 'profiles' | 'subscriptions' | 'last_confirmed' | 'development';

export type PaymentMethod = 'efectivo' | 'yape' | 'plin' | 'transferencia' | 'tarjeta' | 'otro';
export type PaymentStatus = 'sin_registro' | 'al_dia' | 'pendiente' | 'atrasado';

export interface SubscriptionUsage {
  weekStart: string;
  aiRoutinesByClient: Record<string, number>;
  aiDietsByClient: Record<string, number>;
  routinesGenerated?: number;
  dietsGenerated?: number;
  lastReset?: string;
}

export interface UserSubscription {
  type: SubscriptionType;
  isActive: boolean;
  status?: SubscriptionStatus;
  source?: SubscriptionSource;
  confirmedAt?: string | null;
  isSyncing?: boolean;
  trialEndsAt?: string | null;
  expiresAt?: string | null;    // Mapeado a current_period_end de Stripe
  upgradedAt?: string | null;
  planInterval?: PlanInterval;
  usage: SubscriptionUsage;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  provider?: 'internal' | 'mercadopago' | 'apple' | 'google' | 'stripe' | 'manual';
  externalCustomerId?: string;
  externalSubscriptionId?: string;
  currentPeriodEnd?: string;
}

export interface BrandingConfig {
  brandName: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
}

export interface PublicProfile {
  professionalTitle?: string;
  trainerName?: string;
  headline?: string;
  callToAction?: string;
  description: string;
  services: string[];
  targets: string[];
  whatsAppNumber: string;
  backgroundColor: string;
  profileImageUrl: string;
  galleryImages: string[];
  modality?: 'presencial' | 'online' | 'ambas';
  location?: string;
  presentationMode?: 'photo' | 'logo' | 'mixed';
  cardFormat?: 'post' | 'story';
  cardTemplate?: 'personal' | 'brand' | 'balanced';
  photoPositionY?: number;
  slug?: string;
  isPublished?: boolean;
}

export interface ScheduleException {
  id: string;
  date: string;
  type: 'cancelled' | 'rescheduled';
  startTime?: string;
  endTime?: string;
  createdAt: string;
}

export interface TrainerUsage {
  trainer_id: string;
  clients_created_total: number;
  ai_routines_generated_total: number;
  ai_diets_generated_total: number;
  created_at?: string;
  updated_at?: string;
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
  trainerUsage?: TrainerUsage;
}

export interface Routine {
  id: string;
  name: string;
  description: string;
  exercises: any[];
  tags: string[];
  title?: string; // Standardized for AI
  summary?: string; // Standardized for AI
  days?: any[]; // Standardized for AI (List of days with exercises)
  warnings?: string[];
  recommendations?: string[];
  source?: 'ai' | 'fallback' | 'manual';
  version?: number;
  createdAt?: string;
}

// Added DietPlan and associated interfaces
export interface DietMeal {
  timeOfDay: string;
  name: string;
  description: string;
}

export interface DietDay {
  day: string;
  meals: DietMeal[];
}

export interface DietPlan {
  id?: string;
  title: string;
  notes?: string;
  summary?: string; // Standardized for AI
  daily_calories?: number; // Standardized for AI
  totalKcal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  days: DietDay[];
  meals?: any[]; // Flat list if AI returns it thus
  warnings?: string[];
  recommendations?: string[];
  source?: 'ai' | 'fallback' | 'manual';
  version?: number;
  createdAt?: string;
}

// Added ClientPaymentInfo for strict typing
export interface ClientPaymentInfo {
  monthlyFee: number;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  lastPaidAt: string | null;
  nextPaymentAt: string | null;
  lastPaymentAmount?: number | null;
  lastPaymentMonths?: number | null;
}

export type BillingRecordStatus = 'pending' | 'paid' | 'late';

export interface BillingRecord {
  id: string;
  clientId: string;
  trainerId: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  status: BillingRecordStatus;
  notes?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Client {
  id: string;
  trainerId: string;
  name: string;
  email?: string;
  phone?: string;
  gender: 'male' | 'female' | 'other';
  age: number | null;
  country?: string;
  medicalNotes?: string;
  avatarUrl: string;
  weight: number | null;
  height: number | null;
  experienceLevel: string;
  mainGoal: string;
  goals: string[];
  clientGoalSummary?: string;
  routineFocus?: string;
  dietFocus?: string;
  trainingDays: string[];
  trainingTime: string | null;
  scheduleExceptions?: ScheduleException[];
  routines: Routine[];
  dietPlan?: DietPlan; // Fixed any to DietPlan
  dietPlans?: DietPlan[];
  paymentInfo: ClientPaymentInfo; // Fixed inline to ClientPaymentInfo
  status: 'active' | 'paused' | 'inactive';
  pausedAt?: string | null;
  finishedAt?: string | null;
  createdAt: string;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  requiresUpgrade?: boolean;
}
