import React, { useState } from 'react';
import { User as AppUser, PublicProfile } from '../types';
import { dbProvider } from '../data';
import { User, Camera, Save, Plus, X, Globe, Phone, Crown, Download, Loader2 } from 'lucide-react';
import { generateTrainerCardPDF } from '../utils/pdfGenerator';
import { isActivePro } from '../services/subscriptionLogic';

interface Props {
  user: AppUser;
  onUpdateUser: (user: AppUser) => void;
  onShowPaywall: () => void;
}

const TrainerLandingEditor: React.FC<Props> = ({ user, onUpdateUser, onShowPaywall }) => {
  const isPro = isActivePro(user);

  const [profile, setProfile] = useState<PublicProfile>({
    description: user.publicProfile?.description || '',
    services: user.publicProfile?.services || [],
    targets: user.publicProfile?.targets || [],
    whatsAppNumber: user.publicProfile?.whatsAppNumber || '',
    backgroundColor: user.publicProfile?.backgroundColor || '#000000',
    profileImageUrl: user.publicProfile?.profileImageUrl || '',
    galleryImages: user.publicProfile?.galleryImages || []
  });

  const [newService, setNewService] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, field: 'profile' | 'gallery') => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();

      reader.onloadend = () => {
        const base64String = reader.result as string;
        if (field === 'profile') {
          setProfile(prev => ({ ...prev, profileImageUrl: base64String }));
        } else {
          setProfile(prev => ({ ...prev, galleryImages: [...prev.galleryImages, base64String] }));
        }
      };

      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!isPro) {
      onShowPaywall();
      return;
    }

    setSaving(true);
    try {
      await dbProvider.updateUser(user.uid, { publicProfile: profile });
      onUpdateUser({ ...user, publicProfile: profile });
      alert('Perfil público actualizado');
    } catch (e) {
      console.error(e);
      alert('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePDF = async () => {
    if (!isPro) {
      onShowPaywall();
      return;
    }

    setLoadingPdf(true);
    setTimeout(() => {
      try {
        generateTrainerCardPDF({ ...user, publicProfile: profile });
      } catch (e) {
        console.error(e);
        alert('Error generando PDF');
      } finally {
        setLoadingPdf(false);
      }
    }, 100);
  };

  const addService = () => {
    const value = newService.trim();
    if (!value) return;
    setProfile(p => ({ ...p, services: [...p.services, value] }));
    setNewService('');
  };

  const addTarget = () => {
    const value = newTarget.trim();
    if (!value) return;
    setProfile(p => ({ ...p, targets: [...p.targets, value] }));
    setNewTarget('');
  };

  return (
    <div className={`bg-zinc-900 p-6 relative ${!isPro ? 'opacity-50 pointer-events-none' : ''}`}>
      {!isPro && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center p-6 bg-black/60 backdrop-blur-sm">
          <div className="bg-mvp-gold text-black p-4 rounded-full mb-4 shadow-[0_0_20px_rgba(245,158,11,0.4)]">
            <Crown size={32} />
          </div>
          <h3 className="text-2xl font-bold text-white mb-2">Página Web & Tarjeta Digital</h3>
          <p className="text-zinc-300 max-w-sm mb-6 text-sm">
            Obtén tu propia landing page para clientes y genera tarjetas de presentación profesionales en PDF.
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); onShowPaywall(); }}
            className="bg-gradient-to-r from-mvp-gold to-orange-500 hover:opacity-90 text-white font-bold py-3 px-8 rounded-xl shadow-lg pointer-events-auto"
          >
            Desbloquear Branding PRO
          </button>
        </div>
      )}

      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex flex-col items-center gap-3">
            <div className="w-32 h-32 rounded-full border-4 border-zinc-800 bg-zinc-800 relative overflow-hidden group">
              {profile.profileImageUrl ? (
                <img src={profile.profileImageUrl} className="w-full h-full object-cover" />
              ) : (
                <User className="w-12 h-12 text-zinc-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"/>
              )}
              <label className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                <Camera className="text-white" />
                <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'profile')} />
              </label>
            </div>
            <span className="text-xs text-zinc-500 font-bold uppercase">Foto de Perfil</span>
          </div>
          <div className="md:col-span-2 space-y-4">
            <div>
              <label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">Descripción Corta</label>
              <textarea
                value={profile.description}
                onChange={e => setProfile({...profile, description: e.target.value})}
                className="w-full bg-black border border-zinc-700 text-white rounded-xl px-4 py-3 focus:border-mvp-gold outline-none h-24 resize-none"
                placeholder="Ayudo a profesionales a transformar su físico..."
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">WhatsApp Business</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16}/>
                <input
                  type="text"
                  value={profile.whatsAppNumber}
                  onChange={e => setProfile({...profile, whatsAppNumber: e.target.value})}
                  placeholder="51999999999"
                  className="w-full bg-black border border-zinc-700 text-white rounded-xl pl-10 pr-4 py-3 focus:border-mvp-gold outline-none"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">Mis Servicios</label>
            <div className="flex gap-2 mb-2">
              <input
                value={newService}
                onChange={e => setNewService(e.target.value)}
                className="flex-1 bg-black border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
                placeholder="Ej: Asesoría Online"
                onKeyDown={e => { if(e.key === 'Enter') addService(); }}
              />
              <button onClick={addService} className="bg-zinc-800 p-2 rounded-lg"><Plus size={18}/></button>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.services.map((s, i) => (
                <span key={i} className="bg-zinc-800 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                  {s} <button onClick={() => setProfile(p => ({...p, services: p.services.filter((_, idx) => idx !== i)}))}><X size={12}/></button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">Objetivos (Targets)</label>
            <div className="flex gap-2 mb-2">
              <input
                value={newTarget}
                onChange={e => setNewTarget(e.target.value)}
                className="flex-1 bg-black border border-zinc-700 text-white rounded-lg px-3 py-2 text-sm"
                placeholder="Ej: Pérdida de Peso"
                onKeyDown={e => { if(e.key === 'Enter') addTarget(); }}
              />
              <button onClick={addTarget} className="bg-zinc-800 p-2 rounded-lg"><Plus size={18}/></button>
            </div>
            <div className="flex flex-wrap gap-2">
              {profile.targets.map((t, i) => (
                <span key={i} className="bg-mvp-gold/20 text-mvp-gold text-xs px-2 py-1 rounded flex items-center gap-1 border border-mvp-gold/20">
                  {t} <button onClick={() => setProfile(p => ({...p, targets: p.targets.filter((_, idx) => idx !== i)}))}><X size={12}/></button>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-4 pt-4 border-t border-zinc-800">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-mvp-gold hover:bg-amber-600 text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            <Save size={18}/> {saving ? 'Guardando...' : 'Guardar Perfil'}
          </button>

          <button
            onClick={handleGeneratePDF}
            disabled={loadingPdf}
            className="px-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors border border-zinc-700"
            title="Descargar Tarjeta PDF"
          >
            {loadingPdf ? <Loader2 className="animate-spin" size={18}/> : <Download size={18} />} PDF
          </button>

          <button
            onClick={() => {
              const url = `${window.location.origin}?trainerId=${user.uid}`;
              navigator.clipboard.writeText(url);
              alert('Enlace copiado: ' + url);
            }}
            className="px-4 bg-zinc-800 hover:bg-zinc-700 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors border border-zinc-700"
            title="Copiar enlace público"
          >
            <Globe size={18} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TrainerLandingEditor;
