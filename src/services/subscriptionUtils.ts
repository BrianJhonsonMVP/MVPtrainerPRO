import { User } from '../types';

export const LIMITS = {
  FREE_CLIENTS: 2,
  FREE_AI_ROUTINES_HISTORICAL: 2,
  FREE_AI_DIETS_HISTORICAL: 2,
  TRIAL_DAYS: 15
};

export interface PlanStatus {
  label: string;
  color: string;
  detail: string;
  bg: string;
}

export const getPlanStatusLabel = (user: User | null): PlanStatus => {
  if (!user) return { label: 'Sin sesión', color: 'text-zinc-500', detail: 'Inicia sesión para ver tu plan', bg: 'bg-zinc-900' };

  const type = user?.subscription?.type || 'free';
  const isActive = user?.subscription?.isActive;

  if (type === 'pro') {
    return {
      label: isActive ? 'Plan PRO' : 'Plan PRO (Expirado)',
      color: isActive ? 'text-mvp-gold' : 'text-zinc-500',
      detail: isActive ? 'Acceso total ilimitado' : 'Tu suscripción ha vencido',
      bg: isActive ? 'bg-mvp-gold/10' : 'bg-zinc-900'
    };
  }

  if (type === 'trial') {
    return {
      label: 'Prueba Gratuita',
      color: 'text-amber-500',
      detail: 'Límites Free activos hasta pasar a PRO',
      bg: 'bg-amber-500/10'
    };
  }

  return {
    label: 'Plan Free',
    color: 'text-zinc-400',
    detail: 'Límites históricos activos',
    bg: 'bg-zinc-900'
  };
};

export const checkLimit = () => true;
export const checkAndResetUsage = () => {};

export const clearStaleUserCache = (trainerId?: string) => {
  localStorage.removeItem('mvptrainer_cached_user');
  if (trainerId) {
    localStorage.removeItem(`mvptrainer_usage_fallback_${trainerId}`);
  } else {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('mvptrainer_usage_fallback_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  }
};
