/**
 * Bot Binance Square - 30 posts/dia
 * Posts ordenados, variados, emojis libres, analisis profundos
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

const POST_TYPES_BASE = [
  "analisis","analisis","analisis","analisis","analisis",
  "noticia_crypto","noticia_crypto","noticia_crypto","noticia_crypto",
  "pregunta","pregunta","pregunta","pregunta","pregunta",
  "comparativa","comparativa","comparativa","comparativa",
  "resumen_mercado","resumen_mercado","resumen_mercado","resumen_mercado",
  "frase_motivacional","frase_motivacional","frase_motivacional","frase_motivacional",
  "consejo_trading","consejo_trading","consejo_trading","consejo_trading",
];

const ANALISIS_ENFOQUES = [
  "momentum","zonas_psicologicas","sentimiento","fuerza_precio",
  "tendencia","rebote","ruptura","acumulacion","trampa","contexto"
];

const EXCLUDE_COINS = ["USDT","USDC","BUSD","DAI","TUSD","FDUSD","USDS","STETH","WBTC","WETH"];

let cachedCoins = null;
let lastCoinFetch = 0;
let dailyQueue = [];
let analisisIndex = 0;

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  for (let i = 1; i < a.length; i++) {
    if (a[i] === a[i-1]) {
      for (let j = i+1; j < a.length; j++) {
        if (a[j] !== a[i-1]) { [a[i], a[j]] = [a[j], a[i]]; break; }
      }
    }
  }
  return a;
}

function getNextType() {
  if (dailyQueue.length === 0) {
    dailyQueue = shuffleArray(POST_TYPES_BASE);
    console.log("Cola del dia lista: " + dailyQueue.join(", "));
  }
  return dailyQueue.shift();
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
  return info;
}

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildPrompt(type, coins, newsTitle) {
  const coin = pickCoin(coins);
  const coin2 = pickCoin(coins, [coin?.symbol]);
  const top5 = coins.slice(0, 5).map(coinInfo).join("\n");
  const enfoque = ANALISIS_ENFOQUES[analisisIndex % ANALISIS_ENFOQUES.length];
  if (type === "analisis") analisisIndex++;

  const reglas = `REGLAS ESTRICTAS:
- Espanol, texto plano, sin markdown ni asteriscos
- SIN hashtags, jamas uses #
- Solo usa datos reales que te doy, no inventes precios
- Si falta algun dato no lo menciones
- Entre 60 y 120 palabras
- SIEMPRE empieza con un emoji seguido del titulo impactante en la primera linea
- Ejemplo de inicio correcto: "🚀 SOL al alza y con fuerza..." o "⚡ BTC rompio un nivel clave..."
- No digas sigueme ni guarda este post
- Los emojis que uses deben ir donde aporten, no en cada linea`;

  const enfoques_analisis = {
    momentum: `Analiza si ${coin.symbol} tiene fuerza real o se esta agotando. Basate en el precio actual y variacion. No menciones maximo ni minimo del dia.`,
    zonas_psicologicas: `Habla de las zonas de precio psicologicas importantes para ${coin.symbol} ahora mismo. Numeros redondos, niveles que el mercado respeta.`,
    sentimiento: `Analiza el sentimiento del mercado hacia ${coin.symbol} basandote en su variacion de hoy. Miedo, euforia, o calma?`,
    fuerza_precio: `Analiza si el movimiento de precio de ${coin.symbol} hoy refleja compradores fuertes o vendedores dominando.`,
    tendencia: `Analiza la tendencia actual de ${coin.symbol}. Es alcista real, bajista, o lateral engañoso?`,
    rebote: `Analiza si ${coin.symbol} esta en zona de posible rebote o si el movimiento de hoy es solo un respiro.`,
    ruptura: `Analiza si ${coin.symbol} ha roto algun nivel psicologico importante hoy o esta intentando hacerlo.`,
    acumulacion: `Analiza si el comportamiento de ${coin.symbol} hoy sugiere acumulacion silenciosa o distribucion.`,
    trampa: `Analiza si el movimiento de ${coin.symbol} hoy podria ser una trampa alcista o bajista para traders impulsivos.`,
    contexto: `Pon en contexto el movimiento de ${coin.symbol} hoy. Tiene sentido con lo que hace el mercado en general?`,
  };

  const titulos_analisis = {
    momentum: rand([`⚡ ${coin.symbol} tiene fuerza o se agota?`, `🔋 ${coin.symbol} — el momentum habla:`]),
    zonas_psicologicas: rand([`📍 Las zonas que manda ${coin.symbol}:`, `🗺️ Niveles psicologicos clave en ${coin.symbol}:`]),
    sentimiento: rand([`🧠 ${coin.symbol} — miedo o codicia?`, `😰 El sentimiento en ${coin.symbol} ahora:`]),
    fuerza_precio: rand([`💪 Quien controla ${coin.symbol} hoy?`, `📊 La fuerza real detras de ${coin.symbol}:`]),
    tendencia: rand([`📈 ${coin.symbol} — alcista, bajista o trampa?`, `🔎 La tendencia real de ${coin.symbol}:`]),
    rebote: rand([`🏀 ${coin.symbol} lista para rebotar?`, `↗️ ${coin.symbol} en zona de rebote?`]),
    ruptura: rand([`💥 ${coin.symbol} rompio niveles importantes?`, `🚀 Ruptura en ${coin.symbol} — real o falsa?`]),
    acumulacion: rand([`🐋 Las ballenas se mueven en ${coin.symbol}?`, `👀 Acumulacion silenciosa en ${coin.symbol}?`]),
    trampa: rand([`⚠️ ${coin.symbol} — movimiento real o trampa?`, `🪤 Cuidado con ${coin.symbol} hoy:`]),
    contexto: rand([`🤔 El movimiento de ${coin.symbol} tiene sentido?`, `🌐 ${coin.symbol} en contexto de mercado:`]),
  };

  const prompts = {
    analisis: `${reglas}
Primera linea exactamente: "${titulos_analisis[enfoque]}"
Dato real: ${coinInfo(coin)}
${enfoques_analisis[enfoque]}
Termina con una pregunta corta que invite a comentar.`,

    noticia_crypto: `${reglas}
Primera linea: un emoji de alerta + titulo de noticia impactante. Ejemplos: "🚨 ULTIMA HORA —" o "⚡ ACABA DE PASAR —" o "📢 ATENCION —" o "🔔 BREAKING —"
Noticia real de CoinDesk: "${newsTitle || 'Movimiento importante en el mercado crypto'}"
Redactala directo, sin rodeos. Comenta brevemente que significa.`,

    resumen_mercado: `${reglas}
Primera linea: emoji + titulo de resumen. Ejemplos: "📊 Asi esta el mercado ahora:" o "🌐 Panorama crypto de hoy:" o "⚡ Lo que mueve el mercado hoy:"
Datos reales:
${top5}
Resume que sube, que baja y como ves el momento. Sin relleno.`,

    comparativa: `${reglas}
Primera linea: emoji + comparativa directa. Ejemplos: "⚔️ ${coin.symbol} vs ${coin2.symbol} — quien gana hoy?" o "🥊 ${coin.name} vs ${coin2.name}: analisis rapido"
Datos reales:
${coinInfo(coin)}
${coinInfo(coin2)}
Compara cual tiene mejor momento y por que. Termina con pregunta.`,

    pregunta: `${reglas}
Primera linea: emoji + pregunta o gancho directo sobre ${coin.name}.
Ejemplos:
"💬 Si ${coin.symbol} llega a $${fmt(coin.price * 2)}... entras o ya es tarde?"
"🤔 ${coin.symbol} a este precio — compras, hodl o vendes?"
"❓ Cual es tu precio objetivo para ${coin.symbol} este ciclo?"
"💥 ${coin.symbol} sube ${coin.change}% hoy — movimiento real o trampa?"
Dato real: ${coinInfo(coin)}
Desarrolla la pregunta con contexto breve. Que invite fuerte a comentar. Puedes usar formato de opciones si aplica.`,

    frase_motivacional: `${reglas}
Primera linea: emoji + gancho divertido o motivacional.
Ejemplos:
"😅 Crypto nunca aburre y hoy lo confirma:"
"💀 El mercado hoy vs lo que esperabas:"
"🚀 Para los que siguen HODLeando sin importar nada:"
"🧠 Psicologia del trader nivel experto:"
"😤 Lo que nadie te cuenta del trading en crypto:"
Escribe algo breve, con gancho, divertido o motivacional. Sin datos de precios necesarios. Que genere reacciones. Puedes usar formato de lista si aplica.`,

    consejo_trading: `${reglas}
Primera linea: emoji + titulo del consejo directo.
Ejemplos:
"💡 La regla que me cambio el trading:"
"⚠️ El error mas comun en crypto y como evitarlo:"
"📌 Lo que separa a traders que ganan de los que pierden:"
"🎓 Leccion que aprendi a las malas en el mercado:"
"🧠 Algo que nadie te dice cuando empiezas en crypto:"
Comparte un consejo practico y concreto. Directo al punto.`,
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
      max_tokens: 250,
      messages: [
        { role: "system", content: "Eres un experto en crypto publicando en Binance Square en espanol. Posts directos, naturales, con gancho. Siempre empiezas con emoji + titulo impactante. Sin hashtags. Sin saludos. Solo datos reales." },
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
