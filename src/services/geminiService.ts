
import { supabase, isSupabaseEnabled } from './supabaseClient';
import { Routine, DietPlan, Client } from "../types";

/**
 * Fallback local en caso de que la IA falle (403, cuota, etc)
 */
const getFallbackRoutine = (client: Client): Partial<Routine> => {
  const name = client.name || "Cliente";
  const goal = client.mainGoal || "Entrenamiento General";
  const level = client.experienceLevel || "Principiante";
  const days = client.trainingDays || ["Lunes", "Miércoles", "Viernes"];
  
  const exercisesConfig: Record<string, any[]> = {
    "Pérdida de peso": [
      { name: "Burpees", sets: "4", reps: "15", rest: "30s", notes: "Alta intensidad para quema calórica" },
      { name: "Sentadillas con salto", sets: "4", reps: "20", rest: "30s", notes: "Mantener ritmo constante" },
      { name: "Mountain Climbers", sets: "4", reps: "45s", rest: "30s", notes: "Core bien activado" }
    ],
    "Ganancia muscular": [
      { name: "Press de Banca", sets: "4", reps: "8-10", rest: "90s", notes: "Carga pesada con control" },
      { name: "Sentadilla con barra", sets: "4", reps: "8-10", rest: "120s", notes: "Profundidad máxima segura" },
      { name: "Dominadas", sets: "4", reps: "8-12", rest: "90s", notes: "Tracción escapular inicial" }
    ]
  };

  const selectedExercises = exercisesConfig[goal] || exercisesConfig["Ganancia muscular"];
  const finalExercises = days.flatMap(day => 
    selectedExercises.map(ex => ({ ...ex, day }))
  );

  return {
    name: `Plan Base: ${goal}`,
    description: `Generado con parámetros estándar. Por favor verifica tu conexión para obtener una versión optimizada por IA PRO.`,
    tags: ["básico", goal.toLowerCase()],
    exercises: finalExercises
  };
};

const getFallbackDiet = (client: Client): DietPlan => {
  const kcalMult = client.mainGoal?.includes("Pérdida") ? 0.8 : (client.mainGoal?.includes("Ganancia") ? 1.2 : 1.0);
  const weight = client.weight || 70;
  const kcal = (10 * weight + 1000) * 1.5 * kcalMult;

  return {
    title: `Plan Nutricional Base`,
    notes: `Generado con parámetros nutricionales estándar. Verifica tu conexión para obtener optimización por IA PRO.`,
    totalKcal: Math.round(kcal),
    totalProtein: Math.round(weight * 2),
    totalCarbs: Math.round(weight * 3),
    totalFats: Math.round(weight * 0.8),
    days: ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map(d => ({
      day: d,
      meals: [
        { timeOfDay: "Desayuno", name: "Opción Base", description: "Proteína magra y carbohidrato complejo." },
        { timeOfDay: "Almuerzo", name: "Opción Base", description: "Proteína, vegetales y grasas saludables." },
        { timeOfDay: "Cena", name: "Opción Base", description: "Proteína ligera y fibra." }
      ]
    }))
  };
};

/**
 * Asegura que la rutina tenga el formato esperado por el frontend
 */
export const normalizeRoutine = (data: any): Partial<Routine> => {
  if (!data) return { name: "Nueva Rutina", description: "", exercises: [], tags: [] };
  
  console.log("NORMALIZING ROUTINE START...");
  
  // Si tiene days pero no exercises top-level, intentamos aplanarlos para compatibilidad si es necesario
  let flattenedExercises = data.exercises || [];
  if (flattenedExercises.length === 0 && Array.isArray(data.days)) {
    data.days.forEach((day: any) => {
        const dayEx = day.exercises || day.workouts || [];
        dayEx.forEach((ex: any) => {
            flattenedExercises.push({
                ...ex,
                day: day.day || day.name || "General"
            });
        });
    });
  }

  const normalized = {
    name: data.title || data.name || "Nueva Rutina AI",
    description: data.summary || data.description || data.notes || "Generada por IA",
    title: data.title || data.name || "Nueva Rutina AI",
    summary: data.summary || data.description || "Generada por IA",
    exercises: flattenedExercises,
    days: Array.isArray(data.days) ? data.days : [],
    tags: Array.isArray(data.tags) ? data.tags : ["ai"],
    warnings: Array.isArray(data.warnings) ? data.warnings : [],
    recommendations: Array.isArray(data.recommendations) ? data.recommendations : []
  };

  console.log("NORMALIZED ROUTINE EXERCISES COUNT:", normalized.exercises.length);
  return normalized;
};

/**
 * Asegura que el plan de dieta tenga el formato esperado
 */
export const normalizeDiet = (data: any): DietPlan => {
  if (!data) return { 
    title: "Plan Nutricional", 
    totalKcal: 2000, totalProtein: 150, totalCarbs: 200, totalFats: 70, 
    days: [], meals: [], warnings: [], recommendations: [] 
  };

  console.log("NORMALIZING DIET START...");

  const rawDays = Array.isArray(data.days) ? data.days : [];
  const ALL_DAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
  
  // Standard high-quality default meals as fallback reference
  const defaultMealsForDay = (dayName: string) => [
    { 
      timeOfDay: "Desayuno", 
      name: "Tortilla de claras de huevo con espinaca y avena", 
      description: "3 claras de huevo revueltas con espinaca fresca, acompañado de 50g de avena cocida con canela y agua." 
    },
    { 
      timeOfDay: "Media Mañana", 
      name: "Proteína de suero y fruta", 
      description: "1 scoop de proteína de suero de leche (o un puñado de maní tostado) con 1 manzana mediana." 
    },
    { 
      timeOfDay: "Almuerzo", 
      name: "Pechuga de pollo a la plancha con arroz integral y brócoli", 
      description: "150g de pechuga de pollo, 1 taza de arroz integral o camote sancochado y porción generosa de brócoli al vapor." 
    },
    { 
      timeOfDay: "Media Tarde", 
      name: "Yogurt griego con almendras", 
      description: "150g de yogurt griego bajo en grasa mezclado con 10 o 12 almendras picadas." 
    },
    { 
      timeOfDay: "Cena", 
      name: "Pescado a la plancha con ensalada verde mixta", 
      description: "150g de pescado blanco de estación con limón y ensalada de repollo, pepino y palta." 
    }
  ];

  const normalizedDays = ALL_DAYS.map((dayName) => {
    // Check if the day is present in rawDays
    const foundDay = rawDays.find((d: any) => {
      if (!d || !d.day) return false;
      const dName = String(d.day).toLowerCase().trim();
      return dName === dayName.toLowerCase() || 
             dName.replace(/[áéíóú]/g, (char) => ({ 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u' }[char] || char)) === 
             dayName.toLowerCase().replace(/[áéíóú]/g, (char) => ({ 'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u' }[char] || char));
    });

    let meals = foundDay && Array.isArray(foundDay.meals) ? [...foundDay.meals] : [];

    // Ensure all 5 key meal times exist: Desayuno, Media Mañana, Almuerzo, Media Tarde, Cena
    const mealTimes = ["Desayuno", "Media Mañana", "Almuerzo", "Media Tarde", "Cena"];
    
    const finalMeals = mealTimes.map((timeName) => {
      const foundMeal = meals.find((m: any) => {
        if (!m || !m.timeOfDay) return false;
        const mt = String(m.timeOfDay).toLowerCase().trim();
        return mt === timeName.toLowerCase() || 
               (timeName === "Media Mañana" && (mt.includes("mañana") || mt.includes("colacion 1") || mt.includes("snack 1") || mt.includes("colación"))) ||
               (timeName === "Media Tarde" && (mt.includes("tarde") || mt.includes("colacion 2") || mt.includes("snack 2") || mt.includes("merienda") || mt.includes("colación")));
      });

      if (foundMeal) {
        return {
          timeOfDay: timeName,
          name: foundMeal.name || "Comida Saludable",
          description: foundMeal.description || "Porción balanceada según las recomendaciones del plan."
        };
      } else {
        const defaultMatch = defaultMealsForDay(dayName).find(dm => dm.timeOfDay === timeName);
        return defaultMatch || {
          timeOfDay: timeName,
          name: `${timeName} Balanceado`,
          description: "Preparación saludable rica en proteínas limpias y carbohidratos complejos."
        };
      }
    });

    return {
      day: dayName,
      meals: finalMeals
    };
  });

  const normalized = {
    title: data.title || "Plan Nutricional AI",
    summary: data.summary || data.notes || "Generado por IA",
    notes: data.notes || data.summary || "Generado por IA",
    daily_calories: data.daily_calories || data.totalKcal || 2000,
    totalKcal: data.totalKcal || data.daily_calories || 2000,
    totalProtein: data.totalProtein || 150,
    totalCarbs: data.totalCarbs || 200,
    totalFats: data.totalFats || 70,
    days: normalizedDays,
    meals: Array.isArray(data.meals) ? data.meals : [],
    warnings: Array.isArray(data.warnings) ? data.warnings : ["Mantener una hidratación de al menos 2.5 litros de agua al día."],
    recommendations: Array.isArray(data.recommendations) ? data.recommendations : ["Asegura la adherencia pesando tus alimentos en crudo si es posible."]
  };

  console.log("NORMALIZED DIET COMPLETED - 7 DAYS WITH 5 MEALS GUARANTEED");
  return normalized;
};

/**
 * Genera una rutina de entrenamiento usando nuestro backend (Gemini AI).
 */
export const generateWorkoutRoutine = async (
  client: Client
): Promise<Partial<Routine> | null> => {
  try {
    console.log("Calling Backend AI Workout Generation...");
    const response = await fetch("/api/generate-workout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientData: client })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Server error");
    }
    
    const data = await response.json();
    console.log("AI response received & parsed successfully");
    const normalized = normalizeRoutine(data);
    const hasExercises = normalized.exercises && normalized.exercises.length > 0;
    return {
      ...normalized,
      version: 1,
      source: hasExercises ? "ai" : "fallback"
    };

  } catch (error) {
    console.error("AI Error (Workout):", error);
    return {
      ...normalizeRoutine(getFallbackRoutine(client)),
      version: 1,
      source: "fallback"
    } as any;
  }
};

/**
 * Genera un plan de dieta usando nuestro backend (Gemini AI).
 */
export const generateDietPlan = async (
  client: Client
): Promise<DietPlan | null> => {
  try {
    console.log("Calling Backend AI Diet Generation...");
    const response = await fetch("/api/generate-diet", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientData: client })
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Server error");
    }

    const data = await response.json();
    console.log("AI Nutrition response received & parsed");
    const normalized = normalizeDiet(data);
    return {
      ...normalized,
      version: 1,
      source: "ai"
    };

  } catch (error) {
    console.error("AI Error (Diet):", error);
    return {
      ...normalizeDiet(getFallbackDiet(client)),
      version: 1,
      source: "fallback"
    };
  }
};
