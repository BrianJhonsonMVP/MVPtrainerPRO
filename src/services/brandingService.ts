
import { BrandingConfig } from '../types';

export const DEFAULT_BRANDING: BrandingConfig = {
  brandName: 'MVP Trainer',
  logoUrl: '',
  primaryColor: '#F59E0B', // mvp-gold
  secondaryColor: '#000000',
};

export const applyBrandingToTheme = (config: BrandingConfig) => {
  if (!config) return;
  const root = document.documentElement;
  root.style.setProperty('--mvp-gold', config.primaryColor);
  // Podrías añadir más variables CSS aquí si fuera necesario
};
