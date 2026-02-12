
import { supabase } from './supabaseClient';
import { Client, User, Routine } from '../types';

export const dbService = {
  // --- AUTH ---
  async signUp(email: string, pass: string) {
    const { data, error } = await supabase.auth.signUp({ email, password: pass });
    if (error) throw error;
    
    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        email: data.user.email,
        display_name: email.split('@')[0],
        subscription_type: 'trial',
        is_active: true
      });
    }
    return data;
  },

  async signIn(email: string, pass: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
    return data;
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  async getCurrentUser(): Promise<User | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (!profile) return null;

    return {
      uid: profile.id,
      email: profile.email,
      displayName: profile.display_name,
      createdAt: profile.created_at,
      branding: profile.branding,
      publicProfile: profile.public_profile,
      subscription: {
        type: profile.subscription_type,
        isActive: profile.is_active,
        trialEndsAt: profile.trial_ends_at,
        expiresAt: profile.current_period_end,
        stripeCustomerId: profile.stripe_customer_id,
        stripeSubscriptionId: profile.stripe_subscription_id,
        usage: { 
          weekStart: new Date().toISOString(),
          aiRoutinesByClient: {},
          aiDietsByClient: {}
        }
      }
    };
  },

  async getClients(trainerId: string): Promise<Client[]> {
    const { data, error } = await supabase
      .from('clients')
      .select('*, routines(*)')
      .eq('trainer_id', trainerId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    return data.map(c => ({
      ...c,
      paymentInfo: c.payment_info,
      experienceLevel: c.experience_level,
      mainGoal: c.main_goal,
      trainingDays: c.training_days,
      trainingTime: c.training_time,
      dietPlan: c.diet_plan,
      routines: c.routines || []
    }));
  },

  async createClient(trainerId: string, clientData: any) {
    const { data, error } = await supabase
      .from('clients')
      .insert({
        trainer_id: trainerId,
        name: clientData.name,
        email: clientData.email,
        phone: clientData.phone,
        gender: clientData.gender,
        age: clientData.age,
        country: clientData.country,
        weight: clientData.weight,
        height: clientData.height,
        experience_level: clientData.experienceLevel,
        main_goal: clientData.goals?.[0] || 'Salud general',
        goals: clientData.goals,
        training_days: clientData.trainingDays,
        training_time: clientData.trainingTime,
        payment_info: clientData.paymentInfo,
        avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(clientData.name)}&background=random`
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updateClient(clientId: string, data: any) {
    const mappedData: any = {};
    if (data.name) mappedData.name = data.name;
    if (data.paymentInfo) mappedData.payment_info = data.paymentInfo;
    if (data.dietPlan) mappedData.diet_plan = data.dietPlan;
    if (data.trainingDays) mappedData.training_days = data.trainingDays;
    if (data.trainingTime) mappedData.training_time = data.trainingTime;

    const { error } = await supabase
      .from('clients')
      .update(mappedData)
      .eq('id', clientId);
    
    if (error) throw error;
  },

  async deleteClient(clientId: string) {
    const { error } = await supabase.from('clients').delete().eq('id', clientId);
    if (error) throw error;
  }
};
