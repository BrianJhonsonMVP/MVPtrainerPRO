import React, { useMemo, useState } from 'react';
import { Camera, CheckCircle2, Globe, ImageDown, Loader2, Plus, Save, Share2, User, X } from 'lucide-react';
import { dbProvider } from '../data';
import { uploadTrainerAsset } from '../services/trainerAssetService';
import { hasFullAccess } from '../services/subscriptionLogic';
import { PublicProfile, User as AppUser } from '../types';
import { generateTrainerSocialCard, shareOrDownloadTrainerCard } from '../utils/socialCardGenerator';
import PremiumLockOverlay from './PremiumLockOverlay';
import { CopyButton, IconButton, PrimaryButton, ShareImageButton } from './ui/Buttons';

type AppLanguage = 'es' | 'en';

const COPY = {
  es: {
    title: 'Mi pagina publica',
    subtitle: 'Prepara una presentacion profesional para atraer nuevos clientes.',
    ready: 'Lista para compartir',
    draft: 'Borrador',
    draftHint: 'Agrega una descripcion y un WhatsApp valido para activar tu perfil.',
    readyHint: 'Tu perfil tiene la informacion esencial para recibir consultas.',
    photo: 'Foto profesional',
    uploadPhoto: 'Subir foto',
    replacePhoto: 'Cambiar foto',
    photoHint: 'JPG, PNG o WebP. Maximo 5 MB.',
    description: 'Descripcion corta',
    descriptionPlaceholder: 'Ej: Ayudo a personas ocupadas a transformar su fisico con un plan realista.',
    descriptionHint: 'Explica a quien ayudas y que resultado ofreces.',
    whatsapp: 'WhatsApp Business',
    whatsappHint: 'Incluye codigo de pais. Ej: 51999999999.',
    services: 'Servicios',
    servicePlaceholder: 'Ej: Asesoria online',
    targets: 'Objetivos que trabajas',
    targetPlaceholder: 'Ej: Perdida de peso',
    save: 'Guardar perfil',
    saving: 'Guardando...',
    shareImage: 'Compartir imagen',
    createImage: 'Creando imagen...',
    copyLink: 'Copiar enlace',
    saved: 'Perfil guardado correctamente.',
    imageShared: 'Imagen lista para compartir.',
    imageDownloaded: 'La imagen se descargo porque este navegador no permite compartir archivos.',
    linkCopied: 'Enlace publico copiado.',
    invalidPhone: 'Ingresa un WhatsApp valido de al menos 7 digitos.',
    missingInfo: 'Completa la descripcion y el WhatsApp antes de compartir.',
    saveError: 'No se pudo guardar el perfil.',
    imageError: 'No se pudo crear la imagen para compartir.',
    uploadError: 'No se pudo subir la foto.',
    lockedTitle: 'Pagina publica y kit de captacion',
    lockedDescription: 'Presenta tus servicios con una pagina publica y una imagen profesional lista para compartir.',
    lockedCta: 'Desbloquear Branding PRO'
  },
  en: {
    title: 'My public page',
    subtitle: 'Build a professional profile that helps you attract new clients.',
    ready: 'Ready to share',
    draft: 'Draft',
    draftHint: 'Add a description and a valid WhatsApp number to activate your profile.',
    readyHint: 'Your profile has the essential information needed to receive inquiries.',
    photo: 'Professional photo',
    uploadPhoto: 'Upload photo',
    replacePhoto: 'Replace photo',
    photoHint: 'JPG, PNG, or WebP. Maximum 5 MB.',
    description: 'Short description',
    descriptionPlaceholder: 'Example: I help busy people transform their body with a realistic plan.',
    descriptionHint: 'Explain who you help and what result you offer.',
    whatsapp: 'WhatsApp Business',
    whatsappHint: 'Include country code. Example: 15551234567.',
    services: 'Services',
    servicePlaceholder: 'Example: Online coaching',
    targets: 'Goals you coach',
    targetPlaceholder: 'Example: Weight loss',
    save: 'Save profile',
    saving: 'Saving...',
    shareImage: 'Share image',
    createImage: 'Creating image...',
    copyLink: 'Copy link',
    saved: 'Profile saved successfully.',
    imageShared: 'Image ready to share.',
    imageDownloaded: 'The image was downloaded because this browser cannot share files.',
    linkCopied: 'Public link copied.',
    invalidPhone: 'Enter a valid WhatsApp number with at least 7 digits.',
    missingInfo: 'Complete the description and WhatsApp number before sharing.',
    saveError: 'The profile could not be saved.',
    imageError: 'The share image could not be created.',
    uploadError: 'The photo could not be uploaded.',
    lockedTitle: 'Public page and lead kit',
    lockedDescription: 'Present your services with a public page and a professional image ready to share.',
    lockedCta: 'Unlock Branding PRO'
  }
};

interface Props {
  user: AppUser;
  onUpdateUser: (user: AppUser) => void;
  onShowPaywall: () => void;
  language?: AppLanguage;
}

const getPhoneDigits = (value: string) => value.replace(/\D/g, '');

const TrainerLandingEditor: React.FC<Props> = ({ user, onUpdateUser, onShowPaywall, language = 'es' }) => {
  const copy = COPY[language];
  const isPro = hasFullAccess(user);
  const [profile, setProfile] = useState<PublicProfile>({
    description: user.publicProfile?.description || '',
    services: user.publicProfile?.services || [],
    targets: user.publicProfile?.targets || [],
    whatsAppNumber: user.publicProfile?.whatsAppNumber || '',
    backgroundColor: user.publicProfile?.backgroundColor || '#07080d',
    profileImageUrl: user.publicProfile?.profileImageUrl || '',
    galleryImages: user.publicProfile?.galleryImages || []
  });
  const [newService, setNewService] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creatingImage, setCreatingImage] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const phoneDigits = useMemo(() => getPhoneDigits(profile.whatsAppNumber), [profile.whatsAppNumber]);
  const profileReady = profile.description.trim().length >= 20 && phoneDigits.length >= 7;

  const showMessage = (message: string, isError = false) => {
    setNotice(isError ? '' : message);
    setError(isError ? message : '');
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!isPro) return onShowPaywall();

    setUploading(true);
    showMessage('');
    try {
      const profileImageUrl = await uploadTrainerAsset(user.uid, 'profile-photo', file);
      setProfile(current => ({ ...current, profileImageUrl }));
    } catch (uploadError) {
      showMessage(uploadError instanceof Error ? uploadError.message : copy.uploadError, true);
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!isPro) return onShowPaywall();
    if (profile.whatsAppNumber.trim() && phoneDigits.length < 7) return showMessage(copy.invalidPhone, true);

    setSaving(true);
    showMessage('');
    const normalizedProfile = { ...profile, whatsAppNumber: phoneDigits };
    try {
      await dbProvider.updateUser(user.uid, { publicProfile: normalizedProfile });
      setProfile(normalizedProfile);
      onUpdateUser({ ...user, publicProfile: normalizedProfile });
      showMessage(copy.saved);
    } catch (saveError) {
      console.error(saveError);
      showMessage(copy.saveError, true);
    } finally {
      setSaving(false);
    }
  };

  const handleShareImage = async () => {
    if (!isPro) return onShowPaywall();
    if (!profileReady) return showMessage(copy.missingInfo, true);

    setCreatingImage(true);
    showMessage('');
    try {
      const cardLanguage: AppLanguage = language === 'en' ? 'en' : 'es';
      const file = await generateTrainerSocialCard({ ...user, publicProfile: profile }, profile, cardLanguage);
      const result = await shareOrDownloadTrainerCard(file, cardLanguage);
      showMessage(result === 'shared' ? copy.imageShared : copy.imageDownloaded);
    } catch (imageError) {
      if (imageError instanceof DOMException && imageError.name === 'AbortError') return;
      console.error(imageError);
      showMessage(copy.imageError, true);
    } finally {
      setCreatingImage(false);
    }
  };

  const handleCopyLink = async () => {
    if (!isPro) return onShowPaywall();
    if (!profileReady) return showMessage(copy.missingInfo, true);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}?trainerId=${user.uid}`);
      showMessage(copy.linkCopied);
    } catch {
      showMessage(copy.saveError, true);
    }
  };

  const addItem = (type: 'services' | 'targets') => {
    const value = (type === 'services' ? newService : newTarget).trim();
    if (!value) return;
    setProfile(current => ({ ...current, [type]: [...current[type], value] }));
    if (type === 'services') setNewService('');
    else setNewTarget('');
  };

  const removeItem = (type: 'services' | 'targets', index: number) => {
    setProfile(current => ({ ...current, [type]: current[type].filter((_, itemIndex) => itemIndex !== index) }));
  };

  return (
    <section className="relative min-h-[520px] overflow-hidden bg-[#11141d] p-5 sm:p-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-white">{copy.title}</h3>
          <p className="mt-1 text-sm text-zinc-500">{copy.subtitle}</p>
        </div>
        <span className={`inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs font-black ${profileReady ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
          {profileReady && <CheckCircle2 size={14} />}
          {profileReady ? copy.ready : copy.draft}
        </span>
      </header>

      <div className={`space-y-6 ${!isPro ? 'pro-locked-content' : ''}`}>
        <p className={`rounded-lg border px-3 py-2 text-sm ${profileReady ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200' : 'border-amber-500/20 bg-amber-500/5 text-amber-200'}`}>
          {profileReady ? copy.readyHint : copy.draftHint}
        </p>

        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div>
            <span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.photo}</span>
            <label className="group flex min-h-[230px] cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-700 bg-black/35 p-4 text-center transition-colors hover:border-violet-400/60">
              <span className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-violet-400/35 bg-zinc-900">
                {profile.profileImageUrl ? (
                  <img src={profile.profileImageUrl} alt={user.displayName} className="h-full w-full object-cover" />
                ) : (
                  <User size={42} className="text-zinc-600" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition-opacity group-hover:opacity-100"><Camera size={24} /></span>
              </span>
              <span className="text-sm font-black text-white">{uploading ? copy.createImage : profile.profileImageUrl ? copy.replacePhoto : copy.uploadPhoto}</span>
              <span className="text-xs text-zinc-500">{copy.photoHint}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleImageUpload} disabled={uploading} />
            </label>
          </div>

          <div className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.description}</span>
              <textarea value={profile.description} onChange={event => setProfile({ ...profile, description: event.target.value })} maxLength={240} className="min-h-28 w-full resize-none rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition-colors focus:border-violet-400" placeholder={copy.descriptionPlaceholder} />
              <span className="mt-1 flex justify-between text-xs text-zinc-600"><span>{copy.descriptionHint}</span><span>{profile.description.length}/240</span></span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.whatsapp}</span>
              <input inputMode="tel" value={profile.whatsAppNumber} onChange={event => setProfile({ ...profile, whatsAppNumber: event.target.value })} className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition-colors focus:border-violet-400" placeholder="51999999999" />
              <span className="mt-1 block text-xs text-zinc-600">{copy.whatsappHint}</span>
            </label>
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {([
            { type: 'services' as const, label: copy.services, value: newService, setValue: setNewService, placeholder: copy.servicePlaceholder },
            { type: 'targets' as const, label: copy.targets, value: newTarget, setValue: setNewTarget, placeholder: copy.targetPlaceholder }
          ]).map(group => (
            <div key={group.type}>
              <span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{group.label}</span>
              <div className="flex gap-2">
                <input value={group.value} onChange={event => group.setValue(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addItem(group.type); } }} className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-black px-3 py-2.5 text-sm text-white outline-none focus:border-violet-400" placeholder={group.placeholder} />
                <IconButton type="button" onClick={() => addItem(group.type)} aria-label={`${group.label}: ${group.placeholder}`}><Plus size={18} /></IconButton>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {profile[group.type].map((item, index) => (
                  <span key={`${item}-${index}`} className="inline-flex items-center gap-1.5 rounded-md border border-violet-400/20 bg-violet-500/10 px-2.5 py-1.5 text-xs font-bold text-violet-200">
                    {item}
                    <button type="button" onClick={() => removeItem(group.type, index)} className="text-violet-300 hover:text-white" aria-label={`Eliminar ${item}`}><X size={13} /></button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p role="alert" className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
        {notice && <p role="status" className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>}

        <div className="grid gap-3 border-t border-zinc-800 pt-5 sm:grid-cols-[minmax(180px,1fr)_auto_auto]">
          <PrimaryButton type="button" onClick={handleSave} disabled={saving || uploading} isLoading={saving} icon={<Save size={18} />} className="min-h-12 w-full">
            {saving ? copy.saving : copy.save}
          </PrimaryButton>
          <ShareImageButton type="button" onClick={handleShareImage} disabled={creatingImage || !profileReady} isLoading={creatingImage} icon={navigator.share ? <Share2 size={18} /> : <ImageDown size={18} />} className="min-h-12">
            {creatingImage ? copy.createImage : copy.shareImage}
          </ShareImageButton>
          <CopyButton type="button" onClick={handleCopyLink} disabled={!profileReady} icon={<Globe size={18} />} copiedLabel={copy.linkCopied} className="min-h-12" title={copy.copyLink}>
            <span className="sm:sr-only">{copy.copyLink}</span>
          </CopyButton>
        </div>
      </div>

      {!isPro && <PremiumLockOverlay title={copy.lockedTitle} description={copy.lockedDescription} cta={copy.lockedCta} onUnlock={onShowPaywall} />}
    </section>
  );
};

export default TrainerLandingEditor;
