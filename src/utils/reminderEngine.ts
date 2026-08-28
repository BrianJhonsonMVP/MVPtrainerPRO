
import { Client, User } from "../types";
import { isActivePro } from "../services/subscriptionLogic";

const REMINDER_STORAGE_KEY = 'mvp_sent_reminders';

interface SentReminders {
  [key: string]: number; // key: timestamp
}

// Helper para obtener notificaciones ya enviadas hoy
const getSentReminders = (): SentReminders => {
  try {
    const data = localStorage.getItem(REMINDER_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
};

// Helper para marcar notificación como enviada
const markAsSent = (key: string) => {
  const sent = getSentReminders();
  // Limpieza básica: eliminar claves de días anteriores para no llenar el storage
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  
  const cleanSent: SentReminders = {};
  Object.keys(sent).forEach(k => {
    if (now - sent[k] < oneDay) {
      cleanSent[k] = sent[k];
    }
  });

  cleanSent[key] = now;
  localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(cleanSent));
};

// Helper para enviar notificación
const sendNotification = (title: string, body: string, iconUrl?: string, onToast?: (t: any) => void) => {
  // 1. Intentar Notificación Nativa
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: iconUrl || 'https://cdn-icons-png.flaticon.com/512/2964/2964514.png',
      silent: false
    });
  } 
  
  // 2. Fallback visual dentro de la app (Toast)
  if (onToast) {
    onToast({ title, message: body, type: 'warning' }); // Warning usa el color ámbar/gold que destaca bien
  }
};

// Función para convertir hora "07:00 AM" a objeto Date de hoy
const getWorkoutDateToday = (timeString: string | null): Date | null => {
  if (!timeString) return null;
  try {
    const today = new Date();
    const [time, modifier] = timeString.split(' ');
    let [hours, minutes] = time.split(':');
    
    let h = parseInt(hours, 10);
    if (h === 12) h = 0;
    if (modifier === 'PM') h += 12;

    today.setHours(h, parseInt(minutes, 10), 0, 0);
    return today;
  } catch {
    return null;
  }
};

export const checkReminders = (
  user: User, 
  clients: Client[], 
  showToast: (toast: any) => void
) => {
  if (!user || clients.length === 0) return;

  const now = new Date();
  const sentReminders = getSentReminders();
  const isPro = isActivePro(user);
  
  // Nombres de días en español para coincidir con client.trainingDays
  const DAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const currentDayName = DAYS[now.getDay()];

  clients.forEach(client => {
    // --- 1. RECORDATORIOS DE ENTRENAMIENTO (Para TODOS: Free, Trial, Pro) ---
    // Regla: Notificar 1 hora antes
    if (client.trainingDays && client.trainingDays.includes(currentDayName) && client.status === 'active') {
      const workoutTime = getWorkoutDateToday(client.trainingTime || null);
      
      if (workoutTime) {
        const diffMs = workoutTime.getTime() - now.getTime();
        const diffMinutes = Math.floor(diffMs / 60000);

        // Si falta entre 55 y 65 minutos (rango de tolerancia para el intervalo de 1 min)
        if (diffMinutes >= 55 && diffMinutes <= 65) {
          const key = `workout_${client.id}_${now.toDateString()}`;
          
          if (!sentReminders[key]) {
            sendNotification(
              `🏋️‍♂️ Entrenamiento en 1 hora`,
              `Te toca entrenar a ${client.name} a las ${client.trainingTime}`,
              client.avatarUrl,
              showToast
            );
            markAsSent(key);
          }
        }
      }
    }

    // --- 2. RECORDATORIOS DE PAGO (Solo PRO) ---
    if (isPro && client.paymentInfo && client.status === 'active') {
        const nextPayment = client.paymentInfo.nextPaymentAt ? new Date(client.paymentInfo.nextPaymentAt) : null;
        
        if (nextPayment) {
            // Normalizar fechas a medianoche para comparar días
            const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const paymentMidnight = new Date(nextPayment.getFullYear(), nextPayment.getMonth(), nextPayment.getDate());
            
            const diffTime = paymentMidnight.getTime() - todayMidnight.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // A) Recordatorio 1 día antes (diffDays === 1)
            if (diffDays === 1) {
                const key = `payment_warn_${client.id}_${paymentMidnight.toISOString()}`;
                if (!sentReminders[key]) {
                    sendNotification(
                        `💰 Pago Mañana`,
                        `El pago de ${client.name} vence mañana.`,
                        client.avatarUrl,
                        showToast
                    );
                    markAsSent(key);
                }
            }

            // B) Recordatorio Vencido hoy (diffDays === 0) o atrasado
            if (diffDays <= 0 && client.paymentInfo.status !== 'al_dia') {
                // Solo notificar una vez por ciclo de vencimiento (usamos la fecha de pago como key)
                const key = `payment_due_${client.id}_${paymentMidnight.toISOString()}`;
                
                // Solo enviamos si es hora "razonable" (ej: 10 AM) para no despertar por la noche si corre en background,
                // o simplemente confiamos en que el usuario tiene la app abierta.
                // Para simplificar, enviamos si no se ha enviado ya para esa fecha de vencimiento.
                if (!sentReminders[key]) {
                     sendNotification(
                        `⚠️ Pago Vencido`,
                        `${client.name} debe realizar su pago hoy.`,
                        client.avatarUrl,
                        showToast
                    );
                    markAsSent(key);
                }
            }
        }
    }
  });
};

export const requestNotificationPermission = async () => {
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }
    }
};
