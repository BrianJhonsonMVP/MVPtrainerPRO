import { Client } from '../types';
import { parsePaymentDate, startOfDay } from './paymentService';

const DAY_MS = 86_400_000;

export const normalizeClientPhone = (value?: string | null) =>
  (value || '').replace(/\D/g, '').replace(/^00/, '');

export const findDuplicateClientByPhone = (clients: Client[], phone: string, excludedClientId?: string) => {
  const normalized = normalizeClientPhone(phone);
  if (normalized.length < 7) return null;
  return clients.find(client => client.id !== excludedClientId && normalizeClientPhone(client.phone) === normalized) || null;
};

export const pauseClientService = (client: Client, now = new Date()): Partial<Client> => ({
  status: 'paused',
  pausedAt: now.toISOString(),
  finishedAt: null
});

export const reactivateClientService = (client: Client, now = new Date()): Partial<Client> => {
  const pausedAt = parsePaymentDate(client.pausedAt);
  const currentDue = parsePaymentDate(client.paymentInfo?.nextPaymentAt);
  const pausedDays = pausedAt
    ? Math.max(0, Math.round((startOfDay(now).getTime() - startOfDay(pausedAt).getTime()) / DAY_MS))
    : 0;

  let nextPaymentAt = client.paymentInfo?.nextPaymentAt || null;
  if (currentDue && pausedDays > 0) {
    currentDue.setDate(currentDue.getDate() + pausedDays);
    nextPaymentAt = currentDue.toISOString();
  }

  return {
    status: 'active',
    pausedAt: null,
    finishedAt: null,
    paymentInfo: {
      ...client.paymentInfo,
      nextPaymentAt
    }
  };
};

export const finishClientService = (_client: Client, now = new Date()): Partial<Client> => ({
  status: 'inactive',
  pausedAt: null,
  finishedAt: now.toISOString()
});
