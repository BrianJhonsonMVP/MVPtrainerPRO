import express from "express";
import path from "path";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Gemini Setup
  const geminiKey = process.env.GEMINI_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY;

  console.log("GEMINI_API_KEY exists:", !!geminiKey);
  if (geminiKey) console.log("GEMINI_API_KEY length:", geminiKey.length);
  console.log("GOOGLE_API_KEY exists:", !!googleKey);
  if (googleKey) console.log("GOOGLE_API_KEY length:", googleKey.length);
  console.log("Using explicit GEMINI_API_KEY for initialization");

  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  console.log("UNIFIED GEMINI MODEL IN USE:", GEMINI_MODEL);

  const ai = new GoogleGenAI({ 
    apiKey: geminiKey || googleKey || "",
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
  });

  // Helper to clean JSON response from Gemini
  const cleanJSON = (text: string) => {
    try {
      // Remove markdown backticks if present
      let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(clean);
    } catch (e) {
      console.error("Failed to clean and parse JSON:", text);
      throw e;
    }
  };

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/generate-workout", async (req, res) => {
    try {
      const { clientData } = req.body;
      const prompt = `Actúa como un Entrenador Personal de Élite. 
      Genera una RUTA DE ENTRENAMIENTO PROFESIONAL Y SEGURA para el siguiente cliente:
      
      DATOS DEL CLIENTE:
      - Nombre: ${clientData.name}
      - Edad: ${clientData.age || 'No especificada'}
      - Sexo: ${clientData.gender || 'No especificado'}
      - Peso: ${clientData.weight ? clientData.weight + 'kg' : 'No especificado'}
      - Altura: ${clientData.height ? clientData.height + 'cm' : 'No especificada'}
      - Objetivo: ${clientData.mainGoal}
      - Nivel: ${clientData.experienceLevel}
      - Días disponibles: ${Array.isArray(clientData.trainingDays) ? clientData.trainingDays.join(', ') : '3 días/semana'}
      - Lesiones: ${clientData.injuries || 'Ninguna'}
      
      ESTRUCTURA DE RESPUESTA (JSON):
      {
        "title": "Nombre de rutina",
        "summary": "Resumen técnico enfocando en los objetivos del cliente",
        "days": [
          {
            "day": "Lunes",
            "exercises": [
              { 
                "name": "Nombre exacto del ejercicio", 
                "sets": 3, 
                "reps": "12" o "al fallo" o "10-12", 
                "rest": "60s" o "90s", 
                "notes": "Consejo breve de ejecución",
                "howTo": "Explicación breve paso a paso (ej: 1. Coloca los pies... 2. Desciende lentamente...)",
                "commonMistake": "Error común a evitar (ej: Curvar la espalda baja o rebotar)",
                "muscleFocus": "Músculo principal trabajado (ej: Cuádriceps, Pecho, Deltoides)"
              }
            ]
          }
        ],
        "warnings": ["Advertencia de seguridad 1"],
        "recommendations": ["Consejo práctico 1"]
      }
      
      Responde SOLO el JSON. Asegúrate de que el JSON sea válido y contenga los campos howTo, commonMistake y muscleFocus para cada ejercicio de forma obligatoria.`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      
      const rawText = response.text;
      if (!rawText) throw new Error("No text returned from Gemini");
      console.log("RAW GEMINI WORKOUT LENGTH:", rawText.length);
      
      const parsed = cleanJSON(rawText);
      
      res.json(parsed);
    } catch (error: any) {
      console.error("Workout Generation Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generate-diet", async (req, res) => {
    try {
      const { clientData } = req.body;
      const country = clientData.country || "General";
      const prompt = `Actúa como un Nutricionista Deportivo experto.
      Genera un PLAN NUTRICIONAL PROFESIONAL, ACCESIBLE Y REALISTA para el siguiente cliente:
      
      CLIENTE:
      - Nombre: ${clientData.name}
      - Sexo: ${clientData.gender || 'No especificado'}
      - Edad: ${clientData.age || 'No especificada'}
      - Objetivo: ${clientData.mainGoal}
      - Peso: ${clientData.weight}kg
      - Altura: ${clientData.height}cm
      - País: ${country}
      
      REQUISITOS CRÍTICOS:
      1. Prioriza alimentos ECONÓMICOS, FÁCILES DE CONSEGUIR y REALISTAS para alguien en ${country}.
      2. Evita recetas gourmet complejas, ingredientes raros (como kale orgánico, aceites exóticos caros) o suplementos innecesarios.
      3. Enfócate en lo práctico: Pollo, huevos, arroz, avena, frutas locales, legumbres, etc.
      4. Si el país es Perú, usa ingredientes como camote, plátano, queso fresco, menestras, etc.
      5. EL PLAN DEBE INCLUIR LOS 7 DÍAS DE LA SEMANA DE MANERA MANDATORIA: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado y Domingo. No puedes saltarte ningún día.
      6. Cada día debe contemplar: Desayuno, Media Mañana (opcional), Almuerzo, Media Tarde (opcional) y Cena.
      
      ESTRUCTURA DE RESPUESTA (JSON):
      {
        "title": "Nombre del plan (ej: Plan Tonificación Económico)",
        "summary": "Enfoque del plan y por qué se eligieron estos alimentos",
        "daily_calories": 2500,
        "totalProtein": 150,
        "totalCarbs": 250,
        "totalFats": 80,
        "days": [
          {
            "day": "Lunes",
            "meals": [
              { "timeOfDay": "Desayuno", "name": "Avena con plátano y huevos revueltos", "description": "Mezcla de avena cocida con plátano picado y 3 huevos revueltos enteros" },
              { "timeOfDay": "Media Mañana", "name": "Fruta local", "description": "Manzana o mandarina de estación" },
              { "timeOfDay": "Almuerzo", "name": "Arroz con pollo y camote", "description": "Pechuga de pollo a la plancha con taza de arroz blanco cocido y camote sancochado" },
              { "timeOfDay": "Media Tarde", "name": "Yogurt con frutos secos", "description": "Yogurt griego descremado con un puñado pequeño de maní" },
              { "timeOfDay": "Cena", "name": "Tortilla de verduras y queso fresco", "description": "Espinaca, cebolla y queso fresco batido con 2 claras de huevo" }
            ]
          }
        ],
        "warnings": ["Advertencia nutricional"],
        "recommendations": ["Consejo para ahorrar o mejorar adherencia"]
      }
      
      Responde SOLO el JSON. Asegúrate de incluir los 7 días (Lunes, Martes, Miércoles, Jueves, Viernes, Sábado y Domingo) en el arreglo "days".`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });
      
      const rawText = response.text;
      if (!rawText) throw new Error("No text returned from Gemini");
      console.log("RAW GEMINI DIET LENGTH:", rawText.length);

      const parsed = cleanJSON(rawText);

      res.json(parsed);
    } catch (error: any) {
      console.error("Diet Generation Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
