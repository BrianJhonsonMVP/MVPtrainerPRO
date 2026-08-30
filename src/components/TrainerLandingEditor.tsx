import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CheckCircle2, Eye, Globe, ImageDown, MapPin, Plus, Save, Send, Share2, User, X } from 'lucide-react';
import { dbProvider } from '../data';
import { uploadTrainerAsset } from '../services/trainerAssetService';
import { hasFullAccess } from '../services/subscriptionLogic';
import { PublicProfile, User as AppUser } from '../types';
import { generateTrainerSocialCard, shareOrDownloadTrainerCard } from '../utils/socialCardGenerator';
import PremiumLockOverlay from './PremiumLockOverlay';
import { AppButton, CopyButton, IconButton, PrimaryButton, SecondaryButton, ShareImageButton } from './ui/Buttons';

type AppLanguage = 'es' | 'en';

const COPY = {
  es: {
    title: 'Kit de captacion',
    subtitle: 'Crea tu pagina publica y una pieza profesional lista para compartir.',
    ready: 'Lista para compartir',
    published: 'Publicada',
    draft: 'Borrador',
    draftHint: 'Completa tu oferta, WhatsApp y una foto o logo para activar tu perfil.',
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
    missingInfo: 'Agrega una foto o logo, descripcion, WhatsApp y al menos un servicio antes de publicar.',
    saveError: 'No se pudo guardar el perfil.',
    imageError: 'No se pudo crear la imagen para compartir.',
    uploadError: 'No se pudo subir la foto.',
    professionalTitle: 'Especialidad profesional',
    professionalTitlePlaceholder: 'Ej: Entrenador de fuerza y recomposición corporal',
    modality: 'Modalidad',
    inPerson: 'Presencial',
    online: 'Online',
    both: 'Presencial y online',
    location: 'Ciudad o zona',
    locationPlaceholder: 'Ej: Miraflores, Lima',
    preview: 'Vista previa',
    publish: 'Publicar página',
    unpublish: 'Pasar a borrador',
    publishFirst: 'Publica la página antes de copiar su enlace.',
    publishSuccess: 'Tu página ya está pública y lista para recibir consultas.',
    draftSuccess: 'La página volvió a borrador y dejó de ser pública.',
    imagePreview: 'Vista previa de tu imagen',
    continueShare: 'Compartir o descargar',
    identity: '1. Identidad visual',
    photoMode: 'Foto',
    logoMode: 'Logo',
    mixedMode: 'Foto + logo',
    format: '2. Formato',
    post: 'Publicacion',
    story: 'Historia',
    style: '3. Estilo',
    personal: 'Personal',
    brand: 'Marca',
    balanced: 'Equilibrado',
    trainerName: 'Nombre profesional',
    headline: 'Mensaje principal',
    headlinePlaceholder: 'Ej: Transforma tu fisico con un plan que si puedes sostener',
    callToAction: 'Llamada a la accion',
    callToActionPlaceholder: 'Ej: Reserva tu evaluacion',
    lockedTitle: 'Pagina publica y kit de captacion',
    lockedDescription: 'Presenta tus servicios con una pagina publica y una imagen profesional lista para compartir.',
    lockedCta: 'Activar acceso'
  },
  en: {
    title: 'Lead kit',
    subtitle: 'Create your public page and a professional asset ready to share.',
    ready: 'Ready to share',
    published: 'Published',
    draft: 'Draft',
    draftHint: 'Complete your offer, WhatsApp number, and a photo or logo to activate your profile.',
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
    missingInfo: 'Add a photo or logo, description, WhatsApp number, and at least one service before publishing.',
    saveError: 'The profile could not be saved.',
    imageError: 'The share image could not be created.',
    uploadError: 'The photo could not be uploaded.',
    professionalTitle: 'Professional specialty',
    professionalTitlePlaceholder: 'Example: Strength and body recomposition coach',
    modality: 'Modality',
    inPerson: 'In person',
    online: 'Online',
    both: 'In person and online',
    location: 'City or area',
    locationPlaceholder: 'Example: Downtown Miami',
    preview: 'Preview',
    publish: 'Publish page',
    unpublish: 'Return to draft',
    publishFirst: 'Publish the page before copying its link.',
    publishSuccess: 'Your page is public and ready to receive inquiries.',
    draftSuccess: 'The page is back in draft and no longer public.',
    imagePreview: 'Your image preview',
    continueShare: 'Share or download',
    identity: '1. Visual identity',
    photoMode: 'Photo',
    logoMode: 'Logo',
    mixedMode: 'Photo + logo',
    format: '2. Format',
    post: 'Post',
    story: 'Story',
    style: '3. Style',
    personal: 'Personal',
    brand: 'Brand',
    balanced: 'Balanced',
    trainerName: 'Professional name',
    headline: 'Main message',
    headlinePlaceholder: 'Example: Transform your body with a plan you can sustain',
    callToAction: 'Call to action',
    callToActionPlaceholder: 'Example: Book your assessment',
    lockedTitle: 'Public page and lead kit',
    lockedDescription: 'Present your services with a public page and a professional image ready to share.',
    lockedCta: 'Activate access'
  }
};

interface Props {
  user: AppUser;
  onUpdateUser: (user: AppUser) => void;
  onShowPaywall: () => void;
  language?: AppLanguage;
}

const getPhoneDigits = (value: string) => value.replace(/\D/g, '');
const slugify = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 42);

const TrainerLandingEditor: React.FC<Props> = ({ user, onUpdateUser, onShowPaywall, language = 'es' }) => {
  const copy = COPY[language];
  const isPro = hasFullAccess(user);
  const [profile, setProfile] = useState<PublicProfile>({
    professionalTitle: user.publicProfile?.professionalTitle || '',
    trainerName: user.publicProfile?.trainerName || user.displayName,
    headline: user.publicProfile?.headline || '',
    callToAction: user.publicProfile?.callToAction || (language === 'en' ? 'Book your assessment' : 'Reserva tu evaluacion'),
    description: user.publicProfile?.description || '',
    services: user.publicProfile?.services || [],
    targets: user.publicProfile?.targets || [],
    whatsAppNumber: user.publicProfile?.whatsAppNumber || '',
    backgroundColor: user.publicProfile?.backgroundColor || '#07080d',
    profileImageUrl: user.publicProfile?.profileImageUrl || '',
    galleryImages: user.publicProfile?.galleryImages || [],
    modality: user.publicProfile?.modality || 'ambas',
    location: user.publicProfile?.location || '',
    presentationMode: user.publicProfile?.presentationMode || (user.branding?.logoUrl ? 'mixed' : 'photo'),
    cardFormat: user.publicProfile?.cardFormat || 'post',
    cardTemplate: user.publicProfile?.cardTemplate || 'balanced',
    photoPositionY: user.publicProfile?.photoPositionY ?? 50,
    slug: user.publicProfile?.slug || `${slugify(user.branding?.brandName || user.displayName)}-${user.uid.slice(0, 5)}`,
    isPublished: Boolean(user.publicProfile?.isPublished)
  });
  const [newService, setNewService] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [creatingImage, setCreatingImage] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [cardPreview, setCardPreview] = useState<{ file: File; url: string } | null>(null);

  const phoneDigits = useMemo(() => getPhoneDigits(profile.whatsAppNumber), [profile.whatsAppNumber]);
  const publicUrl = useMemo(() => `${window.location.origin}/entrenador/${profile.slug || user.uid}`, [profile.slug, user.uid]);
  const hasPhoto = Boolean(profile.profileImageUrl || user.photoURL);
  const hasLogo = Boolean(user.branding?.logoUrl);
  const hasSelectedIdentity = profile.presentationMode === 'photo'
    ? hasPhoto
    : profile.presentationMode === 'logo'
      ? hasLogo
      : hasPhoto || hasLogo;
  const profileReady = profile.description.trim().length >= 20
    && phoneDigits.length >= 7
    && hasSelectedIdentity
    && profile.services.length > 0;

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

  const persistProfile = async (nextProfile: PublicProfile, successMessage = copy.saved) => {
    if (!isPro) return onShowPaywall();
    const nextPhoneDigits = getPhoneDigits(nextProfile.whatsAppNumber);
    if (nextProfile.whatsAppNumber.trim() && nextPhoneDigits.length < 7) return showMessage(copy.invalidPhone, true);

    setSaving(true);
    showMessage('');
    const normalizedProfile = { ...nextProfile, whatsAppNumber: nextPhoneDigits };
    try {
      await dbProvider.updateUser(user.uid, { publicProfile: normalizedProfile });
      setProfile(normalizedProfile);
      onUpdateUser({ ...user, publicProfile: normalizedProfile });
      showMessage(successMessage);
    } catch (saveError) {
      console.error(saveError);
      showMessage(copy.saveError, true);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => persistProfile(profile);

  const handlePublishToggle = async () => {
    if (!profileReady) return showMessage(copy.missingInfo, true);
    const nextProfile = { ...profile, isPublished: !profile.isPublished };
    await persistProfile(nextProfile, nextProfile.isPublished ? copy.publishSuccess : copy.draftSuccess);
  };

  const handleShareImage = async () => {
    if (!isPro) return onShowPaywall();
    if (!profileReady) return showMessage(copy.missingInfo, true);

    setCreatingImage(true);
    showMessage('');
    try {
      const cardLanguage: AppLanguage = language === 'en' ? 'en' : 'es';
      const file = await generateTrainerSocialCard({ ...user, publicProfile: profile }, profile, cardLanguage, profile.isPublished ? publicUrl : undefined);
      setCardPreview(current => {
        if (current) URL.revokeObjectURL(current.url);
        return { file, url: URL.createObjectURL(file) };
      });
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
    if (!profile.isPublished) return showMessage(copy.publishFirst, true);
    try {
      await navigator.clipboard.writeText(publicUrl);
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
          {profile.isPublished ? copy.published : profileReady ? copy.ready : copy.draft}
        </span>
      </header>

      <div className={`space-y-6 ${!isPro ? 'pro-locked-content' : ''}`}>
        <p className={`rounded-lg border px-3 py-2 text-sm ${profileReady ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-200' : 'border-amber-500/20 bg-amber-500/5 text-amber-200'}`}>
          {profileReady ? copy.readyHint : copy.draftHint}
        </p>

        <div className="grid gap-5 border-y border-zinc-800 py-5 lg:grid-cols-3">
          <ChoiceGroup
            label={copy.identity}
            value={profile.presentationMode || 'mixed'}
            options={[
              { value: 'photo', label: copy.photoMode, disabled: !hasPhoto },
              { value: 'logo', label: copy.logoMode, disabled: !hasLogo },
              { value: 'mixed', label: copy.mixedMode, disabled: !hasPhoto && !hasLogo }
            ]}
            onChange={value => setProfile(current => ({ ...current, presentationMode: value as PublicProfile['presentationMode'] }))}
          />
          <ChoiceGroup
            label={copy.format}
            value={profile.cardFormat || 'post'}
            options={[{ value: 'post', label: copy.post }, { value: 'story', label: copy.story }]}
            onChange={value => setProfile(current => ({ ...current, cardFormat: value as PublicProfile['cardFormat'] }))}
          />
          <ChoiceGroup
            label={copy.style}
            value={profile.cardTemplate || 'balanced'}
            options={[{ value: 'personal', label: copy.personal }, { value: 'balanced', label: copy.balanced }, { value: 'brand', label: copy.brand }]}
            onChange={value => setProfile(current => ({ ...current, cardTemplate: value as PublicProfile['cardTemplate'] }))}
          />
        </div>

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
              <span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.trainerName}</span>
              <input value={profile.trainerName || ''} onChange={event => setProfile({ ...profile, trainerName: event.target.value })} maxLength={70} className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none focus:border-violet-400" placeholder={user.displayName} />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.professionalTitle}</span>
              <input value={profile.professionalTitle || ''} onChange={event => setProfile({ ...profile, professionalTitle: event.target.value })} className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none focus:border-violet-400" placeholder={copy.professionalTitlePlaceholder} />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.headline}</span>
              <input value={profile.headline || ''} onChange={event => setProfile({ ...profile, headline: event.target.value })} maxLength={100} className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none focus:border-violet-400" placeholder={copy.headlinePlaceholder} />
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.description}</span>
              <textarea value={profile.description} onChange={event => setProfile({ ...profile, description: event.target.value })} maxLength={240} className="min-h-28 w-full resize-none rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition-colors focus:border-violet-400" placeholder={copy.descriptionPlaceholder} />
              <span className="mt-1 flex justify-between text-xs text-zinc-600"><span>{copy.descriptionHint}</span><span>{profile.description.length}/240</span></span>
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.modality}</span><select value={profile.modality || 'ambas'} onChange={event => setProfile({ ...profile, modality: event.target.value as PublicProfile['modality'] })} className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none focus:border-violet-400"><option value="presencial">{copy.inPerson}</option><option value="online">{copy.online}</option><option value="ambas">{copy.both}</option></select></label>
              <label className="block"><span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.location}</span><span className="relative block"><MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" /><input value={profile.location || ''} onChange={event => setProfile({ ...profile, location: event.target.value })} className="w-full rounded-lg border border-zinc-700 bg-black py-3 pl-10 pr-4 text-white outline-none focus:border-violet-400" placeholder={copy.locationPlaceholder} /></span></label>
            </div>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.whatsapp}</span>
              <input inputMode="tel" value={profile.whatsAppNumber} onChange={event => setProfile({ ...profile, whatsAppNumber: event.target.value })} className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none transition-colors focus:border-violet-400" placeholder="51999999999" />
              <span className="mt-1 block text-xs text-zinc-600">{copy.whatsappHint}</span>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase text-zinc-500">{copy.callToAction}</span>
              <input value={profile.callToAction || ''} onChange={event => setProfile({ ...profile, callToAction: event.target.value })} maxLength={42} className="w-full rounded-lg border border-zinc-700 bg-black px-4 py-3 text-white outline-none focus:border-violet-400" placeholder={copy.callToActionPlaceholder} />
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

        <div className="grid gap-3 border-t border-zinc-800 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <PrimaryButton type="button" onClick={handleSave} disabled={saving || uploading} isLoading={saving} icon={<Save size={18} />} className="min-h-12 w-full">
            {saving ? copy.saving : copy.save}
          </PrimaryButton>
          <SecondaryButton type="button" onClick={() => setShowPreview(true)} icon={<Eye size={18} />} className="min-h-12">{copy.preview}</SecondaryButton>
          <AppButton type="button" onClick={handlePublishToggle} disabled={saving || (!profileReady && !profile.isPublished)} variant={profile.isPublished ? 'tertiary' : 'ai'} icon={profile.isPublished ? <X size={17} /> : <Send size={17} />} className="min-h-12">{profile.isPublished ? copy.unpublish : copy.publish}</AppButton>
          <ShareImageButton type="button" onClick={handleShareImage} disabled={creatingImage || !profileReady} isLoading={creatingImage} icon={navigator.share ? <Share2 size={18} /> : <ImageDown size={18} />} className="min-h-12">
            {creatingImage ? copy.createImage : copy.shareImage}
          </ShareImageButton>
          <CopyButton type="button" onClick={handleCopyLink} disabled={!profile.isPublished} icon={<Globe size={18} />} copiedLabel={copy.linkCopied} className="min-h-12" title={copy.copyLink}>
            <span className="sm:sr-only">{copy.copyLink}</span>
          </CopyButton>
        </div>
      </div>

      {!isPro && <PremiumLockOverlay title={copy.lockedTitle} description={copy.lockedDescription} cta={copy.lockedCta} onUnlock={onShowPaywall} />}
      {showPreview && <ProfilePreviewModal user={user} profile={profile} copy={copy} onClose={() => setShowPreview(false)} />}
      {cardPreview && <CardPreviewModal preview={cardPreview} copy={copy} onClose={() => { URL.revokeObjectURL(cardPreview.url); setCardPreview(null); }} onShare={async () => {
        const result = await shareOrDownloadTrainerCard(cardPreview.file, language === 'en' ? 'en' : 'es', { text: profile.headline || profile.description, url: profile.isPublished ? publicUrl : undefined });
        if (result !== 'cancelled') showMessage(result === 'shared' ? copy.imageShared : copy.imageDownloaded);
      }} />}
    </section>
  );
};

export default TrainerLandingEditor;

const ChoiceGroup = ({ label, value, options, onChange }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; disabled?: boolean }>;
  onChange: (value: string) => void;
}) => (
  <fieldset>
    <legend className="mb-2 text-xs font-bold uppercase text-zinc-500">{label}</legend>
    <div className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-black/40 p-1">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          disabled={option.disabled}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-10 rounded-md px-2 text-xs font-extrabold transition-colors ${value === option.value ? 'bg-violet-500 text-white' : 'text-zinc-400 hover:bg-white/[0.06] hover:text-white'} disabled:cursor-not-allowed disabled:opacity-30`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </fieldset>
);

const ProfilePreviewModal = ({ user, profile, copy, onClose }: { user: AppUser; profile: PublicProfile; copy: typeof COPY.es; onClose: () => void }) => createPortal((
  <div className="fixed inset-0 z-[90] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
    <section className="w-full max-w-md overflow-hidden rounded-2xl border border-violet-500/25 bg-[#0d1119] shadow-2xl" role="dialog" aria-modal="true">
      <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><span className="text-sm font-black text-white">{copy.preview}</span><IconButton type="button" onClick={onClose} aria-label="Cerrar"><X size={17} /></IconButton></header>
      <div className="p-6 text-center" style={{ backgroundColor: profile.backgroundColor }}>
        <span className="mx-auto flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 border-violet-400/35 bg-zinc-900">{profile.presentationMode === 'logo' && user.branding?.logoUrl ? <img src={user.branding.logoUrl} alt="" className="h-full w-full object-contain p-2" /> : profile.profileImageUrl ? <img src={profile.profileImageUrl} alt="" className="h-full w-full object-cover" style={{ objectPosition: `center ${profile.photoPositionY ?? 50}%` }} /> : user.branding?.logoUrl ? <img src={user.branding.logoUrl} alt="" className="h-full w-full object-contain p-2" /> : <User size={42} className="text-zinc-600" />}</span>
        <h2 className="mt-4 text-2xl font-black text-white">{profile.trainerName || user.displayName}</h2>
        {user.branding?.brandName && user.branding.brandName !== (profile.trainerName || user.displayName) && <p className="mt-1 text-xs font-bold text-zinc-500">{user.branding.brandName}</p>}
        <p className="mt-1 text-sm font-bold text-violet-300">{profile.professionalTitle}</p>
        {profile.headline && <p className="mx-auto mt-4 max-w-sm text-lg font-black leading-snug text-white">{profile.headline}</p>}
        <p className="mx-auto mt-4 max-w-sm text-sm leading-relaxed text-zinc-300">{profile.description || '...'}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">{profile.services.map(item => <span key={item} className="rounded-md border border-violet-400/20 bg-violet-500/10 px-2.5 py-1.5 text-xs font-bold text-violet-200">{item}</span>)}</div>
        {(profile.location || profile.modality) && <p className="mt-5 text-xs text-zinc-500">{profile.location}{profile.location && profile.modality ? ' · ' : ''}{profile.modality}</p>}
      </div>
    </section>
  </div>
), document.body);

const CardPreviewModal = ({ preview, copy, onClose, onShare }: { preview: { file: File; url: string }; copy: typeof COPY.es; onClose: () => void; onShare: () => void }) => createPortal((
  <div className="fixed inset-0 z-[95] grid place-items-center bg-black/85 p-4 backdrop-blur-sm">
    <section className="w-full max-w-md rounded-2xl border border-zinc-700 bg-[#0d1119] p-4 shadow-2xl" role="dialog" aria-modal="true">
      <header className="mb-3 flex items-center justify-between"><h2 className="text-base font-black text-white">{copy.imagePreview}</h2><IconButton type="button" onClick={onClose} aria-label="Cerrar"><X size={17} /></IconButton></header>
      <img src={preview.url} alt={copy.imagePreview} className="mx-auto max-h-[62vh] w-auto rounded-lg border border-zinc-800 object-contain" />
      <ShareImageButton type="button" onClick={onShare} className="mt-4 w-full">{copy.continueShare}</ShareImageButton>
    </section>
  </div>
), document.body);
