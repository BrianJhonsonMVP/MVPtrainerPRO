
import React, { useState, useEffect } from 'react';
import { BrandingConfig, User } from '../types';
import { Palette, Crown, Lock, Save, LayoutTemplate, Image as ImageIcon, RotateCcw } from 'lucide-react';
import { updateUserDoc } from '../services/firebase';
import { applyBrandingToTheme, DEFAULT_BRANDING } from '../services/brandingService';

interface BrandingSettingsProps {
  user: User;
  onUpdateUser: (user: User) => void;
  onShowPaywall: () => void;
}

const BrandingSettings: React.FC<BrandingSettingsProps> = ({ user, onUpdateUser, onShowPaywall }) => {
  const isPro = user.subscription.type === 'pro';
  
  const [config, setConfig] = useState<BrandingConfig>({
    brandName: user.branding?.brandName || '',
    logoUrl: user.branding?.logoUrl || '',
    primaryColor: user.branding?.primaryColor || DEFAULT_BRANDING.primaryColor,
    secondaryColor: user.branding?.secondaryColor || DEFAULT_BRANDING.secondaryColor,
  });

  const [saving, setSaving] = useState(false);

  // Efecto visual instantáneo al editar (solo si es PRO)
  useEffect(() => {
    if (isPro) {
        // Aplicar cambios en tiempo real para "preview"
        applyBrandingToTheme(config);
    }
    // Cleanup: Si desmonta sin guardar y no es el del usuario, revertir (opcional, pero buena UX)
    return () => {
       if (!saving) {
         // Revertir al original del usuario si cancela (opcional, por simplicidad dejamos que persista la vista)
       }
    };
  }, [config, isPro, saving]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updatedUser = await updateUserDoc(user.uid, { branding: config });
      if (updatedUser) {
          onUpdateUser(updatedUser);
      }
    } catch (error) {
      console.error("Error saving branding", error);
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
      if(!confirm("¿Restaurar colores y nombre originales?")) return;
      setConfig(DEFAULT_BRANDING);
      setSaving(true);
      try {
        const updatedUser = await updateUserDoc(user.uid, { branding: DEFAULT_BRANDING });
        if(updatedUser) {
            onUpdateUser(updatedUser);
            applyBrandingToTheme(DEFAULT_BRANDING);
        }
      } finally {
          setSaving(false);
      }
  };

  return (
    <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6 relative overflow-hidden animate-fadeIn">
      {/* Header Sección */}
      <div className="flex items-center gap-3 mb-6">
        <div className="bg-mvp-gold/20 p-2 rounded-lg text-mvp-gold">
           <Palette size={24} />
        </div>
        <div>
           <h3 className="font-bold text-white text-lg">Personalización de Marca</h3>
           <p className="text-zinc-500 text-sm">Adapta la app a tu identidad visual.</p>
        </div>
        {isPro && (
            <div className="ml-auto bg-mvp-gold/20 text-mvp-gold px-2 py-1 rounded text-xs font-bold border border-mvp-gold/30 uppercase tracking-wider flex items-center gap-1">
                <Crown size={12}/> PRO
            </div>
        )}
      </div>

      {/* Contenido (Bloqueado si no es PRO) */}
      <div className={`space-y-6 relative ${!isPro ? 'opacity-50 pointer-events-none filter blur-[1px]' : ''}`}>
        
        {/* Nombre y Logo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
             <div>
                <label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">Nombre de tu Marca</label>
                <div className="relative">
                    <LayoutTemplate className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16}/>
                    <input 
                        type="text"
                        value={config.brandName}
                        onChange={(e) => setConfig({...config, brandName: e.target.value})}
                        placeholder="Ej: Bravo Fit Trainer"
                        className="w-full bg-black border border-zinc-700 text-white rounded-xl pl-10 pr-4 py-3 focus:border-mvp-gold outline-none"
                    />
                </div>
             </div>
             <div>
                <label className="text-xs text-zinc-500 font-bold uppercase mb-2 block">Logo URL (Imagen)</label>
                <div className="relative">
                    <ImageIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={16}/>
                    <input 
                        type="text"
                        value={config.logoUrl}
                        onChange={(e) => setConfig({...config, logoUrl: e.target.value})}
                        placeholder="https://..."
                        className="w-full bg-black border border-zinc-700 text-white rounded-xl pl-10 pr-4 py-3 focus:border-mvp-gold outline-none"
                    />
                </div>
             </div>
        </div>

        {/* Colores */}
        <div>
             <label className="text-xs text-zinc-500 font-bold uppercase mb-3 block">Colores de la App</label>
             <div className="flex gap-6 items-center bg-black/40 p-4 rounded-xl border border-zinc-800">
                <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-zinc-700 cursor-pointer relative group">
                        <input 
                            type="color" 
                            value={config.primaryColor}
                            onChange={(e) => setConfig({...config, primaryColor: e.target.value})}
                            className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 p-0 m-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                         <div className="w-full h-full" style={{ backgroundColor: config.primaryColor }} />
                    </div>
                    <span className="text-[10px] text-zinc-400 uppercase font-mono">Primario</span>
                </div>

                <div className="flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-zinc-700 cursor-pointer relative group">
                        <input 
                            type="color" 
                            value={config.secondaryColor}
                            onChange={(e) => setConfig({...config, secondaryColor: e.target.value})}
                            className="absolute inset-0 w-[150%] h-[150%] -top-1/4 -left-1/4 p-0 m-0 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                        />
                        <div className="w-full h-full" style={{ backgroundColor: config.secondaryColor }} />
                    </div>
                     <span className="text-[10px] text-zinc-400 uppercase font-mono">Secundario</span>
                </div>

                <div className="h-8 w-px bg-zinc-700 mx-2"></div>

                {/* Live Preview Miniture */}
                <div className="flex-1">
                     <span className="text-[10px] text-zinc-500 block mb-2">Vista Previa Botón</span>
                     <button 
                        className="px-4 py-2 rounded-lg text-xs font-bold text-black shadow-lg"
                        style={{ background: `linear-gradient(to right, ${config.primaryColor}, ${config.secondaryColor})` }}
                     >
                        Botón de Ejemplo
                     </button>
                </div>
             </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-2">
            <button 
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-zinc-100 hover:bg-white text-black font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
                <Save size={18}/> {saving ? 'Guardando...' : 'Aplicar Cambios'}
            </button>
            <button 
                 onClick={handleReset}
                 disabled={saving}
                 className="px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white rounded-xl transition-colors"
                 title="Restaurar valores originales"
            >
                <RotateCcw size={18} />
            </button>
        </div>

      </div>

      {/* Paywall Overlay */}
      {!isPro && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-center p-6 animate-fadeIn">
            <div className="bg-mvp-gold text-black p-4 rounded-full mb-4 shadow-[0_0_20px_rgba(245,158,11,0.4)]">
                <Lock size={32} />
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">Personalización Bloqueada</h3>
            <p className="text-zinc-300 max-w-sm mb-6 text-sm">
                Sube tu logo, cambia los colores de la app y define el nombre de tu marca para una experiencia 100% profesional.
            </p>
            <button 
                onClick={onShowPaywall}
                className="bg-gradient-to-r from-mvp-gold to-orange-500 hover:opacity-90 text-white font-bold py-3 px-8 rounded-xl shadow-lg transform hover:scale-105 transition-all"
            >
                Desbloquear Branding PRO
            </button>
        </div>
      )}
    </div>
  );
};

export default BrandingSettings;
