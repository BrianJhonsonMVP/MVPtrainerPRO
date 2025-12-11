
import { User, LimitCheckResult } from '../types';

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
          // Mantener legacy fields reseteados por si acaso
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
  // Si estaba en trial y ya pasó la fecha, pásalo a free
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
  const now = context?.now ?? new Date();

  // NOTA: Se asume que el usuario ya ha pasado por normalizeSubscription y resetWeeklyUsageIfNeeded antes de llamar a esto,
  // o se puede hacer una validación "in-flight" pero sin modificar el objeto persistido aquí (solo lectura).
  // Para seguridad, usaremos los valores del user pasado.

  const sub = user.subscription;

  // PRO: todo ilimitado
  if (sub.type === 'pro' && sub.isActive) {
    return { allowed: true };
  }

  if (feature === 'createClient') {
    const clientsCount = context?.clientsCount ?? 0;
    // FREE y TRIAL: máximo 2 clientes
    if (clientsCount >= 2) {
      return {
        allowed: false,
        requiresUpgrade: true,
        reason: 'Has alcanzado el límite de 2 clientes en tu plan actual.',
      };
    }
    return { allowed: true };
  }

  if (feature === 'generateRoutine' || feature === 'generateDiet') {
    const clientId = context?.clientId;
    if (!clientId) {
      return {
        allowed: false,
        reason: 'Error interno: Falta ID del cliente.',
      };
    }

    const usage = sub.usage;
    const isRoutine = feature === 'generateRoutine';

    // FREE y TRIAL: Limites por cliente por semana
    if (sub.type === 'free' || sub.type === 'trial') {
      if (isRoutine) {
        // Fallback a 0 si no existe el registro
        const currentCount = usage.aiRoutinesByClient?.[clientId] ?? 0;
        if (currentCount >= 1) {
          return {
            allowed: false,
            requiresUpgrade: true,
            reason: 'Solo puedes generar 1 rutina con IA por semana para este cliente.',
          };
        }
      } else {
        const currentCount = usage.aiDietsByClient?.[clientId] ?? 0;
        if (currentCount >= 1) {
          return {
            allowed: false,
            requiresUpgrade: true,
            reason: 'Solo puedes generar 1 dieta con IA por semana para este cliente.',
          };
        }
      }
    }

    return { allowed: true };
  }

  return { allowed: true };
}

export function registerUsage(
  user: User,
  feature: Feature,
  context: { clientId: string; now?: Date }
): User {
  const now = context?.now ?? new Date();
  // Aseguramos que el uso esté reseteado para la semana actual antes de incrementar
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
          // Legacy counter update
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
          // Legacy counter update
          dietsGenerated: (usage.dietsGenerated || 0) + 1
        },
      },
    };
  }

  return updatedUser;
}

// Banner de upgrade:
export function shouldShowUpgradeBanner(
  user: User,
  lastBannerShownAt: number | null,
  nowTs: number
): boolean {
  // PRO: nunca muestra banner
  if (user.subscription.type === 'pro') return false;

  // TRIAL: no muestra banner, aunque tenga límites
  if (user.subscription.type === 'trial') return false;

  // FREE: mostrar cada ~10 minutos de uso
  const TEN_MIN = 10 * 60 * 1000;
  if (!lastBannerShownAt) return true;
  if (nowTs - lastBannerShownAt >= TEN_MIN) return true;

  return false;
}
