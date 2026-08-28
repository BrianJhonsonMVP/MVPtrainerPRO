import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: corsHeaders,
});

const getLanguageInstruction = (language: string) => language === "en"
  ? "Write every human-readable field in English. Use day names Monday through Sunday."
  : "Escribe todos los campos legibles en español. Usa los días Lunes a Domingo.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader ?? "" } } },
    );
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return jsonResponse({ error: "Unauthorized" }, 401);

    const { clientData, language } = await req.json();
    if (!clientData?.name) return jsonResponse({ error: "Client data is required" }, 400);

    const apiKey = Deno.env.get("GEMINI_API_KEY") ?? Deno.env.get("GOOGLE_API_KEY");
    if (!apiKey) return jsonResponse({ error: "Gemini API key is not configured" }, 503);

    const model = Deno.env.get("GEMINI_MODEL") ?? "gemini-1.5-flash";
    const prompt = `Actúa como un Entrenador Personal de Élite. Genera una ruta de entrenamiento profesional y segura para este cliente.

DATOS DEL CLIENTE:
- Nombre: ${clientData.name}
- Edad: ${clientData.age || "No especificada"}
- Sexo: ${clientData.gender || "No especificado"}
- Peso: ${clientData.weight || "No especificado"} kg
- Talla: ${clientData.height || "No especificada"} cm
- Objetivo principal: ${clientData.mainGoal || "No especificado"}
- Objetivos secundarios: ${clientData.goals?.join(", ") || "Ninguno"}
- Nivel: ${clientData.experienceLevel || "No especificado"}
- Días disponibles: ${clientData.trainingDays?.join(", ") || "3 días"}
- Equipamiento: ${clientData.equipment || "Gimnasio completo"}
- Lesiones o limitaciones: ${clientData.injuries || "Ninguna"}
- Notas médicas: ${clientData.medicalNotes || "Sin observaciones"}

${getLanguageInstruction(language)}

Responde únicamente JSON válido con esta estructura:
{
  "name": "Nombre descriptivo",
  "description": "Resumen técnico de 2 frases",
  "tags": ["objetivo", "nivel", "frecuencia"],
  "days": [
    {
      "day": "Monday/Lunes",
      "exercises": [
        { "name": "Exercise", "sets": "3", "reps": "10-12", "rest": "60s", "notes": "Technical instruction" }
      ]
    }
  ]
}
Incluye los 7 días de la semana. En los días sin entrenamiento usa un arreglo exercises vacío. No añadas texto fuera del JSON.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );

    const raw = await response.text();
    if (!response.ok) {
      console.error("Gemini workout API error", response.status, raw.slice(0, 500));
      return jsonResponse({ error: `Gemini request failed (${response.status})`, isAiError: true }, response.status >= 500 ? 502 : response.status);
    }

    const result = JSON.parse(raw);
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return jsonResponse({ error: "Gemini returned an empty workout" }, 502);

    return new Response(text, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown AI error";
    console.error("Workout function error", message);
    return jsonResponse({ error: message, isAiError: true }, 502);
  }
});
