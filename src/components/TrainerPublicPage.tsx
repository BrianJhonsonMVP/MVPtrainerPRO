
import React, { useEffect, useState } from 'react';
import { getTrainerProfileById } from '../services/firebase';
import { User } from '../types';
import { MessageSquare, CheckCircle, Target, Loader2 } from 'lucide-react';

interface Props {
    trainerId: string;
}

const TrainerPublicPage: React.FC<Props> = ({ trainerId }) => {
    const [trainer, setTrainer] = useState<Partial<User> | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const data = await getTrainerProfileById(trainerId);
            setTrainer(data);
            setLoading(false);
        };
        load();
    }, [trainerId]);

    if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-white"><Loader2 className="animate-spin text-orange-500"/></div>;
    if (!trainer) return <div className="min-h-screen bg-black flex items-center justify-center text-white">Entrenador no encontrado.</div>;

    const brandColor = trainer.branding?.primaryColor || '#FF5B0B';
    const profile = trainer.publicProfile;

    return (
        <div className="min-h-screen bg-black text-white font-sans selection:bg-orange-500/30">
            {/* HERO */}
            <header className="relative py-20 px-6 text-center overflow-hidden">
                <div className="absolute inset-0 opacity-10" style={{ background: `radial-gradient(circle at center, ${brandColor}, transparent 70%)` }}></div>
                
                <div className="relative z-10 flex flex-col items-center">
                    <div className="w-32 h-32 rounded-full border-4 border-white/10 mb-6 overflow-hidden shadow-2xl">
                        {profile?.profileImageUrl ? (
                            <img src={profile.profileImageUrl} alt="Trainer" className="w-full h-full object-cover"/>
                        ) : (
                            <div className="w-full h-full bg-zinc-800 flex items-center justify-center text-zinc-500 text-4xl font-bold">
                                {trainer.displayName?.charAt(0)}
                            </div>
                        )}
                    </div>
                    
                    <h1 className="text-4xl md:text-6xl font-black mb-2 tracking-tight">
                        {trainer.branding?.brandName || trainer.displayName}
                    </h1>
                    <p className="text-zinc-400 max-w-lg mx-auto text-lg leading-relaxed">
                        {profile?.description || "Ayudo a personas a alcanzar su mejor versión física y mental."}
                    </p>

                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        {profile?.targets?.map((t, i) => (
                            <span key={i} className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-sm font-semibold flex items-center gap-2">
                                <Target size={14} style={{ color: brandColor }}/> {t}
                            </span>
                        ))}
                    </div>

                    <a 
                        href={`https://wa.me/${profile?.whatsAppNumber}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-10 px-8 py-4 rounded-full font-bold text-lg shadow-lg hover:transform hover:scale-105 transition-all flex items-center gap-3"
                        style={{ backgroundColor: brandColor, color: '#000' }}
                    >
                        <MessageSquare size={20}/> Contactar por WhatsApp
                    </a>
                </div>
            </header>

            {/* SERVICES */}
            <section className="py-16 px-6 max-w-4xl mx-auto">
                <h2 className="text-2xl font-bold mb-8 text-center uppercase tracking-widest text-zinc-500">Mis Servicios</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {profile?.services?.length ? profile.services.map((s, i) => (
                        <div key={i} className="bg-zinc-900/50 border border-zinc-800 p-6 rounded-2xl flex items-center gap-4">
                            <div className="bg-white/5 p-3 rounded-xl" style={{ color: brandColor }}>
                                <CheckCircle size={24}/>
                            </div>
                            <span className="font-bold text-lg">{s}</span>
                        </div>
                    )) : (
                        <div className="col-span-2 text-center text-zinc-600 italic">No hay servicios listados.</div>
                    )}
                </div>
            </section>

            <footer className="py-8 text-center text-zinc-600 text-sm border-t border-zinc-900 mt-10">
                <p>Powered by MVP Trainer Pro</p>
            </footer>
        </div>
    );
};

export default TrainerPublicPage;
