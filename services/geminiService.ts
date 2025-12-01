import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Routine } from "../types";

const apiKey = process.env.API_KEY || "";
const ai = new GoogleGenAI({ apiKey });

// Schema for structured output
const exerciseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Nombre del ejercicio" },
    sets: { type: Type.INTEGER, description: "Número de series" },
    reps: { type: Type.STRING, description: "Rango de repeticiones (ej. '8-12' o 'al fallo')" },
    notes: { type: Type.STRING, description: "Instrucciones técnicas o tempo" },
  },
  required: ["name", "sets", "reps"],
};

const routineSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING, description: "Nombre creativo para la rutina de entrenamiento" },
    description: { type: Type.STRING, description: "Breve descripción del enfoque del entrenamiento" },
    tags: { 
      type: Type.ARRAY, 
      items: { type: Type.STRING },
      description: "Etiquetas como 'Fuerza', 'Cardio', 'HIIT'"
    },
    exercises: {
      type: Type.ARRAY,
      items: exerciseSchema,
      description: "Lista de ejercicios de la rutina"
    },
  },
  required: ["name", "description", "exercises", "tags"],
};

export const generateWorkoutRoutine = async (
  clientGoal: string,
  fitnessLevel: string,
  constraints: string
): Promise<Partial<Routine> | null> => {
  if (!apiKey) {
    console.warn("Falta la API Key para Gemini");
    return null;
  }

  try {
    const modelId = "gemini-2.5-flash"; // Efficient for structured tasks
    const prompt = `
      Crea una rutina de entrenamiento detallada para un cliente.
      Objetivo: ${clientGoal}
      Nivel de condición física: ${fitnessLevel}
      Equipamiento/Restricciones: ${constraints}
      
      La rutina debe ser efectiva, segura y motivadora.
      Responde en español.
    `;

    const response = await ai.models.generateContent({
      model: modelId,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: routineSchema,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) return null;

    return JSON.parse(text) as Partial<Routine>;
  } catch (error) {
    console.error("Error al generar rutina:", error);
    return null;
  }
};