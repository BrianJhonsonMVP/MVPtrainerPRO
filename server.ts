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

  const geminiKey = process.env.GEMINI_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY;
  const apiKey = geminiKey || googleKey || "";
  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

  console.log("Gemini API configured:", Boolean(apiKey));
  console.log("Gemini model:", GEMINI_MODEL);

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { "User-Agent": "mvp-trainer-pro" } }
  });

  const cleanJSON = (text: string) => {
    try {
      const clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(clean);
    } catch (e) {
      console.error("Failed to parse Gemini JSON response.");
      throw e;
    }
  };

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/generate-workout", async (req, res) => {
    try {
      if (!apiKey) throw new Error("Gemini API key is not configured.");

      const { clientData } = req.body;
      const prompt = `Actúa como un entrenador personal de élite.
Genera una rutina profesional, segura y realista para este cliente.

DATOS DEL CLIENTE:
- Nombre: ${clientData.name}
- Edad: ${clientData.age || "No especificada"}
- Sexo: ${clientData.gender || "No especificado"}
- Peso: ${clientData.weight ? clientData.weight + "kg" : "No especificado"}
- Altura: ${clientData.height ? clientData.height + "cm" : "No especificada"}
- País: ${clientData.country || "No especificado"}
- Objetivo principal: ${clientData.mainGoal || clientData.goals?.[0] || "No especificado"}
- Objetivos adicionales: ${Array.isArray(clientData.goals) ? clientData.goals.join(", ") : "No especificados"}
- Nivel: ${clientData.experienceLevel || "No especificado"}
- Días disponibles: ${Array.isArray(clientData.trainingDays) ? clientData.trainingDays.join(", ") : "3 días/semana"}
- Horario de entrenamiento: ${clientData.trainingTime || "No especificado"}
- Restricciones/lesiones: ${clientData.injuries || clientData.restrictions || "Ninguna indicada"}

REGLAS:
1. Prioriza seguridad, progresión y técnica.
2. Adapta volumen/intensidad al nivel y objetivo.
3. Usa ejercicios realistas para un entrenador personal.
4. Incluye guía de ejecución y errores comunes.
5. Responde SOLO JSON válido.

ESTRUCTURA JSON OBLIGATORIA:
{
  "title": "Nombre de rutina",
  "summary": "Resumen técnico enfocado en los objetivos del cliente",
  "days": [
    {
      "day": "Lunes",
      "exercises": [
        {
          "name": "Nombre exacto del ejercicio",
          "sets": 3,
          "reps": "10-12",
          "rest": "60s",
          "notes": "Consejo breve de ejecución",
          "howTo": "Explicación breve paso a paso",
          "commonMistake": "Error común a evitar",
          "muscleFocus": "Músculo principal trabajado"
        }
      ]
    }
  ],
  "warnings": ["Advertencia de seguridad"],
  "recommendations": ["Consejo práctico"]
}`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const rawText = response.text;
      if (!rawText) throw new Error("No text returned from Gemini");
      res.json(cleanJSON(rawText));
    } catch (error: any) {
      console.error("Workout Generation Error:", error.message || error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/generate-diet", async (req, res) => {
    try {
      if (!apiKey) throw new Error("Gemini API key is not configured.");

      const { clientData } = req.body;
      const country = clientData.country || "General";
      const prompt = `Actúa como nutricionista deportivo experto.
Genera un plan nutricional profesional, accesible, realista y personalizado.

CLIENTE:
- Nombre: ${clientData.name}
- Sexo: ${clientData.gender || "No especificado"}
- Edad: ${clientData.age || "No especificada"}
- Objetivo: ${clientData.mainGoal || clientData.goals?.[0] || "No especificado"}
- Peso: ${clientData.weight || "No especificado"}kg
- Altura: ${clientData.height || "No especificada"}cm
- País: ${country}
- Días/horario de entrenamiento: ${Array.isArray(clientData.trainingDays) ? clientData.trainingDays.join(", ") : "No especificados"} / ${clientData.trainingTime || "No especificado"}

REQUISITOS:
1. Prioriza alimentos económicos, fáciles de conseguir y realistas para ${country}.
2. Evita recetas gourmet complejas, ingredientes raros y suplementos innecesarios.
3. Si el país es Perú, usa opciones como pollo, huevos, arroz, avena, camote, plátano, queso fresco, menestras, pescado local y frutas de estación.
4. Incluye los 7 días completos: Lunes, Martes, Miércoles, Jueves, Viernes, Sábado y Domingo.
5. Cada día debe incluir: Desayuno, Media Mañana, Almuerzo, Media Tarde y Cena.
6. Incluye macros aproximados, recomendaciones y advertencias.
7. Responde SOLO JSON válido.

ESTRUCTURA JSON OBLIGATORIA:
{
  "title": "Nombre del plan",
  "summary": "Enfoque del plan y por qué se eligieron estos alimentos",
  "daily_calories": 2500,
  "totalProtein": 150,
  "totalCarbs": 250,
  "totalFats": 80,
  "days": [
    {
      "day": "Lunes",
      "meals": [
        { "timeOfDay": "Desayuno", "name": "Comida simple", "description": "Descripción con porciones aproximadas" }
      ]
    }
  ],
  "warnings": ["Advertencia nutricional"],
  "recommendations": ["Consejo de adherencia o ahorro"]
}`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { responseMimeType: "application/json" }
      });

      const rawText = response.text;
      if (!rawText) throw new Error("No text returned from Gemini");
      res.json(cleanJSON(rawText));
    } catch (error: any) {
      console.error("Diet Generation Error:", error.message || error);
      res.status(500).json({ error: error.message });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
