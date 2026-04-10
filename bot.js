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
const BINANCE_IMAGE_URL = "https://www.binance.com/bapi/composite/v1/public/pgc/openApi/content/uploadImageByUrl";
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

// Datos extra sobre criptos conocidas para enriquecer los analisis
const COIN_CONTEXT = {
  BTC: "la primera y mas dominante criptomoneda del mundo, reserva de valor digital, suministro maximo de 21 millones, halvings cada 4 años",
  ETH: "plataforma de contratos inteligentes lider, base de DeFi y NFTs, pasó a Proof of Stake en 2022, con quema deflacionaria de ETH",
  SOL: "blockchain de alta velocidad (65k TPS), bajas comisiones, ecosistema DeFi y NFT muy activo, rival directo de Ethereum",
  XRP: "creada por Ripple para pagos internacionales rapidos, usada por bancos, lleva años en batalla legal con la SEC",
  BNB: "token nativo de Binance, usado para pagar fees con descuento, quema trimestral reduce su suministro constantemente",
  ADA: "blockchain Proof of Stake con enfoque academico, creada por Charles Hoskinson, expansion fuerte en Africa",
  DOGE: "la meme coin original, adoptada como propina y pago por algunas empresas, impulsada por comunidad y Elon Musk",
  AVAX: "blockchain con arquitectura de subredes, finalizacion rapida, competidor directo de Ethereum en DeFi",
  DOT: "protocolo de interoperabilidad entre blockchains, creado por Gavin Wood cofundador de Ethereum",
  LINK: "oraculo descentralizado lider que conecta contratos inteligentes con datos del mundo real",
  MATIC: "solución Layer 2 de Ethereum, escalabilidad y bajas comisiones, rebrandeada como Polygon",
  POL: "token de Polygon, sucesor de MATIC con mayor utilidad en el ecosistema",
  UNI: "token de Uniswap, el exchange descentralizado mas grande, referente del DeFi",
  ATOM: "token del ecosistema Cosmos, enfocado en interoperabilidad entre blockchains",
  LTC: "una de las primeras altcoins, versión mas rapida y barata de Bitcoin",
  TAO: "protocolo de inteligencia artificial descentralizada, mineria basada en modelos de ML",
  INJ: "blockchain Layer 1 para DeFi y derivados, alta velocidad y con quema deflacionaria de tokens",
  SUI: "blockchain nueva generacion con lenguaje Move, alta velocidad, respaldada por ex-equipo de Diem de Meta",
  APT: "blockchain creada por ex-desarrolladores de Diem de Meta, usa Move, enfocada en seguridad y escala",
  OP: "token de Optimism, solución Layer 2 de Ethereum, parte del ecosistema Superchain",
  ARB: "token de Arbitrum, Layer 2 lider de Ethereum por volumen, base de muchos protocolos DeFi",
  NEAR: "blockchain enfocada en usabilidad y escalabilidad, con sharding, competidor de Ethereum",
  FIL: "almacenamiento descentralizado, permite alquilar espacio de disco duro a cambio de FIL",
  RENDER: "red de renderizado descentralizada usando GPUs, muy ligada al boom de la IA",
  FET: "protocolo de agentes de IA autonomos, parte del ecosistema AI crypto en fuerte crecimiento",
};

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
        marketCap: coin.market_cap,
        volume: coin.total_volume,
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

// --- IMAGEN ---

function buildImagePrompt(type, coin) {
  const symbol = coin?.symbol || "BTC";
  const prompts = {
    analisis: `Cryptocurrency market analysis ${symbol} digital art, glowing price chart, abstract financial data, dark background, blue and gold colors, professional trading dashboard aesthetic`,
    noticia_crypto: `Breaking crypto news digital explosion, ${symbol} coin logo glowing, blockchain network, dark moody background, red and orange alert colors, futuristic news broadcast style`,
    resumen_mercado: `Cryptocurrency market overview dashboard, multiple coins floating, green and red candles, digital financial landscape, dark background, neon accents`,
    comparativa: `Two cryptocurrency coins facing off, dueling glowing orbs, abstract versus battle, dark background, electric blue and gold tones`,
    pregunta: `Crypto community question discussion, glowing question mark, ${symbol} coin, social network nodes, dark purple background, vibrant colors`,
    frase_motivacional: `Motivational crypto trader mindset, rocket launching from blockchain, gold coins raining, dark sky background, inspiring digital art`,
    consejo_trading: `Trading strategy concept, chess pieces on cryptocurrency board, glowing screen charts, dark professional atmosphere, green neon accents`,
  };
  return encodeURIComponent(prompts[type] || prompts["analisis"]);
}

async function generateImageUrl(type, coin) {
  // Pollinations genera imagenes directamente sin autenticacion
  const prompt = buildImagePrompt(type, coin);
  const seed = Math.floor(Math.random() * 99999);
  return `https://image.pollinations.ai/prompt/${prompt}?width=1200&height=630&seed=${seed}&nologo=true`;
}

async function uploadImageToBinance(imageUrl) {
  try {
    console.log("Subiendo imagen a Binance...");
    // Descargar imagen primero
    const imgRes = await fetch(imageUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 15000,
    });
    if (!imgRes.ok) throw new Error(`Error descargando imagen: ${imgRes.status}`);

    const buffer = await imgRes.buffer();
    const base64 = buffer.toString("base64");
    const contentType = imgRes.headers.get("content-type") || "image/jpeg";

    // Subir a Binance como base64
    const uploadRes = await fetch(BINANCE_IMAGE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Square-OpenAPI-Key": BINANCE_SQUARE_API_KEY,
        clienttype: "web",
      },
      body: JSON.stringify({
        imageBase64: `data:${contentType};base64,${base64}`,
      }),
    });

    const uploadData = await uploadRes.json();
    if (uploadData.code !== "000000") throw new Error(`Upload error: ${JSON.stringify(uploadData)}`);

    const uploadedUrl = uploadData.data?.url || uploadData.data?.imageUrl;
    if (!uploadedUrl) throw new Error("No se recibio URL de imagen de Binance");

    console.log("Imagen subida correctamente a Binance");
    return { type: "binance", url: uploadedUrl };
  } catch (e) {
    console.error("No se pudo subir imagen a Binance:", e.message);
    return null;
  }
}

async function getImageForPost(type, coin) {
  try {
    console.log("Generando imagen...");
    const pollinationsUrl = await generateImageUrl(type, coin);

    // Intentar subir a Binance
    const binanceResult = await uploadImageToBinance(pollinationsUrl);
    if (binanceResult) return binanceResult;

    // Fallback: usar URL directa de Pollinations
    console.log("Usando URL directa de Pollinations");
    return { type: "url", url: pollinationsUrl };
  } catch (e) {
    console.error("Error generando imagen:", e.message);
    return null;
  }
}

// --- PROMPTS ---

function buildPrompt(type, coins, newsTitle) {
  const coin = pickCoin(coins);
  const coin2 = pickCoin(coins, [coin?.symbol]);
  const top5 = coins.slice(0, 5).map(coinInfo).join("\n");
  const enfoque = ANALISIS_ENFOQUES[analisisIndex % ANALISIS_ENFOQUES.length];
  if (type === "analisis") analisisIndex++;

  const coinContext = COIN_CONTEXT[coin?.symbol] || `criptomoneda con precio actual de $${fmt(coin?.price)}`;
  const coin2Context = COIN_CONTEXT[coin2?.symbol] || `criptomoneda con precio actual de $${fmt(coin2?.price)}`;

  const reglas = `REGLAS ESTRICTAS:
- Espanol, texto plano, sin markdown ni asteriscos
- SIN hashtags, jamas uses #
- Solo usa datos reales que te doy, no inventes precios ni porcentajes
- Si falta algun dato no lo menciones
- Entre 80 y 150 palabras (ni muy corto ni muy largo)
- SIEMPRE empieza con un emoji seguido del titulo impactante en la primera linea
- Ejemplo de inicio correcto: "🚀 SOL al alza y con fuerza..." o "⚡ BTC rompio un nivel clave..."
- No digas sigueme ni guarda este post
- Los emojis deben ir donde aporten, no en cada linea
- En analisis: NO te limites solo al % del dia. Habla de que es el proyecto, su tecnologia, su narrativa, por que importa en el mercado ahora, y luego conecta con el movimiento de precio`;

  const enfoques_analisis = {
    momentum: `Explica brevemente que es ${coin.symbol} y para que sirve (contexto: ${coinContext}). Luego analiza si tiene fuerza real o se esta agotando basandote en el precio actual. No te enfoques solo en el % del dia.`,
    zonas_psicologicas: `Explica brevemente que es ${coin.symbol} (contexto: ${coinContext}). Luego habla de las zonas de precio psicologicas importantes para ${coin.symbol} ahora mismo. Numeros redondos, niveles que el mercado respeta.`,
    sentimiento: `Explica brevemente que es ${coin.symbol} (contexto: ${coinContext}). Luego analiza el sentimiento del mercado hacia ${coin.symbol} ahora mismo. Miedo, euforia, o calma? Conecta con su narrativa actual.`,
    fuerza_precio: `Menciona brevemente el proposito de ${coin.symbol} (contexto: ${coinContext}). Luego analiza si el movimiento de precio de ${coin.symbol} hoy refleja compradores fuertes o vendedores dominando, y que podria significar.`,
    tendencia: `Presenta brevemente ${coin.symbol} y su narrativa (contexto: ${coinContext}). Luego analiza la tendencia actual. Es alcista real, bajista, o lateral engañoso? Por que deberia importarle al mercado.`,
    rebote: `Contextualiza ${coin.symbol} para quien no lo conoce (contexto: ${coinContext}). Luego analiza si esta en zona de posible rebote o si el movimiento de hoy es solo un respiro antes de continuar.`,
    ruptura: `Explica en una linea que hace ${coin.symbol} (contexto: ${coinContext}). Luego analiza si ha roto algun nivel psicologico importante hoy o esta intentando hacerlo, y que implicaria esa ruptura.`,
    acumulacion: `Describe brevemente ${coin.symbol} y por que genera interes (contexto: ${coinContext}). Luego analiza si el comportamiento de hoy sugiere acumulacion silenciosa o distribucion por parte de manos fuertes.`,
    trampa: `Introduce ${coin.symbol} y su propuesta de valor (contexto: ${coinContext}). Luego analiza si el movimiento de hoy podria ser una trampa alcista o bajista para traders impulsivos.`,
    contexto: `Situa ${coin.symbol} en el ecosistema crypto (contexto: ${coinContext}). Luego pon en contexto su movimiento de hoy. Tiene sentido con lo que hace el mercado en general? Que deberia vigilarse.`,
  };

  const titulos_analisis = {
    momentum: rand([`⚡ ${coin.symbol} tiene fuerza o se agota?`, `🔋 ${coin.symbol} — el momentum habla:`]),
    zonas_psicologicas: rand([`📍 Las zonas que mandan en ${coin.symbol}:`, `🗺️ Niveles psicologicos clave en ${coin.symbol}:`]),
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
Redactala directo, sin rodeos. Comenta brevemente que significa para el mercado y para los holders.`,

    resumen_mercado: `${reglas}
Primera linea: emoji + titulo de resumen. Ejemplos: "📊 Asi esta el mercado ahora:" o "🌐 Panorama crypto de hoy:" o "⚡ Lo que mueve el mercado hoy:"
Datos reales:
${top5}
Resume que sube, que baja, como ves el momento general y que deberia vigilar un trader ahora mismo. Sin relleno.`,

    comparativa: `${reglas}
Primera linea: emoji + comparativa directa. Ejemplos: "⚔️ ${coin.symbol} vs ${coin2.symbol} — quien gana hoy?" o "🥊 ${coin.name} vs ${coin2.name}: analisis rapido"
Datos reales:
${coinInfo(coin)}
${coinInfo(coin2)}
Contexto ${coin.symbol}: ${coinContext}
Contexto ${coin2.symbol}: ${coin2Context}
Compara cual tiene mejor momento ahora y por que, considerando su propuesta de valor y movimiento actual. Termina con pregunta.`,

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
Escribe algo breve con gancho, divertido o motivacional. Sin datos de precios obligatorios. Que genere reacciones. Puedes usar formato de lista si aplica.`,

    consejo_trading: `${reglas}
Primera linea: emoji + titulo del consejo directo.
Ejemplos:
"💡 La regla que me cambio el trading:"
"⚠️ El error mas comun en crypto y como evitarlo:"
"📌 Lo que separa a traders que ganan de los que pierden:"
"🎓 Leccion que aprendi a las malas en el mercado:"
"🧠 Algo que nadie te dice cuando empiezas en crypto:"
Comparte un consejo practico y concreto. Directo al punto. Con ejemplos reales si aplica.`,
  };

  return { prompt: prompts[type] || prompts["resumen_mercado"], coin };
}

async function generatePostContent(type, coins, newsTitle) {
  const { prompt, coin } = buildPrompt(type, coins, newsTitle);

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
        { role: "system", content: "Eres un experto en crypto publicando en Binance Square en espanol. Posts directos, naturales, con gancho. Siempre empiezas con emoji + titulo impactante. Sin hashtags. Sin saludos. Solo datos reales. En analisis debes hablar del proyecto en si, su tecnologia o narrativa, no solo del % del dia." },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) throw new Error(`Groq error: ${response.status} ${await response.text()}`);
  const data = await response.json();
  return { content: data.choices[0].message.content.trim(), coin };
}

async function publishToSquare(content, imageData) {
  const body = { bodyTextOnly: content };

  // Agregar imagen si esta disponible
  if (imageData) {
    if (imageData.type === "binance") {
      // Imagen subida a Binance: usar campo de imagen
      body.imageUrlList = [imageData.url];
    } else if (imageData.type === "url") {
      // URL directa: intentar incluirla como imagen externa
      body.imageUrlList = [imageData.url];
    }
  }

  const response = await fetch(BINANCE_SQUARE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Square-OpenAPI-Key": BINANCE_SQUARE_API_KEY,
      clienttype: "web",
    },
    body: JSON.stringify(body),
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

    // Generar contenido e imagen en paralelo para mayor velocidad
    const { content, coin } = await generatePostContent(type, coins, newsTitle);
    const imageData = await getImageForPost(type, coin);

    console.log("Preview:", content.substring(0, 150) + "...");
    if (imageData) console.log("Imagen:", imageData.url.substring(0, 80) + "...");

    const postId = await publishToSquare(content, imageData);
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
