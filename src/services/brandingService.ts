import { BrandingConfig } from '../types';

export const DEFAULT_BRANDING: BrandingConfig = {
  brandName: 'MVP Trainer',
  logoUrl: '',
  primaryColor: '#8B5CF6',
  secondaryColor: '#050505'
};

const hexToRgb = (hex: string) => {
  const normalized = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
};

const normalizeHex = (value: string | undefined, fallback: string) => {
  const normalized = value?.trim().replace(/^#?/, '#') || '';
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback;
};

const mixHex = (base: string, target: string, amount: number) => {
  const baseRgb = hexToRgb(base);
  const targetRgb = hexToRgb(target);
  if (!baseRgb || !targetRgb) return base;

  const mixChannel = (from: number, to: number) =>
    Math.round(from + (to - from) * amount).toString(16).padStart(2, '0');

  return `#${mixChannel(baseRgb.r, targetRgb.r)}${mixChannel(baseRgb.g, targetRgb.g)}${mixChannel(baseRgb.b, targetRgb.b)}`.toUpperCase();
};

export const normalizeBrandingConfig = (config?: Partial<BrandingConfig> | null): BrandingConfig => ({
  brandName: config?.brandName?.trim() || '',
  logoUrl: config?.logoUrl?.trim() || '',
  primaryColor: normalizeHex(config?.primaryColor, DEFAULT_BRANDING.primaryColor),
  secondaryColor: normalizeHex(config?.secondaryColor, DEFAULT_BRANDING.secondaryColor)
});

const luminance = (hex: string) => {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const channels = [rgb.r, rgb.g, rgb.b].map(value => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};

export const getContrastRatio = (background: string, foreground: string) => {
  const bright = Math.max(luminance(background), luminance(foreground));
  const dark = Math.min(luminance(background), luminance(foreground));
  return (bright + 0.05) / (dark + 0.05);
};

export const getContrastTextColor = (background: string) => {
  const dark = '#050505';
  const light = '#FFFFFF';
  return getContrastRatio(background, dark) >= getContrastRatio(background, light) ? dark : light;
};

export const applyBrandingToTheme = (input?: Partial<BrandingConfig> | null) => {
  if (typeof document === 'undefined') return;

  const config = normalizeBrandingConfig(input || DEFAULT_BRANDING);
  const primaryRgb = hexToRgb(config.primaryColor);
  const secondaryRgb = hexToRgb(config.secondaryColor);
  const primaryLight = mixHex(config.primaryColor, '#FFFFFF', 0.2);
  const primaryDark = mixHex(config.primaryColor, '#000000', 0.22);
  const root = document.documentElement;

  root.style.setProperty('--primary', config.primaryColor);
  root.style.setProperty('--primary-light', primaryLight);
  root.style.setProperty('--primary-dark', primaryDark);
  root.style.setProperty('--border-focus', config.primaryColor);
  root.style.setProperty('--mvp-gold', primaryLight);
  root.style.setProperty('--mvp-brand-primary', config.primaryColor);
  root.style.setProperty('--mvp-brand-secondary', config.secondaryColor);
  root.style.setProperty('--mvp-brand-on-primary', getContrastTextColor(config.primaryColor));
  root.style.setProperty('--mvp-brand-on-secondary', getContrastTextColor(config.secondaryColor));
  root.style.setProperty('--mvp-brand-primary-rgb', primaryRgb ? `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}` : '139, 92, 246');
  root.style.setProperty('--mvp-brand-secondary-rgb', secondaryRgb ? `${secondaryRgb.r}, ${secondaryRgb.g}, ${secondaryRgb.b}` : '5, 5, 5');
  root.style.setProperty('--shadow-primary', `0 12px 28px rgba(${primaryRgb ? `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}` : '139, 92, 246'}, 0.24)`);
};
