
import { User, LimitCheckResult } from '../types';

export const LIMITS_CONFIG = {
  MAX_CLIENTS_FREE: 2,
  MAX_ROUTINES_PER_CLIENT_WEEKLY: 1,
  MAX_DIETS_PER_CLIENT_WEEKLY: 1
};

export type Feature =
  | 'createClient'
  | 'generateRoutine'
  | 'generateDiet';

// Normaliza el inicio de semana (ej: siempre lunes 00:00)
export function getWeekStartISO(now: Date): string {
  const date = new Date(now);
  const day = date.getDay(); // 0 domingo, 1 lunes, ...
  const diff = (day + 6) % 7; // mover al lunes (si es domingo 0, diff es 6 -> lunes anterior)
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function resetWeeklyUsageIfNeeded(user: User, now: Date): User {
  const currentWeek = getWeekStartISO(now);
  const usage = user.subscription.usage;

  if (!usage.weekStart || usage.weekStart !== currentWeek) {
    return {
      ...user,
      subscription: {
        ...user.subscription,
        usage: {
          weekStart: currentWeek,
          aiRoutinesByClient: {},
          aiDietsByClient: {},
          routinesGenerated: 0,
          dietsGenerated: 0,
          lastReset: now.toISOString()
        },
      },
    };
  }

  return user;
}

export function isTrialExpired(user: User, now: Date): boolean {
  if (user.subscription.type !== 'trial') return false;
  if (!user.subscription.trialEndsAt) return false;
  return new Date(now) > new Date(user.subscription.trialEndsAt);
}

export function normalizeSubscription(user: User, now: Date): User {
  if (user.subscription.type === 'trial' && isTrialExpired(user, now)) {
    return {
      ...user,
      subscription: {
        ...user.subscription,
        type: 'free',
      },
    };
  }
  return user;
}

export function canUseFeature(
  user: User,
  feature: Feature,
  context?: { clientId?: string; clientsCount?: number; now?: Date }
): LimitCheckResult {
  const sub = user.subscription;

  if (sub.type === 'pro' && sub.isActive) {
    return { allowed: true };
  }

  if (feature === 'createClient') {
    const clientsCount = context?.clientsCount ?? 0;
    if (clientsCount >= LIMITS_CONFIG.MAX_CLIENTS_FREE) {
      return {
        allowed: false,
        requiresUpgrade: true,
        reason: `Has alcanzado el límite de ${LIMITS_CONFIG.MAX_CLIENTS_FREE} clientes en tu plan actual.`,
      };
    }
    return { allowed: true };
  }

  if (feature === 'generateRoutine' || feature === 'generateDiet') {
    const clientId = context?.clientId;
    if (!clientId) {
      return { allowed: false, reason: 'Error interno: Falta ID del cliente.' };
    }

    const usage = sub.usage;
    if (feature === 'generateRoutine') {
      const currentCount = usage.aiRoutinesByClient?.[clientId] ?? 0;
      if (currentCount >= LIMITS_CONFIG.MAX_ROUTINES_PER_CLIENT_WEEKLY) {
        return {
          allowed: false,
          requiresUpgrade: true,
          reason: `Solo puedes generar ${LIMITS_CONFIG.MAX_ROUTINES_PER_CLIENT_WEEKLY} rutina con IA por semana para este cliente.`,
        };
      }
    } else {
      const currentCount = usage.aiDietsByClient?.[clientId] ?? 0;
      if (currentCount >= LIMITS_CONFIG.MAX_DIETS_PER_CLIENT_WEEKLY) {
        return {
          allowed: false,
          requiresUpgrade: true,
          reason: `Solo puedes generar ${LIMITS_CONFIG.MAX_DIETS_PER_CLIENT_WEEKLY} dieta con IA por semana para este cliente.`,
        };
      }
    }
  }

  return { allowed: true };
}

export function registerUsage(
  user: User,
  feature: Feature,
  context: { clientId: string; now?: Date }
): User {
  const now = context?.now ?? new Date();
  let updatedUser = resetWeeklyUsageIfNeeded(user, now);

  const sub = updatedUser.subscription;
  const usage = sub.usage;
  const clientId = context.clientId;

  if (feature === 'generateRoutine') {
    const currentCount = usage.aiRoutinesByClient?.[clientId] ?? 0;
    return {
      ...updatedUser,
      subscription: {
        ...sub,
        usage: {
          ...usage,
          aiRoutinesByClient: {
            ...usage.aiRoutinesByClient,
            [clientId]: currentCount + 1,
          },
          routinesGenerated: (usage.routinesGenerated || 0) + 1
        },
      },
    };
  }

  if (feature === 'generateDiet') {
    const currentCount = usage.aiDietsByClient?.[clientId] ?? 0;
    return {
      ...updatedUser,
      subscription: {
        ...sub,
        usage: {
          ...usage,
          aiDietsByClient: {
            ...usage.aiDietsByClient,
            [clientId]: currentCount + 1,
          },
          dietsGenerated: (usage.dietsGenerated || 0) + 1
        },
      },
    };
  }

  return updatedUser;
}

export function shouldShowUpgradeBanner(
  user: User,
  lastBannerShownAt: number | null,
  nowTs: number
): boolean {
  if (user.subscription.type === 'pro') return false;
  if (user.subscription.type === 'trial') return false;

  const TEN_MIN = 10 * 60 * 1000;
  if (!lastBannerShownAt) return true;
  if (nowTs - lastBannerShownAt >= TEN_MIN) return true;

  return false;
}
