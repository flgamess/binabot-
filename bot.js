/**
 * Bot Binance Square - 30 posts/dia
 * Criptos en tendencia dinamicas + CoinDesk + Groq IA
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

// 30 horarios distribuidos en el dia (cada ~48 min)
const SCHEDULE_TIMES = [
  "00:00","00:48","01:36","02:24","03:12","04:00",
  "04:48","05:36","06:24","07:12","08:00","08:48",
  "09:36","10:24","11:12","12:00","12:48","13:36",
  "14:24","15:12","16:00","16:48","17:36","18:24",
  "19:12","20:00","20:48","21:36","22:24","23:12",
];

const POST_TYPES = [
  "analisis","analisis","analisis","analisis","analisis",
  "analisis","analisis","analisis","analisis","analisis",
  "noticia_crypto","noticia_crypto","noticia_crypto","noticia_crypto",
  "resumen_mercado","resumen_mercado","resumen_mercado",
  "comparativa","comparativa","comparativa",
  "pregunta","pregunta","pregunta","pregunta","pregunta",
  "frase_motivacional","frase_motivacional","frase_motivacional",
  "consejo_trading","consejo_trading",
];

// CRIPTOS EN TENDENCIA DE COINGECKO (top 20 por volumen)
let cachedCoins = null;
let lastCoinFetch = 0;

async function getTrendingCoins() {
  const now = Date.now();
  // Cache de 30 minutos para no spamear la API
  if (cachedCoins && now - lastCoinFetch < 30 * 60 * 1000) {
    return cachedCoins;
  }

  try {
    const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=20&page=1&price_change_percentage=24h";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
    });
    const data = await res.json();

    const EXCLUDE = ["USDT","USDC","BUSD","DAI","TUSD","FDUSD","USDS"];

    const coins = data.filter(coin => !EXCLUDE.includes(coin.symbol.toUpperCase())).map(coin => ({
      name: coin.name,
      symbol: coin.symbol.toUpperCase(),
      price: coin.current_price,
      change: coin.price_change_percentage_24h?.toFixed(2),
      high: coin.high_24h,
      low: coin.low_24h,
      marketCap: coin.market_cap,
    }));

    cachedCoins = coins;
    lastCoinFetch = now;
    console.log(`Criptos en tendencia: ${coins.slice(0,5).map(c => c.symbol).join(", ")}...`);
    return coins;
  } catch (e) {
    console.error("Error obteniendo criptos:", e.message);
    return cachedCoins || [];
  }
}

// SELECCIONAR CRIPTO AL AZAR DE LAS EN TENDENCIA
function pickCoin(coins, exclude = []) {
  const available = coins.filter(c => !exclude.includes(c.symbol));
  if (available.length === 0) return coins[0];
  return available[Math.floor(Math.random() * available.length)];
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
    const noticia = titles[Math.floor(Math.random() * Math.min(10, titles.length))];
    console.log("Noticia:", noticia);
    return noticia;
  } catch (e) {
    console.error("Error noticias:", e.message);
    return null;
  }
}

// FORMATO LEGIBLE
function fmt(num) {
  if (!num && num !== 0) return null;
  if (num < 1) return parseFloat(num).toFixed(4);
  if (num < 100) return parseFloat(num).toFixed(2);
  return parseFloat(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function coinInfo(coin) {
  if (!coin) return "";
  let info = `${coin.name} (${coin.symbol}): $${fmt(coin.price)}`;
  if (coin.change) info += ` | ${coin.change}% hoy`;
  if (coin.high && coin.low) info += ` | Max: $${fmt(coin.high)} | Min: $${fmt(coin.low)}`;
  return info;
}

// PROMPTS
function buildPrompt(type, coins, newsTitle) {
  const instrucciones = `Eres una persona experta en criptomonedas publicando en Binance Square.
Escribe en espanol, natural y directo, como lo haria una persona real.
Sin markdown ni asteriscos. Solo texto plano con emojis.
Termina con 2 o 3 hashtags relevantes.
Entre 100 y 200 palabras.
IMPORTANTE: Solo menciona datos que te doy. No inventes precios ni porcentajes. Si no tienes algun dato, simplemente no lo menciones.`;

  const coin = pickCoin(coins);
  const coin2 = pickCoin(coins, [coin?.symbol]);
  const top5 = coins.slice(0, 5).map(coinInfo).join("\n");

  const prompts = {
    analisis: `${instrucciones}
Escribe un post de analisis sobre ${coin.name} usando estos datos reales:
${coinInfo(coin)}
Habla del precio actual, como se mueve hoy, y da una perspectiva breve y concreta. Natural, como si fueras un trader compartiendo su vision del momento.`,

    noticia_crypto: `${instrucciones}
Escribe un post basado en esta noticia real de CoinDesk:
"${newsTitle || 'El mercado crypto sigue activo hoy'}"
Comentala de forma natural, menciona que significa para el mercado y da tu opinion breve.`,

    resumen_mercado: `${instrucciones}
Escribe un resumen del mercado crypto de hoy con estos datos reales de las criptos con mas volumen:
${top5}
Comenta que esta subiendo, que esta bajando y como ves el mercado en general ahora mismo.`,

    comparativa: `${instrucciones}
Compara estas dos criptomonedas usando datos reales:
${coinInfo(coin)}
${coinInfo(coin2)}
Comenta cual tiene mejor momento hoy y por que. Natural, como si estuvieras debatiendo con alguien cual es mejor opcion ahora.`,

    pregunta: `${instrucciones}
Escribe un post con una pregunta interesante sobre ${coin.name} para generar debate.
Dato real: ${coinInfo(coin)}
Lanza la pregunta y da un poco de contexto para que la gente quiera opinar.
Puede ser sobre precio objetivo, si es buen momento para entrar, su futuro, comparacion con otras criptos, etc.`,

    frase_motivacional: `${instrucciones}
Escribe un post divertido, motivacional o con humor sobre el mundo crypto.
Puede ser sobre HODL, comprar en las bajas, la vida del trader, las subidas inesperadas, o una frase que inspire a la comunidad.
Que sea entretenido y genere reacciones y comentarios.`,

    consejo_trading: `${instrucciones}
Comparte un consejo util y practico sobre trading de criptomonedas o gestion de riesgo.
Que sea algo concreto que cualquier trader pueda aplicar. Natural y directo.`,
  };

  return prompts[type] || prompts["resumen_mercado"];
}

// GENERAR CON GROQ
async function generatePostContent(type, coins, newsTitle) {
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
        { role: "system", content: "Eres una persona experta en criptomonedas que publica contenido natural y atractivo en Binance Square en espanol. Nunca inventas datos ni precios." },
        { role: "user", content: buildPrompt(type, coins, newsTitle) },
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
    const coins = await getTrendingCoins();
    const newsTitle = type === "noticia_crypto" ? await getLatestNews() : null;
    const content = await generatePostContent(type, coins, newsTitle);
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
