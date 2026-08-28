import { User } from '../types';
import { LIMITS } from './subscriptionUtils';

export const DEV_FORCE_PRO = false;

export const getWeekStartISO = (date: Date = new Date()): string => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};

export const isActivePro = (user: User | null): boolean => {
  if (!user) return false;
  return DEV_FORCE_PRO || (user.subscription?.type === 'pro' && user.subscription?.isActive === true);
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

const getUsageOrBlock = (user: User) => {
  if (!user.trainerUsage || !user.trainerUsage.trainer_id) {
    return {
      usage: null,
      reason: 'No se pudo validar tu uso histórico en Supabase. Revisa la tabla public.trainer_usage y sus policies antes de continuar.'
    };
  }
  return { usage: user.trainerUsage, reason: undefined };
};

export const canUseFeature = (user: User | null, feature: string, context: any = {}): { allowed: boolean; reason?: string } => {
  if (!user) return { allowed: false, reason: 'No hay sesión activa' };
  if (isActivePro(user)) return { allowed: true };

  const { usage, reason } = getUsageOrBlock(user);
  if (!usage && ['createClient', 'generateRoutine', 'generateDiet'].includes(feature)) {
    return { allowed: false, reason };
  }

  switch (feature) {
    case 'createClient': {
      const clientsCreatedTotal = usage?.clients_created_total ?? 0;
      if (clientsCreatedTotal >= LIMITS.FREE_CLIENTS) {
        return { allowed: false, reason: `Límite de plan gratuito alcanzado: máximo ${LIMITS.FREE_CLIENTS} clientes históricos.` };
      }
      return { allowed: true };
    }

    case 'generateRoutine': {
      const routinesCreatedTotal = usage?.ai_routines_generated_total ?? 0;
      if (routinesCreatedTotal >= LIMITS.FREE_AI_ROUTINES_HISTORICAL) {
        return { allowed: false, reason: `Límite de plan gratuito alcanzado: máximo ${LIMITS.FREE_AI_ROUTINES_HISTORICAL} rutinas IA históricas.` };
      }
      return { allowed: true };
    }

    case 'generateDiet': {
      const dietsCreatedTotal = usage?.ai_diets_generated_total ?? 0;
      if (dietsCreatedTotal >= LIMITS.FREE_AI_DIETS_HISTORICAL) {
        return { allowed: false, reason: `Límite de plan gratuito alcanzado: máximo ${LIMITS.FREE_AI_DIETS_HISTORICAL} dietas IA históricas.` };
      }
      return { allowed: true };
    }

    case 'agenda':
    case 'payments':
    case 'branding':
    case 'publicProfile':
    case 'whatsappShare':
      return { allowed: false, reason: 'Esta función es exclusiva para usuarios PRO.' };

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

export const shouldShowUpgradeBanner = (user: User | null, lastShownAt: number | null, now: number): boolean => {
  if (!user) return false;
  if (isActivePro(user) || user.subscription?.isSyncing) return false;

  const oneDay = 24 * 60 * 60 * 1000;
  return !lastShownAt || now - lastShownAt > oneDay;
};
