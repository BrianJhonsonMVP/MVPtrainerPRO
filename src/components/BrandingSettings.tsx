import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrandingConfig, User } from '../types';
import { CheckCircle2, Crown, ImagePlus, Loader2, Palette, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react';
import { dbProvider } from '../data';
import {
  applyBrandingToTheme,
  DEFAULT_BRANDING,
  getContrastRatio,
  getContrastTextColor,
  normalizeBrandingConfig
} from '../services/brandingService';
import { uploadTrainerAsset } from '../services/trainerAssetService';
import { isActivePro } from '../services/subscriptionLogic';
import PremiumLockOverlay from './PremiumLockOverlay';

type AppLanguage = 'es' | 'en';

const COPY = {
  es: {
    confirmTitle: 'Restaurar marca',
    confirmMessage: 'Se restauraran el nombre, logo y colores originales de MVP Trainer.',
    title: 'Personalizacion de marca',
    subtitle: 'Tu identidad se vera en la cabecera, pagina publica e imagenes para compartir.',
    brandName: 'Nombre de tu marca',
    brandPlaceholder: 'Ej: Bravo Fit Trainer',
    logo: 'Logo de tu marca',
    uploadLogo: 'Subir logo',
    replaceLogo: 'Cambiar logo',
    uploadHint: 'JPG, PNG o WebP. Maximo 5 MB.',
    appColors: 'Colores de marca',
    primary: 'Color principal',
    secondary: 'Fondo de marca',
    preview: 'Asi se vera',
    sampleButton: 'Reservar asesoria',
    contrastGood: 'Contraste legible',
    contrastBad: 'Elige un color con mayor contraste',
    saving: 'Guardando...',
    uploading: 'Subiendo...',
    apply: 'Aplicar cambios',
    upToDate: 'Todo actualizado',
    pending: 'Cambios pendientes',
    saved: 'Marca aplicada correctamente.',
    uploaded: 'Logo cargado. Aplica los cambios para publicarlo.',
    removeLogo: 'Quitar logo',
    resetTitle: 'Restaurar marca original',
    lockedTitle: 'Personalizacion bloqueada',
    lockedDescription: 'Sube tu logo y adapta la identidad visual para presentar una experiencia profesional.',
    lockedCta: 'Desbloquear Branding PRO'
  },
  en: {
    confirmTitle: 'Restore brand',
    confirmMessage: 'Your brand name, logo, and colors will return to the MVP Trainer defaults.',
    title: 'Brand customization',
    subtitle: 'Your identity appears in the header, public page, and share images.',
    brandName: 'Brand name',
    brandPlaceholder: 'Example: Bravo Fit Trainer',
    logo: 'Brand logo',
    uploadLogo: 'Upload logo',
    replaceLogo: 'Replace logo',
    uploadHint: 'JPG, PNG, or WebP. Maximum 5 MB.',
    appColors: 'Brand colors',
    primary: 'Primary color',
    secondary: 'Brand background',
    preview: 'How it will look',
    sampleButton: 'Book coaching',
    contrastGood: 'Readable contrast',
    contrastBad: 'Choose a color with stronger contrast',
    saving: 'Saving...',
    uploading: 'Uploading...',
    apply: 'Apply changes',
    upToDate: 'Everything is up to date',
    pending: 'Unsaved changes',
    saved: 'Brand applied successfully.',
    uploaded: 'Logo uploaded. Apply the changes to publish it.',
    removeLogo: 'Remove logo',
    resetTitle: 'Restore original brand',
    lockedTitle: 'Branding locked',
    lockedDescription: 'Upload your logo and customize the visual identity for a professional client experience.',
    lockedCta: 'Unlock Branding PRO'
  }
};

interface BrandingSettingsProps {
  user: User;
  onUpdateUser: (user: User) => void;
  onShowPaywall: () => void;
  requestConfirm: (config: any) => void;
  language?: AppLanguage;
}

const BrandingSettings: React.FC<BrandingSettingsProps> = ({
  user,
  onUpdateUser,
  onShowPaywall,
  requestConfirm,
  language = 'es'
}) => {
  const copy = COPY[language];
  const isPro = isActivePro(user);
  const savedConfig = useMemo(() => normalizeBrandingConfig(user.branding), [
    user.branding?.brandName,
    user.branding?.logoUrl,
    user.branding?.primaryColor,
    user.branding?.secondaryColor
  ]);
  const [config, setConfig] = useState<BrandingConfig>(savedConfig);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info'; message: string } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setConfig(savedConfig);
  }, [savedConfig]);

  const normalizedConfig = useMemo(() => normalizeBrandingConfig(config), [config]);
  const isDirty = JSON.stringify(normalizedConfig) !== JSON.stringify(savedConfig);
  const visibleBrandName = config.brandName.trim() || user.displayName || DEFAULT_BRANDING.brandName;

  const previewTextColor = getContrastTextColor(config.primaryColor);
  const contrastRatio = getContrastRatio(config.primaryColor, previewTextColor);
  const contrastIsGood = contrastRatio >= 4.5;

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!isPro) return onShowPaywall();

    setUploadingLogo(true);
    setError('');
    try {
      const logoUrl = await uploadTrainerAsset(user.uid, 'brand-logo', file);
      setConfig(current => ({ ...current, logoUrl }));
      setFeedback({ type: 'info', message: copy.uploaded });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'No se pudo subir el logo.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!isPro) return onShowPaywall();
    setSaving(true);
    setError('');
    setFeedback(null);
    try {
      await dbProvider.updateUser(user.uid, { branding: normalizedConfig });
      applyBrandingToTheme(normalizedConfig);
      onUpdateUser({ ...user, branding: normalizedConfig });
      setFeedback({ type: 'success', message: copy.saved });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudieron guardar los cambios.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (!isPro) return onShowPaywall();
    requestConfirm({
      title: copy.confirmTitle,
      message: copy.confirmMessage,
      type: 'warning',
      onConfirm: async () => {
        setSaving(true);
        try {
          await dbProvider.updateUser(user.uid, { branding: DEFAULT_BRANDING });
          const defaultConfig = normalizeBrandingConfig(DEFAULT_BRANDING);
          setConfig(defaultConfig);
          applyBrandingToTheme(defaultConfig);
          onUpdateUser({ ...user, branding: defaultConfig });
          setError('');
          setFeedback({ type: 'success', message: copy.saved });
        } catch (resetError) {
          setError(resetError instanceof Error ? resetError.message : 'No se pudo restaurar la marca.');
        } finally {
          setSaving(false);
        }
      }
    });
  };

  return (
    <section className="relative min-h-[480px] overflow-hidden rounded-lg border border-zinc-800 bg-[#11141d] p-5 sm:p-6">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-violet-400/20 bg-violet-500/10 text-violet-300">
          <Palette size={21} />
        </span>
        <div>
          <h3 className="text-lg font-black text-white">{copy.title}</h3>
          <p className="text-sm text-zinc-500">{copy.subtitle}</p>
        </div>
        {isPro && (
          <span className="ml-auto flex items-center gap-1 rounded-md border border-violet-400/25 bg-violet-500/10 px-2 py-1 text-xs font-bold text-violet-300">
            <Crown size={12} /> PRO
          </span>
        )}
      </header>

      <div className={`space-y-6 ${!isPro ? 'pro-locked-content' : ''}`}>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_240px]">
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.brandName}</span>
            <input
              value={config.brandName}
              onChange={event => {
                setConfig({ ...config, brandName: event.target.value });
                setFeedback(null);
              }}
              placeholder={copy.brandPlaceholder}
              className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition-colors focus:border-violet-400"
            />
          </label>

          <div>
            <span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.logo}</span>
            <button
              type="button"
              data-testid="brand-logo-upload"
              onClick={() => logoInputRef.current?.click()}
              disabled={uploadingLogo}
              className="flex min-h-[112px] w-full cursor-pointer items-center gap-3 rounded-lg border border-dashed border-zinc-700 bg-black/40 p-3 text-left transition-colors hover:border-violet-400/60 disabled:cursor-wait disabled:opacity-70"
            >
              {config.logoUrl ? (
                <img src={config.logoUrl} alt="" className="h-16 w-16 shrink-0 rounded-lg border border-zinc-700 object-contain" />
              ) : (
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-zinc-900 text-zinc-500">
                  {uploadingLogo ? <Loader2 size={24} className="animate-spin" /> : <ImagePlus size={24} />}
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-sm font-bold text-white">{uploadingLogo ? copy.uploading : config.logoUrl ? copy.replaceLogo : copy.uploadLogo}</span>
                <span className="mt-1 block text-xs text-zinc-500">{copy.uploadHint}</span>
              </span>
            </button>
            <input ref={logoInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
            {config.logoUrl && (
              <button
                type="button"
                onClick={() => {
                  setConfig(current => ({ ...current, logoUrl: '' }));
                  setFeedback(null);
                }}
                className="mt-2 flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-red-300"
              >
                <Trash2 size={13} /> {copy.removeLogo}
              </button>
            )}
          </div>
        </div>

        <div>
          <span className="mb-3 block text-xs font-bold uppercase text-zinc-500">{copy.appColors}</span>
          <div className="grid gap-4 rounded-lg border border-zinc-800 bg-black/35 p-4 sm:grid-cols-[auto_auto_minmax(220px,1fr)] sm:items-center">
            {([
              ['primaryColor', copy.primary],
              ['secondaryColor', copy.secondary]
            ] as const).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-3">
                <span className="h-11 w-11 rounded-lg border border-zinc-600" style={{ backgroundColor: config[key] }} />
                <span>
                  <span className="block text-xs font-bold text-zinc-300">{label}</span>
                  <span className="font-mono text-[11px] uppercase text-zinc-600">{config[key]}</span>
                </span>
                <input
                  type="color"
                  value={config[key]}
                  onChange={event => {
                    setConfig({ ...config, [key]: event.target.value });
                    setFeedback(null);
                  }}
                  className="sr-only"
                />
              </label>
            ))}

            <div className="border-t border-zinc-800 pt-4 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
              <span className="mb-2 block text-[11px] font-bold uppercase text-zinc-600">{copy.preview}</span>
              <div className="overflow-hidden rounded-lg border border-white/10" style={{ backgroundColor: config.secondaryColor, color: getContrastTextColor(config.secondaryColor) }}>
                <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5">
                  {config.logoUrl ? (
                    <img src={config.logoUrl} alt="" className="h-7 w-7 rounded-md bg-white/10 object-contain" />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/15"><Sparkles size={14} /></span>
                  )}
                  <span className="min-w-0 truncate text-xs font-black">{visibleBrandName}</span>
                </div>
                <div className="p-3">
                  <button type="button" className="w-full rounded-lg px-4 py-3 text-sm font-black shadow-lg" style={{ backgroundColor: config.primaryColor, color: previewTextColor }}>
                    {copy.sampleButton}
                  </button>
                </div>
              </div>
              <span className={`mt-2 block text-xs ${contrastIsGood ? 'text-emerald-400' : 'text-amber-400'}`}>
                {contrastIsGood ? copy.contrastGood : copy.contrastBad} ({contrastRatio.toFixed(1)}:1)
              </span>
            </div>
          </div>
        </div>

        <div aria-live="polite">
          {error && <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
          {!error && feedback && (
            <p className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${feedback.type === 'success' ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-violet-400/25 bg-violet-500/10 text-violet-200'}`}>
              {feedback.type === 'success' ? <CheckCircle2 size={16} /> : <ImagePlus size={16} />}
              {feedback.message}
            </p>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={saving || uploadingLogo || !isDirty}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg px-4 font-black transition-[filter,opacity] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
            style={{ backgroundColor: config.primaryColor, color: previewTextColor }}
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : isDirty ? <Save size={18} /> : <CheckCircle2 size={18} />}
            {saving ? copy.saving : isDirty ? copy.apply : copy.upToDate}
          </button>
          <button onClick={handleReset} disabled={saving} className="flex h-12 w-12 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-white" title={copy.resetTitle} aria-label={copy.resetTitle}>
            <RotateCcw size={18} />
          </button>
        </div>
        {isDirty && !feedback && <p className="text-center text-xs font-bold text-amber-300">{copy.pending}</p>}
      </div>

      {!isPro && <PremiumLockOverlay title={copy.lockedTitle} description={copy.lockedDescription} cta={copy.lockedCta} onUnlock={onShowPaywall} />}
    </section>
  );
};

export default BrandingSettings;
