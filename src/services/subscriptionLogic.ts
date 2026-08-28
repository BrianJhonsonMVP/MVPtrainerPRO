import { User } from '../types';

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

export const isActiveTrial = (user: User | null, now: Date = new Date()): boolean => {
  if (!user || user.subscription?.type !== 'trial' || user.subscription?.isActive !== true) return false;
  const trialEndsAt = user.subscription.trialEndsAt;
  if (!trialEndsAt) return false;
  const timestamp = new Date(trialEndsAt).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
};

export const hasFullAccess = (user: User | null, now: Date = new Date()): boolean =>
  isActivePro(user) || isActiveTrial(user, now);

export const isSubscriptionLocked = (user: User | null, now: Date = new Date()): boolean =>
  Boolean(user && !user.subscription?.isSyncing && !hasFullAccess(user, now));

export const getTrialDaysRemaining = (user: User | null, now: Date = new Date()): number | null => {
  if (!isActiveTrial(user, now) || !user?.subscription?.trialEndsAt) return null;
  const remaining = new Date(user.subscription.trialEndsAt).getTime() - now.getTime();
  return Math.max(1, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
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

export const canUseFeature = (user: User | null, _feature: string, _context: any = {}): { allowed: boolean; reason?: string } => {
  if (!user) return { allowed: false, reason: 'No hay sesión activa' };
  if (hasFullAccess(user)) return { allowed: true };
  if (user.subscription?.isSyncing) {
    return { allowed: false, reason: 'Estamos confirmando tu acceso. Inténtalo nuevamente en unos segundos.' };
  }
  return {
    allowed: false,
    reason: 'Tu prueba de 21 días terminó. Tus datos siguen guardados y volverán a estar disponibles al activar tu plan.'
  };
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
  if (hasFullAccess(user) || user.subscription?.isSyncing) return false;

  const oneDay = 24 * 60 * 60 * 1000;
  return !lastShownAt || now - lastShownAt > oneDay;
};
