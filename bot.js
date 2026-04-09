/**
 * Bot Binance Square
 * 15 posts al dia con IA (Groq - GRATIS) + precios reales
 */

import cron from "node-cron";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const BINANCE_SQUARE_API_KEY = process.env.BINANCE_SQUARE_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const BINANCE_SQUARE_URL = "https://www.binance.com/bapi/composite/v1/public/pgc/openApi/content/add";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_MODEL = "llama-3.3-70b-versatile";

const SCHEDULE_TIMES = [
  "00:30","02:00","04:00","06:00","07:30",
  "09:00","10:30","12:00","13:30","15:00",
  "16:30","18:00","19:30","21:00","22:30",
];

const POST_TYPES = [
  "senal_largo",
  "senal_corto",
  "analisis_btc",
  "analisis_eth",
  "analisis_sol",
  "noticia_crypto",
  "consejo_trading",
  "resumen_mercado",
  "frase_motivacional",
  "comparativa",
];

// PRECIOS REALES DE BINANCE
async function getLivePrices() {
  try {
    const symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"];
    const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`;
    const res = await fetch(url);
    const data = await res.json();
    const prices = {};
    for (const item of data) {
      const symbol = item.symbol.replace("USDT", "");
      prices[symbol] = {
        price: parseFloat(item.lastPrice).toFixed(2),
        change: parseFloat(item.priceChangePercent).toFixed(2),
      };
    }
    console.log("Precios obtenidos:", JSON.stringify(prices));
    return prices;
  } catch (e) {
    console.error("No se pudieron obtener precios:", e.message);
    return null;
  }
}

// PROMPTS
function buildPrompt(type, prices) {
  const pc = prices
    ? `Precios REALES actuales (USALOS EXACTAMENTE, no inventes otros):
BTC: $${prices.BTC?.price} (${prices.BTC?.change}% 24h)
ETH: $${prices.ETH?.price} (${prices.ETH?.change}% 24h)
SOL: $${prices.SOL?.price} (${prices.SOL?.change}% 24h)
BNB: $${prices.BNB?.price} (${prices.BNB?.change}% 24h)
XRP: $${prices.XRP?.price} (${prices.XRP?.change}% 24h)`
    : "";

  const base = `Eres un experto en trading de criptomonedas. Escribe una publicacion para Binance Square en espanol.
Natural, informativa y atractiva. Maximo 300 palabras. Incluye emojis.
Termina con 3-5 hashtags como #BTC #Crypto #Trading.
NO uses markdown ni asteriscos, solo texto plano.
${pc}`;

  const prompts = {
    senal_largo: `${base}
Tipo: SENAL LONG (compra). Usa los precios reales de arriba.
Stop loss = precio actual - 3%. Target = precio actual + 6%.
Formato:
SENAL LONG - [MONEDA]
Entrada: $X
Stop Loss: $X
Target: $X
Razon: [analisis breve]`,

    senal_corto: `${base}
Tipo: SENAL SHORT (venta). Usa los precios reales de arriba.
Stop loss = precio actual + 3%. Target = precio actual - 6%.
Formato:
SENAL SHORT - [MONEDA]
Entrada: $X
Stop Loss: $X
Target: $X
Razon: [analisis breve]`,

    analisis_btc: `${base}
Tipo: ANALISIS BITCOIN
Precio actual BTC: $${prices?.BTC?.price} (${prices?.BTC?.change}% en 24h).
Analisis tecnico: menciona ese precio exacto, soportes y resistencias cercanos, tendencia y perspectiva corto plazo.`,

    analisis_eth: `${base}
Tipo: ANALISIS ETHEREUM
Precio actual ETH: $${prices?.ETH?.price} (${prices?.ETH?.change}% en 24h).
Analisis tecnico: menciona ese precio exacto, soportes y resistencias cercanos, tendencia y perspectiva corto plazo.`,

    analisis_sol: `${base}
Tipo: ANALISIS SOLANA
Precio actual SOL: $${prices?.SOL?.price} (${prices?.SOL?.change}% en 24h).
Analisis tecnico: menciona ese precio exacto, soportes y resistencias cercanos, tendencia y perspectiva corto plazo.`,

    noticia_crypto: `${base}
Tipo: NOTICIA CRYPTO
Escribe un resumen noticioso sobre una tendencia reciente del mundo crypto (adopcion institucional, regulacion, actualizacion de red, nuevo proyecto, etc).
Menciona BTC ($${prices?.BTC?.price}) y ETH ($${prices?.ETH?.price}) como contexto de mercado.`,

    consejo_trading: `${base}
Tipo: CONSEJO DE TRADING
Comparte un consejo valioso y practico sobre trading, gestion de riesgo o psicologia del mercado crypto. Que sea util para traders de todos los niveles.`,

    resumen_mercado: `${base}
Tipo: RESUMEN DE MERCADO
Usa los precios reales para hacer un resumen del mercado crypto de hoy.
Menciona que sube, que baja, el sentimiento general y una perspectiva breve.`,

    frase_motivacional: `${base}
Tipo: FRASE MOTIVACIONAL / MEME CRYPTO
Escribe un post divertido, inspirador o con humor sobre el mundo crypto.
Puede ser una frase motivacional para holders, un chiste sobre las bajas del mercado, 
una referencia a "HODL", "to the moon", "buy the dip", o la vida del trader.
Hazlo entretenido y que genere engagement. Usa emojis generosamente.`,

    comparativa: `${base}
Tipo: COMPARATIVA DE CRIPTOMONEDAS
Compara 2 criptomonedas de los precios reales de arriba (ejemplo BTC vs ETH, o SOL vs BNB).
Menciona los precios reales, rendimiento en 24h, y cual tiene mejor perspectiva a corto plazo y por que.
Formato claro tipo "BTC vs ETH: cual elegir hoy?"`,
  };

  return prompts[type] || prompts["resumen_mercado"];
}

// GENERAR CONTENIDO CON GROQ
async function generatePostContent(type, prices) {
  const prompt = buildPrompt(type, prices);

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
        { role: "system", content: "Eres un experto en trading de criptomonedas que escribe publicaciones para Binance Square en espanol." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

// PUBLICAR EN BINANCE SQUARE
async function publishToSquare(content) {
  const response = await fetch(BINANCE_SQUARE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Square-OpenAPI-Key": BINANCE_SQUARE_API_KEY,
      clienttype: "web",
    },
    body: JSON.stringify({ bodyTextOnly: content }),
  });

  const data = await response.json();
  if (data.code !== "000000") {
    throw new Error(`Binance Square error: ${JSON.stringify(data)}`);
  }
  return data.data?.id || "unknown";
}

// LOGICA PRINCIPAL
let postIndex = 0;

async function runPost() {
  const type = POST_TYPES[postIndex % POST_TYPES.length];
  postIndex++;

  console.log(`\n[${new Date().toLocaleString()}] Generando post tipo: ${type}`);

  try {
    const prices = await getLivePrices();
    const content = await generatePostContent(type, prices);
    console.log("Contenido generado:", content.substring(0, 150) + "...");

    const postId = await publishToSquare(content);
    console.log(`Publicado en Binance Square! ID: ${postId}`);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

// VALIDACION
function validateConfig() {
  if (!BINANCE_SQUARE_API_KEY) { console.error("Falta BINANCE_SQUARE_API_KEY"); process.exit(1); }
  if (!GROQ_API_KEY) { console.error("Falta GROQ_API_KEY"); process.exit(1); }
}

// SCHEDULER
function startScheduler() {
  console.log("Bot Binance Square iniciado (Groq + precios reales)");
  console.log(`${SCHEDULE_TIMES.length} posts al dia: ${SCHEDULE_TIMES.join(", ")}`);
  console.log(`Tipos de posts: ${POST_TYPES.join(", ")}`);

  SCHEDULE_TIMES.forEach((time) => {
    const [hour, minute] = time.split(":");
    cron.schedule(`${minute} ${hour} * * *`, () => runPost());
    console.log(`Programado: ${time}`);
  });

  console.log("\nEjecutando post de prueba inicial...");
  runPost();
}

validateConfig();
startScheduler();
