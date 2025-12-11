import { BrandingConfig } from "../types";

export const DEFAULT_BRANDING: BrandingConfig = {
  brandName: 'MVP TRAINER',
  logoUrl: '',
  primaryColor: '#FF5B0B', // MVP Orange
  secondaryColor: '#FBBF24', // Soft Gold Accent
};

export const applyBrandingToTheme = (branding?: BrandingConfig) => {
  const root = document.documentElement;
  
  const primary = branding?.primaryColor || DEFAULT_BRANDING.primaryColor;
  const secondary = branding?.secondaryColor || DEFAULT_BRANDING.secondaryColor;

  // Actualizar variables CSS
  // Tailwind en index.html está configurado para usar var(--mvp-orange) y var(--mvp-gold)
  // Nota: Mapeamos primary -> mvp-orange (accion principal) y secondary -> mvp-gold (acentos)
  root.style.setProperty('--mvp-orange', primary);
  root.style.setProperty('--mvp-gold', secondary);

  if (branding?.brandName) {
      document.title = branding.brandName;
  }
};

export const resetBranding = () => {
    applyBrandingToTheme(DEFAULT_BRANDING);
    document.title = 'MVP-Trainer-Pro';
};