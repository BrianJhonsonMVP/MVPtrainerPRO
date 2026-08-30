import { IDBProvider } from './dbInterface';
import { supabase, isSupabaseEnabled } from '../services/supabaseClient';
import { BillingRecord, BrandingConfig, Client, ClientPaymentInfo, PublicProfile, User } from '../types';
import {
  markSubscriptionSyncing,
  markSubscriptionSyncFailed,
  resolveSubscriptionEntitlements
} from '../services/subscriptionEntitlements';

const LOG_SUPABASE_RETRIES = false;
const LOG_REALTIME_STATUS = false;

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
    if (LOG_SUPABASE_RETRIES && (import.meta as any).env?.DEV) {
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

const toDateOnly = (value?: string | null) => {
  if (!value) return null;
  const directDate = value.match(/^(\d{4}-\d{2}-\d{2})/);
  if (directDate) return directDate[1];
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : null;
};

const mapBillingRecord = (record: any): BillingRecord => ({
  id: record.id,
  clientId: record.client_id,
  trainerId: record.trainer_id,
  amount: Number(record.amount) || 0,
  dueDate: record.due_date,
  paidAt: record.paid_at || null,
  status: record.status,
  notes: record.notes || null,
  createdAt: record.created_at,
  updatedAt: record.updated_at
});

const mapBranding = (value: any): BrandingConfig | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  return {
    brandName: value.brandName || value.brand_name || '',
    logoUrl: value.logoUrl || value.logo_url || '',
    primaryColor: value.primaryColor || value.primary_color || '#8B5CF6',
    secondaryColor: value.secondaryColor || value.secondary_color || '#050505'
  };
};

const mapPublicProfile = (value: any): PublicProfile | undefined => {
  if (!value) return undefined;
  return {
    professionalTitle: value.professional_title || value.professionalTitle || '',
    trainerName: value.trainer_name || value.trainerName || '',
    headline: value.headline || '',
    callToAction: value.cta_text || value.callToAction || 'WhatsApp',
    description: value.description || '',
    services: Array.isArray(value.services) ? value.services : [],
    targets: Array.isArray(value.targets) ? value.targets : [],
    whatsAppNumber: value.whatsapp_number || value.whatsAppNumber || '',
    backgroundColor: value.background_color || value.backgroundColor || '#07080d',
    profileImageUrl: value.avatar_url || value.profileImageUrl || '',
    galleryImages: Array.isArray(value.gallery_images) ? value.gallery_images : [],
    modality: value.modality || 'ambas',
    location: value.location || '',
    presentationMode: value.presentation_mode || value.presentationMode || 'mixed',
    cardFormat: value.card_format || value.cardFormat || 'post',
    cardTemplate: value.card_template || value.cardTemplate || 'balanced',
    photoPositionY: Number(value.photo_position_y ?? value.photoPositionY ?? 50),
    slug: value.slug || '',
    isPublished: Boolean(value.is_published ?? value.isPublished)
  };
};

const toPublicProfileRow = (
  uid: string,
  profile: PublicProfile,
  displayName: string,
  branding?: BrandingConfig
) => ({
  id: uid,
  slug: profile.slug?.trim() || uid,
  professional_title: profile.professionalTitle?.trim() || displayName,
  trainer_name: profile.trainerName?.trim() || displayName,
  headline: profile.headline?.trim() || null,
  description: profile.description?.trim() || null,
  avatar_url: profile.profileImageUrl || null,
  whatsapp_number: (profile.whatsAppNumber || '').replace(/\D/g, '') || null,
  cta_text: profile.callToAction?.trim() || 'WhatsApp',
  is_published: Boolean(profile.isPublished),
  brand_name: branding?.brandName?.trim() || displayName,
  logo_url: branding?.logoUrl || null,
  primary_color: branding?.primaryColor || '#8B5CF6',
  secondary_color: branding?.secondaryColor || '#050505',
  services: profile.services || [],
  targets: profile.targets || [],
  modality: profile.modality || 'ambas',
  location: profile.location?.trim() || null,
  presentation_mode: profile.presentationMode || 'mixed',
  card_format: profile.cardFormat || 'post',
  card_template: profile.cardTemplate || 'balanced',
  photo_position_y: Math.min(100, Math.max(0, profile.photoPositionY ?? 50)),
  background_color: profile.backgroundColor || '#07080d',
  updated_at: new Date().toISOString()
});

const findBillingRecord = async (
  client: any,
  trainerId: string,
  clientId: string,
  dueDate: string,
  statuses: Array<'pending' | 'paid' | 'late'>
) => {
  const { data, error } = await client
    .from('billing_records')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('client_id', clientId)
    .eq('due_date', dueDate)
    .in('status', statuses)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
};

const ensureBillingRecord = async (
  client: any,
  trainerId: string,
  clientId: string,
  dueDate: string,
  amount: number,
  status: 'pending' | 'paid' | 'late',
  paidAt: string | null
) => {
  const matchingStatuses = status === 'paid'
    ? ['paid'] as const
    : ['pending', 'late'] as const;
  const existing = await findBillingRecord(
    client,
    trainerId,
    clientId,
    dueDate,
    [...matchingStatuses]
  );
  const payload = {
    trainer_id: trainerId,
    client_id: clientId,
    amount,
    due_date: dueDate,
    paid_at: paidAt,
    status,
    updated_at: new Date().toISOString()
  };

  if (existing) {
    const { error } = await client
      .from('billing_records')
      .update(payload)
      .eq('id', existing.id)
      .eq('trainer_id', trainerId);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await client
    .from('billing_records')
    .insert(payload)
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
};

const syncBillingLedger = async (
  client: any,
  trainerId: string,
  clientId: string,
  previousPayment: Partial<ClientPaymentInfo> | null,
  payment: ClientPaymentInfo
) => {
  const amount = Number(payment.monthlyFee) || 0;
  const paidAmount = Number(payment.lastPaymentAmount) || amount;
  if (amount <= 0 || payment.status === 'sin_registro') return;

  const today = new Date().toISOString();
  const paidDate = toDateOnly(payment.lastPaidAt);
  const previousPaidDate = toDateOnly(previousPayment?.lastPaidAt);
  const dueDate = toDateOnly(payment.nextPaymentAt);
  const previousDueDate = toDateOnly(previousPayment?.nextPaymentAt);
  const hasNewPayment = payment.status === 'al_dia'
    && Boolean(paidDate)
    && paidDate !== previousPaidDate;

  if (hasNewPayment && paidDate) {
    let payableRecord: any = null;
    if (previousDueDate) {
      payableRecord = await findBillingRecord(
        client,
        trainerId,
        clientId,
        previousDueDate,
        ['pending', 'late']
      );
    }
    if (!payableRecord) {
      const { data, error } = await client
        .from('billing_records')
        .select('*')
        .eq('trainer_id', trainerId)
        .eq('client_id', clientId)
        .in('status', ['pending', 'late'])
        .is('deleted_at', null)
        .order('due_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      payableRecord = data;
    }

    if (payableRecord) {
      const { error } = await client
        .from('billing_records')
        .update({
          amount: paidAmount,
          paid_at: payment.lastPaidAt || today,
          status: 'paid',
          updated_at: today
        })
        .eq('id', payableRecord.id)
        .eq('trainer_id', trainerId);
      if (error) throw error;
    } else {
      await ensureBillingRecord(
        client,
        trainerId,
        clientId,
        previousDueDate || paidDate,
        paidAmount,
        'paid',
        payment.lastPaidAt || today
      );
    }
  }

  if (payment.status === 'pendiente' || payment.status === 'atrasado') {
    const pendingDueDate = dueDate || previousDueDate || toDateOnly(today)!;
    if (previousDueDate && previousDueDate !== pendingDueDate) {
      const previousRecord = await findBillingRecord(
        client,
        trainerId,
        clientId,
        previousDueDate,
        ['pending', 'late']
      );
      if (previousRecord) {
        const { error } = await client
          .from('billing_records')
          .update({
            due_date: pendingDueDate,
            amount,
            status: payment.status === 'atrasado' ? 'late' : 'pending',
            paid_at: null,
            updated_at: today
          })
          .eq('id', previousRecord.id)
          .eq('trainer_id', trainerId);
        if (error) throw error;
        return;
      }
    }
    await ensureBillingRecord(
      client,
      trainerId,
      clientId,
      pendingDueDate,
      amount,
      payment.status === 'atrasado' ? 'late' : 'pending',
      null
    );
    return;
  }

  if (payment.status === 'al_dia' && dueDate) {
    let existingDue = await findBillingRecord(
      client,
      trainerId,
      clientId,
      dueDate,
      ['pending', 'late']
    );
    if (!existingDue && previousDueDate && previousDueDate !== dueDate) {
      existingDue = await findBillingRecord(
        client,
        trainerId,
        clientId,
        previousDueDate,
        ['pending', 'late']
      );
    }
    if (existingDue) {
      const { error } = await client
        .from('billing_records')
        .update({
          amount,
          due_date: dueDate,
          status: 'pending',
          paid_at: null,
          updated_at: today
        })
        .eq('id', existingDue.id)
        .eq('trainer_id', trainerId);
      if (error) throw error;
    } else {
      await ensureBillingRecord(client, trainerId, clientId, dueDate, amount, 'pending', null);
    }
  }
};

let lastFetchedUser: any = null;
let lastFetchTime = 0;
let currentUserFetchPromise: Promise<User | null> | null = null;

const planLog = (...args: any[]) => {
  if ((import.meta as any).env?.DEV) console.info(...args);
};

export const supabaseProvider: IDBProvider = {
  name: 'Supabase Cloud',

  async signUp(email, pass, options) {
    const client = requireSupabase();
    const { data, error } = (await withTimeout(client.auth.signUp({
      email,
      password: pass,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          display_name: options?.displayName || email.split('@')[0],
          full_name: options?.displayName || email.split('@')[0]
        }
      }
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
    currentUserFetchPromise = null;
    if (isSupabaseEnabled()) {
      await supabase!.auth.signOut();
    }
  },

  async getCurrentUser(forceFresh = false) {
    if (!isSupabaseEnabled()) return null;

    if (currentUserFetchPromise) return currentUserFetchPromise;

    const now = Date.now();
    if (!forceFresh && lastFetchedUser && (now - lastFetchTime < 60000)) {
      return lastFetchedUser;
    }

    const fetchOperation = async () => {
      planLog('PLAN RESOLUTION START');
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
              display_name: authUser.user_metadata?.display_name || authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || 'User',
              plan_type: 'free',
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

      const { data: subscriptions, error: subscriptionError } = (await withTimeout(
        client
          .from('subscriptions')
          .select('*')
          .eq('user_id', authUser.id)
          .order('updated_at', { ascending: false })
          .limit(10),
        3000,
        'subscriptionFetch'
      )) as any;

      if (subscriptionError && subscriptionError.code !== 'PGRST116') {
        throw subscriptionError;
      }

      const { data: publicProfileRow, error: publicProfileError } = (await withTimeout(
        client
          .from('public_profiles')
          .select('*')
          .eq('id', authUser.id)
          .maybeSingle(),
        3000,
        'publicProfileFetch'
      )) as any;

      if (publicProfileError && publicProfileError.code !== 'PGRST116') {
        throw publicProfileError;
      }

      const resolvedSubscription = resolveSubscriptionEntitlements(resolvedProfile, subscriptions);
      let trainerUsage;
      try {
        trainerUsage = await this.getOrCreateTrainerUsage(authUser.id);
      } catch (usageError: any) {
        if ((import.meta as any).env?.DEV) {
          console.warn('TRAINER USAGE FETCH FAILED: limits will remain blocked until Supabase confirms usage.', usageError?.message || usageError);
        }
      }

      const mappedUser = {
        uid: resolvedProfile.id,
        email: resolvedProfile.email || authUser.email || '',
        displayName: resolvedProfile.display_name || authUser.email?.split('@')[0] || 'User',
        createdAt: resolvedProfile.created_at,
        branding: mapBranding(resolvedProfile.branding_settings),
        publicProfile: mapPublicProfile(publicProfileRow),
        subscription: resolvedSubscription,
        isAdmin: resolvedProfile.is_admin || false,
        trainerUsage
      } as any;

      const previousPlan = lastFetchedUser?.uid === mappedUser.uid
        ? lastFetchedUser.subscription?.type
        : null;
      lastFetchedUser = mappedUser;
      lastFetchTime = Date.now();
      planLog(`PLAN RESOLVED: ${resolvedSubscription.type}`);
      planLog(`PLAN SOURCE: ${resolvedSubscription.source}`);
      planLog(`PLAN CONFIRMED AT: ${resolvedSubscription.confirmedAt}`);
      if (previousPlan && previousPlan !== resolvedSubscription.type) {
        planLog('PLAN CHANGE CONFIRMED', {
          from: previousPlan,
          to: resolvedSubscription.type,
          reason: resolvedSubscription.status
        });
      }
      return mappedUser;
    };

    currentUserFetchPromise = retryPromise(fetchOperation, 1, 500);
    try {
      return await currentUserFetchPromise;
    } catch (e: any) {
      if ((import.meta as any).env?.DEV) {
        console.warn('TEMPORARY PLAN FETCH FAILED', e.message || e);
      }
      if (lastFetchedUser) {
        planLog(`KEEPING LAST CONFIRMED PLAN: ${lastFetchedUser.subscription?.type || 'unknown'}`);
        return markSubscriptionSyncing(lastFetchedUser);
      }
      throw e;
    } finally {
      currentUserFetchPromise = null;
    }
  },

  onAuthStateChanged(callback) {
    if (!isSupabaseEnabled()) return () => {};

    const { data: { subscription } } = supabase!.auth.onAuthStateChange((event, session) => {
      const cached = localStorage.getItem('mvptrainer_cached_user');
      let parsedCachedUser: any = null;
      if (cached) {
        try { parsedCachedUser = JSON.parse(cached); } catch (_) {}
      }
      const activeUserFallback = lastFetchedUser || parsedCachedUser;

      if (session?.user) {
        if (activeUserFallback && activeUserFallback.uid === session.user.id) {
          callback(markSubscriptionSyncing(activeUserFallback), event);
        }

        // TOKEN_REFRESHED already confirms that Auth has a valid session. Re-reading
        // profiles and subscriptions here creates a second Auth lock contender and
        // can make a temporary network failure look like an endless sync.
        if (event === 'TOKEN_REFRESHED') {
          if (activeUserFallback && activeUserFallback.uid === session.user.id) {
            callback(activeUserFallback, event);
          }
          return;
        }

        window.setTimeout(() => {
          this.getCurrentUser(true)
            .then(user => callback(user, `${event}_PLAN_SYNCED`))
            .catch(error => {
              if ((import.meta as any).env?.DEV) {
                console.warn('TEMPORARY PLAN FETCH FAILED', error?.message || error);
              }
              if (activeUserFallback && activeUserFallback.uid === session.user.id) {
                callback(markSubscriptionSyncFailed(activeUserFallback), `${event}_PLAN_SYNC_FAILED`);
              }
            });
        }, 0);
      } else {
        const confirmsMissingSession = event === 'INITIAL_SESSION'
          || event === 'SIGNED_OUT'
          || (event as string) === 'USER_DELETED';

        if (!confirmsMissingSession && activeUserFallback) {
          callback(markSubscriptionSyncing(activeUserFallback), event);
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

    const dietsByClient: Record<string, any[]> = {};
    (dietsRes.data || []).forEach((d: any) => {
      if (!dietsByClient[d.client_id]) dietsByClient[d.client_id] = [];
      dietsByClient[d.client_id].push({ ...d.content, id: d.id, createdAt: d.created_at });
    });

    return (clientsRes.data || []).map((c: any) =>
      mapClientToFrontend(c, routinesByClient[c.id] || [], dietsByClient[c.id] || [])
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
      if (LOG_REALTIME_STATUS && (import.meta as any).env?.DEV) console.log(`REALTIME CHANNEL STATUS: ${status}`, err || '');
      if (onStatus) onStatus(status);
    });

    return () => {
      supabase!.removeChannel(channel);
    };
  },

  subscribeToBillingRecords(trainerId, callback) {
    if (!isSupabaseEnabled() || !trainerId || trainerId === 'undefined') return () => {};
    const refresh = () => this.getBillingRecords(trainerId).then(callback).catch(error => {
      if ((import.meta as any).env?.DEV) console.warn('Billing realtime refresh failed', error);
    });
    refresh();
    const channel = supabase!
      .channel(`billing-trainer-${trainerId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_records', filter: `trainer_id=eq.${trainerId}` }, refresh);
    channel.subscribe();
    return () => { supabase!.removeChannel(channel); };
  },

  async createClient(passedTrainerId, data) {
    const client = requireSupabase();
    const authUser = await requireAuthUser();
    const trainerId = authUser.id;

    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(now.getMonth() + 1);

    const monthlyFee = Number(data.paymentInfo?.monthlyFee) || 0;
    const initialPaymentStatus = data.paymentInfo?.status || 'sin_registro';
    const todayISO = now.toISOString();
    const nextMonthISO = nextMonth.toISOString();
    const initialPaymentInfo: ClientPaymentInfo = {
      monthlyFee,
      status: initialPaymentStatus,
      paymentMethod: data.paymentInfo?.paymentMethod || 'efectivo',
      lastPaidAt: data.paymentInfo?.lastPaidAt || (initialPaymentStatus === 'al_dia' ? todayISO : null),
      nextPaymentAt: data.paymentInfo?.nextPaymentAt
        || (initialPaymentStatus === 'al_dia'
          ? nextMonthISO
          : (initialPaymentStatus === 'pendiente' || initialPaymentStatus === 'atrasado' ? todayISO : null)),
      lastPaymentAmount: data.paymentInfo?.lastPaymentAmount || null,
      lastPaymentMonths: data.paymentInfo?.lastPaymentMonths || null
    };
    const normalizedEmail = typeof data.email === 'string' ? data.email.trim() : '';

    const insertPayload: any = {
      trainer_id: trainerId,
      full_name: data.name,
      email: normalizedEmail || null,
      phone: data.phone,
      sex: data.gender,
      birth_date: data.age ? `${new Date().getFullYear() - data.age}-01-01` : null,
      weight_kg: data.weight,
      height_cm: data.height,
      activity_level: data.experienceLevel,
      goal: data.mainGoal || data.goals?.[0] || null,
      payment_amount: monthlyFee,
      payment_day: now.getDate(),
      billing_frequency: 'monthly',
      notes: JSON.stringify({
        payment: {
          ...initialPaymentInfo
        },
        service: {
          status: data.status || 'active',
          pausedAt: data.pausedAt || null,
          finishedAt: data.finishedAt || null
        },
        training: {
          days: data.trainingDays,
          time: data.trainingTime,
          exceptions: data.scheduleExceptions || []
        },
        profile: {
          age: data.age,
          country: data.country,
          goals: data.goals,
          mainGoal: data.mainGoal || data.goals?.[0] || '',
          clientGoalSummary: data.clientGoalSummary || '',
          routineFocus: data.routineFocus || '',
          dietFocus: data.dietFocus || '',
          medicalNotes: data.medicalNotes || ''
        }
      })
    };

    const { data: newClient, error } = await client.from('clients').insert(insertPayload).select().single();
    if (error) throw error;

    try {
      await syncBillingLedger(client, trainerId, newClient.id, null, initialPaymentInfo);
    } catch (ledgerError) {
      await client
        .from('clients')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', newClient.id)
        .eq('trainer_id', trainerId);
      throw ledgerError;
    }

    const updatedUsage = await this.incrementTrainerUsage(trainerId, 'clients');
    return {
      ...mapClientToFrontend(newClient),
      updatedUsage
    };
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
    const existingPayment = mapClientToFrontend(existing).paymentInfo as ClientPaymentInfo;
    const monthlyFee = data.paymentInfo?.monthlyFee !== undefined
      ? Number(data.paymentInfo.monthlyFee)
      : (existing?.payment_amount || 0);
    const mergedPayment: ClientPaymentInfo = {
      ...existingPayment,
      ...(data.paymentInfo || {}),
      monthlyFee
    };
    const normalizedEmail = data.email === undefined
      ? existing.email
      : (typeof data.email === 'string' ? data.email.trim() : '');

    const updatePayload: any = {
      full_name: data.name ?? existing.full_name,
      email: normalizedEmail || null,
      phone: data.phone ?? existing.phone,
      sex: data.gender ?? existing.sex,
      birth_date: data.age ? `${new Date().getFullYear() - data.age}-01-01` : existing.birth_date,
      weight_kg: data.weight ?? existing.weight_kg,
      height_cm: data.height ?? existing.height_cm,
      activity_level: data.experienceLevel ?? existing.activity_level,
      goal: data.mainGoal || data.goals?.[0] || existing.goal,
      payment_amount: monthlyFee,
      notes: JSON.stringify({
        payment: mergedPayment,
        service: {
          status: data.status ?? existingMeta.service?.status ?? 'active',
          pausedAt: data.pausedAt !== undefined ? data.pausedAt : (existingMeta.service?.pausedAt || null),
          finishedAt: data.finishedAt !== undefined ? data.finishedAt : (existingMeta.service?.finishedAt || null)
        },
        training: {
          days: data.trainingDays || existingMeta.training?.days || [],
          time: data.trainingTime !== undefined ? data.trainingTime : (existingMeta.training?.time || ''),
          exceptions: data.scheduleExceptions !== undefined ? data.scheduleExceptions : (existingMeta.training?.exceptions || [])
        },
        profile: {
          age: data.age ?? existingMeta.profile?.age ?? null,
          country: data.country || existingMeta.profile?.country || '',
          goals: data.goals || existingMeta.profile?.goals || [],
          mainGoal: data.mainGoal || existingMeta.profile?.mainGoal || existing.goal || '',
          clientGoalSummary: data.clientGoalSummary ?? existingMeta.profile?.clientGoalSummary ?? '',
          routineFocus: data.routineFocus ?? existingMeta.profile?.routineFocus ?? '',
          dietFocus: data.dietFocus ?? existingMeta.profile?.dietFocus ?? '',
          medicalNotes: data.medicalNotes ?? existingMeta.profile?.medicalNotes ?? existingMeta.medicalNotes ?? ''
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

    if (data.paymentInfo) {
      await syncBillingLedger(
        client,
        authUser.id,
        clientId,
        existingPayment,
        mergedPayment
      );
    }
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

  async getBillingRecords(trainerId) {
    const client = requireSupabase();
    const authUser = await requireAuthUser();
    if (authUser.id !== trainerId) {
      throw new Error('No puedes consultar movimientos de otro entrenador.');
    }

    const { data, error } = await client
      .from('billing_records')
      .select('*')
      .eq('trainer_id', trainerId)
      .is('deleted_at', null)
      .order('due_date', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) throw error;
    return (data || []).map(mapBillingRecord);
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

    const { data: currentProfile, error: currentProfileError } = await client
      .from('profiles')
      .select('id, display_name, branding_settings')
      .eq('id', uid)
      .single();
    if (currentProfileError) throw currentProfileError;

    const dbPayload: any = {};
    if (data.displayName !== undefined) dbPayload.display_name = data.displayName;
    if (data.branding !== undefined) dbPayload.branding_settings = data.branding;

    let updatedProfile = currentProfile;
    if (Object.keys(dbPayload).length > 0) {
      const { data: profile, error } = await client
        .from('profiles')
        .update(dbPayload)
        .eq('id', uid)
        .select()
        .single();
      if (error) throw error;
      updatedProfile = profile;
    }

    if (data.publicProfile !== undefined) {
      const resolvedBranding = mapBranding(data.branding || updatedProfile.branding_settings);
      const publicRow = toPublicProfileRow(
        uid,
        data.publicProfile,
        data.displayName || updatedProfile.display_name || 'MVP Trainer',
        resolvedBranding
      );
      const { error: publicProfileError } = await client
        .from('public_profiles')
        .upsert(publicRow, { onConflict: 'id' });
      if (publicProfileError) throw publicProfileError;
    } else if (data.branding !== undefined) {
      const { data: existingPublicProfile, error: readPublicError } = await client
        .from('public_profiles')
        .select('*')
        .eq('id', uid)
        .maybeSingle();
      if (readPublicError) throw readPublicError;
      if (existingPublicProfile) {
        const branding = mapBranding(data.branding);
        const { error: publicBrandingError } = await client
          .from('public_profiles')
          .update({
            brand_name: branding?.brandName?.trim() || updatedProfile.display_name,
            logo_url: branding?.logoUrl || null,
            primary_color: branding?.primaryColor || '#8B5CF6',
            secondary_color: branding?.secondaryColor || '#050505',
            updated_at: new Date().toISOString()
          })
          .eq('id', uid);
        if (publicBrandingError) throw publicBrandingError;
      }
    }

    lastFetchedUser = null;
    lastFetchTime = 0;
    return updatedProfile;
  },

  async getProfile(uid) {
    const client = requireSupabase();
    const lookupColumn = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(uid) ? 'id' : 'slug';
    const { data, error } = await client
      .from('public_profiles')
      .select('id, slug, professional_title, trainer_name, headline, description, avatar_url, whatsapp_number, cta_text, is_published, brand_name, logo_url, primary_color, secondary_color, services, targets, background_color, modality, location, presentation_mode, card_format, card_template, photo_position_y')
      .eq(lookupColumn, uid)
      .eq('is_published', true)
      .single();

    if (error || !data) return null;
    return {
      uid: data.id,
      displayName: data.trainer_name || data.brand_name || data.professional_title || 'MVP Trainer',
      branding: mapBranding(data),
      publicProfile: mapPublicProfile(data)
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

    const operation = routine.id
      ? client.from('routines').update({ ...payload, source: 'manual', updated_at: new Date().toISOString() }).eq('id', routine.id).eq('trainer_id', authUser.id).eq('client_id', clientId)
      : client.from('routines').insert(payload).select().single();
    const { error } = await operation;
    if (error) throw error;

    if (!routine.id && routine.source === 'ai') {
      return this.incrementTrainerUsage(authUser.id, 'routines');
    }

    return null;
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

    const operation = diet.id
      ? client.from('diets').update({ ...payload, source: 'manual', updated_at: new Date().toISOString() }).eq('id', diet.id).eq('trainer_id', authUser.id).eq('client_id', clientId)
      : client.from('diets').insert(payload).select().single();
    const { error } = await operation;
    if (error) throw error;

    if (!diet.id && diet.source === 'ai') {
      return this.incrementTrainerUsage(authUser.id, 'diets');
    }

    return null;
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
    const diets = await this.getDiets(clientId);
    return diets[0] || null;
  },

  async getDiets(clientId) {
    const client = requireSupabase();
    const authUser = await requireAuthUser();
    const { data, error } = await client
      .from('diets')
      .select('*')
      .eq('client_id', clientId)
      .eq('trainer_id', authUser.id)
      .order('created_at', { ascending: false });

    if (error || !data) return [];
    return data.map((d: any) => ({ ...d.content, id: d.id, createdAt: d.created_at }));
  },

  async getOrCreateTrainerUsage(trainerId) {
    const client = requireSupabase();

    const { data, error } = await client
      .from('trainer_usage')
      .select('*')
      .eq('trainer_id', trainerId)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      return data;
    }

    const { data: newUsage, error: insertError } = await client
      .from('trainer_usage')
      .insert({
        trainer_id: trainerId,
        clients_created_total: 0,
        ai_routines_generated_total: 0,
        ai_diets_generated_total: 0
      })
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

const mapClientToFrontend = (c: any, routines: any[] = [], dietPlansOrDiet: any = null) => {
  if (!c) return null;
  const meta = parseNotes(c.notes);
  const payment = meta.payment || meta.payment_info || {};
  const service = meta.service || {};
  const training = meta.training || {};
  const profile = meta.profile || {};
  const dietPlans = Array.isArray(dietPlansOrDiet)
    ? dietPlansOrDiet
    : (dietPlansOrDiet ? [dietPlansOrDiet] : []);

  return {
    id: c.id,
    trainerId: c.trainer_id,
    name: c.full_name || c.name,
    email: c.email,
    phone: c.phone,
    gender: c.sex || c.gender,
    age: profile.age || meta.age || (c.birth_date ? new Date().getFullYear() - new Date(c.birth_date).getFullYear() : null),
    country: profile.country || meta.country,
    medicalNotes: profile.medicalNotes || meta.medicalNotes || meta.injuries || meta.restrictions || '',
    avatarUrl: c.avatar_url || meta.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.full_name || c.name || 'Client')}&background=random`,
    weight: c.weight_kg !== undefined ? c.weight_kg : (c.weight !== undefined ? c.weight : profile.weight || meta.weight),
    height: c.height_cm !== undefined ? c.height_cm : (c.height !== undefined ? c.height : profile.height || meta.height),
    experienceLevel: c.experience_level || c.activity_level || profile.experienceLevel || meta.experienceLevel,
    mainGoal: c.goal || c.main_goal || profile.mainGoal || meta.mainGoal,
    goals: profile.goals || meta.goals || [],
    clientGoalSummary: profile.clientGoalSummary || meta.clientGoalSummary || '',
    routineFocus: profile.routineFocus || meta.routineFocus || '',
    dietFocus: profile.dietFocus || meta.dietFocus || '',
    trainingDays: training.days || meta.trainingDays || [],
    trainingTime: training.time || meta.trainingTime,
    scheduleExceptions: Array.isArray(training.exceptions) ? training.exceptions : [],
    routines: routines || [],
    dietPlan: dietPlans[0] || null,
    dietPlans,
    paymentInfo: {
      monthlyFee: payment.monthlyFee || c.payment_amount || 0,
      paymentMethod: payment.paymentMethod || c.payment_method || 'efectivo',
      status: (payment.status || c.payment_status || 'sin_registro') as any,
      lastPaidAt: payment.lastPaidAt || c.last_paid_at || null,
      nextPaymentAt: payment.nextPaymentAt || c.next_payment_at || null,
      lastPaymentAmount: payment.lastPaymentAmount || null,
      lastPaymentMonths: payment.lastPaymentMonths || null
    },
    status: service.status || c.status || 'active',
    pausedAt: service.pausedAt || null,
    finishedAt: service.finishedAt || null,
    createdAt: c.created_at
  } as any;
};
