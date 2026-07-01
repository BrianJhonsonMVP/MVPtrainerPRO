
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
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })

    // 2. Obtener datos del cliente
    const { clientData } = await req.json()
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY')
    
    console.log(`AI Request start for client: ${clientData.name}`);

    const prompt = `Actúa como un Entrenador Personal de Élite. 
    Genera una RUTA DE ENTRENAMIENTO PROFESIONAL Y SEGURA para el siguiente cliente:
    
    DATOS DEL CLIENTE:
    - Nombre: ${clientData.name}
    - Edad: ${clientData.age || 'No especificada'}
    - Sexo: ${clientData.gender || 'No especificado'}
    - Peso: ${clientData.weight || 'No especificado'} kg
    - Talla: ${clientData.height || 'No especificada'} cm
    - Objetivo Principal: ${clientData.mainGoal}
    - Objetivos Secundarios: ${clientData.goals?.join(', ') || 'Ninguno'}
    - Nivel de Experiencia: ${clientData.experienceLevel}
    - Días Disponibles: ${clientData.trainingDays?.join(', ') || '3 días'}
    - Equipamiento: ${clientData.equipment || 'Gimnasio Completo'}
    - Lesiones/Limitaciones: ${clientData.injuries || 'Ninguna'}
    - Notas Médicas: ${clientData.medicalNotes || 'Sin observaciones'}
    
    ESTRUCTURA DE RESPUESTA (JSON estricto):
    {
      "name": "Nombre descriptivo de la rutina",
      "description": "Resumen técnico de 2 frases sobre el enfoque del entrenamiento.",
      "tags": ["objetivo", "nivel", "frecuencia"],
      "exercises": [
        {
          "day": "Día de la semana (Lunes, Martes, etc.)",
          "name": "Nombre del ejercicio",
          "sets": "Número de series (ej: 3)",
          "reps": "Rango de reps (ej: 10-12 o Al fallo)",
          "rest": "Tiempo de descanso (ej: 60s)",
          "notes": "Instrucción técnica clave"
        }
      ]
    }
    
    REGLA: Responde ÚNICAMENTE el objeto JSON. No añadas texto explicativo fuera del JSON. 
    Asegúrate de que los ejercicios coincidan con los días disponibles.`;

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
    console.log("AI response received");
    
    let text = result.candidates[0].content.parts[0].text
    console.log("AI JSON parsed");

    return new Response(text, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error("AI Error detail:", error.message);
    return new Response(JSON.stringify({ error: error.message, isAiError: true }), {
      status: 400,
      headers: corsHeaders,
    })
  }
})
