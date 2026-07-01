
import { User, UserSubscription } from '../types';
import { LIMITS } from './subscriptionUtils';

export const getWeekStartISO = (date: Date = new Date()): string => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Lunes
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export const normalizeSubscription = (user: User, now: Date = new Date()): User => {
  const sub = user.subscription;
  if (!sub) return user;

  let isActive = sub.isActive;
  if (sub.type === 'trial' && sub.trialEndsAt) {
    isActive = new Date(sub.trialEndsAt) > now;
  } else if (sub.type === 'pro' && sub.expiresAt) {
    isActive = new Date(sub.expiresAt) > now;
  }

  return {
    ...user,
    subscription: {
      ...sub,
      isActive
    }
  };
};

export const resetWeeklyUsageIfNeeded = (user: User, now: Date = new Date()): User => {
  const sub = user.subscription;
  if (!sub || !sub.usage) return user;

  const currentWeekStart = getWeekStartISO(now);
  if (sub.usage.weekStart !== currentWeekStart) {
    return {
      ...user,
      subscription: {
        ...sub,
        usage: {
          ...sub.usage,
          weekStart: currentWeekStart,
          aiRoutinesByClient: {},
          aiDietsByClient: {},
          routinesGenerated: 0,
          dietsGenerated: 0
        }
      }
    };
  }
  return user;
};

export const canUseFeature = (user: User | null, feature: string, context: any = {}): { allowed: boolean; reason?: string } => {
  if (!user) return { allowed: false, reason: 'No hay sesión activa' };
  const sub = user.subscription || { type: 'free', isActive: true };

  const isPro = sub.type === 'pro' && sub.isActive;
  if (isPro) return { allowed: true };

  // Para usuarios no-PRO (incluyendo de prueba o free), aplicamos de forma limpia los límites históricos de supabase trainer_usage
  const trainerUsage = user.trainerUsage;

  switch (feature) {
    case 'createClient': {
      const clientsCreatedTotal = trainerUsage?.clients_created_total ?? 0;
      if (clientsCreatedTotal >= LIMITS.FREE_CLIENTS) {
        return { allowed: false, reason: `Límite de plan gratuito alcanzado: máximo ${LIMITS.FREE_CLIENTS} clientes históricos.` };
      }
      return { allowed: true };
    }
    
    case 'generateRoutine': {
      const routinesCreatedTotal = trainerUsage?.ai_routines_generated_total ?? 0;
      if (routinesCreatedTotal >= 2) {
        return { allowed: false, reason: "Límite de plan gratuito alcanzado: máximo 2 rutinas IA históricas." };
      }
      return { allowed: true };
    }

    case 'generateDiet': {
      const dietsCreatedTotal = trainerUsage?.ai_diets_generated_total ?? 0;
      if (dietsCreatedTotal >= 2) {
        return { allowed: false, reason: "Límite de plan gratuito alcanzado: máximo 2 dietas IA históricas." };
      }
      return { allowed: true };
    }

    case 'agenda':
    case 'payments':
    case 'branding':
    case 'publicProfile':
      return { allowed: false, reason: "Esta función es exclusiva para usuarios PRO." };

    default:
      return { allowed: true };
  }
};

export const registerUsage = (user: User, feature: string, context: any = {}): User => {
  const sub = user.subscription;
  if (!sub) return user;

  const usage = { ...(sub?.usage || { weekStart: getWeekStartISO(), aiRoutinesByClient: {}, aiDietsByClient: {} }) };
  const clientId = context.clientId;

  if (feature === 'generateRoutine') {
    usage.routinesGenerated = (usage.routinesGenerated || 0) + 1;
    if (clientId) {
      usage.aiRoutinesByClient = { ...usage.aiRoutinesByClient, [clientId]: (usage.aiRoutinesByClient[clientId] || 0) + 1 };
    }
  } else if (feature === 'generateDiet') {
    usage.dietsGenerated = (usage.dietsGenerated || 0) + 1;
    if (clientId) {
      usage.aiDietsByClient = { ...usage.aiDietsByClient, [clientId]: (usage.aiDietsByClient[clientId] || 0) + 1 };
    }
  }

  return {
    ...user,
    subscription: {
      ...sub,
      usage
    }
  };
};

export const shouldShowUpgradeBanner = (user: User | null, lastShownAt: number, now: number): boolean => {
  if (!user) return false;
  if (user.subscription?.type === 'pro') return false;
  
  // Mostrar cada 24 horas si no es PRO
  const oneDay = 24 * 60 * 60 * 1000;
  return now - lastShownAt > oneDay;
};
