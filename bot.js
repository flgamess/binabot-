/**
 * Bot Binance Square - 20 posts/dia
 * Precios reales Binance + Noticias reales CoinDesk + Groq IA
 * Sin senales - contenido variado y real
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

// 20 horarios distribuidos en el dia
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
        high: parseFloat(item.highPrice).toFixed(2),
        low: parseFloat(item.lowPrice).toFixed(2),
        volume: parseFloat(item.quoteVolume).toFixed(0),
      };
    }
    console.log("Precios obtenidos:", JSON.stringify(prices));
    return prices;
  } catch (e) {
    console.error("Error obteniendo precios:", e.message);
    return null;
  }
}

// NOTICIAS REALES DE COINDESK (RSS gratis, sin API key)
async function getLatestNews() {
  try {
    const url = "https://www.coindesk.com/arc/outboundfeeds/rss/";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }
    });
    const text = await res.text();

    // Extraer titulares del RSS
    const titles = [];
    const regex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const title = match[1] || match[2];
      if (title && !title.includes("CoinDesk") && title.length > 20) {
        titles.push(title.trim());
      }
    }

    if (titles.length === 0) return null;

    // Agarrar una al azar de las primeras 8
    const random = titles[Math.floor(Math.random() * Math.min(8, titles.length))];
    console.log("Noticia real:", random);
    return random;
  } catch (e) {
    console.error("Error obteniendo noticias:", e.message);
    return null;
  }
}

// PROMPTS
function buildPrompt(type, prices, newsTitle) {
  const pc = prices
    ? `Precios reales ahora mismo (USALOS EXACTAMENTE, no cambies nada):
BTC: $${prices.BTC?.price} | Cambio 24h: ${prices.BTC?.change}% | Max: $${prices.BTC?.high} | Min: $${prices.BTC?.low}
ETH: $${prices.ETH?.price} | Cambio 24h: ${prices.ETH?.change}% | Max: $${prices.ETH?.high} | Min: $${prices.ETH?.low}
SOL: $${prices.SOL?.price} | Cambio 24h: ${prices.SOL?.change}% | Max: $${prices.SOL?.high} | Min: $${prices.SOL?.low}
BNB: $${prices.BNB?.price} | Cambio 24h: ${prices.BNB?.change}% | Max: $${prices.BNB?.high} | Min: $${prices.BNB?.low}
XRP: $${prices.XRP?.price} | Cambio 24h: ${prices.XRP?.change}% | Max: $${prices.XRP?.high} | Min: $${prices.XRP?.low}`
    : "";

  const instrucciones = `Escribe en espanol. Sin markdown ni asteriscos. Solo texto plano.
Con emojis relevantes. Termina con 3 hashtags. Maximo 150 palabras.`;

  const prompts = {
    analisis_btc: `${instrucciones}
Escribe un analisis breve de Bitcoin basado en estos datos reales:
${pc}
Menciona el precio actual, la variacion del dia, el maximo y minimo, y una perspectiva corta. Directo y concreto.`,

    analisis_eth: `${instrucciones}
Escribe un analisis breve de Ethereum basado en estos datos reales:
${pc}
Menciona el precio actual de ETH, su variacion del dia, maximo y minimo, y perspectiva corta. Directo y concreto.`,

    analisis_sol: `${instrucciones}
Escribe un analisis breve de Solana basado en estos datos reales:
${pc}
Menciona el precio actual de SOL, su variacion del dia, maximo y minimo, y perspectiva corta. Directo y concreto.`,

    analisis_bnb: `${instrucciones}
Escribe un analisis breve de BNB basado en estos datos reales:
${pc}
Menciona el precio actual de BNB, su variacion del dia, maximo y minimo, y perspectiva corta. Directo y concreto.`,

    analisis_xrp: `${instrucciones}
Escribe un analisis breve de XRP basado en estos datos reales:
${pc}
Menciona el precio actual de XRP, su variacion del dia, maximo y minimo, y perspectiva corta. Directo y concreto.`,

    noticia_crypto: `${instrucciones}
Redacta un post breve para Binance Square basado en esta noticia real de CoinDesk:
"${newsTitle || 'El mercado crypto sigue en movimiento'}"
Breve, claro, sin inventar datos. Maximo 120 palabras.`,

    consejo_trading: `${instrucciones}
Escribe un consejo practico y util sobre trading de criptomonedas o gestion de riesgo.
Que sea aplicable y directo. Maximo 120 palabras.`,

    resumen_mercado: `${instrucciones}
Escribe un resumen breve del mercado crypto de hoy con estos datos reales:
${pc}
Menciona que monedas suben y cuales bajan, el sentimiento general. Maximo 150 palabras.`,

    frase_motivacional: `${instrucciones}
Escribe un post divertido, motivacional o con humor sobre el mundo crypto.
Puede ser sobre HODL, buy the dip, la vida del trader, o una frase inspiradora para inversores.
Muchos emojis. Que genere likes y comentarios. Maximo 100 palabras.`,

    comparativa: `${instrucciones}
Compara dos criptomonedas usando estos datos reales:
${pc}
Elige 2 monedas y compara su precio actual, variacion en 24h y perspectiva.
Formato: "[MONEDA1] vs [MONEDA2]: cual tiene mejor momento hoy?"
Maximo 150 palabras.`,

    pregunta_btc: `${instrucciones}
Escribe una pregunta provocadora y atractiva sobre Bitcoin para generar debate en Binance Square.
Usa el precio real: BTC esta en $${prices?.BTC?.price} (${prices?.BTC?.change}% hoy).
Ejemplos: "BTC puede llegar a $150,000 este año?", "Es este el mejor momento para comprar BTC?"
Desarrolla la pregunta con contexto breve. Que invite a comentar. Maximo 120 palabras.`,

    pregunta_eth: `${instrucciones}
Escribe una pregunta provocadora sobre Ethereum para generar debate en Binance Square.
Usa el precio real: ETH esta en $${prices?.ETH?.price} (${prices?.ETH?.change}% hoy).
Ejemplos: "ETH puede superar a BTC algun dia?", "Vale la pena comprar ETH ahora?"
Desarrolla con contexto breve. Que invite a comentar. Maximo 120 palabras.`,

    pregunta_sol: `${instrucciones}
Escribe una pregunta provocadora sobre Solana para generar debate en Binance Square.
Usa el precio real: SOL esta en $${prices?.SOL?.price} (${prices?.SOL?.change}% hoy).
Ejemplos: "SOL puede volver a $200?", "Es Solana el futuro de las blockchains?"
Desarrolla con contexto breve. Que invite a comentar. Maximo 120 palabras.`,

    pregunta_bnb: `${instrucciones}
Escribe una pregunta provocadora sobre BNB para generar debate en Binance Square.
Usa el precio real: BNB esta en $${prices?.BNB?.price} (${prices?.BNB?.change}% hoy).
Ejemplos: "BNB puede llegar a $1000?", "Es BNB una buena inversion a largo plazo?"
Desarrolla con contexto breve. Que invite a comentar. Maximo 120 palabras.`,

    pregunta_xrp: `${instrucciones}
Escribe una pregunta provocadora sobre XRP para generar debate en Binance Square.
Usa el precio real: XRP esta en $${prices?.XRP?.price} (${prices?.XRP?.change}% hoy).
Ejemplos: "XRP puede llegar a $5 este ciclo?", "Ganara Ripple el caso contra la SEC?"
Desarrolla con contexto breve. Que invite a comentar. Maximo 120 palabras.`,
  };

  return prompts[type] || prompts["resumen_mercado"];
}

// GENERAR CON GROQ
async function generatePostContent(type, prices, newsTitle) {
  const prompt = buildPrompt(type, prices, newsTitle);

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
        { role: "system", content: "Escribes posts cortos, atractivos y con datos reales para Binance Square en espanol. Nunca inventas precios ni datos." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq error: ${response.status} ${await response.text()}`);
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

  console.log("Ejecutando post de prueba...");
  runPost();
}

validateConfig();
startScheduler();
