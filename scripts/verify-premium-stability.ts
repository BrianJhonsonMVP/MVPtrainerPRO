import assert from 'node:assert/strict';
import { BillingRecord, Client, User } from '../src/types';
import {
  markSubscriptionSyncing,
  mergeUserWithLastConfirmedPlan,
  resolveSubscriptionEntitlements
} from '../src/services/subscriptionEntitlements';
import { canUseFeature, isActivePro } from '../src/services/subscriptionLogic';
import { getDaySchedule } from '../src/services/scheduleService';
import {
  buildPaymentEventsForMonth,
  getMonthlyPaymentSummary,
  markPaymentPaid
} from '../src/services/paymentService';

const confirmedAt = new Date('2026-07-27T17:00:00.000Z');
const proSubscription = resolveSubscriptionEntitlements(
  { plan_type: 'pro', account_status: 'active', billing_interval: 'annual' },
  [{
    plan_type: 'pro',
    status: 'active',
    billing_interval: 'annual',
    current_period_end: '2027-07-27T17:00:00.000Z',
    updated_at: '2026-07-27T17:00:00.000Z'
  }],
  confirmedAt
);

const proUser: User = {
  uid: 'trainer-pro',
  email: 'trainer@example.com',
  displayName: 'Trainer',
  createdAt: confirmedAt.toISOString(),
  subscription: proSubscription
};

assert.equal(isActivePro(proUser), true, 'A confirmed active PRO account must have PRO access.');
assert.equal(canUseFeature(proUser, 'agenda').allowed, true);

const syncingPro = markSubscriptionSyncing(proUser);
assert.equal(syncingPro.subscription.isSyncing, true);
assert.equal(isActivePro(syncingPro), true, 'Temporary syncing must preserve confirmed PRO access.');

const mergedPro = mergeUserWithLastConfirmedPlan(proUser, syncingPro);
assert.equal(mergedPro.subscription.type, 'pro');
assert.equal(mergedPro.subscription.isActive, true);
assert.equal(mergedPro.subscription.source, 'last_confirmed');

const freeSubscription = resolveSubscriptionEntitlements(
  { plan_type: 'free', account_status: 'free' },
  [],
  confirmedAt
);
const freeUser: User = {
  ...proUser,
  uid: 'trainer-free',
  email: 'free@example.com',
  subscription: freeSubscription
};
assert.equal(isActivePro(freeUser), false);
assert.equal(canUseFeature(freeUser, 'agenda').allowed, false);
assert.equal(
  mergeUserWithLastConfirmedPlan(proUser, freeUser).subscription.type,
  'free',
  'A different account must never inherit the previous PRO plan.'
);

const canceledSubscription = resolveSubscriptionEntitlements(
  { plan_type: 'pro', account_status: 'active' },
  [{
    plan_type: 'pro',
    status: 'canceled',
    current_period_end: '2027-07-27T17:00:00.000Z',
    updated_at: '2026-07-27T17:00:00.000Z'
  }],
  confirmedAt
);
assert.equal(canceledSubscription.status, 'canceled');
assert.equal(canceledSubscription.isActive, false, 'A confirmed cancellation must remove PRO access.');

const makeClient = (overrides: Partial<Client>): Client => ({
  id: 'client-1',
  trainerId: 'trainer-pro',
  name: 'Renato',
  gender: 'male',
  age: 30,
  avatarUrl: '',
  weight: 80,
  height: 175,
  experienceLevel: 'intermediate',
  mainGoal: 'Improve fitness',
  goals: ['Improve fitness'],
  trainingDays: ['Monday'],
  trainingTime: '06:00 PM - 07:00 PM',
  routines: [],
  paymentInfo: {
    monthlyFee: 200,
    paymentMethod: 'transferencia',
    status: 'pendiente',
    lastPaidAt: null,
    nextPaymentAt: '2026-07-28T12:00:00.000Z'
  },
  status: 'active',
  createdAt: confirmedAt.toISOString(),
  ...overrides
});

const monday = new Date('2026-07-27T12:00:00.000Z');
const schedule = getDaySchedule([makeClient({})], monday, monday);
assert.equal(schedule.sessions.length, 1);
assert.equal(schedule.scheduledMinutes, 60);
assert.equal(schedule.sessions[0].client.id, 'client-1');

const paidClient = makeClient({
  id: 'client-paid',
  name: 'Carlos',
  paymentInfo: {
    monthlyFee: 180,
    paymentMethod: 'yape',
    status: 'al_dia',
    lastPaidAt: '2026-07-10T12:00:00.000Z',
    nextPaymentAt: '2026-08-10T12:00:00.000Z'
  }
});
const overdueClient = makeClient({
  id: 'client-overdue',
  name: 'Marcelo',
  paymentInfo: {
    monthlyFee: 150,
    paymentMethod: 'efectivo',
    status: 'atrasado',
    lastPaidAt: null,
    nextPaymentAt: '2026-07-20T12:00:00.000Z'
  }
});
const inactiveClient = makeClient({
  id: 'client-inactive',
  status: 'inactive'
});

const records: BillingRecord[] = [
  {
    id: 'record-paid',
    clientId: paidClient.id,
    trainerId: 'trainer-pro',
    amount: 180,
    dueDate: '2026-07-10',
    paidAt: '2026-07-10T12:00:00.000Z',
    status: 'paid'
  },
  {
    id: 'record-overdue',
    clientId: overdueClient.id,
    trainerId: 'trainer-pro',
    amount: 150,
    dueDate: '2026-07-20',
    paidAt: null,
    status: 'late'
  }
];

const clients = [makeClient({}), paidClient, overdueClient, inactiveClient];
const events = buildPaymentEventsForMonth(clients, monday, records, confirmedAt);
assert.equal(events.some(event => event.client.id === inactiveClient.id), false);
assert.equal(events.some(event => event.state === 'paid' && event.amount === 180), true);
assert.equal(events.some(event => event.state === 'overdue' && event.amount === 150), true);
assert.equal(events.some(event => event.state === 'pending' && event.client.id === 'client-1'), true);

const paymentSummary = getMonthlyPaymentSummary(clients, monday, records, confirmedAt);
assert.equal(paymentSummary.collected, 180);
assert.equal(paymentSummary.pending, 200);
assert.equal(paymentSummary.overdue, 150);
assert.equal(paymentSummary.pendingClients, 2);

const paid = markPaymentPaid(makeClient({}).paymentInfo, confirmedAt);
assert.equal(paid.status, 'al_dia');
assert.ok(paid.lastPaidAt);
assert.ok(paid.nextPaymentAt && new Date(paid.nextPaymentAt) > confirmedAt);

console.log(JSON.stringify({
  premium: 'stable',
  freeIsolation: 'passed',
  confirmedCancellation: 'passed',
  sessions: schedule.sessions.length,
  payments: {
    collected: paymentSummary.collected,
    pending: paymentSummary.pending,
    overdue: paymentSummary.overdue
  }
}));
