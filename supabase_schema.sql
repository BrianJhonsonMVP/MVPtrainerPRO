-- 1. Profiles table (linked to Auth)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  subscription_type TEXT DEFAULT 'trial',
  is_active BOOLEAN DEFAULT TRUE,
  is_admin BOOLEAN DEFAULT FALSE,
  branding JSONB DEFAULT '{}'::jsonb,
  public_profile JSONB DEFAULT '{}'::jsonb,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Clients table
CREATE TABLE public.clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  trainer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  sex TEXT,
  birth_date DATE,
  weight_kg NUMERIC,
  height_cm NUMERIC,
  activity_level TEXT,
  goal TEXT,
  payment_amount NUMERIC DEFAULT 0,
  payment_day INTEGER,
  billing_frequency TEXT DEFAULT 'monthly',
  notes TEXT DEFAULT '{}',
  avatar_url TEXT,
  status TEXT DEFAULT 'active',
  deleted_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Workouts table
CREATE TABLE public.workouts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  trainer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  week_label TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Diets table
CREATE TABLE public.diets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  trainer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  week_label TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Payments table
CREATE TABLE public.payments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  trainer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  due_date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  status TEXT DEFAULT 'pendiente',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Trainer Usage table
CREATE TABLE public.trainer_usage (
  trainer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  clients_created_total INTEGER DEFAULT 0,
  ai_routines_generated_total INTEGER DEFAULT 0,
  ai_diets_generated_total INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trainer_usage ENABLE ROW LEVEL SECURITY;

-- Policies for Profiles
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Policies for Trainer Usage
CREATE POLICY "Trainers can view their own usage" ON public.trainer_usage FOR SELECT TO authenticated USING (auth.uid() = trainer_id);
CREATE POLICY "Trainers can insert their own usage" ON public.trainer_usage FOR INSERT TO authenticated WITH CHECK (auth.uid() = trainer_id);
CREATE POLICY "Trainers can update their own usage" ON public.trainer_usage FOR UPDATE TO authenticated USING (auth.uid() = trainer_id) WITH CHECK (auth.uid() = trainer_id);

-- Policies for Clients
DROP POLICY IF EXISTS "Trainers can view their own clients" ON public.clients;
CREATE POLICY "Trainers can view their own clients" ON public.clients 
  FOR SELECT 
  TO authenticated 
  USING (auth.uid() = trainer_id);

DROP POLICY IF EXISTS "Trainers can insert their own clients" ON public.clients;
CREATE POLICY "Trainers can insert their own clients" ON public.clients 
  FOR INSERT 
  TO authenticated 
  WITH CHECK (auth.uid() = trainer_id);

DROP POLICY IF EXISTS "Trainers can update their own clients" ON public.clients;
CREATE POLICY "Trainers can update their own clients" ON public.clients 
  FOR UPDATE 
  TO authenticated 
  USING (auth.uid() = trainer_id) 
  WITH CHECK (auth.uid() = trainer_id);

DROP POLICY IF EXISTS "Trainers can delete their own clients" ON public.clients;
CREATE POLICY "Trainers can delete their own clients" ON public.clients 
  FOR DELETE 
  TO authenticated 
  USING (auth.uid() = trainer_id);

-- Policies for Workouts
CREATE POLICY "Trainers can view their own workouts" ON public.workouts FOR SELECT USING (auth.uid() = trainer_id);
CREATE POLICY "Trainers can insert their own workouts" ON public.workouts FOR INSERT WITH CHECK (auth.uid() = trainer_id);
CREATE POLICY "Trainers can update their own workouts" ON public.workouts FOR UPDATE USING (auth.uid() = trainer_id);
CREATE POLICY "Trainers can delete their own workouts" ON public.workouts FOR DELETE USING (auth.uid() = trainer_id);

-- Policies for Diets
CREATE POLICY "Trainers can view their own diets" ON public.diets FOR SELECT USING (auth.uid() = trainer_id);
CREATE POLICY "Trainers can insert their own diets" ON public.diets FOR INSERT WITH CHECK (auth.uid() = trainer_id);
CREATE POLICY "Trainers can update their own diets" ON public.diets FOR UPDATE USING (auth.uid() = trainer_id);
CREATE POLICY "Trainers can delete their own diets" ON public.diets FOR DELETE USING (auth.uid() = trainer_id);

-- Policies for Payments
CREATE POLICY "Trainers can view their own payments" ON public.payments FOR SELECT USING (auth.uid() = trainer_id);
CREATE POLICY "Trainers can insert their own payments" ON public.payments FOR INSERT WITH CHECK (auth.uid() = trainer_id);
CREATE POLICY "Trainers can update their own payments" ON public.payments FOR UPDATE USING (auth.uid() = trainer_id);
CREATE POLICY "Trainers can delete their own payments" ON public.payments FOR DELETE USING (auth.uid() = trainer_id);

-- Trigger for profile creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
