
export type SubscriptionType = 'trial' | 'free' | 'pro';
export type PlanInterval = 'monthly' | 'semiannual' | 'yearly';

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
  trialEndsAt?: string | null;
  expiresAt?: string | null;    // Mapeado a current_period_end de Stripe
  upgradedAt?: string | null;
  planInterval?: PlanInterval;
  usage: SubscriptionUsage;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
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

export interface Routine {
  id: string;
  name: string;
  description: string;
  exercises: any[];
  tags: string[];
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
  title: string;
  notes?: string;
  totalKcal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFats: number;
  days: DietDay[];
}

// Added ClientPaymentInfo for strict typing
export interface ClientPaymentInfo {
  monthlyFee: number;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  lastPaidAt: string | null;
  nextPaymentAt: string | null;
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
  avatarUrl: string;
  weight: number | null;
  height: number | null;
  experienceLevel: string;
  mainGoal: string;
  goals: string[];
  trainingDays: string[];
  trainingTime: string | null;
  routines: Routine[];
  dietPlan?: DietPlan; // Fixed any to DietPlan
  paymentInfo: ClientPaymentInfo; // Fixed inline to ClientPaymentInfo
  status: 'active' | 'inactive';
  createdAt: string;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  requiresUpgrade?: boolean;
}
