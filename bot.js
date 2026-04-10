/**
 * Bot Binance Square - 30 posts/dia
 * Posts mezclados, variados, sin repeticion
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

// Mezclado completamente al azar con todos los tipos
const POST_TYPES = [
  "analisis_momentum","analisis_zonas","analisis_sentimiento",
  "analisis_volumen","analisis_tendencia","analisis_rebote",
  "analisis_ruptura","analisis_acumulacion","analisis_ciclo","analisis_comparacion_semana",
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
let lastPostTypes = []; // Para evitar repetir el mismo tipo seguido

function getNextType() {
  // Mezclar y elegir un tipo que no se haya usado en los ultimos 3 posts
  const shuffled = [...POST_TYPES].sort(() => Math.random() - 0.5);
  for (const type of shuffled) {
    if (!lastPostTypes.slice(-3).includes(type)) {
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

  const reglas = `REGLAS ESTRICTAS:
- Escribe en espanol, texto plano, sin markdown ni asteriscos
- SIN hashtags, jamas uses #
- Solo usa datos reales que te doy, no inventes precios ni porcentajes
- Si no tienes algun dato, no lo menciones
- Entre 100 y 200 palabras
- NUNCA empieces con Hola, Buenos dias, Saludos ni nada similar
- El titulo o primera linea debe ser UNICO y diferente, no repetir formulas`;

  const prompts = {
    analisis_momentum: `${reglas}
Enfoque: MOMENTUM — si la cripto tiene fuerza o se esta agotando
Datos reales: ${coinInfo(coin)}
Empieza con un titulo impactante y unico sobre el momentum de ${coin.symbol}.
Ejemplo de inicio: "⚡ ${coin.symbol} esta acelerando o frenando?" o "🔋 La fuerza de ${coin.symbol} hoy:"
Analiza si el movimiento de hoy tiene fuerza real o se esta agotando. Termina con pregunta.`,

    analisis_zonas: `${reglas}
Enfoque: ZONAS CLAVE — niveles importantes de precio
Datos reales: ${coinInfo(coin)}
Empieza con titulo unico sobre zonas de precio de ${coin.symbol}.
Ejemplo: "🗺️ Las zonas que manda ${coin.symbol} ahora:" o "📍 Niveles que no puedes ignorar en ${coin.symbol}:"
Habla de los niveles clave basandote en el max y min del dia. Termina con pregunta.`,

    analisis_sentimiento: `${reglas}
Enfoque: SENTIMIENTO — como esta el mercado emocionalmente con esta cripto
Datos reales: ${coinInfo(coin)}
Empieza con titulo unico sobre el sentimiento hacia ${coin.symbol}.
Ejemplo: "🧠 El mercado y ${coin.symbol}: miedo o codicia?" o "😰 Como esta el sentimiento en ${coin.symbol} hoy:"
Analiza si la variacion del dia refleja miedo, euforia o calma. Termina con pregunta.`,

    analisis_volumen: `${reglas}
Enfoque: VOLUMEN — si hay dinero real entrando o saliendo
Datos reales: ${coinInfo(coin)}
Empieza con titulo unico sobre el volumen de ${coin.symbol}.
Ejemplo: "💰 Hay dinero entrando en ${coin.symbol}?" o "📊 El volumen de ${coin.symbol} habla:"
Comenta si el movimiento de precio tiene respaldo de volumen o no. Termina con pregunta.`,

    analisis_tendencia: `${reglas}
Enfoque: TENDENCIA — alcista, bajista o lateral
Datos reales: ${coinInfo(coin)}
Empieza con titulo unico sobre la tendencia de ${coin.symbol}.
Ejemplo: "📈 ${coin.symbol} en tendencia alcista o trampa?" o "🔎 La verdad sobre la tendencia de ${coin.symbol}:"
Analiza la direccion basandote en el cambio del dia. Termina con pregunta.`,

    analisis_rebote: `${reglas}
Enfoque: REBOTE — si la cripto esta rebotando o puede rebotar
Datos reales: ${coinInfo(coin)}
Empieza con titulo unico.
Ejemplo: "🏀 ${coin.symbol} lista para rebotar?" o "↗️ Senales de rebote en ${coin.symbol}:"
Analiza si el precio esta en zona de rebote basandote en el min del dia. Termina con pregunta.`,

    analisis_ruptura: `${reglas}
Enfoque: RUPTURA — si rompio o esta por romper un nivel importante
Datos reales: ${coinInfo(coin)}
Empieza con titulo unico.
Ejemplo: "🚀 ${coin.symbol} rompio niveles importantes hoy?" o "💥 Ruptura en ${coin.symbol}:"
Analiza si el precio del dia representa una ruptura significativa. Termina con pregunta.`,

    analisis_acumulacion: `${reglas}
Enfoque: ACUMULACION — si parece que hay acumulacion institucional o de ballenas
Datos reales: ${coinInfo(coin)}
Empieza con titulo unico.
Ejemplo: "🐋 Las ballenas estan acumulando ${coin.symbol}?" o "👀 Senales de acumulacion en ${coin.symbol}:"
Habla de si el comportamiento del precio sugiere acumulacion. Termina con pregunta.`,

    analisis_ciclo: `${reglas}
Enfoque: CICLO DE MERCADO — en que parte del ciclo esta esta cripto
Datos reales: ${coinInfo(coin)}
Empieza con titulo unico.
Ejemplo: "🔄 En que momento del ciclo esta ${coin.symbol}?" o "📅 ${coin.symbol} y el ciclo del mercado:"
Comenta en que fase parece estar basandote en el movimiento de hoy. Termina con pregunta.`,

    analisis_comparacion_semana: `${reglas}
Enfoque: CONTEXTO — como se ve el movimiento de hoy en contexto
Datos reales: ${coinInfo(coin)}
Empieza con titulo unico.
Ejemplo: "📆 ${coin.symbol} hoy vs lo que se esperaba:" o "🤔 El movimiento de ${coin.symbol} tiene sentido?"
Contextualiza el movimiento del dia. Termina con pregunta.`,

    noticia_crypto: `${reglas}
Empieza con una linea de alerta UNICA como: "${rand(["🚨 ULTIMA HORA —","⚠️ ATENCION —","📢 ACABA DE PASAR —","🔔 BREAKING —","📰 ESTO ACABA DE SALIR —","🌐 NOTICIA DEL MOMENTO —"])}"
Redacta esta noticia real de CoinDesk: "${newsTitle || 'El mercado crypto sigue activo'}"
Comenta brevemente que puede significar para el mercado. Directo y sin rodeos.`,

    resumen_mercado: `${reglas}
Empieza con titulo UNICO como: "${rand(["📊 ASI ESTA EL MERCADO AHORA:","🌐 PANORAMA CRYPTO HOY —","⚡ RESUMEN DEL MERCADO:","📉📈 LO QUE MUEVE EL MERCADO HOY:","🔎 MERCADO EN VIVO:","💹 SNAPSHOT DEL MERCADO:"])}"
Datos reales:
${top5}
Comenta que sube, que baja y como ves el mercado. Concreto y directo.`,

    comparativa: `${reglas}
Empieza con titulo UNICO sobre la comparativa entre ${coin.symbol} y ${coin2.symbol}.
Ejemplos: "⚔️ ${coin.symbol} vs ${coin2.symbol} — quien gana hoy?" o "🥊 ${coin.name} contra ${coin2.name}: analisis rapido"
Datos reales:
${coinInfo(coin)}
${coinInfo(coin2)}
Compara cual tiene mejor momento hoy. Termina pidiendo opinion.`,

    pregunta: `${reglas}
Empieza con un titulo UNICO y provocador sobre ${coin.name}.
Ejemplos: "💬 La pregunta que todos se hacen sobre ${coin.symbol}:" o "🤔 ${coin.symbol} a ${fmt(coin.price * 2)}... posible o locura?" o "❓ Si ${coin.symbol} cae a $${fmt(coin.low * 0.9)}, compras o esperas?"
Dato real: ${coinInfo(coin)}
Desarrolla la pregunta con contexto y termina invitando a comentar.`,

    frase_motivacional: `${reglas}
Empieza con titulo UNICO y divertido.
Ejemplos: "${rand(["😂 La vida del trader crypto:","🚀 Para los que siguen HODLeando:","💀 Cuando el mercado hace lo que quiere:","🧠 Psicologia del trader nivel Dios:","😤 Nadie habla de esto pero todos lo vivimos:","🙏 Mensaje para los que compraron en maximos:","😅 Crypto nunca aburre y eso incluye hoy:"])}"
Escribe algo divertido o motivacional sobre la vida en crypto. Sin datos de precios necesarios. Que genere reacciones.`,

    consejo_trading: `${reglas}
Empieza con titulo UNICO y directo.
Ejemplos: "${rand(["🧠 Lo que separa a los traders que ganan de los que pierden:","💡 Regla que me cambio el trading:","⚠️ El error mas comun en crypto y como evitarlo:","📌 Algo que nadie te dice cuando empiezas:","🎓 Leccion que el mercado me enseno a las malas:"])}"
Comparte un consejo practico sobre trading o gestion de riesgo. Concreto y aplicable.`,
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
      max_tokens: 350,
      messages: [
        { role: "system", content: "Eres un experto en criptomonedas que publica contenido variado, natural y atractivo en Binance Square en espanol. Cada post suena diferente. Nunca inventas datos. Nunca usas hashtags. Nunca empiezas con saludos." },
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
