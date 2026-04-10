/**
 * Bot Binance Square - 20 posts/dia
 * Precios reales Binance + Noticias reales CoinDesk + Groq IA
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
  "00:00","01:30","03:00","04:30","06:00",
  "07:00","08:00","09:00","10:00","11:00",
  "12:00","13:00","14:00","15:00","16:00",
  "17:00","18:00","19:30","21:00","22:30",
];

const POST_TYPES = [
  "analisis_btc",
  "analisis_eth",
  "analisis_sol",
  "analisis_bnb",
  "analisis_xrp",
  "noticia_crypto",
  "noticia_crypto",
  "noticia_crypto",
  "consejo_trading",
  "resumen_mercado",
  "frase_motivacional",
  "frase_motivacional",
  "comparativa",
  "comparativa",
  "pregunta_btc",
  "pregunta_eth",
  "pregunta_sol",
  "pregunta_bnb",
  "pregunta_xrp",
  "resumen_mercado",
];

// PRECIOS REALES DE BINANCE - un simbolo a la vez para evitar errores
async function getLivePrices() {
  try {
    const symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT"];
    const prices = {};

    for (const symbol of symbols) {
      const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
      const res = await fetch(url);
      const item = await res.json();
      const key = symbol.replace("USDT", "");
      prices[key] = {
        price: parseFloat(item.lastPrice).toFixed(2),
        change: parseFloat(item.priceChangePercent).toFixed(2),
        high: parseFloat(item.highPrice).toFixed(2),
        low: parseFloat(item.lowPrice).toFixed(2),
      };
    }

    console.log("Precios OK:", JSON.stringify(prices));
    return prices;
  } catch (e) {
    console.error("Error precios:", e.message);
    return null;
  }
}

// NOTICIAS REALES DE COINDESK
async function getLatestNews() {
  try {
    const url = "https://www.coindesk.com/arc/outboundfeeds/rss/";
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const text = await res.text();

    const titles = [];
    const regex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const title = (match[1] || match[2] || "").trim();
      if (title && !title.toLowerCase().includes("coindesk") && title.length > 20) {
        titles.push(title);
      }
    }

    if (titles.length === 0) return null;
    const noticia = titles[Math.floor(Math.random() * Math.min(8, titles.length))];
    console.log("Noticia:", noticia);
    return noticia;
  } catch (e) {
    console.error("Error noticias:", e.message);
    return null;
  }
}

// PROMPTS
function buildPrompt(type, prices, newsTitle) {
  const p = prices || {};
  const pc = prices ? `Precios reales ahora (USALOS EXACTAMENTE, no inventes otros):
BTC: $${p.BTC?.price} | ${p.BTC?.change}% hoy | Max: $${p.BTC?.high} | Min: $${p.BTC?.low}
ETH: $${p.ETH?.price} | ${p.ETH?.change}% hoy | Max: $${p.ETH?.high} | Min: $${p.ETH?.low}
SOL: $${p.SOL?.price} | ${p.SOL?.change}% hoy | Max: $${p.SOL?.high} | Min: $${p.SOL?.low}
BNB: $${p.BNB?.price} | ${p.BNB?.change}% hoy | Max: $${p.BNB?.high} | Min: $${p.BNB?.low}
XRP: $${p.XRP?.price} | ${p.XRP?.change}% hoy | Max: $${p.XRP?.high} | Min: $${p.XRP?.low}` : "";

  const base = `Escribe en espanol. Sin markdown ni asteriscos. Solo texto plano. Con emojis. Termina con 3 hashtags. Maximo 150 palabras. NUNCA inventes precios, solo usa los datos reales proporcionados.`;

  const prompts = {
    analisis_btc: `${base}
Analisis breve de Bitcoin con estos datos reales: ${pc}
Menciona precio actual de BTC, variacion del dia, maximo y minimo. Perspectiva corta y concreta.`,

    analisis_eth: `${base}
Analisis breve de Ethereum con estos datos reales: ${pc}
Menciona precio actual de ETH, variacion del dia, maximo y minimo. Perspectiva corta y concreta.`,

    analisis_sol: `${base}
Analisis breve de Solana con estos datos reales: ${pc}
Menciona precio actual de SOL, variacion del dia, maximo y minimo. Perspectiva corta y concreta.`,

    analisis_bnb: `${base}
Analisis breve de BNB con estos datos reales: ${pc}
Menciona precio actual de BNB, variacion del dia, maximo y minimo. Perspectiva corta y concreta.`,

    analisis_xrp: `${base}
Analisis breve de XRP con estos datos reales: ${pc}
Menciona precio actual de XRP, variacion del dia, maximo y minimo. Perspectiva corta y concreta.`,

    noticia_crypto: `${base}
Redacta un post breve basado en esta noticia real de CoinDesk: "${newsTitle || 'Mercado crypto activo hoy'}"
Breve, claro, sin inventar datos. Maximo 120 palabras.`,

    consejo_trading: `${base}
Escribe un consejo practico sobre trading de criptomonedas o gestion de riesgo. Directo y util. Maximo 120 palabras.`,

    resumen_mercado: `${base}
Resumen breve del mercado crypto con estos datos reales: ${pc}
Que sube, que baja, sentimiento general. Maximo 150 palabras.`,

    frase_motivacional: `${base}
Post divertido o motivacional sobre el mundo crypto. Puede ser humor sobre HODL, buy the dip, la vida del trader. Muchos emojis. Maximo 100 palabras.`,

    comparativa: `${base}
Compara dos criptomonedas con estos datos reales: ${pc}
Elige 2 y compara precio actual, variacion 24h y perspectiva. Titulo tipo "[MONEDA1] vs [MONEDA2] hoy". Maximo 150 palabras.`,

    pregunta_btc: `${base}
Pregunta provocadora sobre Bitcoin para generar debate. Precio real BTC: $${p.BTC?.price} (${p.BTC?.change}% hoy).
Ejemplo: "BTC puede llegar a $150,000 este año?" Desarrolla con contexto breve. Que invite a comentar.`,

    pregunta_eth: `${base}
Pregunta provocadora sobre Ethereum para generar debate. Precio real ETH: $${p.ETH?.price} (${p.ETH?.change}% hoy).
Ejemplo: "ETH puede superar a BTC?" Desarrolla con contexto breve. Que invite a comentar.`,

    pregunta_sol: `${base}
Pregunta provocadora sobre Solana para generar debate. Precio real SOL: $${p.SOL?.price} (${p.SOL?.change}% hoy).
Ejemplo: "SOL puede volver a $200?" Desarrolla con contexto breve. Que invite a comentar.`,

    pregunta_bnb: `${base}
Pregunta provocadora sobre BNB para generar debate. Precio real BNB: $${p.BNB?.price} (${p.BNB?.change}% hoy).
Ejemplo: "BNB puede llegar a $1000?" Desarrolla con contexto breve. Que invite a comentar.`,

    pregunta_xrp: `${base}
Pregunta provocadora sobre XRP para generar debate. Precio real XRP: $${p.XRP?.price} (${p.XRP?.change}% hoy).
Ejemplo: "XRP puede llegar a $5 este ciclo?" Desarrolla con contexto breve. Que invite a comentar.`,
  };

  return prompts[type] || prompts["resumen_mercado"];
}

// GENERAR CON GROQ
async function generatePostContent(type, prices, newsTitle) {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 350,
      messages: [
        { role: "system", content: "Escribes posts cortos y atractivos para Binance Square en espanol. NUNCA inventas precios ni datos. Solo usas los datos reales que te dan." },
        { role: "user", content: buildPrompt(type, prices, newsTitle) },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Groq error: ${response.status} ${await response.text()}`);
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
  if (data.code !== "000000") throw new Error(`Binance Square error: ${JSON.stringify(data)}`);
  return data.data?.id || "unknown";
}

// LOGICA PRINCIPAL
let postIndex = 0;

async function runPost() {
  const type = POST_TYPES[postIndex % POST_TYPES.length];
  postIndex++;
  console.log(`[${new Date().toLocaleString()}] Tipo: ${type}`);

  try {
    const prices = await getLivePrices();
    const newsTitle = type === "noticia_crypto" ? await getLatestNews() : null;
    const content = await generatePostContent(type, prices, newsTitle);
    console.log("Preview:", content.substring(0, 120) + "...");
    const postId = await publishToSquare(content);
    console.log(`Publicado! ID: ${postId}`);
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
  console.log(`Bot iniciado - ${SCHEDULE_TIMES.length} posts al dia`);
  SCHEDULE_TIMES.forEach((time) => {
    const [hour, minute] = time.split(":");
    cron.schedule(`${minute} ${hour} * * *`, () => runPost());
  });
  console.log("Post de prueba...");
  runPost();
}

validateConfig();
startScheduler();
