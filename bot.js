/**
 * 🤖 Binance Square Bot
 * Genera y publica 15 posts al día con IA (Groq - GRATIS)
 * Temas: señales, cortos/largos, noticias crypto
 *
 * Instalación:
 *   npm install node-cron node-fetch dotenv
 *
 * Uso:
 *   node bot.js
 */

import cron from "node-cron";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

// ─────────────────────────────────────────
// CONFIGURACIÓN
// ─────────────────────────────────────────
const BINANCE_SQUARE_API_KEY = process.env.BINANCE_SQUARE_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;

const BINANCE_SQUARE_URL =
  "https://www.binance.com/bapi/composite/v1/public/pgc/openApi/content/add";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

// 15 horarios distribuidos a lo largo del día (hora:minuto)
const SCHEDULE_TIMES = [
  "00:30", "02:00", "04:00", "06:00", "07:30",
  "09:00", "10:30", "12:00", "13:30", "15:00",
  "16:30", "18:00", "19:30", "21:00", "22:30",
];

// Tipos de posts que rotará el bot
const POST_TYPES = [
  "señal_largo",
  "señal_corto",
  "analisis_btc",
  "analisis_eth",
  "noticia_crypto",
  "consejo_trading",
  "resumen_mercado",
];

// ─────────────────────────────────────────
// PROMPTS POR TIPO DE POST
// ─────────────────────────────────────────
function buildPrompt(type) {
  const base = `Eres un experto en trading de criptomonedas. Escribe una publicación para Binance Square en español.
La publicación debe ser natural, informativa y atractiva. Máximo 300 palabras.
Incluye emojis relevantes. Termina siempre con 3-5 hashtags relevantes como #BTC #Crypto #Trading.
NO uses markdown, NO uses asteriscos, escribe en texto plano.`;

  const prompts = {
    señal_largo: `${base}
Tipo: SEÑAL DE LARGO (compra)
Genera una señal de entrada LONG para una criptomoneda popular (BTC, ETH, SOL, BNB, etc).
Incluye: moneda, precio de entrada aproximado, zona de stop loss, objetivo de precio, y razón técnica breve.
Ejemplo de formato:
🟢 SEÑAL LONG - [MONEDA]
Entrada: $X
Stop Loss: $X  
Target: $X
Razón: [análisis]`,

    señal_corto: `${base}
Tipo: SEÑAL DE CORTO (venta)
Genera una señal de entrada SHORT para una criptomoneda.
Incluye: moneda, precio de entrada aproximado, zona de stop loss, objetivo de precio, y razón técnica breve.
Ejemplo de formato:
🔴 SEÑAL SHORT - [MONEDA]
Entrada: $X
Stop Loss: $X
Target: $X
Razón: [análisis]`,

    analisis_btc: `${base}
Tipo: ANÁLISIS BITCOIN
Escribe un análisis técnico breve de Bitcoin hoy.
Menciona niveles clave de soporte y resistencia, tendencia actual, y qué esperar a corto plazo.`,

    analisis_eth: `${base}
Tipo: ANÁLISIS ETHEREUM
Escribe un análisis técnico breve de Ethereum hoy.
Menciona niveles clave de soporte y resistencia, tendencia actual, y qué esperar a corto plazo.`,

    noticia_crypto: `${base}
Tipo: NOTICIA / ACTUALIDAD CRYPTO
Inventa una noticia plausible y positiva del mundo crypto de hoy (puede ser sobre adopción institucional, regulación favorable, nuevo proyecto, actualización de red, etc).
Hazla sonar como un resumen noticioso real.`,

    consejo_trading: `${base}
Tipo: CONSEJO DE TRADING
Comparte un consejo de trading o gestión de riesgo valioso para traders de criptomonedas.
Puede ser sobre psicología, gestión de capital, análisis técnico, o estrategia.`,

    resumen_mercado: `${base}
Tipo: RESUMEN DE MERCADO
Escribe un resumen del estado actual del mercado crypto.
Menciona el sentimiento general (alcista/bajista/lateral), las criptomonedas que destacan hoy, y una perspectiva breve.`,
  };

  return prompts[type] || prompts["resumen_mercado"];
}

// ─────────────────────────────────────────
// GENERAR CONTENIDO CON IA (Groq - GRATIS)
// ─────────────────────────────────────────
async function generatePostContent(type) {
  const prompt = buildPrompt(type);

  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "system",
          content: "Eres un experto en trading de criptomonedas que escribe publicaciones para Binance Square en español.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// ─────────────────────────────────────────
// PUBLICAR EN BINANCE SQUARE
// ─────────────────────────────────────────
async function publishToSquare(content) {
  const response = await fetch(BINANCE_SQUARE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Square-OpenAPI-Key": BINANCE_SQUARE_API_KEY,
      clienttype: "web",
    },
    body: JSON.stringify({
      bodyTextOnly: content,
    }),
  });

  const data = await response.json();

  if (data.code !== "000000") {
    throw new Error(`Binance Square error: ${JSON.stringify(data)}`);
  }

  return data.data?.id || "unknown";
}

// ─────────────────────────────────────────
// LÓGICA PRINCIPAL DE UNA PUBLICACIÓN
// ─────────────────────────────────────────
let postIndex = 0;

async function runPost() {
  const type = POST_TYPES[postIndex % POST_TYPES.length];
  postIndex++;

  console.log(`\n[${new Date().toLocaleString()}] 📝 Generando post tipo: ${type}`);

  try {
    const content = await generatePostContent(type);
    console.log("✅ Contenido generado:\n", content.substring(0, 100) + "...");

    const postId = await publishToSquare(content);
    console.log(`🚀 Publicado en Binance Square! ID: ${postId}`);
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

// ─────────────────────────────────────────
// VERIFICACIÓN INICIAL
// ─────────────────────────────────────────
function validateConfig() {
  if (!BINANCE_SQUARE_API_KEY) {
    console.error("❌ Falta BINANCE_SQUARE_API_KEY en el archivo .env");
    process.exit(1);
  }
  if (!GROQ_API_KEY) {
    console.error("❌ Falta GROQ_API_KEY en el archivo .env");
    process.exit(1);
  }
}

// ─────────────────────────────────────────
// PROGRAMAR LOS 15 POSTS DIARIOS
// ─────────────────────────────────────────
function startScheduler() {
  console.log("🤖 Binance Square Bot iniciado (Groq - GRATIS)");
  console.log(`📅 Se publicarán ${SCHEDULE_TIMES.length} posts al día en estos horarios:`);
  console.log(SCHEDULE_TIMES.join(", "));

  SCHEDULE_TIMES.forEach((time) => {
    const [hour, minute] = time.split(":");
    const cronExpr = `${minute} ${hour} * * *`;

    cron.schedule(cronExpr, () => {
      runPost();
    });

    console.log(`⏰ Programado: ${time}`);
  });

  // Post de prueba inmediato al iniciar (opcional, comentar si no se quiere)
  console.log("\n🔥 Ejecutando post de prueba inicial...");
  runPost();
}

// ─────────────────────────────────────────
// INICIO
// ─────────────────────────────────────────
validateConfig();
startScheduler();
