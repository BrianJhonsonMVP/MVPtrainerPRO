
import { User, LimitCheckResult } from "../types";
import { updateUserDoc } from "./firebase";
import { getWeekStartISO } from "./subscriptionLogic";

export const LIMITS = {
  FREE_CLIENTS: 2,
  FREE_ROUTINES_WEEKLY: 1, // Actualizado a 1 según requerimiento
  FREE_DIETS_WEEKLY: 1
};

/**
 * Verifica si han pasado 7 días desde el último reset y reinicia contadores si es necesario.
 */
export const checkAndResetUsage = async (user: User): Promise<User> => {
  if (!user.subscription || !user.subscription.usage) return user;

  const lastReset = user.subscription.usage.lastReset ? new Date(user.subscription.usage.lastReset) : new Date();
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - lastReset.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

  if (diffDays >= 7) {
    const newUsage = {
      weekStart: getWeekStartISO(now),
      aiRoutinesByClient: {},
      aiDietsByClient: {},
      routinesGenerated: 0,
      dietsGenerated: 0,
      lastReset: now.toISOString()
    };
    
    // Actualizar en DB
    await updateUserDoc(user.uid, {
      subscription: {
        ...user.subscription,
        usage: newUsage
      }
    });

    // Retornar usuario actualizado localmente
    return {
      ...user,
      subscription: {
        ...user.subscription,
        usage: newUsage
      }
    };
  }

  return user;
};

/**
 * Función central para verificar límites según el plan.
 */
export const checkLimit = (
  user: User, 
  feature: 'create_client' | 'generate_routine' | 'generate_diet',
  currentClientsCount: number = 0
): LimitCheckResult => {
  
  const { type, usage, isActive } = user.subscription;

  // 1. PRO siempre permitido si está activo
  if (type === 'pro' && isActive) {
    return { allowed: true };
  }

  // 2. TRIAL y FREE comparten límites
  // Verificar si el trial ha expirado (si es trial)
  if (type === 'trial' && user.subscription.trialEndsAt) {
      const end = new Date(user.subscription.trialEndsAt);
      if (new Date() > end) {
          // El trial venció, se comporta como FREE estricto (aunque el tipo en DB diga trial hasta que se actualice)
          // Nota: Idealmente se actualiza el user al cargar la app.
      }
  }

  switch (feature) {
    case 'create_client':
      if (currentClientsCount >= LIMITS.FREE_CLIENTS) {
        return { 
          allowed: false, 
          reason: `Límite de ${LIMITS.FREE_CLIENTS} clientes alcanzado en plan ${type.toUpperCase()}.`,
          requiresUpgrade: true
        };
      }
      break;

    case 'generate_routine':
      if (usage.routinesGenerated >= LIMITS.FREE_ROUTINES_WEEKLY) {
        return { 
          allowed: false, 
          reason: `Límite de ${LIMITS.FREE_ROUTINES_WEEKLY} rutina/semana alcanzado.`,
          requiresUpgrade: true
        };
      }
      break;

    case 'generate_diet':
      if (usage.dietsGenerated >= LIMITS.FREE_DIETS_WEEKLY) {
        return { 
          allowed: false, 
          reason: `Límite de ${LIMITS.FREE_DIETS_WEEKLY} dieta/semana alcanzado.`,
          requiresUpgrade: true
        };
      }
      break;
  }

  return { allowed: true };
};

export const getPlanStatusLabel = (user: User) => {
    const { type, trialEndsAt, expiresAt } = user.subscription;
    
    if (type === 'pro') {
        const date = expiresAt ? new Date(expiresAt).toLocaleDateString() : 'Indefinido';
        return { label: 'PRO', color: 'text-mvp-gold', bg: 'bg-mvp-gold/10', detail: `Renueva: ${date}` };
    }
    
    if (type === 'trial') {
        if (trialEndsAt && new Date() > new Date(trialEndsAt)) {
             return { label: 'TRIAL VENCIDO', color: 'text-red-500', bg: 'bg-red-500/10', detail: 'Actualiza a PRO' };
        }
        const daysLeft = trialEndsAt ? Math.ceil((new Date(trialEndsAt).getTime() - new Date().getTime()) / (1000 * 3600 * 24)) : 0;
        return { label: 'TRIAL', color: 'text-blue-400', bg: 'bg-blue-500/10', detail: `${daysLeft} días restantes` };
    }

    return { label: 'FREE', color: 'text-zinc-400', bg: 'bg-zinc-800', detail: 'Plan Básico' };
};
