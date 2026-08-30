import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import {
  LOG_LEVEL,
  PACKAGE_TYPE,
  Purchases,
  type CustomerInfo,
  type PurchasesPackage
} from '@revenuecat/purchases-capacitor';
import type { PlanInterval } from '../types';

export type BillingPlatform = 'web' | 'ios' | 'android';
export type NativePlan = {
  interval: PlanInterval;
  price: string;
  title: string;
  package: PurchasesPackage;
};

const ENTITLEMENT_ID = (import.meta as any).env.VITE_REVENUECAT_ENTITLEMENT_ID || 'pro';
let configuredUserId: string | null = null;

export const getBillingPlatform = (): BillingPlatform => {
  const platform = Capacitor.getPlatform();
  return platform === 'ios' || platform === 'android' ? platform : 'web';
};

export const isNativeBilling = () => Capacitor.isNativePlatform() && getBillingPlatform() !== 'web';

const platformApiKey = () => {
  const env = (import.meta as any).env;
  return getBillingPlatform() === 'ios'
    ? env.VITE_REVENUECAT_APPLE_API_KEY
    : getBillingPlatform() === 'android'
      ? env.VITE_REVENUECAT_GOOGLE_API_KEY
      : null;
};

export const initializeNativeBilling = async (userId: string) => {
  if (!isNativeBilling()) return false;
  const apiKey = platformApiKey();
  if (!apiKey) throw new Error('Native billing is not configured for this store.');
  if (configuredUserId === userId) return true;

  await Purchases.setLogLevel({ level: (import.meta as any).env.DEV ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR });
  if (!configuredUserId) {
    await Purchases.configure({ apiKey, appUserID: userId });
  } else {
    await Purchases.logIn({ appUserID: userId });
  }
  configuredUserId = userId;
  return true;
};

const intervalForPackage = (value: PurchasesPackage): PlanInterval | null => {
  if (value.packageType === PACKAGE_TYPE.MONTHLY) return 'monthly';
  if (value.packageType === PACKAGE_TYPE.SIX_MONTH) return 'semiannual';
  if (value.packageType === PACKAGE_TYPE.ANNUAL) return 'yearly';
  const identifier = `${value.identifier} ${value.product.identifier}`;
  if (/annual|year|12month/i.test(identifier)) return 'yearly';
  if (/semi|6month/i.test(identifier)) return 'semiannual';
  if (/month/i.test(identifier)) return 'monthly';
  return null;
};

export const loadNativePlans = async (userId: string): Promise<NativePlan[]> => {
  await initializeNativeBilling(userId);
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages || [];
  return packages.flatMap(aPackage => {
    const interval = intervalForPackage(aPackage);
    return interval ? [{
      interval,
      price: aPackage.product.priceString,
      title: aPackage.product.title,
      package: aPackage
    }] : [];
  });
};

export const purchaseNativePlan = async (userId: string, interval: PlanInterval) => {
  const plans = await loadNativePlans(userId);
  const selected = plans.find(plan => plan.interval === interval);
  if (!selected) throw new Error('This plan is not available in the store yet.');
  const result = await Purchases.purchasePackage({ aPackage: selected.package });
  return result.customerInfo;
};

export const restoreNativePurchases = async (userId: string) => {
  await initializeNativeBilling(userId);
  const result = await Purchases.restorePurchases();
  return result.customerInfo;
};

export const getNativeCustomerInfo = async (userId: string) => {
  await initializeNativeBilling(userId);
  const { customerInfo } = await Purchases.getCustomerInfo();
  return customerInfo;
};

export const hasNativeProEntitlement = (customerInfo: CustomerInfo) => Boolean(customerInfo.entitlements.active[ENTITLEMENT_ID]);

export const openNativeSubscriptionManagement = async (userId: string) => {
  await initializeNativeBilling(userId);
  const { customerInfo } = await Purchases.getCustomerInfo();
  const managementUrl = customerInfo.managementURL;
  if (!managementUrl) throw new Error('The store did not provide a subscription management URL.');
  await Browser.open({ url: managementUrl });
};
