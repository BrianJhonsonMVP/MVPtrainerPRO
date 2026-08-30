import { BillingRecord, Client, ClientPaymentInfo, DietPlan, Routine, User } from '../types';
import { IDBProvider } from './dbInterface';

const TRAINER_ID = 'visual-review-trainer';
const DAY_MS = 86_400_000;

const isoDaysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

const reviewRoutine: Routine = {
  id: 'review-routine-1',
  name: 'Fuerza y recomposicion corporal',
  title: 'Fuerza y recomposicion corporal',
  description: 'Plan progresivo de fuerza, movilidad y acondicionamiento.',
  summary: 'Plan progresivo de fuerza, movilidad y acondicionamiento.',
  tags: ['Fuerza', 'Recomposicion'],
  source: 'ai',
  version: 1,
  createdAt: isoDaysFromNow(-5),
  exercises: [
    { name: 'Sentadilla goblet', sets: 4, reps: '10-12', rest: '60s', day: 'Lunes', muscleFocus: 'Piernas y gluteos', notes: 'Mantener el pecho elevado.' },
    { name: 'Remo con mancuerna', sets: 3, reps: '12 por lado', rest: '60s', day: 'Miercoles', muscleFocus: 'Espalda', notes: 'Evitar girar el tronco.' },
    { name: 'Press de pecho', sets: 4, reps: '8-10', rest: '75s', day: 'Viernes', muscleFocus: 'Pecho y triceps', notes: 'Controlar el descenso.' }
  ],
  days: [
    { day: 'Lunes', exercises: [{ name: 'Sentadilla goblet', sets: 4, reps: '10-12', rest: '60s', muscleFocus: 'Piernas y gluteos', notes: 'Mantener el pecho elevado.' }] },
    { day: 'Martes', exercises: [{ name: 'Movilidad de cadera', sets: 3, reps: '45 segundos', rest: '30s', muscleFocus: 'Movilidad', notes: 'Movimiento controlado.' }] },
    { day: 'Miercoles', exercises: [{ name: 'Remo con mancuerna', sets: 3, reps: '12 por lado', rest: '60s', muscleFocus: 'Espalda', notes: 'Evitar girar el tronco.' }] },
    { day: 'Jueves', exercises: [{ name: 'Caminata a ritmo moderado', sets: 1, reps: '30 minutos', rest: 'Sin descanso', muscleFocus: 'Cardio', notes: 'Mantener un ritmo conversacional.' }] },
    { day: 'Viernes', exercises: [{ name: 'Press de pecho', sets: 4, reps: '8-10', rest: '75s', muscleFocus: 'Pecho y triceps', notes: 'Controlar el descenso.' }] },
    { day: 'Sabado', exercises: [{ name: 'Circuito de cuerpo completo', sets: 3, reps: '12 por ejercicio', rest: '60s', muscleFocus: 'Cuerpo completo', notes: 'Priorizar tecnica.' }] },
    { day: 'Domingo', exercises: [{ name: 'Recuperacion activa', sets: 1, reps: '25 minutos', rest: 'Sin descanso', muscleFocus: 'Recuperacion', notes: 'Intensidad suave.' }] }
  ],
  warnings: ['Detener el ejercicio ante dolor agudo.'],
  recommendations: ['Aumentar la carga solo cuando la tecnica sea estable.']
};

const mealNames = ['Avena con fruta y huevos', 'Yogurt con frutos secos', 'Pollo con arroz y ensalada', 'Fruta con queso fresco', 'Pescado con camote'];
const mealTimes = ['Desayuno', 'Media Manana', 'Almuerzo', 'Media Tarde', 'Cena'];
const reviewDiet: DietPlan = {
  id: 'review-diet-1',
  title: 'Plan nutricional practico de recomposicion',
  summary: 'Comidas accesibles, altas en proteina y faciles de preparar.',
  notes: 'Ajustar porciones segun hambre, progreso y rendimiento.',
  daily_calories: 2250,
  totalKcal: 2250,
  totalProtein: 155,
  totalCarbs: 235,
  totalFats: 70,
  source: 'ai',
  version: 1,
  createdAt: isoDaysFromNow(-4),
  days: ['Lunes', 'Martes', 'Miercoles', 'Jueves', 'Viernes', 'Sabado', 'Domingo'].map((day, dayIndex) => ({
    day,
    meals: mealTimes.map((timeOfDay, mealIndex) => ({
      timeOfDay,
      name: mealNames[(mealIndex + dayIndex) % mealNames.length],
      description: 'Porcion equilibrada con proteina, carbohidrato y vegetales de temporada.'
    }))
  })),
  warnings: ['Adaptar el plan ante alergias o indicacion medica.'],
  recommendations: ['Mantener hidratacion constante durante el dia.']
};

const reviewUser: User = {
  uid: TRAINER_ID,
  email: 'revision@mvptrainer.local',
  displayName: 'Brian',
  createdAt: isoDaysFromNow(-90),
  subscription: {
    type: 'trial',
    isActive: true,
    status: 'trialing',
    source: 'development',
    confirmedAt: new Date().toISOString(),
    trialEndsAt: isoDaysFromNow(21),
    usage: { weekStart: new Date().toISOString().slice(0, 10), aiRoutinesByClient: {}, aiDietsByClient: {} }
  },
  branding: {
    brandName: 'MVP Trainer',
    logoUrl: '/brand/mvp-trainer-pro-logo.png',
    primaryColor: '#8B5CF6',
    secondaryColor: '#050505'
  },
  publicProfile: {
    professionalTitle: 'Entrenador de fuerza y recomposición corporal',
    trainerName: 'Brian Pinedo',
    headline: 'Transforma tu físico con un plan que sí puedes sostener',
    callToAction: 'Reserva tu evaluación',
    description: 'Entrenamiento personalizado para construir fuerza, salud y confianza.',
    services: ['Entrenamiento presencial', 'Asesoria online', 'Plan de alimentacion'],
    targets: ['Recomposicion corporal', 'Ganancia muscular', 'Perdida de grasa'],
    whatsAppNumber: '51999999999',
    backgroundColor: '#050505',
    profileImageUrl: '',
    galleryImages: [],
    modality: 'ambas',
    location: 'Lima, Perú',
    presentationMode: 'logo',
    cardFormat: 'post',
    cardTemplate: 'balanced',
    photoPositionY: 50,
    slug: 'mvp-trainer-lima',
    isPublished: true
  },
  trainerUsage: {
    trainer_id: TRAINER_ID,
    clients_created_total: 8,
    ai_routines_generated_total: 14,
    ai_diets_generated_total: 11
  }
};

const baseClient = (overrides: Partial<Client>): Client => ({
  id: 'review-client',
  trainerId: TRAINER_ID,
  name: 'Cliente de muestra',
  phone: '999999999',
  gender: 'other',
  age: 30,
  country: 'Peru',
  medicalNotes: 'Ninguna restriccion reportada.',
  avatarUrl: '',
  weight: 72,
  height: 170,
  experienceLevel: 'Intermedio',
  mainGoal: 'Recomposicion corporal',
  goals: ['Recomposicion corporal'],
  trainingDays: ['Lunes', 'Miercoles', 'Viernes'],
  trainingTime: '18:00 - 19:00',
  routines: [reviewRoutine],
  dietPlan: reviewDiet,
  dietPlans: [reviewDiet],
  paymentInfo: {
    monthlyFee: 400,
    paymentMethod: 'yape',
    status: 'al_dia',
    lastPaidAt: isoDaysFromNow(-12),
    nextPaymentAt: isoDaysFromNow(18),
    lastPaymentAmount: 400,
    lastPaymentMonths: 1
  },
  status: 'active',
  createdAt: isoDaysFromNow(-70),
  ...overrides
});

let clients: Client[] = [
  baseClient({ id: 'review-client-renato', name: 'Renato Cueva', gender: 'male', age: 29, mainGoal: 'Bajar grasa', goals: ['Bajar grasa', 'Mejorar fuerza'], trainingDays: ['Lunes', 'Miercoles', 'Viernes'], trainingTime: '18:00 - 19:00' }),
  baseClient({ id: 'review-client-valeria', name: 'Valeria Torres', gender: 'female', age: 34, mainGoal: 'Ganar masa muscular', goals: ['Ganar masa muscular'], trainingDays: ['Martes', 'Jueves', 'Sabado'], trainingTime: '07:00 - 08:00', paymentInfo: { monthlyFee: 450, paymentMethod: 'transferencia', status: 'pendiente', lastPaidAt: isoDaysFromNow(-31), nextPaymentAt: isoDaysFromNow(1), lastPaymentAmount: 450, lastPaymentMonths: 1 } }),
  baseClient({ id: 'review-client-diego', name: 'Diego Salazar', gender: 'male', age: 41, mainGoal: 'Movilidad y salud', goals: ['Movilidad y salud'], trainingDays: ['Lunes', 'Jueves'], trainingTime: '12:00 - 13:00', paymentInfo: { monthlyFee: 350, paymentMethod: 'efectivo', status: 'atrasado', lastPaidAt: isoDaysFromNow(-42), nextPaymentAt: isoDaysFromNow(-8), lastPaymentAmount: 350, lastPaymentMonths: 1 } }),
  baseClient({ id: 'review-client-lucia', name: 'Lucia Mendoza', gender: 'female', age: 26, mainGoal: 'Rendimiento deportivo', goals: ['Rendimiento deportivo'], trainingDays: ['Martes', 'Viernes'], trainingTime: '16:00 - 17:00', status: 'paused', pausedAt: isoDaysFromNow(-3), paymentInfo: { monthlyFee: 380, paymentMethod: 'plin', status: 'al_dia', lastPaidAt: isoDaysFromNow(-15), nextPaymentAt: isoDaysFromNow(15), lastPaymentAmount: 380, lastPaymentMonths: 1 } })
];

let billingRecords: BillingRecord[] = [
  { id: 'review-payment-paid', clientId: 'review-client-renato', trainerId: TRAINER_ID, amount: 400, dueDate: isoDaysFromNow(-12), paidAt: isoDaysFromNow(-12), status: 'paid' },
  { id: 'review-payment-pending', clientId: 'review-client-valeria', trainerId: TRAINER_ID, amount: 450, dueDate: isoDaysFromNow(1), paidAt: null, status: 'pending' },
  { id: 'review-payment-late', clientId: 'review-client-diego', trainerId: TRAINER_ID, amount: 350, dueDate: isoDaysFromNow(-8), paidAt: null, status: 'late' }
];

const notifyClients = (callback: (items: Client[]) => void) => callback(clients.map(client => ({ ...client })));

export const visualReviewProvider: IDBProvider = {
  name: 'Visual Review Sandbox',
  async signUp() { return { user: reviewUser }; },
  async signIn() { return { user: reviewUser }; },
  async signOut() {},
  async getCurrentUser() { return reviewUser; },
  onAuthStateChanged(callback) {
    const timer = window.setTimeout(() => callback(reviewUser, 'SIGNED_IN'), 0);
    return () => window.clearTimeout(timer);
  },
  async getClients() { return clients.map(client => ({ ...client })); },
  subscribeToClients(_trainerId, callback, onStatus) {
    const timer = window.setTimeout(() => {
      notifyClients(callback);
      onStatus?.('SUBSCRIBED');
    }, 0);
    return () => window.clearTimeout(timer);
  },
  subscribeToBillingRecords(_trainerId, callback) {
    const timer = window.setTimeout(() => callback(billingRecords.map(record => ({ ...record }))), 0);
    return () => window.clearTimeout(timer);
  },
  async createClient(trainerId, data) {
    const client = baseClient({ ...data, id: `review-client-${Date.now()}`, trainerId });
    clients = [client, ...clients];
    return client;
  },
  async updateClient(clientId, data) {
    const previous = clients.find(client => client.id === clientId);
    clients = clients.map(client => client.id === clientId ? { ...client, ...data } : client);
    if (previous && data.paymentInfo) {
      const payment = data.paymentInfo as ClientPaymentInfo;
      const previousDue = previous.paymentInfo?.nextPaymentAt?.slice(0, 10);
      const nextDue = payment.nextPaymentAt?.slice(0, 10);
      const hasNewPayment = payment.status === 'al_dia'
        && Boolean(payment.lastPaidAt)
        && payment.lastPaidAt !== previous.paymentInfo?.lastPaidAt;
      const openRecord = billingRecords.find(record => record.clientId === clientId && record.status !== 'paid');

      if (hasNewPayment) {
        if (openRecord) {
          openRecord.status = 'paid';
          openRecord.paidAt = payment.lastPaidAt;
          openRecord.amount = Number(payment.lastPaymentAmount) || Number(payment.monthlyFee) || 0;
        } else {
          billingRecords.push({
            id: `review-paid-${Date.now()}`,
            clientId,
            trainerId: previous.trainerId,
            amount: Number(payment.lastPaymentAmount) || Number(payment.monthlyFee) || 0,
            dueDate: previousDue || payment.lastPaidAt!,
            paidAt: payment.lastPaidAt,
            status: 'paid'
          });
        }
      }

      if (nextDue && payment.status !== 'sin_registro') {
        const nextOpen = billingRecords.find(record => record.clientId === clientId && record.status !== 'paid');
        if (nextOpen) {
          nextOpen.dueDate = nextDue;
          nextOpen.amount = Number(payment.monthlyFee) || 0;
          nextOpen.paidAt = null;
          nextOpen.status = payment.status === 'atrasado' ? 'late' : 'pending';
        } else {
          billingRecords.push({
            id: `review-due-${Date.now()}`,
            clientId,
            trainerId: previous.trainerId,
            amount: Number(payment.monthlyFee) || 0,
            dueDate: nextDue,
            paidAt: null,
            status: payment.status === 'atrasado' ? 'late' : 'pending'
          });
        }
      }
    }
  },
  async deleteClient(clientId) { clients = clients.filter(client => client.id !== clientId); },
  async getBillingRecords() { return billingRecords.map(record => ({ ...record })); },
  async updateUser(_userId, data) { Object.assign(reviewUser, data); return reviewUser; },
  async getProfile() { return reviewUser; },
  async saveRoutine(_trainerId, clientId, routine) {
    clients = clients.map(client => client.id === clientId ? { ...client, routines: routine.id && client.routines.some(item => item.id === routine.id) ? client.routines.map(item => item.id === routine.id ? { ...routine, source: 'manual' } : item) : [routine, ...client.routines] } : client);
    return routine;
  },
  async saveDiet(_trainerId, clientId, diet) {
    clients = clients.map(client => client.id === clientId ? { ...client, dietPlan: diet, dietPlans: diet.id && (client.dietPlans || []).some(item => item.id === diet.id) ? (client.dietPlans || []).map(item => item.id === diet.id ? { ...diet, source: 'manual' } : item) : [diet, ...(client.dietPlans || [])] } : client);
    return diet;
  },
  async getRoutines(clientId) { return clients.find(client => client.id === clientId)?.routines || []; },
  async getDiet(clientId) { return clients.find(client => client.id === clientId)?.dietPlan || null; },
  async getDiets(clientId) { return clients.find(client => client.id === clientId)?.dietPlans || []; },
  async archiveRoutine(routineId) {
    clients = clients.map(client => ({ ...client, routines: client.routines.filter(routine => routine.id !== routineId) }));
  },
  async archiveDiet(dietId) {
    clients = clients.map(client => {
      const dietPlans = (client.dietPlans || []).filter(diet => diet.id !== dietId);
      return { ...client, dietPlans, dietPlan: dietPlans[0] };
    });
  },
  async getOrCreateTrainerUsage() { return reviewUser.trainerUsage; },
  async incrementTrainerUsage() { return reviewUser.trainerUsage; },
  async getTotalRoutinesCount() { return clients.reduce((total, client) => total + client.routines.length, 0); },
  async getTotalDietsCount() { return clients.reduce((total, client) => total + (client.dietPlans?.length || 0), 0); }
};

export const isVisualReviewMode = () => {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('review') === 'visual';
};
