import React, { useMemo, useState } from 'react';
import { Dumbbell, Plus, Save, Trash2, Utensils, X } from 'lucide-react';
import { DietPlan, Routine } from '../types';
import { AppButton, IconButton, PrimaryButton, SecondaryButton } from './ui/Buttons';

type EditablePlan = Routine | DietPlan;

interface Props {
  type: 'routine' | 'diet';
  plan: EditablePlan;
  language?: 'es' | 'en';
  saving?: boolean;
  onClose: () => void;
  onSave: (plan: EditablePlan) => void;
}

const clonePlan = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const normalizeEditablePlan = (plan: EditablePlan, type: Props['type']) => {
  const draft: any = clonePlan(plan);
  if (Array.isArray(draft.days) && draft.days.length > 0) return draft;

  if (type === 'routine' && Array.isArray(draft.exercises) && draft.exercises.length > 0) {
    const grouped = draft.exercises.reduce((days: Record<string, any[]>, exercise: any) => {
      const day = exercise.day || exercise.trainingDay || 'Día 1';
      days[day] = [...(days[day] || []), exercise];
      return days;
    }, {});
    return { ...draft, days: Object.entries(grouped).map(([day, exercises]) => ({ day, exercises })) };
  }

  if (type === 'diet' && Array.isArray(draft.meals) && draft.meals.length > 0) {
    return { ...draft, days: [{ day: 'Día 1', meals: draft.meals }] };
  }

  return { ...draft, days: [{ day: 'Día 1', [type === 'routine' ? 'exercises' : 'meals']: [] }] };
};

const PlanEditorModal: React.FC<Props> = ({ type, plan, language = 'es', saving = false, onClose, onSave }) => {
  const copy = useMemo(() => language === 'en' ? {
    title: 'Edit plan', hint: 'Make only the changes the client needs. This does not use another AI generation.', summary: 'Summary', day: 'Day', addItem: type === 'routine' ? 'Add exercise' : 'Add meal', save: 'Save changes', cancel: 'Cancel', name: 'Name', sets: 'Sets', reps: 'Repetitions', rest: 'Rest', notes: 'Coach note', mealTime: 'Meal', description: 'Description', edited: 'Edited by trainer'
  } : {
    title: 'Editar plan', hint: 'Corrige solo lo que necesita el cliente. Esto no consume otra generación de IA.', summary: 'Resumen', day: 'Día', addItem: type === 'routine' ? 'Añadir ejercicio' : 'Añadir comida', save: 'Guardar cambios', cancel: 'Cancelar', name: 'Nombre', sets: 'Series', reps: 'Repeticiones', rest: 'Descanso', notes: 'Indicación del entrenador', mealTime: 'Comida', description: 'Descripción', edited: 'Editado por el entrenador'
  }, [language, type]);
  const [draft, setDraft] = useState<any>(() => normalizeEditablePlan(plan, type));

  const updateDay = (dayIndex: number, updater: (day: any) => any) => {
    setDraft((current: any) => ({ ...current, days: (current.days || []).map((day: any, index: number) => index === dayIndex ? updater(day) : day) }));
  };

  const itemKey = type === 'routine' ? 'exercises' : 'meals';
  const addItem = (dayIndex: number) => updateDay(dayIndex, day => ({
    ...day,
    [itemKey]: [...(day[itemKey] || []), type === 'routine'
      ? { name: '', sets: 3, reps: '10-12', rest: '60s', notes: '' }
      : { timeOfDay: '', name: '', description: '' }]
  }));
  const updateItem = (dayIndex: number, itemIndex: number, key: string, value: any) => updateDay(dayIndex, day => ({
    ...day,
    [itemKey]: (day[itemKey] || []).map((item: any, index: number) => index === itemIndex ? { ...item, [key]: value } : item)
  }));
  const removeItem = (dayIndex: number, itemIndex: number) => updateDay(dayIndex, day => ({
    ...day,
    [itemKey]: (day[itemKey] || []).filter((_: any, index: number) => index !== itemIndex)
  }));

  const save = () => onSave({
    ...draft,
    exercises: type === 'routine' ? draft.days.flatMap((day: any) => (day.exercises || []).map((exercise: any) => ({ ...exercise, day: day.day }))) : draft.exercises,
    meals: type === 'diet' ? draft.days.flatMap((day: any) => (day.meals || []).map((meal: any) => ({ ...meal, day: day.day }))) : draft.meals,
    source: 'manual',
    editedByTrainer: true
  } as EditablePlan);

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <section className="flex h-[100dvh] w-full max-w-3xl flex-col border border-zinc-700 bg-[#0d1119] shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl" role="dialog" aria-modal="true">
        <header className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 py-4">
          <div className="flex gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg border border-violet-500/25 bg-violet-500/10 text-violet-300">{type === 'routine' ? <Dumbbell size={19} /> : <Utensils size={19} />}</span><div><h2 className="text-lg font-black text-white">{copy.title}</h2><p className="mt-1 text-xs text-zinc-500">{copy.hint}</p></div></div>
          <IconButton type="button" onClick={onClose} aria-label="Cerrar"><X size={17} /></IconButton>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 custom-scrollbar">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[10px] font-black uppercase text-zinc-500">{copy.name}<input value={draft.title || draft.name || ''} onChange={event => setDraft((current: any) => ({ ...current, title: event.target.value, name: event.target.value }))} className="mt-2 w-full rounded-lg border border-zinc-700 bg-black px-3 py-3 text-sm font-bold text-white outline-none focus:border-violet-400" /></label>
            <label className="text-[10px] font-black uppercase text-zinc-500">{copy.summary}<textarea value={draft.summary || draft.description || draft.notes || ''} onChange={event => setDraft((current: any) => ({ ...current, summary: event.target.value, description: type === 'routine' ? event.target.value : current.description }))} className="mt-2 min-h-20 w-full resize-none rounded-lg border border-zinc-700 bg-black px-3 py-3 text-sm text-white outline-none focus:border-violet-400" /></label>
          </div>

          {(draft.days || []).map((day: any, dayIndex: number) => (
            <section key={`${day.day}-${dayIndex}`} className="overflow-hidden rounded-xl border border-zinc-800 bg-[#111620]">
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3"><label className="text-[10px] font-black uppercase text-zinc-500">{copy.day}<input value={day.day || ''} onChange={event => updateDay(dayIndex, current => ({ ...current, day: event.target.value }))} className="ml-3 bg-transparent text-sm font-black normal-case text-white outline-none" /></label><SecondaryButton type="button" compact onClick={() => addItem(dayIndex)} icon={<Plus size={14} />}>{copy.addItem}</SecondaryButton></div>
              <div className="space-y-3 p-3">
                {(day[itemKey] || []).map((item: any, itemIndex: number) => (
                  <div key={itemIndex} className="rounded-lg border border-zinc-800 bg-black/30 p-3">
                    {type === 'routine' ? (
                      <div className="grid gap-2 sm:grid-cols-[minmax(180px,1fr)_80px_100px_90px_auto]">
                        <input value={item.name || ''} onChange={event => updateItem(dayIndex, itemIndex, 'name', event.target.value)} placeholder={copy.name} className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm font-bold text-white outline-none focus:border-violet-400" />
                        <input type="number" min="1" value={item.sets || ''} onChange={event => updateItem(dayIndex, itemIndex, 'sets', Number(event.target.value))} placeholder={copy.sets} className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none" />
                        <input value={item.reps || ''} onChange={event => updateItem(dayIndex, itemIndex, 'reps', event.target.value)} placeholder={copy.reps} className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none" />
                        <input value={item.rest || ''} onChange={event => updateItem(dayIndex, itemIndex, 'rest', event.target.value)} placeholder={copy.rest} className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none" />
                        <IconButton type="button" tone="danger" onClick={() => removeItem(dayIndex, itemIndex)} aria-label="Eliminar"><Trash2 size={15} /></IconButton>
                        <input value={item.notes || ''} onChange={event => updateItem(dayIndex, itemIndex, 'notes', event.target.value)} placeholder={copy.notes} className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-xs text-zinc-300 outline-none sm:col-span-5" />
                      </div>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-[130px_minmax(160px,1fr)_minmax(200px,1.4fr)_auto]">
                        <input value={item.timeOfDay || ''} onChange={event => updateItem(dayIndex, itemIndex, 'timeOfDay', event.target.value)} placeholder={copy.mealTime} className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-white outline-none" />
                        <input value={item.name || ''} onChange={event => updateItem(dayIndex, itemIndex, 'name', event.target.value)} placeholder={copy.name} className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm font-bold text-white outline-none" />
                        <input value={item.description || ''} onChange={event => updateItem(dayIndex, itemIndex, 'description', event.target.value)} placeholder={copy.description} className="rounded-lg border border-zinc-700 bg-black px-3 py-2 text-sm text-zinc-300 outline-none" />
                        <IconButton type="button" tone="danger" onClick={() => removeItem(dayIndex, itemIndex)} aria-label="Eliminar"><Trash2 size={15} /></IconButton>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="grid grid-cols-2 gap-3 border-t border-zinc-800 p-4"><AppButton type="button" variant="tertiary" onClick={onClose}>{copy.cancel}</AppButton><PrimaryButton type="button" onClick={save} disabled={saving} isLoading={saving} icon={<Save size={16} />}>{copy.save}</PrimaryButton></footer>
      </section>
    </div>
  );
};

export default PlanEditorModal;
