
import { IDBProvider } from './dbInterface';
import { supabase, isSupabaseEnabled } from '../services/supabaseClient';
import { Client, User } from '../types';

// Helper para limitar el tiempo de espera de las peticiones
const withTimeout = <T>(promise: Promise<T> | any, ms: number, operation: string): Promise<T> => {
  return Promise.race([
    promise as Promise<T>,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Supabase timeout: ${operation}`)), ms)
    )
  ]);
};

// Helper para reintentos con retraso progresivo (backoff)
const retryPromise = async <T>(fn: () => Promise<T>, retries = 3, delay = 800): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    if (retries <= 0) throw error;
    console.warn(`[RETRY] Intento fallido (${error.message || error}). Intentos restantes: ${retries}. Reintentando en ${delay}ms...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryPromise(fn, retries - 1, delay * 1.5);
  }
};

let lastFetchedUser: any = null;
let lastFetchTime = 0;
let isFetchingUser = false;

export const supabaseProvider: IDBProvider = {
  name: 'Supabase Cloud',

  async signUp(email, pass) {
    if (!isSupabaseEnabled()) throw new Error("Supabase no está configurado.");
    
    console.log("Supabase: signUp start");
    const { data, error } = (await withTimeout(supabase!.auth.signUp({ 
      email, 
      password: pass,
      options: { emailRedirectTo: window.location.origin }
    }), 5000, "signUp")) as any;
    
    if (error) {
      console.error("Supabase SignUp Error:", error);
      throw error;
    }

    // Caso crítico: El usuario se crea pero requiere confirmación de email
    if (data.user && !data.session) {
      return { 
        user: data.user, 
        message: "CONFIRM_EMAIL", 
        detail: "Cuenta creada. Por seguridad, debes confirmar tu email antes de entrar." 
      };
    }

    return data;
  },

  async signIn(email, pass) {
    if (!isSupabaseEnabled()) throw new Error("Supabase no está configurado.");
    
    const { data, error } = await supabase!.auth.signInWithPassword({ email, password: pass });
    
    if (error) {
      console.error("Supabase SignIn Error:", error);
      throw error;
    }
    
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
    
    if (isFetchingUser) {
        if ((import.meta as any).env?.DEV) {
            console.log("Supabase: getCurrentUser skipped - fetch already in progress, returning last cache");
        }
        return lastFetchedUser;
    }

    const now = Date.now();
    if (!forceFresh && lastFetchedUser && (now - lastFetchTime < 60000)) {
        if ((import.meta as any).env?.DEV) {
            console.log("Supabase: returning recently active cached user profile:", lastFetchedUser.email);
        }
        return lastFetchedUser;
    }

    if ((import.meta as any).env?.DEV) {
        console.log("Supabase: getCurrentUser starting fresh fetch");
    }

    isFetchingUser = true;
    if ((import.meta as any).env?.DEV) {
        console.log("AUTH LOOP FIX ACTIVE: Fetching user profile from Supabase DB...");
    }

    const fetchOperation = async () => {
        if ((import.meta as any).env?.DEV) {
            console.log("Supabase: auth.getSession start (inside retry container)");
        }
        
        const { data: { session }, error: authError } = (await withTimeout(supabase!.auth.getSession(), 3000, "getSession")) as any;
        if (authError) {
            throw authError;
        }
        
        const user = session?.user;
        if ((import.meta as any).env?.DEV) {
            console.log("Supabase: auth.getSession end", user ? "User found" : "No user");
        }
        
        if (!user) return null;
        
        if ((import.meta as any).env?.DEV) {
            console.log("Supabase: profiles fetch start for id", user.id);
        }
        
        const { data: profile, error: profError } = (await withTimeout(
            supabase!
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single(),
            3000,
            "profilesFetch"
        )) as any;
        
        if (profError) {
            throw profError;
        }
        
        if (!profile) {
            console.log("Supabase: Profile missing, attempting auto-create/backfill", user.id);
            const { data: newProfile, error: createProfError } = (await withTimeout(
                supabase!
                  .from('profiles')
                  .insert({
                      id: user.id,
                      email: user.email!,
                      display_name: user.email?.split('@')[0] || 'User',
                      subscription_type: 'trial',
                      account_status: 'active'
                  })
                  .select()
                  .single(),
                3000,
                "profileCreate"
            )) as any;
            
            if (createProfError) {
                console.error("Supabase: Failed to auto-create profile", createProfError);
                throw createProfError;
            }
            
            const createdUsage = await this.getOrCreateTrainerUsage(newProfile.id);
            const createdUser = {
                uid: newProfile.id,
                email: newProfile.email,
                displayName: newProfile.display_name,
                createdAt: newProfile.created_at,
                subscription: {
                    type: newProfile.subscription_type || 'trial',
                    isActive: true,
                    usage: { weekStart: new Date().toISOString(), aiRoutinesByClient: {}, aiDietsByClient: {} }
                },
                trainerUsage: createdUsage
            } as any;
            lastFetchedUser = createdUser;
            lastFetchTime = Date.now();
            return createdUser;
        }

        const DEV_FORCE_PRO = false; // Solo activa manualmente en desarrollo
        const effectiveType = DEV_FORCE_PRO ? 'pro' : (profile.subscription_type || 'trial');
        const effectiveStatus = DEV_FORCE_PRO ? true : (profile.is_active !== false);

        const trainerUsage = await this.getOrCreateTrainerUsage(user.id);

        const mappedUser = {
          uid: profile.id,
          email: profile.email,
          displayName: profile.display_name || profile.email.split('@')[0],
          createdAt: profile.created_at,
          branding: profile.branding,
          publicProfile: profile.public_profile,
          subscription: {
            type: effectiveType,
            isActive: effectiveStatus,
            billingInterval: profile.billing_interval,
            status: profile.account_status || (profile.is_active ? 'active' : 'inactive'),
            usage: { weekStart: new Date().toISOString(), aiRoutinesByClient: {}, aiDietsByClient: {} },
            stripeCustomerId: profile.stripe_customer_id,
            stripeSubscriptionId: profile.stripe_subscription_id,
            currentPeriodEnd: profile.current_period_end
          },
          isAdmin: profile.is_admin || false,
          trainerUsage: trainerUsage
        } as any;

        lastFetchedUser = mappedUser;
        lastFetchTime = Date.now();
        return mappedUser;
    };

    try {
        return await retryPromise(fetchOperation, 1, 500);
    } catch (e: any) {
        if ((import.meta as any).env?.DEV) {
            console.warn("Supabase: All getCurrentUser retry attempts failed:", e.message || e);
        }
        // Fallback: If we had a previously fetched user, return it to keep active session alive!
        if (lastFetchedUser) {
            if ((import.meta as any).env?.DEV) {
                console.log("Supabase: Returning stale memory cached user profile as fallback.");
            }
            return lastFetchedUser;
        }
        
        // Secondary fallback: Try to parse user from localStorage to safeguard on initialization
        try {
            const cachedUserString = localStorage.getItem('mvptrainer_cached_user');
            if (cachedUserString) {
                const parsed = JSON.parse(cachedUserString);
                if (parsed && parsed.uid) {
                    if ((import.meta as any).env?.DEV) {
                        console.log("Supabase: Returning cached localStorage user profile as secondary fallback.");
                    }
                    lastFetchedUser = parsed;
                    return parsed;
                }
            }
        } catch (_) {}

        if (e.message?.includes("timeout") || e.message?.includes("fetch")) {
            return undefined as any; // special timeout indicator
        }
        return null;
    } finally {
        isFetchingUser = false;
    }
  },

  onAuthStateChanged(callback) {
    if (!isSupabaseEnabled()) return () => {};
    
    const { data: { subscription } } = supabase!.auth.onAuthStateChange(async (event, session) => {
      if ((import.meta as any).env?.DEV) {
          console.log("AUTH LOOP FIX ACTIVE: authStateChange event triggered -", event);
      }
      if ((import.meta as any).env?.DEV) {
          console.log(`[AUTH STATE CHANGE SOURCE] Event: ${event}`, session ? "Session active" : "No session");
      }

      const cached = localStorage.getItem('mvptrainer_cached_user');
      let parsedCachedUser: any = null;
      if (cached) {
          try { parsedCachedUser = JSON.parse(cached); } catch(_) {}
      }
      const activeUserFallback = lastFetchedUser || parsedCachedUser;

      if (session?.user) {
        // If the same user's token refreshed, we can just forward the cached profile without a new DB fetch
        if ((event as string) === 'TOKEN_REFRESHED' && activeUserFallback && activeUserFallback.uid === session.user.id) {
            if ((import.meta as any).env?.DEV) {
                console.log("Supabase: TOKEN_REFRESHED for active user, forwarding cached profile immediately.");
            }
            callback(activeUserFallback, event);
            return;
        }

        // STEP 4: Bypass getCurrentUser on SIGNED_IN for a matching user reference
        if (event === 'SIGNED_IN' && activeUserFallback && activeUserFallback.uid === session.user.id) {
            if ((import.meta as any).env?.DEV) {
                console.log("AUTH: using existing cached user");
            }
            callback(activeUserFallback, event);
            return;
        }
        
        const user = await this.getCurrentUser();
        callback(user, event);
      } else {
        // Handle null session when transient
        if (event !== 'SIGNED_OUT' && (event as string) !== 'USER_DELETED') {
            if (activeUserFallback) {
                if ((import.meta as any).env?.DEV) {
                    console.warn(`Supabase: Event ${event} reported null session with active cached user. IGNORING transient state.`);
                }
                callback(activeUserFallback, event);
                return;
            }
        }
        // ONLY trigger null/logout on true SIGNED_OUT or USER_DELETED events
        callback(null, event);
      }
    });
    
    return () => subscription.unsubscribe();
  },

  async getClients(trainerId) {
    if ((import.meta as any).env?.DEV) {
        console.log("Supabase: getClients start for trainer", trainerId);
    }
    if (!trainerId || trainerId === 'undefined') {
        if ((import.meta as any).env?.DEV) {
            console.log("Supabase: getClients skipped, trainerId is undefined");
        }
        return [];
    }
    
    try {
      // Parallel fetch of clients, routines, and diets (excluding soft-deleted clients)
      const [clientsRes, routinesRes, dietsRes] = await Promise.all([
        supabase!
          .from('clients')
          .select('*')
          .eq('trainer_id', trainerId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
        supabase!
          .from('routines')
          .select('*')
          .eq('trainer_id', trainerId)
          .order('created_at', { ascending: false }),
        supabase!
          .from('diets')
          .select('*')
          .eq('trainer_id', trainerId)
          .order('created_at', { ascending: false })
      ]);

      if (clientsRes.error) throw clientsRes.error;

      const clientsData = clientsRes.data || [];
      const routinesData = routinesRes.data || [];
      const dietsData = dietsRes.data || [];

      // Group routines by client_id
      const routinesByClient: Record<string, any[]> = {};
      routinesData.forEach((r: any) => {
        if (!routinesByClient[r.client_id]) {
          routinesByClient[r.client_id] = [];
        }
        routinesByClient[r.client_id].push({
          ...r.content,
          id: r.id,
          createdAt: r.created_at
        });
      });

      // Group diets by client_id (one plan per client)
      const dietByClient: Record<string, any> = {};
      dietsData.forEach((d: any) => {
        if (!dietByClient[d.client_id]) {
          dietByClient[d.client_id] = {
            ...d.content,
            id: d.id,
            createdAt: d.created_at
          };
        }
      });

      if ((import.meta as any).env?.DEV) {
          console.log("Supabase: getClients success, count:", clientsData.length);
      }
      return clientsData.map((c: any) => 
        mapClientToFrontend(c, routinesByClient[c.id] || [], dietByClient[c.id] || null)
      );
    } catch (e) {
      if ((import.meta as any).env?.DEV) {
          console.error("Supabase: getClients error", e);
      }
      throw e;
    }
  },

  subscribeToClients(trainerId, callback, onStatus) {
    if (!isSupabaseEnabled()) return () => {};
    if (!trainerId || trainerId === 'undefined') return () => {};

    if ((import.meta as any).env?.DEV) {
        console.log("Supabase: subscribeToClients start (Unified Postgres Change Listener)");
    }
    // Initial fetch
    this.getClients(trainerId).then(callback);

    // Realtime subscription watching clients, routines, and diets to have zero lag
    const channel = supabase!
      .channel(`unified-trainer-${trainerId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'clients',
          filter: `trainer_id=eq.${trainerId}`
        },
        () => {
          console.log("Supabase Realtime: clients change, re-fetching");
          this.getClients(trainerId).then(callback);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'routines',
          filter: `trainer_id=eq.${trainerId}`
        },
        () => {
          console.log("Supabase Realtime: routines change, re-fetching");
          this.getClients(trainerId).then(callback);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'diets',
          filter: `trainer_id=eq.${trainerId}`
        },
        () => {
          console.log("Supabase Realtime: diets change, re-fetching");
          this.getClients(trainerId).then(callback);
        }
      );

    channel.subscribe((status, err) => {
      console.log(`REALTIME CHANNEL STATUS: ${status}`, err || '');
      if (onStatus) {
        onStatus(status);
      }
    });

    return () => {
      console.log("Supabase: subscribeToClients unsubscribe");
      supabase!.removeChannel(channel);
    };
  },

  async createClient(passedTrainerId, data) {
    console.log("Supabase: createClient start, data received:", data);
    
    // Obtenemos el usuario autenticado real para evitar falsos trainerId
    const { data: { user } } = await supabase!.auth.getUser();
    if (!user) throw new Error("No hay sesión activa para crear cliente.");
    
    console.log("AUTH USER ID:", user.id);
    const trainerId = user.id; // Forzamos el uso del ID real de la sesión
    
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
      birth_date: data.age 
        ? `${new Date().getFullYear() - data.age}-01-01`
        : null,
      weight_kg: data.weight,
      height_cm: data.height,
      activity_level: data.experienceLevel,
      goal: data.goals?.[0] || null,
      payment_amount: monthlyFee,
      payment_day: now.getDate(),
      billing_frequency: "monthly",
      notes: JSON.stringify({
        payment: {
          monthlyFee: monthlyFee,
          status: "al_dia",
          paymentMethod: "efectivo",
          lastPaidAt: todayISO,
          nextPaymentAt: nextMonthISO
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

    console.log("CLIENT INSERT PAYLOAD SAFE:", insertPayload);

    try {
        const { data: newClient, error } = await supabase!.from('clients').insert(insertPayload).select().single();
        if (error) throw error;
        
        // Incrementar contador histórico +1 al crearse con éxito
        await this.incrementTrainerUsage(trainerId, 'clients');
        
        return mapClientToFrontend(newClient);
    } catch (e) {
        console.error("Supabase: createClient critical error", e);
        throw e;
    }
  },

  async updateClient(clientId, data) {
    console.log("Supabase: updateClient start", clientId, data);
    
    // Obtenemos el usuario para el payload y para el filtro de seguridad
    const { data: { user } } = await supabase!.auth.getUser();
    if (!user) throw new Error("No hay sesión activa.");

    // Obtener datos existentes para no perder el fee u otros campos si no vienen en el payload
    const { data: existing } = await supabase!
        .from('clients')
        .select('*')
        .eq('id', clientId)
        .eq('trainer_id', user.id)
        .single();

    const monthlyFee = data.paymentInfo?.monthlyFee !== undefined 
        ? Number(data.paymentInfo.monthlyFee) 
        : (existing?.payment_amount || 0);

    const updatePayload: any = {
      trainer_id: user.id, // Re-afirmamos para RLS
      full_name: data.name,
      email: data.email,
      phone: data.phone,
      sex: data.gender,
      birth_date: data.age 
        ? `${new Date().getFullYear() - data.age}-01-01`
        : (existing?.birth_date || null),
      weight_kg: data.weight,
      height_cm: data.height,
      activity_level: data.experienceLevel,
      goal: data.goals?.[0] || (existing?.goal || null),
      payment_amount: monthlyFee,
      notes: JSON.stringify({
        payment: { ...(existing?.notes ? JSON.parse(existing.notes).payment : {}), ...(data.paymentInfo || {}) },
        training: {
          days: data.trainingDays || (existing?.notes ? JSON.parse(existing.notes).training?.days : []),
          time: data.trainingTime || (existing?.notes ? JSON.parse(existing.notes).training?.time : "")
        },
        profile: {
          age: data.age || (existing?.notes ? JSON.parse(existing.notes).profile?.age : ""),
          country: data.country || (existing?.notes ? JSON.parse(existing.notes).profile?.country : ""),
          goals: data.goals || (existing?.notes ? JSON.parse(existing.notes).profile?.goals : [])
        }
      })
    };

    console.log("CLIENT UPDATE PAYLOAD SAFE:", updatePayload);

    try {
        const { error } = await supabase!
            .from('clients')
            .update(updatePayload)
            .eq('id', clientId)
            .eq('trainer_id', user.id);
        if (error) throw error;
    } catch (e) {
        console.error("Supabase: updateClient error", e);
        throw e;
    }
  },

  async deleteClient(clientId) {
    console.log("Supabase: deleteClient start", clientId);
    const { data: { user } } = await supabase!.auth.getUser();
    if (!user) {
        console.error("Supabase: deleteClient error - No session");
        throw new Error("No hay sesión para esta operación.");
    }

    console.log("Supabase: deleteClient start execution", { clientId, userId: user.id });

    // Realizamos soft-delete seteando la columna `deleted_at` con la fecha y hora actuales
    const { data, error } = await supabase!
      .from('clients')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', clientId)
      .eq('trainer_id', user.id)
      .select('id');
      
    if (error) {
        console.error("Supabase: deleteClient error detail:", error);
        throw error;
    }

    console.log("Supabase: deleteClient deleted rows (returned data):", data);

    if (!data || data.length === 0) {
        console.warn("Supabase: deleteClient - No rows were affected. This usually means the row doesn't exist or RLS blocked the deletion.");
        throw new Error("No se eliminó ninguna fila. Posible problema de RLS (no eres el dueño) o el ID del cliente es incorrecto.");
    }

    console.log("Supabase: deleteClient success", clientId);
  },

  async archiveRoutine(routineId) {
    const { error } = await supabase!
      .from('routines')
      .delete()
      .eq('id', routineId);
    if (error) throw error;
  },

  async archiveDiet(dietId) {
    const { error } = await supabase!
        .from('diets')
        .delete()
        .eq('id', dietId);
    if (error) throw error;
  },

  async updateUser(uid, data) {
    const { data: profile, error } = await supabase!
        .from('profiles')
        .update(data)
        .eq('id', uid)
        .select()
        .single();
        
    if (error) throw error;
    return profile;
  },

  async getProfile(uid) {
    const { data, error } = await supabase!
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
    const { data: { user } } = await supabase!.auth.getUser();
    if (!user) throw new Error("No hay sesión activa para guardar rutina.");

    const payload = {
      client_id: clientId,
      trainer_id: user.id,
      title: routine.title || routine.name || "Nueva Rutina AI",
      version: 1,
      source: routine.source || "fallback",
      content: routine,
      notes: routine.summary || routine.description || ""
    };

    console.log("Routines: Saving payload (INSERT):", payload);

    const { data, error } = await supabase!
      .from('routines')
      .insert(payload)
      .select()
      .single();
      
    if (error) {
        console.error("Routines: Error saving:", error);
        throw error;
    }
    console.log("Routine saved success:", data);
    
    // Incrementar contador histórico +1 si viene de la IA
    if (routine.source === 'ai') {
        await this.incrementTrainerUsage(user.id, 'routines');
    }
  },

  async saveDiet(trainerId, clientId, diet) {
    if (!diet) {
        const { error } = await supabase!.from('diets').delete().eq('client_id', clientId);
        if (error) throw error;
        return;
    }

    const { data: { user } } = await supabase!.auth.getUser();
    if (!user) throw new Error("No hay sesión activa para guardar dieta.");

    const payload = {
      client_id: clientId,
      trainer_id: user.id,
      title: diet.title || "Plan Nutricional AI",
      version: 1,
      source: diet.source || "fallback",
      content: diet,
      notes: diet.summary || diet.notes || ""
    };

    console.log("Diets: Saving payload (INSERT):", payload);

    const { data, error } = await supabase!
      .from('diets')
      .insert(payload)
      .select()
      .single();
      
    if (error) {
        console.error("Diets: Error saving:", error);
        throw error;
    }
    console.log("Diet saved success:", data);
    
    // Incrementar contador histórico +1 si viene de la IA
    if (diet.source === 'ai') {
        await this.incrementTrainerUsage(user.id, 'diets');
    }
  },

  async getRoutines(clientId) {
    const { data, error } = await supabase!
      .from('routines')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });
    
    if (error) return [];
    return data.map((r: any) => ({
        ...r.content,
        id: r.id,
        createdAt: r.created_at
    }));
  },

  async getDiet(clientId) {
    const { data, error } = await supabase!
      .from('diets')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .maybeSingle();
    
    if (error || !data) return null;
    return {
        ...data.content,
        id: data.id,
        createdAt: data.created_at
    };
  },

  async getOrCreateTrainerUsage(trainerId) {
    if (!isSupabaseEnabled()) {
        return {
            trainer_id: trainerId,
            clients_created_total: 0,
            ai_routines_generated_total: 0,
            ai_diets_generated_total: 0
        };
    }
    
    // Obtener total real histórico de clientes en DB para propósitos de Backfill
    let currentTotalCount = 0;
    try {
        const { count, error: countErr } = await supabase!
            .from('clients')
            .select('*', { count: 'exact', head: true })
            .eq('trainer_id', trainerId);
            
        if (!countErr && count !== null) {
            currentTotalCount = count;
        }
    } catch (err) {
        console.warn("Supabase backfill client count query failed:", err);
    }
    
    try {
        const { data, error } = await supabase!
            .from('trainer_usage')
            .select('*')
            .eq('trainer_id', trainerId)
            .maybeSingle();
            
        if (error) {
            throw error;
        }
        
        if (data) {
            // BACKFILL: Si el conteo real en DB es mayor al registrado, actualizamos la tabla para sincronizar
            if (currentTotalCount > (data.clients_created_total || 0)) {
                console.log(`[BACKFILL] Sincronizando trainer_usage. DB count: ${currentTotalCount}, actual: ${data.clients_created_total}`);
                const { data: updatedData, error: updateErr } = await supabase!
                    .from('trainer_usage')
                    .update({ clients_created_total: currentTotalCount, updated_at: new Date().toISOString() })
                    .eq('trainer_id', trainerId)
                    .select()
                    .single();
                if (!updateErr && updatedData) {
                    return updatedData;
                }
            }
            return data;
        }
        
        // No existe: crearlo sincronizado con el conteo de clientes real
        const { data: newUsage, error: insertError } = await supabase!
            .from('trainer_usage')
            .insert({
                trainer_id: trainerId,
                clients_created_total: currentTotalCount,
                ai_routines_generated_total: 0,
                ai_diets_generated_total: 0
            })
            .select()
            .single();
            
        if (insertError) {
            throw insertError;
        }
        return newUsage;
    } catch (e: any) {
        if ((import.meta as any).env?.DEV) {
            console.warn("Supabase: Error reading/creating trainer_usage. Using local fallback.", e);
        }
        // Fallback robusto usando localStorage para no colapsar la app en pre-producción o antes de migrar SQL
        const localKey = `mvptrainer_usage_fallback_${trainerId}`;
        const cached = localStorage.getItem(localKey);
        if (cached) {
            try { return JSON.parse(cached); } catch { /* ignore */ }
        }
        const fallbackObj = {
            trainer_id: trainerId,
            clients_created_total: Math.max(0, currentTotalCount),
            ai_routines_generated_total: 0,
            ai_diets_generated_total: 0
        };
        localStorage.setItem(localKey, JSON.stringify(fallbackObj));
        return fallbackObj;
    }
  },

  async incrementTrainerUsage(trainerId, type) {
    const current = await this.getOrCreateTrainerUsage(trainerId);
    
    // Incremos locales
    const increments: any = {};
    if (type === 'clients') {
        increments.clients_created_total = (current.clients_created_total || 0) + 1;
    } else if (type === 'routines') {
        increments.ai_routines_generated_total = (current.ai_routines_generated_total || 0) + 1;
    } else if (type === 'diets') {
        increments.ai_diets_generated_total = (current.ai_diets_generated_total || 0) + 1;
    }
    
    increments.updated_at = new Date().toISOString();
    
    if (!isSupabaseEnabled()) {
        return { ...current, ...increments };
    }
    
    try {
        const { data, error } = await supabase!
            .from('trainer_usage')
            .update(increments)
            .eq('trainer_id', trainerId)
            .select()
            .single();
            
        if (error) {
            // Intentar con insert si por alguna razón falla el update
            const { data: inserted, error: upsertError } = await supabase!
                .from('trainer_usage')
                .upsert({
                    trainer_id: trainerId,
                    clients_created_total: increments.clients_created_total ?? current.clients_created_total ?? 0,
                    ai_routines_generated_total: increments.ai_routines_generated_total ?? current.ai_routines_generated_total ?? 0,
                    ai_diets_generated_total: increments.ai_diets_generated_total ?? current.ai_diets_generated_total ?? 0,
                    updated_at: increments.updated_at
                })
                .select()
                .single();
            if (upsertError) throw upsertError;
            
            if (lastFetchedUser && lastFetchedUser.uid === trainerId) {
                lastFetchedUser.trainerUsage = inserted;
            }
            return inserted;
        }
        
        // Cachear en lastFetchedUser si aplica
        if (lastFetchedUser && lastFetchedUser.uid === trainerId) {
            lastFetchedUser.trainerUsage = data;
        }
        
        // Sincronizar local storage
        const localKey = `mvptrainer_usage_fallback_${trainerId}`;
        localStorage.setItem(localKey, JSON.stringify(data));
        
        return data;
    } catch (e: any) {
        if ((import.meta as any).env?.DEV) {
            console.warn("Supabase: Error updating trainer_usage. Using local fallback updates.", e);
        }
        const updatedFallback = { ...current, ...increments };
        const localKey = `mvptrainer_usage_fallback_${trainerId}`;
        localStorage.setItem(localKey, JSON.stringify(updatedFallback));
        
        if (lastFetchedUser && lastFetchedUser.uid === trainerId) {
            lastFetchedUser.trainerUsage = updatedFallback;
        }
        return updatedFallback;
    }
  },

  async getTotalRoutinesCount(trainerId) {
    if (!isSupabaseEnabled()) return 0;
    try {
        const { count, error } = await supabase!
            .from('routines')
            .select('*', { count: 'exact', head: true })
            .eq('trainer_id', trainerId);
        if (error) {
            console.error("Supabase error fetching total routines count:", error);
            return 0;
        }
        return count || 0;
    } catch (e: any) {
        console.error("Error getting total routines count:", e);
        return 0;
    }
  },

  async getTotalDietsCount(trainerId) {
    if (!isSupabaseEnabled()) return 0;
    try {
        const { count, error } = await supabase!
            .from('diets')
            .select('*', { count: 'exact', head: true })
            .eq('trainer_id', trainerId);
        if (error) {
            console.error("Supabase error fetching total diets count:", error);
            return 0;
        }
        return count || 0;
    } catch (e: any) {
        console.error("Error getting total diets count:", e);
        return 0;
    }
  }
};

// Helper interno para mapear cliente uniformemente
const mapClientToFrontend = (c: any, routines: any[] = [], dietPlan: any = null) => {
  if (!c) return null;
  let meta: any = {};
  try {
    if (c.notes && (c.notes.startsWith('{') || c.notes.startsWith('['))) {
      meta = JSON.parse(c.notes);
    }
  } catch (e) {
    meta = {};
  }
  
  // Soporte para nueva estructura: meta.payment, meta.training, meta.profile
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
