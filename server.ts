import dotenv from "dotenv";
import express, { NextFunction, Request, Response } from "express";
import path from "path";
import { readFile } from "fs/promises";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import react from "@vitejs/plugin-react";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const isCompiledServer = /(?:^|[\\/])dist[\\/]server\.cjs$/i.test(process.argv[1] || "");
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production" && !isCompiledServer;
const serverLog = (...args: unknown[]) => {
  if (IS_DEVELOPMENT) console.log(...args);
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  const configuredOrigins = (process.env.ALLOWED_ORIGINS || process.env.PUBLIC_APP_URL || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const allowedOrigins = new Set([
    ...configuredOrigins,
    ...(IS_DEVELOPMENT ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : [])
  ]);

  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      callback(new Error('Origen no permitido.'));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
  }));
  app.use(express.json({ limit: "15mb" }));

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const supabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.VITE_SUPABASE_ANON_KEY
    || '';
  const supabaseAuth = supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      })
    : null;

  const requireAuthenticatedUser = async (req: Request, res: Response, next: NextFunction) => {
    if (!supabaseAuth) {
      return res.status(503).json({ error: 'La validación de sesión no está configurada.', code: 'AUTH_NOT_CONFIGURED' });
    }

    const authorization = req.headers.authorization || '';
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!token) {
      return res.status(401).json({ error: 'Inicia sesión para usar la inteligencia artificial.', code: 'AUTH_REQUIRED' });
    }

    const { data, error } = await supabaseAuth.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ error: 'Tu sesión no es válida o ha vencido.', code: 'AUTH_INVALID' });
    }

    res.locals.authUserId = data.user.id;
    next();
  };

  const aiRateWindowMs = Number(process.env.AI_RATE_WINDOW_MS || 10 * 60 * 1000);
  const aiRateLimit = Number(process.env.AI_RATE_LIMIT || 30);
  const aiUsage = new Map<string, { count: number; resetAt: number }>();
  const enforceAiRateLimit = (_req: Request, res: Response, next: NextFunction) => {
    const userId = String(res.locals.authUserId || 'unknown');
    const now = Date.now();
    const current = aiUsage.get(userId);
    const usage = !current || current.resetAt <= now
      ? { count: 0, resetAt: now + aiRateWindowMs }
      : current;

    usage.count += 1;
    aiUsage.set(userId, usage);
    res.setHeader('X-RateLimit-Limit', aiRateLimit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, aiRateLimit - usage.count));
    res.setHeader('X-RateLimit-Reset', Math.ceil(usage.resetAt / 1000));

    if (usage.count > aiRateLimit) {
      return res.status(429).json({
        error: 'Has realizado muchas solicitudes seguidas. Espera unos minutos y vuelve a intentarlo.',
        code: 'AI_RATE_LIMITED'
      });
    }
    next();
  };

  const protectAi = [requireAuthenticatedUser, enforceAiRateLimit];

  const geminiKey = process.env.GEMINI_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY;
  const apiKey = googleKey || geminiKey || "";
  const apiKeySource = googleKey ? "GOOGLE_API_KEY" : geminiKey ? "GEMINI_API_KEY" : "none";
  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
  const GEMINI_API_BASE_URL = process.env.GEMINI_API_BASE_URL || "https://generativelanguage.googleapis.com/v1beta";
  const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS || 45000);

  serverLog("GEMINI_API_KEY exists:", Boolean(geminiKey));
  serverLog("GEMINI_API_KEY length:", geminiKey?.length || 0);
  serverLog("GOOGLE_API_KEY exists:", Boolean(googleKey));
  serverLog("GOOGLE_API_KEY length:", googleKey?.length || 0);
  serverLog("Gemini API configured:", Boolean(apiKey));
  serverLog("Gemini key source:", apiKeySource);
  serverLog("Gemini model:", GEMINI_MODEL);

  type AppLanguage = "es" | "en";
  const normalizeLanguage = (value: any): AppLanguage => value === "en" ? "en" : "es";
  const languageName = (language: AppLanguage) => language === "en" ? "English" : "Spanish";
  const localizedDayList = (language: AppLanguage) => language === "en"
    ? "Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday"
    : "Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo";
  const localizedMealList = (language: AppLanguage) => language === "en"
    ? "Breakfast, Morning Snack, Lunch, Afternoon Snack, Dinner"
    : "Desayuno, Media Mañana, Almuerzo, Media Tarde, Cena";
  const outputLanguageRule = (language: AppLanguage) =>
    `OUTPUT LANGUAGE: Write every user-facing value in ${languageName(language)}. Keep JSON property names exactly as requested. Do not translate client names, phone numbers, emails or exact proper nouns.`;

  const cleanJSON = (text: string) => {
    const withoutFences = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const firstBrace = withoutFences.indexOf("{");
    const lastBrace = withoutFences.lastIndexOf("}");
    const clean = firstBrace >= 0 && lastBrace > firstBrace
      ? withoutFences.slice(firstBrace, lastBrace + 1)
      : withoutFences;

    try {
      return JSON.parse(clean);
    } catch (e) {
      if (IS_DEVELOPMENT) {
        console.error("Failed to parse Gemini JSON response.", { length: text.length });
      }
      throw e;
    }
  };

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  const extractGeminiText = (data: any) => {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return "";
    return parts.map((part: any) => part?.text || "").join("").trim();
  };

  const isRetryableGeminiError = (error: any) => {
    const status = error?.status;
    return !status || status === 408 || status === 429 || status >= 500;
  };

  const getGeminiResponseStatus = (error: any) => {
    if (error?.status === 429) return 429;
    if (error?.status === 408) return 504;
    if (error?.status >= 500 && error?.status <= 599) return error.status;
    if ([400, 401, 403, 404].includes(error?.status)) return 400;
    return 502;
  };

  const callGeminiParts = async (parts: any[], temperature: number, responseMimeType = "application/json") => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    const url = `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const generationConfig: any = {
      temperature,
      topP: temperature > 0.3 ? 0.9 : 0.7
    };

    if (responseMimeType) {
      generationConfig.responseMimeType = responseMimeType;
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "mvp-trainer-pro"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts
            }
          ],
          generationConfig
        }),
        signal: controller.signal
      });

      const rawBody = await response.text();
      let data: any = null;
      try {
        data = rawBody ? JSON.parse(rawBody) : null;
      } catch {
        data = null;
      }

      if (!response.ok) {
        const apiMessage = data?.error?.message || rawBody || response.statusText;
        const error: any = new Error(`Gemini HTTP ${response.status}: ${apiMessage}`);
        error.status = response.status;
        error.code = data?.error?.status || response.statusText;
        throw error;
      }

      const text = extractGeminiText(data);
      if (!text) {
        throw new Error("Gemini no devolvió texto utilizable.");
      }

      return text;
    } catch (error: any) {
      if (error?.name === "AbortError") {
        const timeoutError: any = new Error(`Gemini timeout después de ${GEMINI_TIMEOUT_MS / 1000}s.`);
        timeoutError.status = 408;
        timeoutError.code = "GEMINI_TIMEOUT";
        throw timeoutError;
      }

      if (error?.message === "fetch failed") {
        const networkError: any = new Error("No se pudo conectar con Gemini. Revisa internet, firewall, VPN o acceso a generativelanguage.googleapis.com.");
        networkError.code = "GEMINI_NETWORK_ERROR";
        networkError.cause = error;
        throw networkError;
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  };

  const callGeminiRest = async (prompt: string, temperature: number) => {
    return callGeminiParts([{ text: prompt }], temperature);
  };

  const extractTranscriptFromGeminiText = (rawText: string) => {
    let text = String(rawText || "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();

    try {
      const parsed = JSON.parse(text);
      const transcript = String(parsed?.transcript || "").trim();
      if (transcript) return transcript;
    } catch {
      // Voice transcription can safely fall back to plain text.
    }

    const transcriptMatch = text.match(/"transcript"\s*:\s*"([\s\S]*)"?\s*}?$/i);
    if (transcriptMatch?.[1]) {
      text = transcriptMatch[1];
    }

    return text
      .replace(/^["']+|["'}\s]+$/g, "")
      .replace(/\\n/g, "\n")
      .replace(/\\"/g, '"')
      .trim();
  };

  const generateGeminiJSON = async (prompt: string, temperature: number) => {
    let lastError: any = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      const retryPrompt = lastError?.name === "SyntaxError"
        ? `${prompt}\n\nTu respuesta anterior no pudo parsearse como JSON. Reenvia SOLO JSON valido, sin markdown, sin texto extra y sin comas faltantes.`
        : prompt;
      try {
        const rawText = await callGeminiRest(retryPrompt, attempt === 0 ? temperature : 0.25);
        return cleanJSON(rawText);
      } catch (error) {
        lastError = error;
        const shouldRetry = attempt < 2 && (lastError?.name === "SyntaxError" || isRetryableGeminiError(lastError));
        if (IS_DEVELOPMENT) {
          console.warn("Gemini attempt failed", {
            attempt: attempt + 1,
            retrying: shouldRetry,
            status: lastError?.status,
            code: lastError?.code,
            message: lastError?.message
          });
        }
        if (!shouldRetry) break;
        await sleep(600 * (attempt + 1));
      }
    }

    throw lastError || new Error("Gemini no devolvió JSON válido.");
  };

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/organize-client-goals", ...protectAi, async (req, res) => {
    try {
      if (!apiKey) throw new Error("Gemini API key is not configured.");

      const transcript = String(req.body?.transcript || "").trim();
      const outputLanguage = normalizeLanguage(req.body?.language);
      if (!transcript) {
        return res.status(400).json({
          error: "La transcripcion esta vacia.",
          code: "EMPTY_TRANSCRIPT"
        });
      }

      const prompt = `Actua como un asistente profesional de un entrenador personal.
Ordena esta informacion hablada en campos claros para registrar un cliente nuevo.
No inventes datos. No exageres. Manten un tono profesional, simple y practico.
Si un dato no fue mencionado, dejalo como cadena vacia o arreglo vacio.
La transcripcion puede estar en español, inglés o una mezcla de ambos.
${outputLanguageRule(outputLanguage)}
Para campos libres como clientGoalSummary, medicalConsiderations, routineFocus y dietFocus escribe en ${languageName(outputLanguage)}.

TRANSCRIPCION:
${transcript}

OBJETIVOS PRINCIPALES PERMITIDOS:
Bajar grasa, Ganar masa muscular, Recomposicion corporal, Definir / tonificar, Gluteos y piernas, Abdomen y core, Aumentar fuerza, Mejorar resistencia fisica, Mejorar salud general, Movilidad / flexibilidad, Rendimiento deportivo, Mantenerse activo.

ENFOQUES SECUNDARIOS PERMITIDOS:
Bajar abdomen, Aumentar gluteos, Aumentar piernas, Definir brazos, Mejorar postura, Mejorar cardio, Ganar fuerza, Mejorar flexibilidad, Reducir cintura, Crear habito de entrenamiento.

DIAS PERMITIDOS:
Lunes, Martes, Miercoles, Jueves, Viernes, Sabado, Domingo.
Si el entrenador menciona dias en ingles, conviertelos a estos valores internos en español.

NIVELES PERMITIDOS:
beginner, intermediate, advanced.

GENERO PERMITIDO:
male, female, other.

Responde SOLO JSON valido con esta estructura:
{
  "name": "Nombre completo del cliente o vacio",
  "email": "Email si se menciona o vacio",
  "phone": "Telefono si se menciona o vacio",
  "age": "Edad en numero o vacio",
  "weight": "Peso en kg, solo numero o vacio",
  "height": "Altura en cm, solo numero o vacio",
  "gender": "male, female, other o vacio",
  "country": "Pais si se menciona o vacio",
  "experienceLevel": "beginner, intermediate, advanced o vacio",
  "primaryGoal": "Uno de los objetivos principales permitidos o vacio",
  "secondaryGoals": ["Solo enfoques secundarios permitidos"],
  "clientGoalSummary": "Resumen claro de la meta del cliente",
  "medicalConsiderations": "Condicion medica, lesion o limitacion si se menciona; si no, vacio",
  "routineFocus": "Enfoque recomendado para rutina",
  "dietFocus": "Enfoque recomendado para dieta",
  "trainingDays": ["Dias permitidos mencionados"],
  "trainingStartTime": "HH:MM en 24h si se menciona o vacio",
  "trainingEndTime": "HH:MM en 24h si se menciona o vacio",
  "monthlyFee": "Mensualidad en numero o vacio"
}`;

      const parsed = await generateGeminiJSON(prompt, 0.25);
      res.json(parsed);
    } catch (error: any) {
      console.error("Goal Organizer Error:", error.message || error);
      res.status(getGeminiResponseStatus(error)).json({
        error: error.message,
        code: error.code || "GOAL_ORGANIZER_FAILED"
      });
    }
  });

  app.post("/api/transcribe-client-goals", ...protectAi, async (req, res) => {
    try {
      if (!apiKey) throw new Error("Gemini API key is not configured.");

      const { audioBase64, mimeType } = req.body || {};
      const cleanAudio = String(audioBase64 || "").replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, "");
      if (!cleanAudio || cleanAudio.length < 500) {
        return res.status(400).json({
          error: "No se recibio audio suficiente para transcribir.",
          code: "VOICE_AUDIO_EMPTY"
        });
      }

      const safeMimeType = typeof mimeType === "string" && mimeType.startsWith("audio/")
        ? mimeType.split(";")[0]
        : "audio/webm";

      const prompt = `Detecta automaticamente el idioma del audio y transcribe en el mismo idioma hablado.
El audio corresponde a un entrenador registrando objetivos de un cliente.
No inventes datos. Si hay pausas o frases incompletas, conserva el sentido principal.
Si el entrenador mezcla español e inglés, conserva el significado natural sin forzar traduccion.
Devuelve SOLO JSON valido.

ESTRUCTURA:
{
  "transcript": "texto claro y completo de lo que dijo el entrenador"
}`;

      serverLog("Calling Gemini voice transcription", {
        mimeType: safeMimeType,
        audioKb: Math.round(cleanAudio.length * 0.75 / 1024)
      });

      const rawText = await callGeminiParts([
        { text: prompt },
        {
          inline_data: {
            mime_type: safeMimeType,
            data: cleanAudio
          }
        }
      ], 0.1, "");

      const transcript = extractTranscriptFromGeminiText(rawText);
      if (!transcript) {
        return res.status(422).json({
          error: "Gemini no devolvio una transcripcion utilizable.",
          code: "VOICE_TRANSCRIPT_EMPTY"
        });
      }

      serverLog("Gemini voice transcription success", {
        chars: transcript.length
      });
      res.json({ transcript });
    } catch (error: any) {
      console.error("Voice Transcription Error:", error.message || error);
      res.status(getGeminiResponseStatus(error)).json({
        error: error.message,
        code: error.code || "VOICE_TRANSCRIPTION_FAILED"
      });
    }
  });

  app.post("/api/generate-workout", ...protectAi, async (req, res) => {
    try {
      if (!apiKey) throw new Error("Gemini API key is not configured.");

      const { clientData } = req.body;
      const outputLanguage = normalizeLanguage(req.body?.language);
      const medicalNotes = clientData?.medicalNotes || clientData?.injuries || clientData?.restrictions || "Ninguna indicada";
      serverLog("Calling Gemini workout", {
        model: GEMINI_MODEL,
        hasClient: Boolean(clientData?.name),
        goal: clientData?.mainGoal || clientData?.goals?.[0] || "not-set"
      });
      const prompt = `Actúa como un entrenador personal de élite.
Genera una rutina profesional, segura y realista para este cliente.
${outputLanguageRule(outputLanguage)}

DATOS DEL CLIENTE:
- Nombre: ${clientData.name}
- Edad: ${clientData.age || "No especificada"}
- Sexo: ${clientData.gender || "No especificado"}
- Peso: ${clientData.weight ? clientData.weight + "kg" : "No especificado"}
- Altura: ${clientData.height ? clientData.height + "cm" : "No especificada"}
- País: ${clientData.country || "No especificado"}
- Objetivo principal: ${clientData.mainGoal || clientData.goals?.[0] || "No especificado"}
- Objetivos adicionales: ${Array.isArray(clientData.goals) ? clientData.goals.join(", ") : "No especificados"}
- Meta especifica del cliente: ${clientData.clientGoalSummary || "No especificada"}
- Enfoque deseado para rutina: ${clientData.routineFocus || "No especificado"}
- Nivel: ${clientData.experienceLevel || "No especificado"}
- Días disponibles: ${Array.isArray(clientData.trainingDays) ? clientData.trainingDays.join(", ") : "3 días/semana"}
- Horario de entrenamiento: ${clientData.trainingTime || "No especificado"}
- Condicion medica, lesion o limitacion a considerar: ${medicalNotes}
- Semilla de variación interna: ${Date.now()}-${Math.random().toString(36).slice(2)}

REGLAS:
1. Prioriza seguridad, progresión y técnica.
2. Adapta volumen/intensidad al nivel y objetivo.
3. Usa ejercicios realistas para un entrenador personal.
4. Incluye guía de ejecución y errores comunes.
5. Los días disponibles son agenda/servicio contratado, no el límite del plan recomendado.
6. Genera exactamente 7 dias visibles en este idioma: ${localizedDayList(outputLanguage)}.
7. Lunes a Sabado deben tener una sesion util y clara con enfoque, ejercicios o actividad estructurada. No reduzcas los dias no contratados a solo caminata o descanso salvo que una condicion medica lo justifique.
8. Domingo debe ser recuperacion activa, movilidad, caminata suave, estiramientos o descanso activo.
9. No entregues una plantilla generica: personaliza por objetivo, nivel, pais, peso, edad, condicion medica y horario.
10. Usa nombres comunes y entendibles de ejercicios. Si un nombre tecnico aporta valor, acompañalo con el nombre comun.
11. Evita titulos rebuscados como "activacion neuromuscular avanzada" si no aportan claridad. Prefiere "Tren inferior y gluteos", "Espalda y brazos", "Core y abdomen", "Cardio moderado" o "Recuperacion activa".
12. Usa emojis solo de forma moderada en titulos, advertencias o recomendaciones si ayudan. No uses emoji en cada ejercicio.
13. Responde SOLO JSON valido. No uses comentarios, markdown, comas colgantes ni texto fuera del JSON.

ESTRUCTURA JSON OBLIGATORIA:
{
  "title": "Nombre de rutina",
  "summary": "Resumen técnico enfocado en los objetivos del cliente",
  "days": [
    {
      "day": "${outputLanguage === "en" ? "Monday" : "Lunes"}",
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

      const parsed = await generateGeminiJSON(prompt, 0.75);
      serverLog("Gemini workout success", {
        days: Array.isArray(parsed.days) ? parsed.days.length : 0
      });
      res.json(parsed);
    } catch (error: any) {
      console.error("Workout Generation Error:", error.message || error);
      res.status(getGeminiResponseStatus(error)).json({
        error: error.message,
        code: error.code || "GEMINI_REQUEST_FAILED"
      });
    }
  });

  app.post("/api/generate-diet", ...protectAi, async (req, res) => {
    try {
      if (!apiKey) throw new Error("Gemini API key is not configured.");

      const { clientData } = req.body;
      const outputLanguage = normalizeLanguage(req.body?.language);
      const country = clientData.country || "General";
      const medicalNotes = clientData?.medicalNotes || clientData?.injuries || clientData?.restrictions || "Ninguna indicada";
      serverLog("Calling Gemini diet", {
        model: GEMINI_MODEL,
        hasClient: Boolean(clientData?.name),
        country,
        goal: clientData?.mainGoal || clientData?.goals?.[0] || "not-set"
      });
      const prompt = `Actúa como nutricionista deportivo experto.
Genera un plan nutricional profesional, accesible, realista y personalizado.
${outputLanguageRule(outputLanguage)}

CLIENTE:
- Nombre: ${clientData.name}
- Sexo: ${clientData.gender || "No especificado"}
- Edad: ${clientData.age || "No especificada"}
- Objetivo: ${clientData.mainGoal || clientData.goals?.[0] || "No especificado"}
- Objetivos adicionales: ${Array.isArray(clientData.goals) ? clientData.goals.join(", ") : "No especificados"}
- Meta especifica del cliente: ${clientData.clientGoalSummary || "No especificada"}
- Enfoque deseado para dieta: ${clientData.dietFocus || "No especificado"}
- Peso: ${clientData.weight || "No especificado"}kg
- Altura: ${clientData.height || "No especificada"}cm
- País: ${country}
- Condicion medica, lesion, alergia o limitacion a considerar: ${medicalNotes}
- Días/horario de entrenamiento: ${Array.isArray(clientData.trainingDays) ? clientData.trainingDays.join(", ") : "No especificados"} / ${clientData.trainingTime || "No especificado"}
- Semilla de variación interna: ${Date.now()}-${Math.random().toString(36).slice(2)}

REQUISITOS:
1. Prioriza alimentos económicos, fáciles de conseguir y realistas para ${country}.
2. Evita recetas gourmet complejas, ingredientes raros y suplementos innecesarios.
3. Si el país es Perú, usa opciones como pollo, huevos, arroz, avena, camote, plátano, queso fresco, menestras, pescado local y frutas de estación.
4. Incluye los 7 días completos visibles en este idioma: ${localizedDayList(outputLanguage)}.
5. Cada día debe incluir estas comidas visibles en este idioma: ${localizedMealList(outputLanguage)}.
6. Incluye macros aproximados, recomendaciones y advertencias.
7. No entregues una plantilla generica: adapta por objetivo, peso, edad, pais, nivel, restricciones y condicion medica.
8. Usa emojis de forma moderada solo en titulos, advertencias o recomendaciones si ayudan. No recargues cada comida.
9. Responde SOLO JSON válido. No uses comentarios, markdown, comas colgantes ni texto fuera del JSON.

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
      "day": "${outputLanguage === "en" ? "Monday" : "Lunes"}",
      "meals": [
        { "timeOfDay": "${outputLanguage === "en" ? "Breakfast" : "Desayuno"}", "name": "Comida simple", "description": "Descripción con porciones aproximadas" }
      ]
    }
  ],
  "warnings": ["Advertencia nutricional"],
  "recommendations": ["Consejo de adherencia o ahorro"]
}`;

      const parsed = await generateGeminiJSON(prompt, 0.7);
      serverLog("Gemini diet success", {
        days: Array.isArray(parsed.days) ? parsed.days.length : 0
      });
      res.json(parsed);
    } catch (error: any) {
      console.error("Diet Generation Error:", error.message || error);
      res.status(getGeminiResponseStatus(error)).json({
        error: error.message,
        code: error.code || "GEMINI_REQUEST_FAILED"
      });
    }
  });

  if (IS_DEVELOPMENT) {
    const vite = await createViteServer({
      configFile: false,
      root: process.cwd(),
      plugins: [react()],
      resolve: {
        alias: {
          "@": path.resolve(process.cwd(), ".")
        }
      },
      server: {
        middlewareMode: true,
        host: "0.0.0.0",
        port: PORT
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    const indexPath = path.join(distPath, "index.html");
    app.use(express.static(distPath));
    app.get("/entrenador/:slug", async (req, res) => {
      try {
        let html = await readFile(indexPath, "utf8");
        if (supabaseAuth) {
          const profileKey = req.params.slug;
          const lookupColumn = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(profileKey) ? "id" : "slug";
          const { data } = await supabaseAuth
            .from("public_profiles")
            .select("slug, trainer_name, professional_title, headline, description, avatar_url, logo_url, brand_name")
            .eq(lookupColumn, profileKey)
            .eq("is_published", true)
            .maybeSingle();
          if (data) {
            const escapeHtml = (value: unknown) => String(value || "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
            const title = escapeHtml(data.trainer_name || data.brand_name || data.professional_title || "Personal Trainer");
            const description = escapeHtml(data.headline || data.description || "Entrenamiento personalizado y contacto directo con tu entrenador.");
            const image = escapeHtml(data.avatar_url || data.logo_url || `${process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`}/brand/mvp-trainer-pro-logo.png`);
            const url = escapeHtml(`${process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`}/entrenador/${encodeURIComponent(data.slug)}`);
            const socialMeta = [
              `<meta property="og:type" content="profile" />`,
              `<meta property="og:title" content="${title}" />`,
              `<meta property="og:description" content="${description}" />`,
              `<meta property="og:image" content="${image}" />`,
              `<meta property="og:url" content="${url}" />`,
              `<meta name="twitter:card" content="summary_large_image" />`,
              `<meta name="twitter:title" content="${title}" />`,
              `<meta name="twitter:description" content="${description}" />`,
              `<meta name="twitter:image" content="${image}" />`
            ].join("\n    ");
            html = html
              .replace(/\s*<meta\s+(?:property|name)="(?:og:[^"]+|twitter:[^"]+)"[^>]*>\s*/gi, "\n    ")
              .replace(/<title>.*?<\/title>/i, `<title>${title}</title>`)
              .replace("</head>", `    ${socialMeta}\n  </head>`);
          }
        }
        res.type("html").send(html);
      } catch (error) {
        console.error("Public profile metadata error:", error);
        res.sendFile(indexPath);
      }
    });
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(indexPath);
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
