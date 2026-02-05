
import { GoogleGenAI, Type } from "@google/genai";
import { Routine, DietPlan, Client, Exercise } from "../types";

// Lazy init to avoid crash if env vars missing initially
let ai: GoogleGenAI | null = null;
const getAI = () => {
    if (!ai) {
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
    }
    return ai;
};

// --- WORKOUT SCHEMAS ---
const exerciseSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Nombre del ejercicio" },
    sets: { type: Type.INTEGER, description: "Número de series" },
    reps: { type: Type.STRING, description: "Rango de repeticiones (ej. '8-12', 'AMRAP')" },
    rest: { type: Type.STRING, description: "Tiempo de descanso (ej. '60s', '90s')" },
    notes: { type: Type.STRING, description: "Instrucciones técnicas breves" }
  },
  required: ["name", "sets", "reps", "rest"],
};

const dayRoutineSchema = {
  type: Type.OBJECT,
  properties: {
    dayName: { type: Type.STRING, description: "Día de la semana (Lunes, Martes...)" },
    focus: { type: Type.STRING, description: "Enfoque del día (Ej: Pecho, Pierna, Descanso Activo)" },
    exercises: {
      type: Type.ARRAY,
      items: exerciseSchema,
      description: "Lista de ejercicios para este día"
    }
  },
  required: ["dayName", "focus", "exercises"]
};

const weeklyRoutineSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Nombre creativo para la rutina semanal" },
    description: { type: Type.STRING, description: "Descripción general y objetivos del ciclo" },
    days: {
      type: Type.ARRAY,
      items: dayRoutineSchema,
      description: "Plan detallado para cada día de entrenamiento"
    }
  },
  required: ["title", "description", "days"],
};

// --- DIET SCHEMAS V2 ---
const dietMealSchema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Nombre corto del plato (Ej: Tortilla de avena)" },
    timeOfDay: { 
      type: Type.STRING, 
      enum: ["Desayuno", "Snack", "Almuerzo", "Merienda", "Cena"],
      description: "Momento del día" 
    },
    description: { type: Type.STRING, description: "Ingredientes principales y cantidades aproximadas" }
  },
  required: ["name", "timeOfDay", "description"]
};

const dietDaySchema = {
  type: Type.OBJECT,
  properties: {
    day: { type: Type.STRING, description: "Día de la semana (Lunes, Martes...)" },
    meals: { type: Type.ARRAY, items: dietMealSchema }
  },
  required: ["day", "meals"]
};

const dietPlanSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Título del plan (Ej: Plan Hipertrofia Semanal)" },
    totalKcal: { type: Type.INTEGER, description: "Objetivo calórico diario promedio" },
    totalProtein: { type: Type.INTEGER, description: "Gramos de proteína diarios" },
    totalCarbs: { type: Type.INTEGER, description: "Gramos de carbohidratos diarios" },
    totalFats: { type: Type.INTEGER, description: "Gramos de grasas diarios" },
    days: { type: Type.ARRAY, items: dietDaySchema, description: "Plan de 7 días" },
    notes: { type: Type.STRING, description: "Consejos generales (agua, suplementación, etc.)" }
  },
  required: ["title", "totalKcal", "totalProtein", "totalCarbs", "totalFats", "days"]
};

// --- FUNCTIONS ---

export const generateWorkoutRoutine = async (
  client: Client
): Promise<Partial<Routine> | null> => {
  try {
    const aiInstance = getAI();
    const modelId = "gemini-2.5-flash"; 
    
    // Construct robust context
    const goalsStr = client.goals.join(", ");
    const daysStr = client.trainingDays.join(", ");
    
    const prompt = `
      Actúa como un entrenador personal de élite. Crea una rutina semanal completa para este cliente:
      
      PERFIL:
      - Objetivo principal: ${client.mainGoal}
      - Otros objetivos: ${goalsStr}
      - Nivel: ${client.experienceLevel}
      - Género: ${client.gender}
      - Edad: ${client.age || 'No especificada'}
      - Peso: ${client.weight || '-'}kg | Altura: ${client.height || '-'}cm
      
      DISPONIBILIDAD:
      - Días disponibles: ${daysStr}
      
      REGLAS:
      1. Genera una rutina estructurada por días (Lunes, Martes, etc.) según los días disponibles.
      2. Si faltan días para cubrir la semana, sugiere descanso o cardio ligero.
      3. El Domingo debe ser recuperación o actividad muy suave.
      4. Incluye series, repeticiones y TIEMPO DE DESCANSO.
      5. Responde estrictamente en JSON.
    `;

    const response = await aiInstance.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: weeklyRoutineSchema,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) return null;

    const weeklyData = JSON.parse(text);

    // Transform Weekly Structure to Flat Routine Structure (for backward compatibility)
    const flatExercises: Exercise[] = [];
    const tags: string[] = [client.experienceLevel, ...client.goals.slice(0, 2)];

    if (weeklyData.days && Array.isArray(weeklyData.days)) {
      weeklyData.days.forEach((dayRoutine: any) => {
        const dayLabel = `${dayRoutine.dayName} – ${dayRoutine.focus}`;
        
        dayRoutine.exercises.forEach((ex: any) => {
          flatExercises.push({
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps,
            rest: ex.rest,
            notes: ex.notes,
            day: dayLabel // "Lunes – Hipertrofia"
          });
        });
      });
    }

    return {
      name: weeklyData.title,
      description: weeklyData.description,
      tags: tags,
      exercises: flatExercises
    };

  } catch (error) {
    console.error("Error al generar rutina:", error);
    return null;
  }
};

export const generateDietPlan = async (
  client: Client
): Promise<DietPlan | null> => {
  try {
    const aiInstance = getAI();
    const modelId = "gemini-2.5-flash";
    const goalsStr = client.goals.join(", ");
    const country = client.country || "Perú";
    
    const prompt = `
      Actúa como un nutricionista deportivo experto local de ${country}. 
      Genera un plan de alimentación semanal (7 días) totalmente adaptado a la gastronomía de ${country}.

      PERFIL DEL CLIENTE:
      - Objetivo: ${client.mainGoal}
      - Peso: ${client.weight ? client.weight + 'kg' : 'No especificado'}
      - Altura: ${client.height ? client.height + 'cm' : 'No especificado'}
      - Nivel: ${client.experienceLevel}
      
      INSTRUCCIONES DE LOCALIZACIÓN (${country}):
      - El cliente vive en ${country}.
      - USA SÓLO nombres de platos, ingredientes y jerga culinaria típica de ${country}.
      - NO uses nombres genéricos o de otros países (ej: Si es Perú, usa "Palta" no "Aguacate", "Pollo a la plancha" con "Arroz", etc.).
      - Sugiere desayunos, almuerzos y cenas que una persona común en ${country} comería o podría preparar fácilmente.
      - Evita comidas muy exóticas o difíciles de conseguir en ${country}.

      FORMATO TÉCNICO:
      1. Calcula los macros diarios ideales.
      2. Estructura Lunes a Domingo.
      3. 4-5 comidas por día (Desayuno, Almuerzo, Cena, Snacks).
      4. Responde en JSON estricto.
    `;

    const response = await aiInstance.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: dietPlanSchema,
        temperature: 0.5,
      },
    });

    const text = response.text;
    if (!text) return null;

    return JSON.parse(text) as DietPlan;

  } catch (error) {
    console.error("Error al generar dieta:", error);
    return null;
  }
};
