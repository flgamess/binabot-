/**
 * Bot Binance Square - 30 posts/dia
 * Distribucion equilibrada, posts breves, emojis moderados
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

// Distribucion equilibrada: 5 analisis, 4 noticias, 5 preguntas, 4 comparativas, 4 resumenes, 4 memes, 4 consejos = 30
const POST_TYPES = [
  "analisis","analisis","analisis","analisis","analisis",
  "noticia_crypto","noticia_crypto","noticia_crypto","noticia_crypto",
  "pregunta","pregunta","pregunta","pregunta","pregunta",
  "comparativa","comparativa","comparativa","comparativa",
  "resumen_mercado","resumen_mercado","resumen_mercado","resumen_mercado",
  "frase_motivacional","frase_motivacional","frase_motivacional","frase_motivacional",
  "consejo_trading","consejo_trading","consejo_trading","consejo_trading",
];

const ANALISIS_ENFOQUES = [
  "momentum","zonas","sentimiento","volumen","tendencia",
  "rebote","ruptura","acumulacion","ciclo","contexto"
];

const EXCLUDE_COINS = ["USDT","USDC","BUSD","DAI","TUSD","FDUSD","USDS","STETH","WBTC","WETH"];

let cachedCoins = null;
let lastCoinFetch = 0;
let lastPostTypes = [];
let analisisIndex = 0;

function getNextType() {
  const shuffled = [...POST_TYPES].sort(() => Math.random() - 0.5);
  for (const type of shuffled) {
    if (!lastPostTypes.slice(-4).includes(type)) {
      lastPostTypes.push(type);
      if (lastPostTypes.length > 10) lastPostTypes.shift();
      return type;
    }
  }
  return shuffled[0];
}

async function getTrendingCoins() {
  const now = Date.now();
  if (cachedCoins && now - lastCoinFetch < 30 * 60 * 1000) return cachedCoins;

  try {
    const url = "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=volume_desc&per_page=25&page=1&price_change_percentage=24h";
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } });
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Respuesta invalida");

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
    return titles[Math.floor(Math.random() * Math.min(10, titles.length))];
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

function buildPrompt(type, coins, newsTitle) {
  const coin = pickCoin(coins);
  const coin2 = pickCoin(coins, [coin?.symbol]);
  const top5 = coins.slice(0, 5).map(coinInfo).join("\n");

  const enfoque = ANALISIS_ENFOQUES[analisisIndex % ANALISIS_ENFOQUES.length];
  if (type === "analisis") analisisIndex++;

  const reglas = `REGLAS:
- Espanol, texto plano, sin markdown ni asteriscos
- SIN hashtags, jamas uses #
- Solo datos reales que te doy, no inventes precios
- Si falta algun dato no lo menciones
- Maximo 80 palabras, breve y directo
- NUNCA empieces con Hola, saludos ni frases genericas
- No digas "sigueme" ni "guarda este post"
- Usa 2 o 3 emojis maximo, bien colocados
- Primera linea debe ser el titulo impactante y unico`;

  const titulosAnalisis = {
    momentum: rand([`⚡ ${coin.symbol} — tiene fuerza o se agota?`, `🔋 El momentum de ${coin.symbol} hoy:`]),
    zonas: rand([`📍 Zonas clave en ${coin.symbol} ahora:`, `🗺️ Los niveles que manda ${coin.symbol}:`]),
    sentimiento: rand([`🧠 ${coin.symbol}: miedo o codicia hoy?`, `😰 El sentimiento en ${coin.symbol} ahora:`]),
    volumen: rand([`💰 Hay dinero real entrando en ${coin.symbol}?`, `📊 El volumen de ${coin.symbol} habla:`]),
    tendencia: rand([`📈 ${coin.symbol} — alcista, bajista o trampa?`, `🔎 La tendencia real de ${coin.symbol}:`]),
    rebote: rand([`🏀 ${coin.symbol} lista para rebotar?`, `↗️ Senales de rebote en ${coin.symbol}:`]),
    ruptura: rand([`💥 ${coin.symbol} rompio niveles importantes?`, `🚀 Ruptura en ${coin.symbol} hoy:`]),
    acumulacion: rand([`🐋 Las ballenas acumulan ${coin.symbol}?`, `👀 Acumulacion en ${coin.symbol}:`]),
    ciclo: rand([`🔄 En que momento del ciclo esta ${coin.symbol}?`, `📅 ${coin.symbol} y el ciclo del mercado:`]),
    contexto: rand([`🤔 El movimiento de ${coin.symbol} tiene sentido?`, `📆 ${coin.symbol} hoy en contexto:`]),
  };

  const prompts = {
    analisis: `${reglas}
Titulo: "${titulosAnalisis[enfoque]}"
Datos reales: ${coinInfo(coin)}
Escribe un analisis MUY breve con enfoque en ${enfoque}. Termina con una pregunta corta.`,

    noticia_crypto: `${reglas}
Empieza con: "${rand(["🚨 ULTIMA HORA —","⚠️ ATENCION —","📢 ACABA DE PASAR —","🔔 BREAKING —","📰 ESTO ACABA DE SALIR —"])}"
Noticia real: "${newsTitle || 'El mercado crypto sigue activo'}"
Redactala de forma directa y breve. Sin comentarios extra innecesarios.`,

    resumen_mercado: `${reglas}
Empieza con: "${rand(["📊 MERCADO AHORA:","⚡ RESUMEN RAPIDO:","💹 ASI VA EL MERCADO:","🌐 PANORAMA DE HOY:"])}"
Datos reales:
${top5}
Resume en pocas lineas que sube, que baja. Sin relleno.`,

    comparativa: `${reglas}
Titulo: "${rand([`⚔️ ${coin.symbol} vs ${coin2.symbol} — quien gana hoy?`,`🥊 ${coin.name} vs ${coin2.name}:`,`📊 ${coin.symbol} o ${coin2.symbol}? Analisis rapido:`])}"
Datos reales:
${coinInfo(coin)}
${coinInfo(coin2)}
Compara brevemente cual tiene mejor momento. Termina con pregunta directa.`,

    pregunta: `${reglas}
Titulo unico y provocador sobre ${coin.name}.
Ejemplos: "💬 ${coin.symbol} a $${fmt(coin.price * 2)}... lo ves posible?" o "❓ Si ${coin.symbol} cae a $${fmt(coin.low * 0.85)}, entras o esperas?" o "🤔 Cual es tu precio objetivo para ${coin.symbol} este ciclo?"
Dato real: ${coinInfo(coin)}
Lanza la pregunta con contexto breve. Que invite a responder.`,

    frase_motivacional: `${reglas}
Titulo: "${rand(["😅 Crypto nunca aburre:","💀 El mercado hoy:","🚀 Para los que siguen HODLeando:","🧠 Psicologia del trader:","😤 Nadie lo dice pero todos lo vivimos:"])}"
Escribe algo breve, divertido o motivacional sobre la vida en crypto. Sin datos de precios.`,

    consejo_trading: `${reglas}
Titulo: "${rand(["💡 Algo que aprendi en el mercado:","⚠️ El error mas comun en crypto:","📌 Regla de oro para traders:","🎓 Lo que el mercado me enseno:","🧠 Lo que separa a los que ganan de los que pierden:"])}"
Un consejo practico y concreto sobre trading o gestion de riesgo. Directo al punto.`,
  };

  return prompts[type] || prompts["resumen_mercado"];
}

async function generatePostContent(type, coins, newsTitle) {
  const response = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      max_tokens: 200,
      messages: [
        { role: "system", content: "Eres un experto en crypto que publica en Binance Square en espanol. Posts breves, directos, naturales. Maximo 80 palabras. Sin hashtags. Sin saludos. 2-3 emojis maximo." },
        { role: "user", content: buildPrompt(type, coins, newsTitle) },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Groq error: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

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

async function runPost() {
  const type = getNextType();
  console.log(`[${new Date().toLocaleString()}] Tipo: ${type}`);

  try {
    const coins = await getTrendingCoins();
    const newsTitle = type === "noticia_crypto" ? await getLatestNews() : null;
    const content = await generatePostContent(type, coins, newsTitle);
    console.log("Preview:", content.substring(0, 100) + "...");
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
