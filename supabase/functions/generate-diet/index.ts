
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    // 1. Validar Usuario
    const { data: { user } } = await supabaseClient.auth.getUser()
    if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    // 2. Obtener datos del cliente
    const { clientData } = await req.json()
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    
    console.log(`AI Nutrition Request start for client: ${clientData.name}`);

    const prompt = `Actúa como un Nutricionista Deportivo de Élite. 
    Genera un PLAN NUTRICIONAL SEMANAL PERSONALIZADO para el siguiente cliente:
    
    DATOS DEL CLIENTE:
    - Nombre: ${clientData.name}
    - Edad: ${clientData.age || 'No especificada'}
    - Sexo: ${clientData.gender || 'No especificado'}
    - Peso: ${clientData.weight || 'No especificado'} kg
    - Talla: ${clientData.height || 'No especificada'} cm
    - Objetivo: ${clientData.mainGoal}
    - Nivel de Actividad: ${clientData.experienceLevel}
    - País/Región: ${clientData.country || 'No especificado'} (Usa ingredientes locales)
    - Preferencias/Alergias: ${clientData.preferences || 'Ninguna'}
    - Notas Médicas: ${clientData.medicalNotes || 'Sin observaciones'}
    
    INSTRUCCIONES TÉCNICAS:
    1. Calcula Macros y Calorías aproximadas.
    2. Usa platos típicos de su región si es posible.
    3. Estructura el plan para 7 días.
    
    ESTRUCTURA DE RESPUESTA (JSON estricto):
    {
      "title": "Nombre del plan nutricional",
      "notes": "Consejos clave de hidratación y descanso (2-3 frases).",
      "totalKcal": 2400,
      "totalProtein": 180,
      "totalCarbs": 250,
      "totalFats": 80,
      "days": [
        {
          "day": "Lunes",
          "meals": [
            { "timeOfDay": "Desayuno", "name": "Nombre del plato", "description": "Ingredientes y cantidades aproximadas" }
          ]
        }
      ]
    }
    
    REGLA: Responde ÚNICAMENTE el objeto JSON. No añadas texto explicativo.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          response_mime_type: "application/json"
        }
      })
    })

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Gemini API Error:", errorData);
      throw new Error("Error calling Gemini API");
    }

    const result = await response.json()
    console.log("AI Nutrition response received");
    
    let text = result.candidates[0].content.parts[0].text
    console.log("AI JSON parsed");

    return new Response(text, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error("AI Nutrition Error detail:", error.message);
    return new Response(JSON.stringify({ error: error.message, isAiError: true }), {
      status: 400,
      headers: corsHeaders,
    })
  }
})
