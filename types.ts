export interface User {
  uid: string;
  email: string;
  displayName: string;
  isPro: boolean;
  photoURL?: string;
}

export interface ProgressLog {
  date: string;
  weight: number;
  notes?: string;
}

export interface Exercise {
  name: string;
  sets: number;
  reps: string;
  notes?: string;
}

export interface Routine {
  id: string;
  name: string;
  description: string;
  exercises: Exercise[];
  tags: string[];
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  status: 'active' | 'inactive';
  goal: string;
  joinedAt: string;
  progress: ProgressLog[];
  routines: Routine[];
  avatarUrl: string;
}

export interface StatMetric {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}
