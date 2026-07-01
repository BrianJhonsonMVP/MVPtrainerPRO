import { IDBProvider } from './dbInterface';
import { supabase, isSupabaseEnabled } from '../services/supabaseClient';
import { Client, User } from '../types';
import { DEV_FORCE_PRO } from '../services/subscriptionLogic';

const withTimeout = <T>(promise: Promise<T> | any, ms: number, operation: string): Promise<T> => {
  return Promise.race([
    promise as Promise<T>,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Supabase timeout: ${operation}`)), ms)
    )
  ]);
};

const retryPromise = async <T>(fn: () => Promise<T>, retries = 3, delay = 800): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (retries <= 0) throw error;
    if ((import.meta as any).env?.DEV) {
      console.warn(`[RETRY] Intento fallido (${error.message || error}). Intentos restantes: ${retries}. Reintentando en ${delay}ms...`);
    }
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryPromise(fn, retries - 1, delay * 1.5);
  }
};

const requireSupabase = () => {
  if (!isSupabaseEnabled() || !supabase) {
    throw new Error('Supabase no está configurado. Define VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env.local.');
  }
  return supabase;
};

const requireAuthUser = async () => {
  const client = requireSupabase();
  const { data: { user }, error } = await client.auth.getUser();
  if (error) throw error;
  if (!user) throw new Error('No hay sesión activa para esta operación.');
  return user;
};

const parseNotes = (notes: any) => {
  if (!notes || typeof notes !== 'string') return {};
  try {
    return notes.startsWith('{') || notes.startsWith('[') ? JSON.parse(notes) : {};
  } catch {
    return {};
  }
};

let lastFetchedUser: any = null;
let lastFetchTime = 0;
let isFetchingUser = false;

export const supabaseProvider: IDBProvider = {
  name: 'Supabase Cloud',

  async signUp(email, pass) {
    const client = requireSupabase();
    const { data, error } = (await withTimeout(client.auth.signUp({
      email,
      password: pass,
      options: { emailRedirectTo: window.location.origin }
    }), 5000, 'signUp')) as any;

    if (error) throw error;

    if (data.user && !data.session) {
      return {
        user: data.user,
        message: 'CONFIRM_EMAIL',
        detail: 'Cuenta creada. Por seguridad, debes confirmar tu email antes de entrar.'
      };
    }

    return data;
  },

  async signIn(email, pass) {
    const client = requireSupabase();
    const { data, error } = await client.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    return data;
  },

  async signOut() {
    lastFetchedUser = null;
    lastFetchTime = 0;
    if (isSupabaseEnabled()) {
      await supabase!.auth.signOut();
    }
  },

  async getCurrentUser(forceFresh = false) {
    if (!isSupabaseEnabled()) return null;

    if (isFetchingUser) return lastFetchedUser;

    const now = Date.now();
    if (!forceFresh && lastFetchedUser && (now - lastFetchTime < 60000)) {
      return lastFetchedUser;
    }

    isFetchingUser = true;

    const fetchOperation = async () => {
      const client = requireSupabase();
      const { data: { session }, error: authError } = (await withTimeout(client.auth.getSession(), 3000, 'getSession')) as any;
      if (authError) throw authError;

      const authUser = session?.user;
      if (!authUser) return null;

      const { data: profile, error: profError } = (await withTimeout(
        client.from('profiles').select('*').eq('id', authUser.id).single(),
        3000,
        'profilesFetch'
      )) as any;

      if (profError && profError.code !== 'PGRST116') throw profError;

      let resolvedProfile = profile;
      if (!resolvedProfile) {
        const { data: newProfile, error: createProfError } = (await withTimeout(
          client
            .from('profiles')
            .insert({
              id: authUser.id,
              email: authUser.email!,
              display_name: authUser.email?.split('@')[0] || 'User',
              subscription_type: 'trial',
              account_status: 'active'
            })
            .select()
            .single(),
          3000,
          'profileCreate'
        )) as any;

        if (createProfError) throw createProfError;
        resolvedProfile = newProfile;
      }

      const trainerUsage = await this.getOrCreateTrainerUsage(authUser.id);
      const effectiveType = DEV_FORCE_PRO ? 'pro' : (resolvedProfile.subscription_type || 'trial');
      const effectiveStatus = DEV_FORCE_PRO ? true : (resolvedProfile.is_active !== false);

      const mappedUser = {
        uid: resolvedProfile.id,
        email: resolvedProfile.email || authUser.email || '',
        displayName: resolvedProfile.display_name || authUser.email?.split('@')[0] || 'User',
        createdAt: resolvedProfile.created_at,
        branding: resolvedProfile.branding,
        publicProfile: resolvedProfile.public_profile,
        subscription: {
          type: effectiveType,
          isActive: effectiveStatus,
          billingInterval: resolvedProfile.billing_interval,
          status: resolvedProfile.account_status || (resolvedProfile.is_active ? 'active' : 'inactive'),
          usage: { weekStart: new Date().toISOString(), aiRoutinesByClient: {}, aiDietsByClient: {} },
          stripeCustomerId: resolvedProfile.stripe_customer_id,
          stripeSubscriptionId: resolvedProfile.stripe_subscription_id,
          currentPeriodEnd: resolvedProfile.current_period_end,
          expiresAt: resolvedProfile.current_period_end
        },
        isAdmin: resolvedProfile.is_admin || false,
        trainerUsage
      } as any;

      lastFetchedUser = mappedUser;
      lastFetchTime = Date.now();
      return mappedUser;
    };

    try {
      return await retryPromise(fetchOperation, 1, 500);
    } catch (e: any) {
      if ((import.meta as any).env?.DEV) {
        console.warn('Supabase: getCurrentUser failed.', e.message || e);
      }
      if (lastFetchedUser) return lastFetchedUser;
      if (e.message?.includes('timeout') || e.message?.includes('fetch')) return undefined as any;
      return null;
    } finally {
      isFetchingUser = false;
    }
  },

  onAuthStateChanged(callback) {
    if (!isSupabaseEnabled()) return () => {};

    const { data: { subscription } } = supabase!.auth.onAuthStateChange(async (event, session) => {
      const cached = localStorage.getItem('mvptrainer_cached_user');
      let parsedCachedUser: any = null;
      if (cached) {
        try { parsedCachedUser = JSON.parse(cached); } catch (_) {}
      }
      const activeUserFallback = lastFetchedUser || parsedCachedUser;

      if (session?.user) {
        if ((event as string) === 'TOKEN_REFRESHED' && activeUserFallback && activeUserFallback.uid === session.user.id) {
          callback(activeUserFallback, event);
          return;
        }
        if (event === 'SIGNED_IN' && activeUserFallback && activeUserFallback.uid === session.user.id) {
          callback(activeUserFallback, event);
          return;
        }

        const user = await this.getCurrentUser();
        callback(user, event);
      } else {
        if (event !== 'SIGNED_OUT' && (event as string) !== 'USER_DELETED' && activeUserFallback) {
          callback(activeUserFallback, event);
          return;
        }
        callback(null, event);
      }
    });

    return () => subscription.unsubscribe();
  },

  async getClients(trainerId) {
    if (!trainerId || trainerId === 'undefined') return [];

    const client = requireSupabase();
    const [clientsRes, routinesRes, dietsRes] = await Promise.all([
      client
        .from('clients')
        .select('*')
        .eq('trainer_id', trainerId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false }),
      client
        .from('routines')
        .select('*')
        .eq('trainer_id', trainerId)
        .order('created_at', { ascending: false }),
      client
        .from('diets')
        .select('*')
        .eq('trainer_id', trainerId)
        .order('created_at', { ascending: false })
    ]);

    if (clientsRes.error) throw clientsRes.error;
    if (routinesRes.error) throw routinesRes.error;
    if (dietsRes.error) throw dietsRes.error;

    const routinesByClient: Record<string, any[]> = {};
    (routinesRes.data || []).forEach((r: any) => {
      if (!routinesByClient[r.client_id]) routinesByClient[r.client_id] = [];
      routinesByClient[r.client_id].push({ ...r.content, id: r.id, createdAt: r.created_at });
    });

    const dietByClient: Record<string, any> = {};
    (dietsRes.data || []).forEach((d: any) => {
      if (!dietByClient[d.client_id]) {
        dietByClient[d.client_id] = { ...d.content, id: d.id, createdAt: d.created_at };
      }
    });

    return (clientsRes.data || []).map((c: any) =>
      mapClientToFrontend(c, routinesByClient[c.id] || [], dietByClient[c.id] || null)
    );
  },

  subscribeToClients(trainerId, callback, onStatus) {
    if (!isSupabaseEnabled()) return () => {};
    if (!trainerId || trainerId === 'undefined') return () => {};

    this.getClients(trainerId).then(callback).catch((error) => {
      console.error('Supabase: initial clients fetch failed', error);
      if (onStatus) onStatus('CHANNEL_ERROR');
    });

    const channel = supabase!
      .channel(`unified-trainer-${trainerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `trainer_id=eq.${trainerId}` }, () => {
        this.getClients(trainerId).then(callback);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'routines', filter: `trainer_id=eq.${trainerId}` }, () => {
        this.getClients(trainerId).then(callback);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'diets', filter: `trainer_id=eq.${trainerId}` }, () => {
        this.getClients(trainerId).then(callback);
      });

    channel.subscribe((status, err) => {
      if ((import.meta as any).env?.DEV) console.log(`REALTIME CHANNEL STATUS: ${status}`, err || '');
      if (onStatus) onStatus(status);
    });

    return () => {
      supabase!.removeChannel(channel);
    };
  },

  async createClient(passedTrainerId, data) {
    const client = requireSupabase();
    const authUser = await requireAuthUser();
    const trainerId = authUser.id;

    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(now.getMonth() + 1);

    const monthlyFee = Number(data.paymentInfo?.monthlyFee) || 0;
    const todayISO = now.toISOString();
    const nextMonthISO = nextMonth.toISOString();

    const insertPayload: any = {
      trainer_id: trainerId,
      full_name: data.name,
      email: data.email,
      phone: data.phone,
      sex: data.gender,
      birth_date: data.age ? `${new Date().getFullYear() - data.age}-01-01` : null,
      weight_kg: data.weight,
      height_cm: data.height,
      activity_level: data.experienceLevel,
      goal: data.goals?.[0] || null,
      payment_amount: monthlyFee,
      payment_day: now.getDate(),
      billing_frequency: 'monthly',
      notes: JSON.stringify({
        payment: {
          monthlyFee,
          status: data.paymentInfo?.status || 'sin_registro',
          paymentMethod: data.paymentInfo?.paymentMethod || 'efectivo',
          lastPaidAt: data.paymentInfo?.lastPaidAt || todayISO,
          nextPaymentAt: data.paymentInfo?.nextPaymentAt || nextMonthISO
        },
        training: {
          days: data.trainingDays,
          time: data.trainingTime
        },
        profile: {
          age: data.age,
          country: data.country,
          goals: data.goals
        }
      })
    };

    const { data: newClient, error } = await client.from('clients').insert(insertPayload).select().single();
    if (error) throw error;

    await this.incrementTrainerUsage(trainerId, 'clients');
    return mapClientToFrontend(newClient);
  },

  async updateClient(clientId, data) {
    const client = requireSupabase();
    const authUser = await requireAuthUser();

    const { data: existing, error: existingError } = await client
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .eq('trainer_id', authUser.id)
      .single();

    if (existingError) throw existingError;

    const existingMeta = parseNotes(existing?.notes);
    const monthlyFee = data.paymentInfo?.monthlyFee !== undefined
      ? Number(data.paymentInfo.monthlyFee)
      : (existing?.payment_amount || 0);

    const updatePayload: any = {
      full_name: data.name ?? existing.full_name,
      email: data.email ?? existing.email,
      phone: data.phone ?? existing.phone,
      sex: data.gender ?? existing.sex,
      birth_date: data.age ? `${new Date().getFullYear() - data.age}-01-01` : existing.birth_date,
      weight_kg: data.weight ?? existing.weight_kg,
      height_cm: data.height ?? existing.height_cm,
      activity_level: data.experienceLevel ?? existing.activity_level,
      goal: data.goals?.[0] || existing.goal,
      payment_amount: monthlyFee,
      notes: JSON.stringify({
        payment: { ...(existingMeta.payment || {}), ...(data.paymentInfo || {}) },
        training: {
          days: data.trainingDays || existingMeta.training?.days || [],
          time: data.trainingTime || existingMeta.training?.time || ''
        },
        profile: {
          age: data.age ?? existingMeta.profile?.age ?? null,
          country: data.country || existingMeta.profile?.country || '',
          goals: data.goals || existingMeta.profile?.goals || []
        }
      })
    };

    const { error } = await client
      .from('clients')
      .update(updatePayload)
      .eq('id', clientId)
      .eq('trainer_id', authUser.id)
      .is('deleted_at', null);

    if (error) throw error;
  },

  async deleteClient(clientId) {
    const client = requireSupabase();
    const authUser = await requireAuthUser();

    const { data, error } = await client
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', clientId)
      .eq('trainer_id', authUser.id)
      .is('deleted_at', null)
      .select('id');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error('No se eliminó ninguna fila. Revisa RLS, propiedad del cliente o si ya estaba archivado.');
    }
  },

  async archiveRoutine(routineId) {
    const client = requireSupabase();
    const authUser = await requireAuthUser();
    const { error } = await client.from('routines').delete().eq('id', routineId).eq('trainer_id', authUser.id);
    if (error) throw error;
  },

  async archiveDiet(dietId) {
    const client = requireSupabase();
    const authUser = await requireAuthUser();
    const { error } = await client.from('diets').delete().eq('id', dietId).eq('trainer_id', authUser.id);
    if (error) throw error;
  },

  async updateUser(uid, data) {
    const client = requireSupabase();
    const authUser = await requireAuthUser();
    if (authUser.id !== uid) throw new Error('No puedes actualizar otro perfil.');

    const dbPayload: any = { ...data };
    if ('publicProfile' in dbPayload) {
      dbPayload.public_profile = dbPayload.publicProfile;
      delete dbPayload.publicProfile;
    }

    const { data: profile, error } = await client
      .from('profiles')
      .update(dbPayload)
      .eq('id', uid)
      .select()
      .single();

    if (error) throw error;
    return profile;
  },

  async getProfile(uid) {
    const client = requireSupabase();
    const { data, error } = await client
      .from('profiles')
      .select('id, display_name, branding, public_profile')
      .eq('id', uid)
      .single();

    if (error || !data) return null;
    return {
      uid: data.id,
      displayName: data.display_name,
      branding: data.branding,
      publicProfile: data.public_profile
    };
  },

  async saveRoutine(trainerId, clientId, routine) {
    const client = requireSupabase();
    const authUser = await requireAuthUser();

    const payload = {
      client_id: clientId,
      trainer_id: authUser.id,
      title: routine.title || routine.name || 'Nueva Rutina AI',
      version: 1,
      source: routine.source || 'fallback',
      content: routine,
      notes: routine.summary || routine.description || ''
    };

    const { error } = await client.from('routines').insert(payload).select().single();
    if (error) throw error;

    if (routine.source === 'ai') {
      await this.incrementTrainerUsage(authUser.id, 'routines');
    }
  },

  async saveDiet(trainerId, clientId, diet) {
    const client = requireSupabase();

    if (!diet) {
      const authUser = await requireAuthUser();
      const { error } = await client.from('diets').delete().eq('client_id', clientId).eq('trainer_id', authUser.id);
      if (error) throw error;
      return;
    }

    const authUser = await requireAuthUser();
    const payload = {
      client_id: clientId,
      trainer_id: authUser.id,
      title: diet.title || 'Plan Nutricional AI',
      version: 1,
      source: diet.source || 'fallback',
      content: diet,
      notes: diet.summary || diet.notes || ''
    };

    const { error } = await client.from('diets').insert(payload).select().single();
    if (error) throw error;

    if (diet.source === 'ai') {
      await this.incrementTrainerUsage(authUser.id, 'diets');
    }
  },

  async getRoutines(clientId) {
    const client = requireSupabase();
    const authUser = await requireAuthUser();
    const { data, error } = await client
      .from('routines')
      .select('*')
      .eq('client_id', clientId)
      .eq('trainer_id', authUser.id)
      .order('created_at', { ascending: false });

    if (error) return [];
    return data.map((r: any) => ({ ...r.content, id: r.id, createdAt: r.created_at }));
  },

  async getDiet(clientId) {
    const client = requireSupabase();
    const authUser = await requireAuthUser();
    const { data, error } = await client
      .from('diets')
      .select('*')
      .eq('client_id', clientId)
      .eq('trainer_id', authUser.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return { ...data.content, id: data.id, createdAt: data.created_at };
  },

  async getOrCreateTrainerUsage(trainerId) {
    const client = requireSupabase();

    const [clientCountRes, routineCountRes, dietCountRes] = await Promise.all([
      client.from('clients').select('*', { count: 'exact', head: true }).eq('trainer_id', trainerId),
      client.from('routines').select('*', { count: 'exact', head: true }).eq('trainer_id', trainerId).eq('source', 'ai'),
      client.from('diets').select('*', { count: 'exact', head: true }).eq('trainer_id', trainerId).eq('source', 'ai')
    ]);

    if (clientCountRes.error) throw clientCountRes.error;
    if (routineCountRes.error) throw routineCountRes.error;
    if (dietCountRes.error) throw dietCountRes.error;

    const currentTotals = {
      clients_created_total: clientCountRes.count || 0,
      ai_routines_generated_total: routineCountRes.count || 0,
      ai_diets_generated_total: dietCountRes.count || 0
    };

    const { data, error } = await client
      .from('trainer_usage')
      .select('*')
      .eq('trainer_id', trainerId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      const backfilled = {
        clients_created_total: Math.max(data.clients_created_total || 0, currentTotals.clients_created_total),
        ai_routines_generated_total: Math.max(data.ai_routines_generated_total || 0, currentTotals.ai_routines_generated_total),
        ai_diets_generated_total: Math.max(data.ai_diets_generated_total || 0, currentTotals.ai_diets_generated_total)
      };

      const needsBackfill =
        backfilled.clients_created_total !== data.clients_created_total ||
        backfilled.ai_routines_generated_total !== data.ai_routines_generated_total ||
        backfilled.ai_diets_generated_total !== data.ai_diets_generated_total;

      if (!needsBackfill) return data;

      const { data: updatedData, error: updateErr } = await client
        .from('trainer_usage')
        .update({ ...backfilled, updated_at: new Date().toISOString() })
        .eq('trainer_id', trainerId)
        .select()
        .single();

      if (updateErr) throw updateErr;
      return updatedData;
    }

    const { data: newUsage, error: insertError } = await client
      .from('trainer_usage')
      .insert({ trainer_id: trainerId, ...currentTotals })
      .select()
      .single();

    if (insertError) throw insertError;
    return newUsage;
  },

  async incrementTrainerUsage(trainerId, type) {
    const client = requireSupabase();
    const current = await this.getOrCreateTrainerUsage(trainerId);

    const increments: any = {};
    if (type === 'clients') {
      increments.clients_created_total = (current.clients_created_total || 0) + 1;
    } else if (type === 'routines') {
      increments.ai_routines_generated_total = (current.ai_routines_generated_total || 0) + 1;
    } else if (type === 'diets') {
      increments.ai_diets_generated_total = (current.ai_diets_generated_total || 0) + 1;
    }

    increments.updated_at = new Date().toISOString();

    const { data, error } = await client
      .from('trainer_usage')
      .update(increments)
      .eq('trainer_id', trainerId)
      .select()
      .single();

    if (error) throw error;

    if (lastFetchedUser && lastFetchedUser.uid === trainerId) {
      lastFetchedUser.trainerUsage = data;
    }

    return data;
  },

  async getTotalRoutinesCount(trainerId) {
    const client = requireSupabase();
    const { count, error } = await client
      .from('routines')
      .select('*', { count: 'exact', head: true })
      .eq('trainer_id', trainerId);
    if (error) throw error;
    return count || 0;
  },

  async getTotalDietsCount(trainerId) {
    const client = requireSupabase();
    const { count, error } = await client
      .from('diets')
      .select('*', { count: 'exact', head: true })
      .eq('trainer_id', trainerId);
    if (error) throw error;
    return count || 0;
  }
};

const mapClientToFrontend = (c: any, routines: any[] = [], dietPlan: any = null) => {
  if (!c) return null;
  const meta = parseNotes(c.notes);
  const payment = meta.payment || meta.payment_info || {};
  const training = meta.training || {};
  const profile = meta.profile || {};

  return {
    id: c.id,
    trainerId: c.trainer_id,
    name: c.full_name || c.name,
    email: c.email,
    phone: c.phone,
    gender: c.sex || c.gender,
    age: profile.age || meta.age || (c.birth_date ? new Date().getFullYear() - new Date(c.birth_date).getFullYear() : null),
    country: profile.country || meta.country,
    avatarUrl: c.avatar_url || meta.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.full_name || c.name || 'Client')}&background=random`,
    weight: c.weight_kg !== undefined ? c.weight_kg : (c.weight !== undefined ? c.weight : profile.weight || meta.weight),
    height: c.height_cm !== undefined ? c.height_cm : (c.height !== undefined ? c.height : profile.height || meta.height),
    experienceLevel: c.experience_level || c.activity_level || profile.experienceLevel || meta.experienceLevel,
    mainGoal: c.goal || c.main_goal || profile.mainGoal || meta.mainGoal,
    goals: profile.goals || meta.goals || [],
    trainingDays: training.days || meta.trainingDays || [],
    trainingTime: training.time || meta.trainingTime,
    routines: routines || [],
    dietPlan: dietPlan || null,
    paymentInfo: {
      monthlyFee: payment.monthlyFee || c.payment_amount || 0,
      paymentMethod: payment.paymentMethod || c.payment_method || 'efectivo',
      status: (payment.status || c.payment_status || 'sin_registro') as any,
      lastPaidAt: payment.lastPaidAt || c.last_paid_at || null,
      nextPaymentAt: payment.nextPaymentAt || c.next_payment_at || null
    },
    status: c.status || 'active',
    createdAt: c.created_at
  } as any;
};
