import { SubscriptionSource, SubscriptionStatus, SubscriptionType, User, UserSubscription } from '../types';
import { DEV_FORCE_PRO, getWeekStartISO } from './subscriptionLogic';

type ProfileSubscriptionRow = {
  plan_type?: string | null;
  account_status?: string | null;
  billing_interval?: string | null;
};

type SubscriptionRow = {
  provider?: UserSubscription['provider'] | null;
  plan_type?: string | null;
  status?: string | null;
  billing_interval?: string | null;
  current_period_end?: string | null;
  trial_ends_at?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  external_customer_id?: string | null;
  external_subscription_id?: string | null;
  updated_at?: string | null;
};

const ACTIVE_STATUSES = new Set(['active', 'trialing']);
const INACTIVE_STATUSES = new Set(['past_due', 'canceled', 'expired', 'inactive']);

const normalizePlan = (value?: string | null): SubscriptionType | null => {
  if (value === 'pro' || value === 'free' || value === 'trial') return value;
  return null;
};

const normalizeStatus = (value?: string | null, plan: SubscriptionType = 'free'): SubscriptionStatus => {
  if (plan === 'free') return 'free';
  if (value === 'active' || value === 'trialing' || value === 'past_due' || value === 'canceled' || value === 'expired') {
    return value;
  }
  return 'expired';
};

const isDateCurrent = (value?: string | null, now = new Date()) => {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp > now.getTime();
};

const mapBillingInterval = (value?: string | null): UserSubscription['planInterval'] => {
  if (value === 'annual') return 'yearly';
  if (value === 'semiannual') return 'semiannual';
  return value === 'monthly' ? 'monthly' : undefined;
};

const baseUsage = () => ({
  weekStart: getWeekStartISO(),
  aiRoutinesByClient: {},
  aiDietsByClient: {}
});

const buildSubscription = (
  plan: SubscriptionType,
  status: SubscriptionStatus,
  source: SubscriptionSource,
  confirmedAt: string,
  row?: SubscriptionRow | ProfileSubscriptionRow,
  now: Date = new Date()
): UserSubscription => {
  const subscriptionRow = row as SubscriptionRow | undefined;
  const periodEnd = subscriptionRow?.current_period_end || null;
  const active = plan === 'pro'
    ? ACTIVE_STATUSES.has(status) && isDateCurrent(periodEnd, now)
    : plan === 'trial'
      ? ACTIVE_STATUSES.has(status) && Boolean(subscriptionRow?.trial_ends_at) && isDateCurrent(subscriptionRow?.trial_ends_at, now)
      : false;

  const resolvedStatus = (plan === 'pro' || plan === 'trial') && ACTIVE_STATUSES.has(status) && !active
    ? 'expired'
    : status;

  return {
    type: plan,
    isActive: active,
    status: resolvedStatus,
    source,
    confirmedAt,
    isSyncing: false,
    planInterval: mapBillingInterval(row?.billing_interval),
    trialEndsAt: subscriptionRow?.trial_ends_at || null,
    currentPeriodEnd: periodEnd || undefined,
    expiresAt: periodEnd,
    stripeCustomerId: subscriptionRow?.stripe_customer_id || undefined,
    stripeSubscriptionId: subscriptionRow?.stripe_subscription_id || undefined,
    provider: subscriptionRow?.provider || undefined,
    externalCustomerId: subscriptionRow?.external_customer_id || subscriptionRow?.stripe_customer_id || undefined,
    externalSubscriptionId: subscriptionRow?.external_subscription_id || subscriptionRow?.stripe_subscription_id || undefined,
    usage: baseUsage()
  };
};

export const resolveSubscriptionEntitlements = (
  profile: ProfileSubscriptionRow | null | undefined,
  subscriptions: SubscriptionRow[] | null | undefined,
  now = new Date()
): UserSubscription => {
  const confirmedAt = now.toISOString();

  if (DEV_FORCE_PRO) {
    return buildSubscription('pro', 'active', 'development', confirmedAt, undefined, now);
  }

  const rows = Array.isArray(subscriptions) ? subscriptions : [];
  const activePro = rows.find(row => {
    const plan = normalizePlan(row.plan_type);
    const status = row.status || '';
    return plan === 'pro' && ACTIVE_STATUSES.has(status) && isDateCurrent(row.current_period_end, now);
  });

  if (activePro) {
    return buildSubscription('pro', normalizeStatus(activePro.status, 'pro'), 'subscriptions', confirmedAt, activePro, now);
  }

  const activeTrial = rows.find(row => {
    const plan = normalizePlan(row.plan_type);
    const status = row.status || '';
    return plan === 'trial' && ACTIVE_STATUSES.has(status) && Boolean(row.trial_ends_at) && isDateCurrent(row.trial_ends_at, now);
  });

  if (activeTrial) {
    return buildSubscription('trial', normalizeStatus(activeTrial.status, 'trial'), 'subscriptions', confirmedAt, activeTrial, now);
  }

  const latestExplicit = rows.find(row => {
    const plan = normalizePlan(row.plan_type);
    return Boolean(plan && (ACTIVE_STATUSES.has(row.status || '') || INACTIVE_STATUSES.has(row.status || '') || plan === 'free'));
  });

  if (latestExplicit) {
    const plan = normalizePlan(latestExplicit.plan_type)!;
    return buildSubscription(plan, normalizeStatus(latestExplicit.status, plan), 'subscriptions', confirmedAt, latestExplicit, now);
  }

  const profilePlan = normalizePlan(profile?.plan_type);
  if (profilePlan) {
    const profileStatus = profile?.account_status || (profilePlan === 'free' ? 'free' : '');
    return buildSubscription(profilePlan, normalizeStatus(profileStatus, profilePlan), 'profiles', confirmedAt, profile || undefined, now);
  }

  throw new Error('No confirmed subscription state was returned by Supabase.');
};

export const markSubscriptionSyncing = (user: User): User => ({
  ...user,
  subscription: {
    ...user.subscription,
    source: 'last_confirmed',
    isSyncing: true
  }
});

// Keep the last confirmed entitlement usable when the network is temporarily unavailable.
// A failed refresh must not look like an endless loading state or revoke PRO access.
export const markSubscriptionSyncFailed = (user: User): User => ({
  ...user,
  subscription: {
    ...user.subscription,
    source: 'last_confirmed',
    isSyncing: false
  }
});

export const isConfirmedSubscription = (subscription?: UserSubscription | null) =>
  Boolean(subscription?.confirmedAt && subscription.source && subscription.source !== 'last_confirmed');

export const mergeUserWithLastConfirmedPlan = (previous: User | null, incoming: User): User => {
  if (!previous || previous.uid !== incoming.uid) return incoming;
  if (isConfirmedSubscription(incoming.subscription)) return incoming;

  return {
    ...incoming,
    subscription: {
      ...previous.subscription,
      isSyncing: incoming.subscription?.isSyncing ?? true,
      source: 'last_confirmed'
    }
  };
};
