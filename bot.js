/**
 * Bot Binance Square - 30 posts/dia
 * Criptos en tendencia + CoinDesk + Groq IA
 * Posts variados, sin hashtags, sin saludos repetitivos
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

const EXCLUDE_COINS = ["USDT","USDC","BUSD","DAI","TUSD","FDUSD","USDS","STETH","WBTC","WETH"];

let cachedCoins = null;
let lastCoinFetch = 0;

// CRIPTOS EN TENDENCIA
async function getTrendingCoins() {
  const now = Date.now();
  if (cachedCoins && now - lastCoinFetch < 30 * 60 * 1000) return cachedCoins;

  try {
    const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=25&page=1&price_change_percentage=24h";
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    const data = await res.json();

    if (!Array.isArray(data)) throw new Error("Respuesta invalida de CoinGecko");

    const coins = data
      .filter(coin => !EXCLUDE_COINS.includes(coin.symbol.toUpperCase()))
      .map(coin => ({
        name: coin.name,
        symbol: coin.symbol.toUpperCase(),
        price: coin.current_price,
        change: coin.price_change_percentage_24h?.toFixed(2),
        high: coin.high_24h,
        low: coin.low_24h,
      }));

    cachedCoins = coins;
    lastCoinFetch = now;
    console.log("Tendencia: " + coins.slice(0,6).map(c => c.symbol).join(", "));
    return coins;
  } catch (e) {
    console.error("Error criptos:", e.message);
    return cachedCoins || [];
  }
}

function pickCoin(coins, exclude = []) {
  const available = coins.filter(c => !exclude.includes(c.symbol));
  return available[Math.floor(Math.random() * available.length)] || coins[0];
}

// NOTICIAS COINDESK
async function getLatestNews() {
  try {
    const res = await fetch("https://www.coindesk.com/arc/outboundfeeds/rss/", { headers: { "User-Agent": "Mozilla/5.0" } });
    const text = await res.text();
    const titles = [];
    const regex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      const title = (match[1] || match[2] || "").trim();
      if (title && !title.toLowerCase().includes("coindesk") && title.length > 20) titles.push(title);
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

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// PROMPTS
function buildPrompt(type, coins, newsTitle) {
  const coin = pickCoin(coins);
  const coin2 = pickCoin(coins, [coin?.symbol]);
  const top5 = coins.slice(0, 5).map(coinInfo).join("\n");

  const reglas = `REGLAS:
- Escribe en espanol, texto plano, sin markdown ni asteriscos
- SIN hashtags, no uses # en ningun momento
- Solo usa datos reales que te doy, no inventes precios ni porcentajes
- Si no tienes algun dato, no lo menciones, sigue natural
- Entre 100 y 200 palabras
- NUNCA empieces con Hola, Buenos dias, ni saludos genericos
- Cada post debe sonar diferente y fresco`;

  const aperturas = {
    analisis: rand([
      `📊 ${coin.symbol} HOY —`,
      `👀 Esto esta pasando con ${coin.name}:`,
      `🔍 ${coin.symbol} en este momento:`,
      `⚡ ${coin.name} mueve ficha hoy.`,
      `📈 ${coin.symbol} — lo que necesitas saber:`,
      `🎯 ${coin.symbol} esta en un punto interesante.`,
      `💡 ${coin.name} merece atencion hoy:`,
      `🔥 ${coin.symbol} esta dando senales:`,
    ]),
    pregunta: rand([
      `💬 Pregunta del dia sobre ${coin.name}:`,
      `🤔 Alguien me puede decir...`,
      `❓ ${coin.symbol} — necesito tu opinion:`,
      `🗣️ Debate abierto:`,
      `👇 Quiero saber que piensas sobre ${coin.symbol}:`,
      `🧐 ${coin.name} — opiniones encontradas:`,
    ]),
    meme: rand([
      `😂 La vida del trader crypto:`,
      `🚀 Recordatorio para los que HODL:`,
      `💀 Cuando el mercado hace lo que quiere:`,
      `🧠 Mentalidad crypto nivel experto:`,
      `😤 El mercado hoy vs mi cartera:`,
      `🙏 Un mensaje para los que compraron en maximos:`,
      `😅 Crypto nunca es aburrido:`,
    ]),
    noticia: rand([
      `🚨 ULTIMA HORA —`,
      `⚠️ ATENCION —`,
      `📢 ACABA DE PASAR —`,
      `🔔 BREAKING —`,
      `📰 IMPORTANTE —`,
    ]),
    resumen: rand([
      `📊 ASI ESTA EL MERCADO AHORA:`,
      `🌐 PANORAMA CRYPTO HOY —`,
      `⚡ RESUMEN DEL MERCADO:`,
      `📉📈 LO QUE ESTA MOVIENDO EL MERCADO:`,
      `🔎 MERCADO EN TIEMPO REAL:`,
    ]),
    comparativa: rand([
      `⚔️ ${coin.symbol} vs ${coin2.symbol} — cual gana hoy?`,
      `🥊 Batalla del dia: ${coin.name} vs ${coin2.name}`,
      `🤜🤛 ${coin.symbol} o ${coin2.symbol}? Tu decides:`,
      `📊 Comparativa de hoy: ${coin.name} contra ${coin2.name}`,
    ]),
    consejo: rand([
      `🧠 CONSEJO QUE NADIE TE DICE:`,
      `💡 Algo que aprendi en el mercado:`,
      `⚠️ Error que cometen la mayoria de traders:`,
      `📌 Regla de oro para sobrevivir en crypto:`,
      `🎓 Leccion del mercado de hoy:`,
    ]),
  };

  const prompts = {
    analisis: `${reglas}
Empieza el post con: "${aperturas.analisis}"
Luego escribe sobre ${coin.name} con estos datos reales: ${coinInfo(coin)}
Habla del precio actual, como se mueve hoy, que zonas importan. Termina con una pregunta corta para generar comentarios.`,

    noticia_crypto: `${reglas}
Empieza con: "${aperturas.noticia}"
Luego redacta esta noticia real de forma natural y directa: "${newsTitle || 'El mercado crypto sigue activo'}"
Comenta brevemente que puede significar para el mercado.`,

    resumen_mercado: `${reglas}
Empieza con: "${aperturas.resumen}"
Usa estos datos reales: 
${top5}
Comenta que sube, que baja, como ves el mercado ahora. Directo y concreto.`,

    comparativa: `${reglas}
Empieza con: "${aperturas.comparativa}"
Usa estos datos reales:
${coinInfo(coin)}
${coinInfo(coin2)}
Compara cual tiene mejor momento hoy y por que. Termina pidiendo opinion a los lectores.`,

    pregunta: `${reglas}
Empieza con: "${aperturas.pregunta}"
Lanza una pregunta provocadora sobre ${coin.name} con este dato real: ${coinInfo(coin)}
Da contexto breve y termina invitando a comentar.`,

    frase_motivacional: `${reglas}
Empieza con: "${aperturas.meme}"
Escribe algo divertido, motivacional o con humor sobre el mundo crypto, HODL, comprar en bajas, la vida del trader.
Que genere reacciones. No necesitas datos de precios.`,

    consejo_trading: `${reglas}
Empieza con: "${aperturas.consejo}"
Comparte un consejo practico sobre trading o gestion de riesgo. Concreto, directo y aplicable.`,
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
        { role: "system", content: "Eres una persona experta en criptomonedas que publica contenido natural, variado y atractivo en Binance Square en espanol. Nunca inventas datos. Nunca usas hashtags. Nunca empiezas con saludos genericos." },
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

function validateConfig() {
  if (!BINANCE_SQUARE_API_KEY) { console.error("Falta BINANCE_SQUARE_API_KEY"); process.exit(1); }
  if (!GROQ_API_KEY) { console.error("Falta GROQ_API_KEY"); process.exit(1); }
}

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
