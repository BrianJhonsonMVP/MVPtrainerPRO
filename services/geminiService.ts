
import { supabase } from './supabaseClient';
import { Routine, DietPlan, Client } from "../types";

/**
 * Lógica defensiva para extraer JSON de respuestas de IA
 * que a veces incluyen markdown (```json ... ```)
 */
const extractJson = (text: string) => {
  try {
    // Intentar parsear directo
    return JSON.parse(text);
  } catch (e) {
    // Intentar extraer bloque JSON con regex
    const match = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (innerE) {
        throw new Error("No se pudo parsear el JSON extraído de la IA");
      }
    }
    throw new Error("La IA no devolvió un formato JSON válido");
  }
};

export const generateWorkoutRoutine = async (
  client: Client
): Promise<Partial<Routine> | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-workout', {
      body: { clientId: client.id }
    });

    if (error) throw error;
    
    // La función ya devuelve el objeto Routine guardado en DB o el JSON limpio
    return data;
  } catch (error) {
    console.error("Error en Edge Function (Rutina):", error);
    return null;
  }
};

export const generateDietPlan = async (
  client: Client
): Promise<DietPlan | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-diet', {
      body: { clientId: client.id }
    });

    if (error) throw error;
    
    return data;
  } catch (error) {
    console.error("Error en Edge Function (Dieta):", error);
    return null;
  }
};
