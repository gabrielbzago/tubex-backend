
let __tubexConsentGranted = false;

let searchTrendCache = null;
let __tubexPlanoLoading = false;

let tubexPlanoAtual = "free";
let tubexPlanoPronto = false;
function gerarTagsFortes(videos, titulo){

  if(!Array.isArray(videos) || videos.length === 0){
    return [];
  }

  const stop = ["como","para","com","sem","mais","isso","video"];

  const phrases = {};
  const keywordsBase = {};

  // =========================
  // 🔥 EXTRAÇÃO
  // =========================
  videos.forEach(v => {

    const title = (v?.snippet?.title || "").toLowerCase();

    const words = title
      .replace(/[^\w\s]/g,"")
      .split(" ")
      .filter(w => w.length > 3 && !stop.includes(w));

    words.forEach(w => {
      keywordsBase[w] = (keywordsBase[w] || 0) + 1;
    });

    for(let i=0;i<words.length;i++){

      const bigram = `${words[i]} ${words[i+1] || ""}`.trim();
      const trigram = `${words[i]} ${words[i+1] || ""} ${words[i+2] || ""}`.trim();

      [bigram, trigram].forEach(p => {
        if(p.length > 6){
          phrases[p] = (phrases[p] || 0) + 2; // 🔥 peso maior
        }
      });

    }

  });

   // =========================
  // 🔥 EXTRAÇÃO REAL DA SERP
  // =========================

  const realTags = {};

  videos.forEach(v => {

    // TAGS REAIS DO VÍDEO
    const tags =
      Array.isArray(v?.snippet?.tags)
        ? v.snippet.tags
        : [];

    tags.forEach(tag => {

      const kw = tag
        .toLowerCase()
        .trim();

      if(
        kw.length < 4
      ) return;

      if(
        kw.split(" ").length > 5
      ) return;

      let bonus = 8;

const lowerTitle =
  (titulo || "").toLowerCase();

const titleWords =
  lowerTitle.split(" ");

const kwWords =
  kw.split(" ");

const matching =
  kwWords.filter(w =>
    titleWords.includes(w)
  ).length;

// 🔥 MATCH DIRETO COM A KEYWORD
bonus += matching * 12;

// 🔥 LONG TAIL
if(kwWords.length >= 3){
  bonus += 10;
}

// 🔥 INTENÇÃO
if(
  kw.includes("como") ||
  kw.includes("melhor") ||
  kw.includes("tutorial") ||
  kw.includes("passo")
){
  bonus += 10;
}

realTags[kw] =
  (realTags[kw] || 0) + bonus;

    });

    // TÍTULO
    const title =
      (v?.snippet?.title || "")
        .toLowerCase()
        .replace(/[^\w\s]/g," ");

    const words = title
      .split(" ")
      .filter(w =>
        w.length > 3 &&
        !stop.includes(w)
      );

    // BIGRAMAS
    for(let i=0;i<words.length;i++){

      const bigram =
        `${words[i]} ${words[i+1] || ""}`
          .trim();

      const trigram =
        `${words[i]} ${words[i+1] || ""} ${words[i+2] || ""}`
          .trim();

      [bigram,trigram].forEach(p => {

        if(
          p.length < 8
        ) return;

        realTags[p] =
          (realTags[p] || 0) + 3;

      });

    }

  });

  // =========================
  // 🔥 MERGE INTELIGENTE
  // =========================
const allKeywords = {
  ...keywordsBase,
  ...phrases,
  ...realTags
};

  // =========================
  // 🔥 BASE MERCADO
  // =========================
  const globalViews = videos
    .map(v => parseInt(v?.statistics?.viewCount))
    .filter(v => !isNaN(v) && v > 0);

  const avgViews = globalViews.length
    ? globalViews.reduce((a,b)=>a+b,0) / globalViews.length
    : 1000;

  const competitionBase = Math.min(100, Math.log10(avgViews + 1) * 18);

  // =========================
  // 🔥 SCORE FINAL
  // =========================
  const results = Object.entries(allKeywords).map(([keyword, freq]) => {

    const kw = keyword.toLowerCase().trim();
    const words = kw.split(" ").filter(Boolean);

    // DEMANDA
    const demand = Math.min(100, freq * 15);

    // VIRAL
    const viral = Math.min(100, freq * 18);

    // INTENÇÃO (🔥 PRINCIPAL)
    let intent = 0;

    if(words.length >= 2) intent += 25;
    if(words.length >= 3) intent += 20;

    if(kw.includes("youtube")) intent += 20;
    if(kw.includes("como")) intent += 15;

    // RUÍDO
    let noise = 0;

    if(words.length === 1) noise += 40;
    if(/^[a-z]{3,12}$/.test(kw) && words.length === 1) noise += 30;
    if(/(news|live|today|official)/.test(kw)) noise += 30;

    // SCORE FINAL
    const score =
      (demand * 0.4) +
      ((100 - competitionBase) * 0.2) +
      (viral * 0.2) +
      (intent * 0.4) -
      noise;

    return {
      keyword: kw,
      score: Math.max(0, Math.round(score)),
      difficulty: Math.round(competitionBase),
      viralChance: Math.round(viral)
    };

  });

  // =========================
  // 🔥 FILTRO FINAL PROFISSIONAL
  // =========================
  return results
    .filter(t => {

      const kw = t.keyword;

      if(kw.length < 10) return false;
      if(kw.split(" ").length < 2) return false;

      // 🔥 remove palavras inúteis
      if(/(mrbeast|minecraft|free fire)/.test(kw)) return false;

      return true;
    })
    .sort((a,b)=>b.score - a.score)
    .slice(0, 30);
}

window.getTagCountAndChars = function(){

  const chips = document.querySelectorAll('ytcp-chip');

  let count = chips.length;
  let totalChars = 0;

  chips.forEach(chip => {
    const text = chip.innerText || "";
    totalChars += text.length;
  });

  return {
    count,
    totalChars
  };
}

// ======================================================
// 🔐 CONSENT SYSTEM (OBRIGATÓRIO)
// ======================================================
async function tubexCheckConsent(){

  return new Promise((resolve)=>{

    chrome.storage.local.get(["tubexConsent"], (data)=>{
      resolve(data.tubexConsent === true);
    });

  });

}

// ======================================================
// GOOGLE TRENDS
// ======================================================


async function obterGoogleTrends(keyword){

    return await new Promise(resolve=>{

        chrome.runtime.sendMessage({

            action:"googleTrends",

            keyword

        },resolve);

    });

}

async function tubexCheckLogin(){

  try{

    const data =
      await chrome.storage.local.get([
        "userEmail",
        "accessToken"
      ]);

    const hasLogin =
      !!(
        data?.userEmail &&
        data?.accessToken
      );

    console.log(
      "🔐 Login detectado:",
      hasLogin
    );

    return hasLogin;

  }catch(e){

    console.error(
      "❌ erro tubexCheckLogin:",
      e
    );

    return false;
  }

}

function tubexSaveConsent(){

  chrome.storage.local.set({ tubexConsent: true });

}


function getYouTubeSuggestions(query) {
  return new Promise((resolve) => {

    const cb = "yt_cb_" + Math.random().toString(36).slice(2);

    window[cb] = (data) => {
      resolve(data[1] || []);
      delete window[cb];
      script.remove();
    };

    const script = document.createElement("script");

    script.src = `https://suggestqueries.google.com/complete/search?client=chrome&ds=yt&hl=pt&gl=BR&q=${encodeURIComponent(query)}&callback=${cb}`;

    document.body.appendChild(script);

    setTimeout(() => {
      resolve([]);
      delete window[cb];
      script.remove();
    }, 3000);
  });
}
   


// ======================================================
// ♻️ AUTO RESET GLOBAL (CRÍTICO)
// ======================================================
function resetTubeXState(){

  console.warn("♻️ RESET GLOBAL TubeX");

  window.__tubexAIRunning = false;
  window.__tubexManualAI = false;

  window.__tubexChannelVideos = [];
  window.__tubexPendingVideos = false;

  window.__tubexLastFetch = 0;

}

async function ensureVideosLoaded(){

  try{

    // ======================================================
    // ⚡ CACHE GLOBAL (RÁPIDO)
    // ======================================================
if (
  Array.isArray(window.__tubexChannelVideos) &&
  window.__tubexVideosReady === true
){
  console.log("⚡ usando cache imediato");
  return window.__tubexChannelVideos;
}
    console.warn("⚠ carregando vídeos manualmente...");

    // ======================================================
    // 📡 CHANNEL ID (BLINDADO)
    // ======================================================
    const channelId =
      (typeof tubexGetChannelId === "function")
        ? tubexGetChannelId()
        : null;

    if (!channelId || !channelId.startsWith("UC")) {
      console.warn("🚫 channelId inválido:", channelId);

      // 🔥 garante fluxo mesmo sem ID
      tubexSetChannelVideos([]);
      return [];
    }

    // ======================================================
    // 🚀 REQUEST BACKGROUND (SAFE)
    // ======================================================
    const res = await new Promise((resolve) => {

      try{

        chrome.runtime.sendMessage(
          {
            action: "fetchChannelVideos",
            channelId
          },
          (response) => {

            if (chrome.runtime.lastError) {
              console.warn("⚠ sendMessage error:", chrome.runtime.lastError.message);
              resolve(null);
              return;
            }

            resolve(response);
          }
        );

      }catch(e){
        console.error("💥 erro sendMessage:", e);
        resolve(null);
      }

    });



    // ======================================================
    // 🔥 SUCESSO COM VÍDEOS
    // ======================================================
 if (res && Array.isArray(res.videos)) {

  // 🔥 NOVO (EXATO)
  if(res.advancedTags){
    window.__tubexAdvancedTags = res.advancedTags;
    console.log("🔥 TAGS:", res.advancedTags);
  }

  tubexSetChannelVideos(res.videos);
  return res.videos;
}

    // ======================================================
    // ⚠ FALLBACK (CRÍTICO)
    // ======================================================
    console.warn("⚠ backend sem vídeos → fallback seguro");

    tubexSetChannelVideos([]); // 🔥 garante evento SEMPRE

    return [];

  }catch(e){

    console.error("💥 erro carregar vídeos:", e);

    // ======================================================
    // 🚫 FALLBACK FINAL (NUNCA QUEBRA UI)
    // ======================================================
    tubexSetChannelVideos([]);

    return [];
  }
}

// ======================================================
// 🔢 PARSER DE NÚMEROS (YOUTUBE SAFE)
// ======================================================
function parseNum(val){
  if (!val) return 0;
  if (typeof val === "number") return val;

  let str = String(val).toLowerCase().replace(",", ".");
  let mult = 1;

  if (str.includes("mil") || str.includes("k")) mult = 1000;
  if (str.includes("mi") || str.includes("m")) mult = 1000000;

  const num = parseFloat(str.replace(/[^\d.]/g, ""));
  return isNaN(num) ? 0 : Math.round(num * mult);
}



// ======================================================
// ⏳ WAIT FOR FULL DATA (NÃO TRAVA)
// ======================================================
async function waitForFullData(){

  let attempts = 0;

  while(attempts < 20){

    const videos = window.__tubexChannelVideos;
    const stats = window.__tubexChannelStats;

if (
  Array.isArray(videos) ||
  stats
){
      return {
        videos: videos || [],
        stats: stats || {}
      };
    }

    await new Promise(r => setTimeout(r, 400));
    attempts++;
  }

  console.warn("⚠ timeout full data");

  return {
    videos: window.__tubexChannelVideos || [],
    stats: window.__tubexChannelStats || {}
  };
}

// ======================================================
// 🔢 FORMAT NUMBER (PADRÃO YOUTUBE)
// ======================================================
function formatNumber(num) {

  if (num === null || num === undefined) return '-';

  // se vier string tipo "193,3K" ou "9,15 mi"
  if (typeof num === "string") return num;

  num = Number(num);

  if (isNaN(num)) return '-';

  if (num >= 1_000_000_000) {
    return (num / 1_000_000_000).toFixed(1).replace('.', ',') + 'B';
  }

  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(1).replace('.', ',') + 'M';
  }

  if (num >= 1_000) {
    return (num / 1_000).toFixed(1).replace('.', ',') + 'K';
  }

  return num.toString();
}

async function tubexGetCache(key){
  try{
    const data = await chrome.storage.local.get(key);

    const item = data[key];

    if(!item) return null;

    if(Date.now() - item.time > item.ttl){
      return null;
    }

    return item.data;

  }catch(e){
    console.warn("cache error:", e);
    return null;
  }
}

function getSeoUsage() {
  return parseInt(localStorage.getItem("tubex_seo_usage") || "0", 10);
}


function consumeSeoUsage(keyword){

  const key = "seo_used_" + keyword;

  if (sessionStorage.getItem(key)) {
    console.log("♻️ já consumido nessa sessão:", keyword);
    return false;
  }

  sessionStorage.setItem(key, "1");

  const current = getSeoUsage();
  setSeoUsage(current + 1);

  return true;
}


function showLoading(){

  const panel = document.getElementById("tubex-panel");
  if(!panel) return;

  let loader = document.getElementById("tubex-panel-loading");

  if(!loader){

    loader = document.createElement("div");
    loader.id = "tubex-panel-loading";

    loader.innerHTML = `
      <div class="tubex-loader-box">
        <div class="tubex-spinner"></div>

        <div class="tubex-bar">
<div class="tubex-loading-bar-fill"></div>
        </div>

        <div class="tubex-text">Analisando SEO...</div>
      </div>
    `;

    panel.appendChild(loader);

    // CSS
    const style = document.createElement("style");
    style.innerHTML = `
      #tubex-panel-loading{
        position:absolute;
        inset:0;
        background:rgba(10,10,10,0.85);
        display:flex;
        align-items:center;
        justify-content:center;
        z-index:999;
        border-radius:12px;
      }

      .tubex-loader-box{
        width:180px;
        text-align:center;
      }

      .tubex-spinner{
        width:26px;
        height:26px;
        border:3px solid #333;
        border-top:3px solid #FFD700;
        border-radius:50%;
        margin:0 auto 10px;
        animation:spin 1s linear infinite;
      }

      @keyframes spin{
        to{ transform: rotate(360deg); }
      }

#tab-seo #relevantTitles li{
    color:#374151 !important;
}

html[dark] #tab-seo #relevantTitles li{
    color:#9CA3AF !important;
}

      .tubex-bar{
        width:100%;
        height:5px;
        background:#222;
        border-radius:4px;
        overflow:auto;
        margin-bottom:8px;
      }

.tubex-loading-bar-fill{
        width:40%;
        height:100%;
        background:#FFD700;
      }

      @keyframes loadingBar{
        0%{transform:translateX(-100%)}
        50%{transform:translateX(100%)}
        100%{transform:translateX(100%)}
      }

      .tubex-text{
        font-size:12px;
        color:#aaa;
      }
    `;

    document.head.appendChild(style);
  }

  loader.style.display = "flex";
}



function renderLockedChannelNiche(){

  const el = document.getElementById("tubex-channel-niche");
  if(!el) return;

  el.innerHTML = `
    <div style="
      border:1px dashed rgba(255,215,0,0.35);
      border-radius:12px;
      padding:18px;
      text-align:center;
      background:#0f0f0f;
      margin-top:10px;
    ">
     <div style="color:#FFD700;font-weight:600;margin-bottom:10px;">
  🔒 Nicho disponível no plano Member+
</div>

<div style="font-size:13px;color:#ccc;line-height:1.5;margin-bottom:12px;">
  O algoritmo do YouTube precisa entender <b>claramente sobre o que é o seu canal</b>.  
  Quando seu nicho é bem definido, o sistema aumenta a <b>confiança no seu conteúdo</b> e começa a recomendar seus vídeos para as pessoas certas.
</div>

<div style="font-size:13px;color:#ccc;line-height:1.5;margin-bottom:14px;">
  Este recurso analisa automaticamente o <b>nível de clareza do seu nicho</b> e como o algoritmo enxerga seu canal — um fator decisivo para sair do zero e crescer de forma consistente.
</div>

<button id="tubex-unlock-niche"
  style="
    background:#FFD700;
    border:none;
    padding:10px 18px;
    border-radius:8px;
    font-weight:700;
    cursor:pointer;
  ">
  🔓 Desbloquear análise de nicho
</button>
    </div>
  `;

  // ======================================================
  // 🔥 EVENTO (CORRETO PRA EXTENSÃO)
  // ======================================================
  const btn = document.getElementById("tubex-unlock-niche");

  if (btn) {
    btn.addEventListener("click", () => {
      window.open("https://www.tubex.app.br/#planos", "_blank");
    });
  }
}


// ======================================================
// 🔧 CLAMP (UTIL)
// ======================================================
function clamp(value, min, max){
  return Math.max(min, Math.min(max, value));
}

let seoTimeout;

function tubexInitSEO(){

  // =========================================
  // 🧠 STATE GLOBAL CONTROL
  // =========================================
  let lastKeyword = null;
  let debounceTimer = null;
  let retryAttempts = 0;

  const MAX_RETRIES = 10;

  // =========================================
  // 🔍 GET KEYWORD (ROBUSTO)
  // =========================================
  function getKeyword(){

    let keyword = getCurrentYoutubeSearchQuery();

    if(!keyword || keyword.length < 2){
      const q = new URLSearchParams(window.location.search).get("search_query");
      if(q){
        keyword = decodeURIComponent(q.replace(/\+/g, " "));
      }
    }

    if(!keyword) return null;

    return keyword.trim().toLowerCase();
  }

// =========================================
// 🚀 CORE EXECUTION (PRODUCTION SAFE FINAL)
// =========================================
async function executeSEO(keyword){

  // =========================================
  // 🔒 VALIDAÇÃO ANTES DE QUALQUER LOCK
  // =========================================
  if (!keyword || keyword.length < 2) return;

  const normalizedKeyword = keyword.trim().toLowerCase();




  // =========================================
  // 🚫 DUPLICAÇÃO POR KEYWORD
  // =========================================
  if (normalizedKeyword === lastKeyword && !window.__tubexForceRetry) {
    return;
  }

  // =========================================
  // 🔒 LOCK GLOBAL (ANTI DUPLICAÇÃO REAL)
  // =========================================
 if (window.__tubexSeoLock) {

  console.warn(
    "⚠ lock resetado"
  );

  window.__tubexSeoLock = false;

}

  window.__tubexSeoLock = true;
  window.__tubexSeoRunning = true;
  lastKeyword = normalizedKeyword;

  console.log("🔥 TubeX SEO:", normalizedKeyword);

  try {

    // =========================================
    // ⚡ UX RÁPIDA
    // =========================================
    showLoading();

    await new Promise(r => setTimeout(r, 0));
    await new Promise(requestAnimationFrame);

    // =========================================
    // 🚀 FETCH (UMA VEZ GARANTIDO)
    // =========================================
    await fetchTubeXSeoData(normalizedKeyword);

    // =========================================
    // 👤 PLANO (SINCRONIZADO)
    // =========================================
    const plan = await new Promise(resolve => {
      __tubexGetPlan(p => resolve(String(p || "free").toLowerCase()));
    });

    const isUserAction = window.__tubexUserTriggeredSEO === true;

    // =========================================
    // ⚡ AUTO MODE (NÃO CONSOME)
    // =========================================
    if (!isUserAction) {
      console.log("⚡ SEO automático (sem consumo)");
      window.__tubexSeoBlocked = false;
      return;
    }

    // =========================================
    // 🔒 VALIDAÇÃO + CONSUMO (ÚNICO PONTO)
    // ⚠️ NÃO usa consumeSeoUsage aqui
    // =========================================
    await new Promise(resolve => {

      canUseSeoPanel(plan, (canUse, usadas, limite) => {

     if (!canUse) {

  console.warn(
    "🔒 limite free atingido"
  );

  window.__tubexSeoBlocked = false;

  // 🔥 NÃO destrói a aba
  // 🔥 NÃO remove botões
  // 🔥 NÃO remove listeners
  // 🔥 NÃO remove tabs

  const lock =
    document.getElementById(
      "tubex-seo-lock-msg"
    );

  if(!lock){

    const seoTab =
      document.getElementById(
        "tubex-seo-container"
      );

    if(seoTab){

      const div =
        document.createElement("div");

      div.id =
        "tubex-seo-lock-msg";

      div.style.cssText = `
        margin-top:12px;
        padding:12px;
        border-radius:10px;
        background:#111;
        border:1px solid #FFD700;
        color:#FFD700;
        font-size:13px;
        text-align:center;
      `;

      div.innerHTML = `
        🔒 Limite do plano Free atingido
      `;

      seoTab.appendChild(div);

    }

  }

  resolve();
  return;
}

        window.__tubexSeoBlocked = false;
        resolve();

      });

    });

  } catch (e) {

    console.error("💥 erro executeSEO:", e);

  } finally {

    // =========================================
    // 🔓 LIBERA LOCK (SEMPRE)
    // =========================================
    window.__tubexSeoRunning = false;
    window.__tubexSeoLock = false;
    window.__tubexForceRetry = false;
hidePanelLoading(); // 🔥 ESSA LINHA
setTimeout(() => {
  hidePanelLoading();
}, 8000);

  }
}
  // =========================================
  // ⚡ F5 FIX (RETRY INTELIGENTE)
  // =========================================
  async function boot(){

    while(retryAttempts < MAX_RETRIES){

      const keyword = getKeyword();

      if(keyword){
        await executeSEO(keyword);
        return;
      }

      await new Promise(r => setTimeout(r, 350));
      retryAttempts++;
    }

    console.warn("⛔ SEO não iniciou (sem keyword)");
  }

  // =========================================
  // 🔁 WATCHER (SPA + DIGITAÇÃO)
  // =========================================
  function startWatcher(){

    if(window.__tubexSEOInterval){
      clearInterval(window.__tubexSEOInterval);
    }

    window.__tubexSEOInterval = setInterval(() => {

      const keyword = getKeyword();

      if(!keyword) return;

      // debounce leve
      clearTimeout(debounceTimer);

      debounceTimer = setTimeout(() => {
        executeSEO(keyword);
      }, 150);

    }, 1200);
  }

  // =========================================
  // 🧠 NAVIGATION RESET (YOUTUBE SPA)
  // =========================================
  window.addEventListener("yt-navigate-start", () => {
    console.log("🔄 navegação detectada");
    lastKeyword = null;
    retryAttempts = 0;
  });

  // =========================================
  // 🚀 INIT
  // =========================================
 
  startWatcher();
}




 // ======================================================
// 🚀 TubeX SEO (Backend)
// Todos os cálculos são realizados no backend.
// O frontend apenas exibe os dados.
// ======================================================

function tubexCalculateSEO(data = {}) {

    if (!data || typeof data !== "object") {

        return {

            interest: 0,
            competition: 0,
            opportunity: 0,

            youtubeMetrics: {

                videoCount: 0,
                channelCount: 0,
                averageViews: 0,
                averageLikes: 0,
                averageComments: 0,
                maxViews: 0,
                minViews: 0,
                medianViews: 0

            }

        };

    }

    return {

        // =========================
        // Google Trends
        // =========================

     interest:
    Number(
        data?.interest ??
        data?.data?.interest ??
        0
    ),

        // =========================
        // TubeX Competition
        // =========================

competition:
    Number(
        data?.competitionScore ??
        data?.data?.competitionScore ??
        0
    ),

        // =========================
        // TubeX Opportunity
        // =========================

opportunity:
    Number(
        data?.opportunityScore ??
        data?.data?.opportunityScore ??
        0
    ),
        // =========================
        // Métricas reais do YouTube
        // =========================

     youtubeMetrics: {

    videoCount:
        Number(
            data?.youtubeMetrics?.videoCount ??
            data?.data?.youtubeMetrics?.videoCount ??
            0
        ),

    averageViews:
        Number(
            data?.youtubeMetrics?.averageViews ??
            data?.data?.youtubeMetrics?.averageViews ??
            0
        ),

    averageLikes:
        Number(
            data?.youtubeMetrics?.averageLikes ??
            data?.data?.youtubeMetrics?.averageLikes ??
            0
        ),

    averageComments:
        Number(
            data?.youtubeMetrics?.averageComments ??
            data?.data?.youtubeMetrics?.averageComments ??
            0
        ),

    maxViews:
        Number(
            data?.youtubeMetrics?.maxViews ??
            data?.data?.youtubeMetrics?.maxViews ??
            0
        ),

    minViews:
        Number(
            data?.youtubeMetrics?.minViews ??
            data?.data?.youtubeMetrics?.minViews ??
            0
        ),

    medianViews:
        Number(
            data?.youtubeMetrics?.medianViews ??
            data?.data?.youtubeMetrics?.medianViews ??
            0
        )
}

    };

}
// ======================================================
// 🔧 FIX: tubexSafeStorageGet (FALTAVA)
// ======================================================
function tubexSafeStorageGet(keys, callback){

  try{

    if(!chrome?.runtime?.id){
      console.warn("⚠️ extensão reiniciada (storage)");
      callback({});
      return;
    }

    chrome.storage.local.get(keys, (data)=>{

      if(chrome.runtime.lastError){
        console.warn("Erro storage:", chrome.runtime.lastError.message);
        callback({});
        return;
      }

      callback(data || {});

    });

  }catch(e){

    console.error("Erro tubexSafeStorageGet:", e);
    callback({});

  }

}




function updateSeoLegendas(volume, competition){

    const el = document.getElementById("tubex-seo-legendas");

    if(!el) return;

    // =========================
    // Volume
    // =========================

    const volText =
        volume >= 70
            ? "🔥 Alto volume de buscas"
            : volume >= 40
                ? "⚠️ Volume médio"
                : "📉 Baixo volume";

    // =========================
    // Concorrência
    // 100 = baixa concorrência
    // =========================

    const compText =
        competition >= 70
            ? "🟢 Baixa concorrência"
            : competition >= 40
                ? "🟡 Concorrência média"
                : "🔴 Alta concorrência";

    // =========================
    // Opportunity
    // =========================

    const opp = window.__tubexOpportunity;

    let oppText = "";

    if(opp?.chance){

        oppText =
            opp.chance === "alta"
                ? "🚀 Alta chance de ranquear"

                : opp.chance === "média"
                    ? "⚠️ Chance média de ranquear"

                    : "❌ Baixa chance de ranquear";

    }

    // =========================
    // Keyword Fácil
    // =========================

    const easyText =
        window.__tubexEasyKeyword
            ? "💎 Keyword fácil detectada"
            : "";

    // =========================
    // Mercado Dominado
    // =========================

    const domText =
        window.__tubexDominated
            ? "⚠️ Mercado dominado por canais grandes"
            : "";

    // =========================
    // Render
    // =========================

    el.innerHTML = `
        <div>Volume: ${volText}</div>
        <div>Concorrência: ${compText}</div>

        ${oppText ? `<div>${oppText}</div>` : ""}
        ${easyText ? `<div>${easyText}</div>` : ""}
        ${domText ? `<div>${domText}</div>` : ""}
    `;

}
function tubexGetChannelId(){

  console.log("🔎 tentando pegar channelId...");

  const url = location.href;

  // ======================================================
  // 🎯 1. URL DIRETA (/channel/UC...)
  // ======================================================
  const urlMatch = url.match(/channel\/(UC[\w-]+)/);
  if (urlMatch) {
    console.log("🔥 via URL:", urlMatch[1]);
    return urlMatch[1];
  }

  // ======================================================
  // 🎯 2. WATCH PAGE (🔥 MAIS CONFIÁVEL)
  // ======================================================
  if (location.pathname.startsWith("/watch")) {

    const owner = document.querySelector(
      'ytd-video-owner-renderer a[href*="/channel/"]'
    );

    if (owner?.href) {
      const match = owner.href.match(/channel\/(UC[\w-]+)/);
      if (match) {
        console.log("🔥 via OWNER (watch):", match[1]);
        return match[1];
      }
    }
  }

  // ======================================================
  // 🎯 3. STUDIO (/edit)
  // ======================================================
  if (location.hostname.includes("studio.youtube.com")) {

    try {
      const cfg = window.ytcfg?.data_ || window.ytcfg?.data;

      const id =
        cfg?.CHANNEL_ID ||
        cfg?.INNERTUBE_CONTEXT?.client?.channelId;

      if (id && id.startsWith("UC")) {
        console.log("🔥 via YTCFG (studio):", id);
        return id;
      }
    } catch(e){}
  }

  // ======================================================
  // 🎯 4. PLAYER RESPONSE (fallback WATCH)
  // ======================================================
  try {
    const player = window.ytInitialPlayerResponse;

    const id =
      player?.videoDetails?.channelId ||
      player?.microformat?.playerMicroformatRenderer?.externalChannelId;

    if (id && id.startsWith("UC")) {
      console.log("🔥 via playerResponse:", id);
      return id;
    }
  } catch(e){}

  // ======================================================
  // 🎯 5. ytInitialData (fallback geral)
  // ======================================================
  try {
    const data = window.ytInitialData;

    const id =
      data?.metadata?.channelMetadataRenderer?.externalId ||
      data?.header?.c4TabbedHeaderRenderer?.channelId;

    if (id && id.startsWith("UC")) {
      console.log("🔥 via ytInitialData:", id);
      return id;
    }
  } catch(e){}

  // ======================================================
  // 🎯 6. DOM fallback FINAL
  // ======================================================
  const link = document.querySelector(
    'ytd-channel-name a[href*="/channel/"]'
  );

  if (link?.href) {
    const match = link.href.match(/channel\/(UC[\w-]+)/);
    if (match) {
      console.log("🔥 via DOM fallback:", match[1]);
      return match[1];
    }
  }

  // ======================================================
  // 🎯 7. META (último recurso)
  // ======================================================
  const meta = document.querySelector('meta[itemprop="channelId"]');

  if (meta?.content) {
    console.log("🔥 via META:", meta.content);
    return meta.content;
  }

  console.warn("❌ channelId NÃO encontrado");
  return null;
}





// ======================================================
// ESPERA EDITOR DE TÍTULO (SPA REAL)
// ======================================================
function waitForRealTitleTextbox(callback){

  let tries = 0;

  const interval = setInterval(()=>{

    tries++;

    const boxes = [
      ...document.querySelectorAll(
        'ytcp-social-suggestions-textbox #textbox'
      )
    ];

    // 🔥 pega SOMENTE textbox visível REAL
    const visibleBox = boxes.find(el => {

      const rect = el.getBoundingClientRect();

      return (
        rect.width > 0 &&
        rect.height > 0 &&
        el.offsetParent !== null
      );

    });

    if(visibleBox){

      clearInterval(interval);

      console.log(
        '[TubeX] Textbox REAL do título detectado'
      );

      callback(visibleBox);

    }

    // 🔒 evita interval infinito
    if(tries > 20){

      clearInterval(interval);

      console.warn(
        '❌ textbox do título não encontrado'
      );

    }

  },500);

}


async function ensureOAuthLogin(){

  const data = await new Promise((resolve)=>{
    chrome.storage.local.get(["userEmail"], resolve);
  });

  if(data.userEmail) return data.userEmail;

  const res = await sendToBackground({
    action: "loginOAuth"
  });

  if(!res || !res.success){
    alert("Login necessário");
    throw new Error("Login falhou");
  }

  return res.email;
}

// ===== TubeX PATCH: ler plano de `plan` ou `userPlan` (normalizado) =====
function __tubexGetPlan(cb){

try{

if(!chrome?.runtime?.id){
cb("free");
return;
}

chrome.storage.local.get(['plan','userPlan'], (d)=>{
if(chrome.runtime.lastError){
cb("free");
return;
}

let p = d?.plan || d?.userPlan || "free";

p = String(p).toLowerCase();

if(p === "basic" || p === "starter") p = "start";

cb(p);

});

}catch(e){

console.warn("TubeX context reiniciado");

cb("free");

}

}







// ================================
// TubeX Mini Button + Home Message
// ================================

(function () {

  // ---------- CRIA O BOTÃO ----------
  function createTubeXMinimizedButton() {
    if (document.getElementById('tubex-mini-btn')) return null;

    const btn = document.createElement('button');
    btn.id = 'tubex-mini-btn';
    btn.textContent = '⚡ TubeX';


    btn.style.cssText = `
      margin-left: 8px;
      padding: 6px 10px;
      background: #FFD700;
      color: #121212;
      border: none;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      font-size: 13px;
      white-space: nowrap;
    `;

    btn.addEventListener('click', () => {
      const isHome =
        location.pathname === '/' ||
        location.pathname.startsWith('/feed');

      if (isHome) {
        showTubeXHomePopup();
        return;
      }

      const panel = document.getElementById('tubex-panel');
      if (panel) {
        panel.classList.remove('collapsed');
        panel.style.display = 'block';
      }
    });

    return btn;
  }

function attachTubeXSearchButton(){

  // =====================================
  // 🔒 SOMENTE SEARCH YOUTUBE
  // =====================================

  const isSearchPage =
    location.pathname === "/results" &&
    location.search.includes("search_query");

  if(!isSearchPage){

    document
      .getElementById(
        "tubex-search-btn"
      )
      ?.remove();

    return;
  }

  // =====================================
  // 🚫 DUPLICADO
  // =====================================

  if(
    document.getElementById(
      "tubex-search-btn"
    )
  ){
    return;
  }

  // =====================================
  // 🔍 TOP SEARCH BAR
  // =====================================

  const center =
    document.querySelector(
      "#center"
    );

  if(!center) return;

  // =====================================
  // 🔥 BOTÃO
  // =====================================

  const btn =
    document.createElement("button");

  btn.id =
    "tubex-search-btn";

  btn.innerHTML = `
    <span style="
      font-size:12px;
      color:#f6c84c;
      opacity:.95;
    ">
      ⚡
    </span>

    <span style="
      color:#f3f4f6;
      font-weight:600;
      letter-spacing:.15px;
    ">
      Tube<span style="
        color:#f6c84c;
        font-weight:700;
      ">
        X
      </span>
    </span>
  `;

// =====================================
// 🎨 STYLE
// =====================================

btn.style.cssText = `

  height:32px;

  padding:0 12px;

  margin-left:8px;

  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;

  cursor:pointer;

  flex:none;

  border-radius:10px;

  border:1px solid rgba(250,204,21,.18);

  background:
    linear-gradient(
      135deg,
      #202124 0%,
      #27282B 55%,
      #2D2F33 100%
    );

  backdrop-filter:blur(10px);
  -webkit-backdrop-filter:blur(10px);

  color:#F3F4F6;

  font-family:Inter,Arial,sans-serif;

  font-size:11px;

  font-weight:600;

  letter-spacing:.2px;

  user-select:none;

  transition:
    all .18s ease;

  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.03),
    0 2px 8px rgba(0,0,0,.18);

`;

  // =====================================
  // ✨ HOVER
  // =====================================

  btn.onmouseenter = () => {

    btn.style.transform =
      "translateY(-1px)";

    btn.style.borderColor =
      "rgba(246,200,76,.18)";

    btn.style.boxShadow = `
      inset 0 1px 0 rgba(255,255,255,.04),
      0 4px 14px rgba(0,0,0,.28)
    `;
  };

  btn.onmouseleave = () => {

    btn.style.transform =
      "translateY(0)";

    btn.style.borderColor =
      "rgba(246,200,76,.10)";

    btn.style.boxShadow = `
      inset 0 1px 0 rgba(255,255,255,.03),
      0 2px 10px rgba(0,0,0,.20)
    `;
  };

  // =====================================
  // 🚀 OPEN PANEL
  // =====================================

  btn.onclick = () => {

    const panel =
      document.getElementById(
        "tubex-panel"
      );

    if(!panel) return;

    panel.classList.remove(
      "collapsed"
    );

    panel.style.display =
      "block";
  };

  // =====================================
  // 🔥 INSERE NA SEARCH BAR
  // =====================================

  const searchBox =
    center.querySelector(
      "ytd-searchbox"
    );

  if(searchBox){

    searchBox.insertAdjacentElement(
      "afterend",
      btn
    );

  }else{

    center.appendChild(btn);

  }

}

window.addEventListener(
  "yt-navigate-finish",
  () => {

    setTimeout(() => {

      document
        .getElementById(
          "tubex-search-btn"
        )
        ?.remove();

      attachTubeXSearchButton();

    }, 700);

  }
);

// =====================================
// 🚀 PRIMEIRO CARREGAMENTO (F5)
// =====================================

window.addEventListener("load", () => {

  setTimeout(() => {

    attachTubeXSearchButton();

  }, 1500);

});

function attachTubeXButtonStudio() {

  // 🔒 só Studio
  if (
    !location.hostname.includes(
      "studio.youtube.com"
    )
  ) {
    return;
  }

  // 🔒 somente dashboard
  const isDashboard =
    /^\/channel\/UC/.test(
      location.pathname
    );

  // 🚫 remove fora
  if (!isDashboard) {

    document
      .getElementById(
        "tubex-mini-btn"
      )
      ?.remove();

    return;
  }

  // ====================================
  // 🔥 CONTAINER CORRETO
  // ====================================
  const rightSection =
    document.querySelector(
      "div.ytcpAppHeaderRightSection"
    );

  if (!rightSection) {
    return;
  }

  // 🚫 DUPLICADO
  if (
    document.getElementById(
      "tubex-mini-btn"
    )
  ) {
    return;
  }

  // ====================================
  // 🔥 BOTÃO
  // ====================================
  const btn =
    document.createElement("button");

  btn.id = "tubex-mini-btn";

btn.innerHTML = `
  <span style="
    font-size:12px;

    color:#f6c84c;

    opacity:.95;

    display:flex;
    align-items:center;

    transform:translateY(-.5px);
  ">
    ⚡
  </span>

  <span style="
    color:#f3f4f6;

    letter-spacing:.15px;

    font-weight:600;
  ">
    Tube<span style="
      color:#f6c84c;

      font-weight:700;
    ">
      X
    </span>
  </span>
`;

btn.style.cssText = `
  height:34px;

  padding:0 14px;

  margin-right:10px;

  border:
    1px solid rgba(246,200,76,.10);

  border-radius:14px;

  background:
    linear-gradient(
      135deg,
      rgba(52,42,18,.96) 0%,
      rgba(66,52,22,.96) 55%,
      rgba(44,34,14,.96) 100%
    );

  backdrop-filter: blur(10px);

  color:#f5f5f5;

  font-size:12px;

  font-weight:600;

  display:flex;
  align-items:center;
  gap:7px;

  cursor:pointer;

  flex:none;

  position:relative;

  z-index:999999;

  transition:
    transform .16s ease,
    background .18s ease,
    border-color .18s ease,
    box-shadow .18s ease;

  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.03),
    0 2px 10px rgba(0,0,0,.20);
`;

btn.onmouseenter = () => {

  btn.style.transform =
    "translateY(-1px)";

  btn.style.borderColor =
    "rgba(246,200,76,.18)";

  btn.style.boxShadow = `
    inset 0 1px 0 rgba(255,255,255,.04),
    0 4px 14px rgba(0,0,0,.28)
  `;

  btn.style.background = `
    linear-gradient(
      135deg,
      rgba(64,50,20,.98) 0%,
      rgba(78,60,24,.98) 55%,
      rgba(52,40,16,.98) 100%
    )
  `;
};

btn.onmouseleave = () => {

  btn.style.transform =
    "translateY(0)";

  btn.style.borderColor =
    "rgba(246,200,76,.10)";

  btn.style.boxShadow = `
    inset 0 1px 0 rgba(255,255,255,.03),
    0 2px 10px rgba(0,0,0,.20)
  `;

  btn.style.background = `
    linear-gradient(
      135deg,
      rgba(52,42,18,.96) 0%,
      rgba(66,52,22,.96) 55%,
      rgba(44,34,14,.96) 100%
    )
  `;
};

 btn.onclick = () => {

  const panel =
    document.getElementById(
      "tubex-channel-intel"
    );

  if (!panel) {

    console.warn(
      "❌ painel TubeX não encontrado"
    );

    return;
  }

  // ====================================
  // 🔥 RESTORE PANEL
  // ====================================

  panel.style.display = "block";

  panel.style.visibility = "visible";

  panel.style.opacity = "1";

  panel.style.transform = "translateX(0)";

  panel.style.pointerEvents = "auto";

  panel.style.zIndex = "2147483647";

  // remove collapsed
  panel.classList.remove(
    "collapsed"
  );

  // remove minimized
  panel.classList.remove(
    "minimized"
  );

};

  // ====================================
  // 🔥 INSERE NO COMEÇO DA BARRA
  // ====================================
  rightSection.prepend(btn);

}

 // ---------- INSERE AO LADO DA SEARCH ----------
function attachMiniButtonToSearchBar() {

  // NÃO rodar no YouTube Studio (editor)
  if (location.hostname.includes('studio.youtube.com')) return;

  const masthead = document.querySelector('ytd-masthead');
  if (!masthead) return;

const interval = setInterval(() => {

    const center = document.querySelector("#center");
    const searchBox = document.querySelector("ytd-searchbox");

    if (!center || !searchBox) return;

    clearInterval(interval);

    if(document.getElementById("tubex-search-btn"))
        return;

    // cria botão

},200);
  // Botão principal
  if (!center.querySelector('#tubex-mini-btn')) {
    const btn = createTubeXMinimizedButton();
    if (btn) center.appendChild(btn);
  }

  // Botão planos
  if (!center.querySelector('#tubex-upgrade-btn')) {
    const upgradeBtn = document.createElement('button');
    upgradeBtn.id = 'tubex-upgrade-btn';
    upgradeBtn.textContent = '💎 Planos';

    upgradeBtn.style.cssText = `
      margin-left: 6px;
      padding: 6px 10px;
      background: #111;
      color: #FFD700;
      border: 1px solid #FFD700;
      border-radius: 6px;
      font-weight: 700;
      cursor: pointer;
      font-size: 13px;
    `;

    upgradeBtn.onclick = () => {
      window.open('https://www.tubex.app.br/#planos', '_blank', 'noopener,noreferrer');
    };

    center.appendChild(upgradeBtn);
  }
}



  // ---------- POPUP DA HOME ----------
function showTubeXHomePopup() {
  const old = document.getElementById('tubex-home-popup');
  if (old) old.remove();

  const btn = document.getElementById('tubex-mini-btn');
  if (!btn) return;

  const rect = btn.getBoundingClientRect();

  const popup = document.createElement('div');
  popup.id = 'tubex-home-popup';

  popup.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 8}px;
    left: ${rect.left}px;
    z-index: 2147483647;

    background: #121212;
    color: #ffffff;

    padding: 14px 18px;
    border-radius: 12px;
    max-width: 320px;

    font-size: 14px;
    line-height: 1.5;

    box-shadow: 0 12px 30px rgba(0,0,0,.6);
  `;

  popup.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
      <span style="font-size:18px;">⚡</span>
      <strong style="color:#FFD700;">TubeX</strong>
    </div>
    Faça uma <b>busca por palavra-chave</b> no YouTube para
    analisar <b>volume</b>, <b>concorrência</b> e <b>SEO</b>.
  `;

  document.body.appendChild(popup);

  setTimeout(() => popup.remove(), 4000);
}




// ======================================================
// 🚀 TUBEX BUTTON CONTROL (YOUTUBE STUDIO SPA)
// ======================================================

// ---------- GARANTE PRESENÇA ----------
function ensureButton() {

  // ====================================
  // 🔒 SOMENTE DASHBOARD DO CANAL
  // ====================================
  const isDashboard =

    location.hostname.includes(
      "studio.youtube.com"
    )

    &&

    /^\/channel\/UC/.test(
      location.pathname
    );

  // ====================================
  // 🚫 REMOVE FORA DO DASHBOARD
  // ====================================
  if(!isDashboard){

    document
      .getElementById(
        "tubex-mini-btn"
      )
      ?.remove();

    return;
  }

  // ====================================
  // ✅ CRIA BOTÃO
  // ====================================
  attachTubeXButtonStudio();

}

// ======================================================
// 🔥 YOUTUBE SPA NAVIGATION
// ======================================================
window.addEventListener(
  "yt-navigate-finish",
  () => {

    setTimeout(() => {

      // remove antigo
      document
        .getElementById(
          "tubex-mini-btn"
        )
        ?.remove();

      // recria validando rota
      ensureButton();

    }, 700);

  }
);

// ======================================================
// 👀 OBSERVER SPA
// ======================================================
const observer = new MutationObserver(() => {

  if(window.tubexObserverLock){
    return;
  }

  window.tubexObserverLock = true;

  ensureButton();

  setTimeout(() => {

    window.tubexObserverLock = false;

  }, 2000);

});

// ======================================================
// 🚀 START OBSERVER
// ======================================================
const ytdApp =
  document.querySelector(
    "ytd-app"
  );

observer.observe(
  ytdApp || document.body,
  {
    childList:true,
    subtree:true
  }
);

// ======================================================
// 🚀 INIT
// ======================================================
window.addEventListener(
    "load",
    async () => {

        await tubexFirstInstall();

        ensureButton();

        if(!window.__tubexSEOInitialized){

            window.__tubexSEOInitialized = true;

            setTimeout(() => {

                tubexInitSEO();

            },1200);

        }

    }
);

// init imediato
ensureButton();

})();

function isWatchPage(){
  return location.pathname.startsWith("/watch");
}

function isStudioHome(){

  return (
    location.hostname === "studio.youtube.com"
    &&
    /^\/channel\/UC[\w-]+\/?$/.test(
      location.pathname
    )
  );

}

async function tubexFirstInstall(){

    const data = await chrome.storage.local.get("tubexInstalled");

    if(data.tubexInstalled)
        return;

    await chrome.storage.local.set({

        tubexInstalled: true

    });

    createTubeXMenu();

}

// ======================================================
// SEO SCORE DO TÍTULO
// ======================================================
function atualizarTituloSEO() {

    const textarea =
        document.getElementById("workspaceTitulo");

    if (!textarea) return;

    const barra =
        document.getElementById("tituloSeoBar");

    const texto =
        document.getElementById("tituloSeoScore");

    if (!barra || !texto) return;

    const keyword = (
        document.getElementById("iaKeywordInput")?.value || ""
    ).trim().toLowerCase();

    const titulo = textarea.value.trim();

    // ============================
    // TÍTULO VAZIO
    // ============================

    if (!titulo.length) {

        barra.style.width = "0%";
        barra.style.background = "#ef4444";

        texto.textContent = "0%";
        texto.style.color = "#ef4444";

        return;

    }

    let score = 0;

    const tituloLower = titulo.toLowerCase();

    // ============================
    // Comprimento ideal
    // ============================

    if (titulo.length >= 40)
        score += 20;

    if (titulo.length <= 70)
        score += 20;

    // ============================
    // Palavra-chave
    // ============================

    if (
        keyword &&
        tituloLower.includes(keyword)
    ) {
        score += 20;
    }

    // ============================
    // Número
    // ============================

    if (/\d/.test(titulo))
        score += 10;

    // ============================
    // Emoção
    // ============================

    const emocionais = [

        "segredo",
        "erro",
        "nunca",
        "pare",
        "verdade",
        "explodiu",
        "viral",
        "milhões",
        "incrível",
        "choque",
        "absurdo",
        "rápido",
        "fatal",
        "simples",
        "fácil",
        "proibido",
        "revelado",
        "descubra"

    ];

    if (
        emocionais.some(p => tituloLower.includes(p))
    ) {
        score += 15;
    }

    // ============================
    // Curiosidade
    // ============================

    if (

        titulo.includes("?") ||

        tituloLower.startsWith("como") ||

        tituloLower.includes("por que") ||

        tituloLower.includes("porque") ||

        tituloLower.includes("ninguém")

    ) {
        score += 15;
    }

    // ============================
    // Limite
    // ============================

    score = Math.min(score, 100);

    // ============================
    // Atualiza UI
    // ============================

    barra.style.width = score + "%";
    texto.textContent = score + "%";

    if (score < 40) {

        barra.style.background = "#ef4444";
        texto.style.color = "#ef4444";

    } else if (score < 60) {

        barra.style.background = "#f97316";
        texto.style.color = "#f97316";

    } else if (score < 80) {

        barra.style.background = "#facc15";
        texto.style.color = "#facc15";

    } else {

        barra.style.background = "#22c55e";
        texto.style.color = "#22c55e";

    }

}

// ======================================
// Atualiza em tempo real
// ======================================

document.addEventListener("input", (e) => {

    if (e.target.id === "workspaceTitulo") {
        atualizarTituloSEO();
    }

});

// Inicia em 0%
document.addEventListener("DOMContentLoaded", atualizarTituloSEO);
function canUseTendenciasPanel(plano, callback) {

  if (
    plano === "owner" ||
    plano === "expert" ||
    plano === "pro" ||
    plano === "member"
  ) {
    callback(true);
    return;
  }

  callback(false);
}



// ======================================================
// 🔄 NAVIGATION HANDLER (CORRIGIDO E ESTÁVEL)
// ======================================================
window.addEventListener("yt-navigate-finish", () => {

  console.log("🔄 navegação detectada");

  // ======================================================
  // 🔒 RESET GLOBAL
  // ======================================================
  if (window.__tubexChannelLoading) {
    console.warn("♻️ resetando lock de carregamento");
    window.__tubexChannelLoading = false;
  }

  // ======================================================
  // 🔥 SEO (1x por sessão)
  // ======================================================
  try {
    if (!window.__tubexSEOInitialized) {
      window.__tubexSEOInitialized = true;
      tubexInitSEO();
    }
  } catch (e) {
    console.warn("⚠️ erro no SEO init:", e);
  }

  // ======================================================
  // 🚀 ESPERA CANAL + BOOT (ORDEM CORRETA)
  // ======================================================
  try {

waitForChannelReady(async () => {

  console.log("✅ canal pronto → iniciando TubeX");

  await new Promise(r => setTimeout(r, 800));

  (async ()=>{

  const logged =
    await tubexCheckLogin();

// =====================================
// 🚀 AUTO LOGIN FLOW
// =====================================

// inicia sistema imediatamente

tubexInitSEO();


// =====================================
// 🔐 LOGIN SILENCIOSO
// =====================================

try{

  chrome.runtime.sendMessage({

    action:"silentGoogleAuth"

  }, async(response)=>{

    console.log(
      "🔐 OAuth response:",
      response
    );

    // =================================
    // LOGIN OK
    // =================================

    if(
      response &&
      response.success
    ){

      console.log(
        "✅ login automático OK"
      );

      // atualiza UI premium
      window.dispatchEvent(

        new CustomEvent(
          "tubexPlanUpdated"
        )

      );

    }

  });

}catch(e){

  console.warn(
    "⚠ auth init error:",
    e
  );

}

  // =====================================
  // COM LOGIN
  // =====================================


})();

});

  } catch (e) {
    console.error("💥 erro ao iniciar canal:", e);
  }

});

// ======================================================
// TENDÊNCIAS - ESTILO
// ======================================================

if (!document.getElementById("tendencias-card-style")) {

  const isDark =
    document.documentElement.hasAttribute("dark");

  const cardBg = isDark
    ? "rgba(255,255,255,.04)"
    : "rgba(255,255,255,.74)";

  const cardBorder = isDark
    ? "rgba(255,255,255,.06)"
    : "rgba(0,0,0,.08)";

  const textPrimary = isDark
    ? "#F3F4F6"
    : "#111827";

  const textSecondary = isDark
    ? "#9CA3AF"
    : "#6B7280";

  const chipBg = isDark
    ? "rgba(255,255,255,.05)"
    : "rgba(255,255,255,.90)";

  const chipBorder = isDark
    ? "rgba(255,255,255,.08)"
    : "rgba(0,0,0,.08)";

  const chartBackground = isDark
    ? "rgba(255,255,255,.03)"
    : "rgba(255,255,255,.82)";

  const style = document.createElement("style");

  style.id = "tendencias-card-style";

  style.textContent = `

/* ===========================================
   CARD
=========================================== */

.tend-card{

  background:${cardBg};

  backdrop-filter:blur(16px) saturate(170%);
  -webkit-backdrop-filter:blur(16px) saturate(170%);

  border:1px solid ${cardBorder};

  border-radius:14px;

  padding:16px 14px 12px;

  margin-bottom:14px;

  color:${textPrimary};

  font-size:13px;

  box-shadow:
    0 8px 24px rgba(0,0,0,.16),
    inset 0 1px 0 rgba(255,255,255,.04);

  transition:
    background .18s ease,
    border-color .18s ease,
    box-shadow .18s ease;

}

.tend-card:hover{

  border-color:${isDark
    ? "rgba(255,255,255,.12)"
    : "rgba(0,0,0,.12)"};

}

/* ===========================================
   VERIFIED
=========================================== */

.tubex-verified{

  color:#38BDF8;

  font-weight:700;

  margin-left:6px;

}

/* ===========================================
   TITLE
=========================================== */

.tend-title{

  font-size:15px;

  font-weight:700;

  color:${textPrimary};

  margin-bottom:6px;

  letter-spacing:.02em;

}

/* ===========================================
   METRICS
=========================================== */

.tend-metric{

  margin-bottom:4px;

  color:${textSecondary};

  font-size:13px;

  line-height:1.55;

}

/* ===========================================
   KEYWORDS
=========================================== */

.tend-keywords span{

  display:inline-block;

  margin:3px;

  padding:5px 10px;

  border-radius:999px;

  background:${chipBg};

  backdrop-filter:blur(14px);

  -webkit-backdrop-filter:blur(14px);

  border:1px solid ${chipBorder};

  color:${textPrimary};

  font-size:12px;

  font-weight:600;

}

/* ===========================================
   LINKS
=========================================== */

.tend-link{

  color:#38BDF8;

  text-decoration:none;

  font-size:12px;

  font-weight:600;

}

.tend-link:hover{

  text-decoration:underline;

}

/* ===========================================
   RECOMENDAÇÕES
=========================================== */

.tend-recom li{

  color:${textPrimary};

  font-size:12.5px;

  line-height:1.65;

  margin-bottom:5px;

}

/* ===========================================
   CONTAINER
=========================================== */

#tendencias-content{

  flex:1;

  overflow-y:auto;

  padding-bottom:10px;

}

/* ===========================================
   GRÁFICO
=========================================== */

#graficoTendencias{

  display:block;

  margin:auto;

  margin-bottom:14px;

  max-width:100%;

  height:auto;

  border-radius:14px;

  background:${chartBackground};

  backdrop-filter:blur(16px) saturate(170%);
  -webkit-backdrop-filter:blur(16px) saturate(170%);

  border:1px solid ${cardBorder};

  box-shadow:
    0 8px 24px rgba(0,0,0,.16),
    inset 0 1px 0 rgba(255,255,255,.04);

}

/* ===========================================
   ANÁLISE
=========================================== */

#detalhesTendenciaMes{

  margin-top:12px;

  color:${textSecondary};

  font-size:13px;

  line-height:1.6;

}

`;

  document.head.appendChild(style);

}

// ======================================================
// 🔎 Keyword REAL do YouTube (URL + input)
// ======================================================
function getCurrentYoutubeSearchQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('search_query');
    if (q && q.trim()) {
      return decodeURIComponent(q.replace(/\+/g, ' ')).trim();
    }
    const input = document.querySelector('input#search');
    if (input && input.value.trim()) {
      return input.value.trim();
    }
    return '';
  } catch (e) {
    return '';
  }
}

function gerarTagsDosVideos(videos, tituloBase){

  if(!Array.isArray(videos) || !videos.length) return [];

  const tagMap = {};

  // =========================
  // 🧠 1. TAGS DOS VÍDEOS (COM PESO)
  // =========================
  videos.forEach(v => {

    const views = Number(v?.statistics?.viewCount || 0);
    const likes = Number(v?.statistics?.likeCount || 0);
    const comments = Number(v?.statistics?.commentCount || 0);

    const score = views + (likes * 20) + (comments * 40);

    const tags = v?.snippet?.tags || [];

    tags.forEach(tag => {

      const clean = tag.toLowerCase().trim();

      if(!clean || clean.length < 3) return;

      if(!tagMap[clean]){
        tagMap[clean] = 0;
      }

      tagMap[clean] += score;

    });

  });

  // =========================
  // 🧠 2. EXTRAIR DO TÍTULO DOS VÍDEOS (MUITO IMPORTANTE)
  // =========================
  videos.forEach(v => {

    const title = (v?.snippet?.title || "").toLowerCase();

    const words = title.match(/\b\w{4,}\b/g) || [];

    words.forEach(w => {

      if(!tagMap[w]){
        tagMap[w] = 0;
      }

      tagMap[w] += 50; // peso médio

    });

  });

  // =========================
  // 🧠 3. EXTRAIR DO SEU TÍTULO
  // =========================
  const baseWords = (tituloBase || "")
    .toLowerCase()
    .match(/\b\w{4,}\b/g) || [];

  baseWords.forEach(w => {

    if(!tagMap[w]){
      tagMap[w] = 0;
    }

    tagMap[w] += 200; // 🔥 MUITO PESO (mais importante)

  });

  // =========================
  // 🚫 FILTRO LIXO
  // =========================
  const blacklist = [
    "video","youtube","como","para","com","sem",
    "the","and","this","that"
  ];

  const final = Object.entries(tagMap)
    .filter(([tag]) => !blacklist.includes(tag))
    .sort((a,b) => b[1] - a[1])
    .slice(0, 20)
    .map(([tag]) => tag);

  console.log("🏆 TAGS INTELIGENTES:", final);

  return final;
}
function copiarTagsTubeX(){

  let tags = window.__tubexTags;

  if(tags instanceof Set){
    tags = Array.from(tags);
  }

  if(!Array.isArray(tags) || !tags.length){
    alert("Nenhuma tag encontrada.");
    return;
  }

  const limpas = tags
    .map(t => String(t)
      .replace(/^#/, "")
      .replace(/[^\w\s-]/g, "")
      .trim()
    )
    .filter(Boolean);

  const unicas = [...new Set(limpas)];

  const textoFinal = unicas.join(", ");

  navigator.clipboard.writeText(textoFinal);

  console.log("✅ COPIADO LIMPO:", textoFinal);
}


function gerarPalavrasRelacionadas(videos){

  if(!videos || !videos.length) return [];

  const stopwords = [
    "de","da","do","para","com","sem","um","uma","o","a","os","as",
    "em","no","na","por","como","que","se","é","e","mais","menos"
  ];

  const freq = {};
videos = (videos || []).filter(v =>
  v &&
  typeof v === "object"
);
  videos.forEach(v => {
    const title = v?.snippet?.title || "";

    title
      .toLowerCase()
      .split(/[\s\-|:,.!?]+/)
      .forEach(word => {

        if(word.length < 4) return;
        if(stopwords.includes(word)) return;

        freq[word] = (freq[word] || 0) + 1;

      });

  });

  return Object.entries(freq)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,15)
    .map(([w])=>w);
}

function updateSeoGauge(){

    console.log("UPDATE SEO GAUGE");

    // =========================
    // DADOS OFICIAIS DO BACKEND
    // =========================

    const volume =
        Number(window.__seoVolume || 0);

    const competition =
        Number(window.__seoCompetition || 0);

    const interest =
        Number(window.__seoInterest || 0);

    const opportunity =
        Number(window.__seoOpportunity || 0);

    // =========================
    // SEO SCORE OFICIAL
    // =========================

const targetScore = Math.round(

    Math.min(

        100,

        (

            competition * 0.75 +

            volume      * 0.25 +

            interest    * 0.10 +

            opportunity * 0.10

        )

    )

);
console.log({
    volume,
    competition,
    interest,
    opportunity,
    targetScore
});

    // =========================
    // CANVAS
    // =========================

    const canvas =
        document.getElementById("seoGauge");

    if(!canvas) return;

    const ctx =
        canvas.getContext("2d");

    const width = canvas.width;
    const height = canvas.height;

    const centerX = width / 2;
    const centerY = height * 0.78;

    const radius = 74;
    const lineWidth = 10;
    const needleLength = radius - 8;

    const duration = 800;

    const start =
        performance.now();

    let current =
        window.__gaugeCurrent || 0;
    // =========================
    // EASING
    // =========================

    function easeOutCubic(t){

        return 1 - Math.pow(1 - t, 3);

    }

    // =========================
    // PALETA
    // =========================

    function getColor(score){

        if(score >= 75){

            return "#22C55E"; // Verde

        }

        if(score >= 40){

            return "#F59E0B"; // Amarelo

        }

        return "#EF4444"; // Vermelho

    }

function draw(score){

    ctx.clearRect(0,0,width,height);

    // =========================
    // Ângulos
    // =========================

    const startAngle = Math.PI + 0.14;
    const endLimit   = (Math.PI * 2) - 0.14;

    const endAngle =
        startAngle +
        ((endLimit - startAngle) * score / 100);

    // =========================
    // Track
    // =========================

    ctx.beginPath();

    ctx.arc(
        centerX,
        centerY,
        radius,
        startAngle,
        endLimit
    );

    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#243247";

    ctx.stroke();

    // =========================
    // Cor do Gauge
    // =========================

    const gradient = ctx.createLinearGradient(
        centerX - radius,
        centerY,
        centerX + radius,
        centerY
    );

    if(score >= 75){

        gradient.addColorStop(0,"#22C55E");
        gradient.addColorStop(1,"#4ADE80");

    }else if(score >= 50){

        gradient.addColorStop(0,"#F59E0B");
        gradient.addColorStop(1,"#FACC15");

    }else{

        gradient.addColorStop(0,"#EF4444");
        gradient.addColorStop(1,"#F87171");

    }

    // =========================
    // Progress
    // =========================

    ctx.beginPath();

    ctx.arc(
        centerX,
        centerY,
        radius,
        startAngle,
        endAngle
    );

    ctx.lineWidth = 11;
    ctx.lineCap = "round";
    ctx.strokeStyle = gradient;

    ctx.shadowColor = gradient;
    ctx.shadowBlur = 14;

    ctx.stroke();

    ctx.shadowBlur = 0;

    // =========================
    // Centro
    // =========================

    ctx.beginPath();

    ctx.arc(
        centerX,
        centerY,
        3,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = "#E5E7EB";
    ctx.fill();

    // =========================
    // Tema
    // =========================

    const isDark =
        document.documentElement.hasAttribute("dark");

    const scoreColor =
        isDark ? "#F8FAFC" : "#111827";

    const labelColor =
        isDark ? "#9CA3AF" : "#6B7280";

    // =========================
    // Número
    // =========================

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

ctx.font = "700 36px Inter";

    ctx.fillStyle = scoreColor;

    ctx.fillText(
        `${Math.round(score)}%`,
        centerX,
        centerY - 24
    );

    // =========================
    // Label
    // =========================

    ctx.font = "600 11px Inter";

    ctx.fillStyle = labelColor;

    ctx.fillText(
        "SEO SCORE",
        centerX,
        centerY + 10
    );

}

function animate(now){

    const elapsed = now - start;

    const progress = Math.min(
        elapsed / duration,
        1
    );

    const eased = easeOutCubic(progress);

    current +=
        (targetScore - current) *
        eased * 0.20;

    window.__gaugeCurrent = current;

    const seoScoreEl =
        document.getElementById("seoScore");

    if(seoScoreEl){

        const isDark =
            document.documentElement.hasAttribute("dark");

        const textPrimary =
            isDark
                ? "#F3F4F6"
                : "#111827";

        const textSecondary =
            isDark
                ? "#9CA3AF"
                : "#6B7280";

        let nivel = "Baixo";
        let cor = "#EF4444";
        let descricao = "Baixa chance de ranqueamento";

        if(current >= 75){

            nivel = "Excelente";
            cor = "#22C55E";
            descricao = "Grande potencial de ranqueamento";

        }
        else if(current >= 60){

            nivel = "Alto";
            cor = "#22C55E";
            descricao = "Boa otimização";

        }
        else if(current >= 40){

            nivel = "Médio";
            cor = "#FACC15";
            descricao = "Ainda pode melhorar";

        }

     seoScoreEl.innerHTML = `

<div style="
text-align:center;
font-size:26px;
font-weight:700;
color:${cor};
margin-bottom:14px;
">
${nivel}
</div>

<div style="
display:flex;
justify-content:space-between;
align-items:center;
gap:18px;

width:100%;
max-width:260px;

margin:0 auto;

padding-top:10px;

border-top:1px solid rgba(255,255,255,.06);
">

<span style="
flex:1;

color:${textSecondary};

font-size:11px;

text-align:left;

white-space:nowrap;
overflow:hidden;
text-overflow:ellipsis;
">

${descricao}

</span>

<span style="
flex:none;

font-weight:700;

font-size:13px;

color:${textPrimary};
">

${Math.round(current)}/100

</span>

</div>

`;

    }

    draw(current);

    if(progress < 1){

        requestAnimationFrame(animate);

    }else{

        window.__gaugeCurrent = targetScore;

    }

}

requestAnimationFrame(animate);
}


function generateEstimatedTrend(volume, competition, keyword){

    const trend = [];

    // =====================================
    // HASH DETERMINÍSTICO
    // =====================================

    let seed = hashString(keyword);

    function random(){

        seed =
            (seed * 9301 + 49297) % 233280;

        return seed / 233280;

    }

    // =====================================
    // MÉDIA DE PESQUISAS/DIA
    // =====================================

    const average = Math.round(

        150 +

        Math.pow(volume,1.55) * 26

    );

    // =====================================
    // FORÇA DA TENDÊNCIA
    // =====================================

    const marketScore =

        volume * 0.65 +

        competition * 0.35;

    let trendForce = 0;

    if(marketScore >= 85){

        trendForce = 0.008;

    }else if(marketScore >= 70){

        trendForce = 0.005;

    }else if(marketScore >= 50){

        trendForce = 0.002;

    }else if(marketScore >= 30){

        trendForce = -0.001;

    }else{

        trendForce = -0.004;

    }

    // =====================================
    // INÍCIO
    // =====================================

    let current =

        average *

        (0.90 + random()*0.20);

    // =====================================
    // EVENTOS DE PICO
    // =====================================

    const spikeDays = [];

    const spikeCount =

        volume >= 80

            ? 3

            : volume >= 60

                ? 2

                : 1;

    for(let i=0;i<spikeCount;i++){

        spikeDays.push(

            Math.floor(

                random()*30

            )

        );

    }

    // =====================================
    // 30 DIAS
    // =====================================

    for(let day=0;day<30;day++){

        // tendência principal

        current *=

            1 + trendForce;

        // regressão à média

        current +=

            (average-current)

            *0.04;

        // ciclo semanal

        current +=

            Math.sin(

                day/7 *

                Math.PI*2

            )

            *

            average

            *

            0.05;

        // ciclo mensal

        current +=

            Math.sin(

                day/15

            )

            *

            average

            *

            0.03;

        // finais de semana

        if(day%7===5 || day%7===6){

            current *=

                1.03 +

                random()*0.03;

        }

        // pico de interesse

        if(spikeDays.includes(day)){

            current *=

                1.12 +

                random()*0.12;

        }

        // ruído natural

        current +=

            (random()-0.5)

            *

            average

            *

            0.025;

        // limites

        current = Math.max(

            average*0.55,

            current

        );

        current = Math.min(

            average*1.65,

            current

        );

        trend.push({

            day: day+1,

            value: Math.round(current)

        });

    }

    return trend;

}

function drawTrendTooltip(
    ctx,
    x,
    y,
    value,
    day
){

    const date = new Date();

    date.setDate(

        date.getDate()

        - (29-day)

    );

    const dayText =

        date.toLocaleDateString(

            "pt-BR",

            {

                day:"2-digit",

                month:"short"

            }

        );

    const valueText =

        value.toLocaleString("pt-BR")+

        " pesquisas";

    ctx.font="600 11px Inter";

    const width=

        Math.max(

            ctx.measureText(dayText).width,

            ctx.measureText(valueText).width

        )+28;

    const height=48;

    ctx.fillStyle="#1F2937";

    roundRect(

        ctx,

        x-width/2,

        y-62,

        width,

        height,

        8

    );

    ctx.fill();

    // Data

    ctx.fillStyle="#9CA3AF";

    ctx.font="500 10px Inter";

    ctx.textAlign="center";

    ctx.fillText(

        dayText,

        x,

        y-44

    );

    // Valor

    ctx.fillStyle="#FFFFFF";

    ctx.font="700 11px Inter";

    ctx.fillText(

        valueText,

        x,

        y-24

    );

}

function roundRect(ctx,x,y,w,h,r){

    ctx.beginPath();

    ctx.moveTo(x+r,y);

    ctx.arcTo(x+w,y,x+w,y+h,r);

    ctx.arcTo(x+w,y+h,x,y+h,r);

    ctx.arcTo(x,y+h,x,y,r);

    ctx.arcTo(x,y,x+w,y,r);

    ctx.closePath();

}

// ======================================================
// TUBEX TREND CHART
// ======================================================

let hoveredTrendIndex = -1;
let trendEventsAttached = false;

function renderSearchTrend(data){

    const canvas =
        document.getElementById(
            "searchTrendChart"
        );

    if(!canvas)
        return;

    const ctx =
        canvas.getContext("2d");

    const width =
        canvas.width;

    const height =
        canvas.height;

    // =====================================
    // TEMA
    // =====================================

    const isDark =
        document.documentElement.hasAttribute("dark") ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;

    const textPrimary =
        isDark
            ? "#F3F4F6"
            : "#111827";

    const textSecondary =
        isDark
            ? "#9CA3AF"
            : "#6B7280";

    const gridColor =
        isDark
            ? "rgba(255,255,255,.08)"
            : "rgba(0,0,0,.08)";

    ctx.clearRect(
        0,
        0,
        width,
        height
    );

    // =====================================
    // VALIDAÇÃO
    // =====================================

    if(
        !Array.isArray(data) ||
        data.length < 2
    ){

        ctx.fillStyle =
            textSecondary;

        ctx.font =
            "600 12px Inter";

        ctx.textAlign =
            "center";

        ctx.fillText(

            "Sem dados",

            width/2,

            height/2

        );

        return;

    }

    // =====================================
    // CONVERTE
    // =====================================

    const values = data.map(item=>{

        if(typeof item==="number")
            return item;

        return Number(
            item.value || 0
        );

    });

    // =====================================
    // LAYOUT
    // =====================================

const paddingLeft = 36;
const paddingRight = 18;
const paddingTop = 28;
const paddingBottom = 30;

    const graphWidth =
        width-paddingLeft-paddingRight;

    const graphHeight =
        height-paddingTop-paddingBottom;

    // =====================================
    // ESTATÍSTICAS
    // =====================================

    const max =
        Math.max(...values);

    const min =
        Math.min(...values);

    const average =
        Math.round(

            values.reduce(
                (a,b)=>a+b,
                0
            )

            /

            values.length

        );

    const first =
        values[0];

    const last =
        values[
            values.length-1
        ];

    const percent =

        first > 0

            ? Math.round(

                (

                    last-first

                )

                /

                first

                *100

            )

            : 0;

// =====================================
// ESCALA PROFISSIONAL
// =====================================

const range =

    Math.max(

        1,

        max - min

    );

// margem dinâmica (12% da média ou 20% da variação)
const margin =

    Math.max(

        range * 0.20,

        average * 0.12

    );

// limites reais
let chartMax =

    max + margin;

let chartMin =

    Math.max(

        0,

        min - margin

    );

// =====================================
// ARREDONDAMENTO INTELIGENTE
// =====================================

const scaleRange =

    chartMax - chartMin;

const exponent =

    Math.floor(

        Math.log10(scaleRange)

    );

const base =

    Math.pow(

        10,

        exponent

    );

let step =

    base;

if(scaleRange / base < 2){

    step = base / 5;

}else if(scaleRange / base < 5){

    step = base / 2;

}

// arredonda extremos
chartMax =

    Math.ceil(

        chartMax / step

    ) * step;

chartMin =

    Math.floor(

        chartMin / step

    ) * step;

// segurança
if(chartMax <= chartMin){

    chartMax =

        chartMin + step;

}

// =====================================
// CONVERTE Y
// =====================================

function getY(value){

    // Evita divisão por zero
    const range =

        Math.max(

            1,

            chartMax-chartMin

        );

    // Normaliza entre 0 e 1
    let ratio =

        (value-chartMin)

        /

        range;

    // Garante que fique dentro da área
    ratio =

        Math.max(

            0,

            Math.min(

                1,

                ratio

            )

        );

    // Converte para coordenada Y
    return (

        paddingTop +

        (1-ratio)

        * graphHeight

    );

}
    // =====================================
    // PONTOS
    // =====================================

    const points =

        values.map(

            (value,index)=>{

                return{

                    value,

                    x:

                        paddingLeft+

                        (

                            graphWidth

                            *

                            index

                            /

                            (

                                values.length-1

                            )

                        ),

                    y:

                        getY(value)

                };

            }

        );

    // =====================================
    // UI EXTERNA
    // =====================================

    const statusEl =
        document.getElementById(
            "searchTrendStatus"
        );

    const averageEl =
        document.getElementById(
            "searchAverage"
        );

    const percentEl =
        document.getElementById(
            "searchTrendPercent"
        );

    if(statusEl){

        if(percent>=8){

            statusEl.textContent =
                "Em Alta";

            statusEl.style.color =
                "#22C55E";

        }else if(percent<=-8){

            statusEl.textContent =
                "Em Baixa";

            statusEl.style.color =
                "#EF4444";

        }else{

            statusEl.textContent =
                "Estável";

            statusEl.style.color =
                "#FACC15";

        }

    }

    if(averageEl){

        averageEl.textContent =

            average.toLocaleString("pt-BR")

            +" pesquisas/dia";

        averageEl.style.color =
            textPrimary;

    }

    if(percentEl){

        percentEl.textContent =

            `${percent>0?"+":""}${percent}%`;

        percentEl.style.color =

            percent>=0

                ? "#22C55E"

                : "#EF4444";

    }


// =====================================
// GRADE
// =====================================

ctx.save();

ctx.strokeStyle =
    gridColor;

ctx.lineWidth = 1;

ctx.setLineDash([3,3]);

const gridLines = 5;

for(let i=0;i<gridLines;i++){

    const y =

        paddingTop +

        (

            graphHeight /

            (gridLines-1)

        )

        * i;

    ctx.beginPath();

    ctx.moveTo(

        paddingLeft,

        y

    );

    ctx.lineTo(

        width-paddingRight,

        y

    );

    ctx.stroke();

}

ctx.restore();

ctx.setLineDash([]);

 // =====================================
// ESCALA LATERAL
// =====================================

ctx.fillStyle =
    textSecondary;

ctx.font =
    "500 10px Inter";

ctx.textAlign =
    "right";

ctx.textBaseline =
    "middle";

const labels = 5;

const valueStep =

    (chartMax-chartMin)

    /

    (labels-1);

for(let i=0;i<labels;i++){

    const value =

        chartMax -

        valueStep*i;

    const y =

        paddingTop +

        graphHeight *

        i /

        (labels-1);

    ctx.fillText(

        Math.round(value).toLocaleString("pt-BR"),

        paddingLeft-8,

        y

    );

}
       

    // =====================================
    // ÁREA
    // =====================================

    ctx.beginPath();

    ctx.moveTo(

        points[0].x,

        height-paddingBottom

    );

    ctx.lineTo(

        points[0].x,

        points[0].y

    );

    for(let i=1;i<points.length;i++){

        const prev =

            points[i-1];

        const curr =

            points[i];

        const cpX =

            (prev.x+curr.x)/2;

        ctx.bezierCurveTo(

            cpX,

            prev.y,

            cpX,

            curr.y,

            curr.x,

            curr.y

        );

    }

    ctx.lineTo(

        points.at(-1).x,

        height-paddingBottom

    );

    ctx.closePath();

    const areaGradient =

        ctx.createLinearGradient(

            0,

            paddingTop,

            0,

            height

        );

    areaGradient.addColorStop(

        0,

        "rgba(34,197,94,.28)"

    );

    areaGradient.addColorStop(

        .65,

        "rgba(34,197,94,.08)"

    );

    areaGradient.addColorStop(

        1,

        "rgba(34,197,94,0)"

    );

    ctx.fillStyle =
        areaGradient;

    ctx.fill();

    // =====================================
    // LINHA
    // =====================================

    ctx.beginPath();

    ctx.moveTo(

        points[0].x,

        points[0].y

    );

    for(let i=1;i<points.length;i++){

        const prev =

            points[i-1];

        const curr =

            points[i];

        const cpX =

            (prev.x+curr.x)/2;

        ctx.bezierCurveTo(

            cpX,

            prev.y,

            cpX,

            curr.y,

            curr.x,

            curr.y

        );

    }

    const lineGradient =

        ctx.createLinearGradient(

            0,

            0,

            width,

            0

        );

    lineGradient.addColorStop(

        0,

        "#4ADE80"

    );

    lineGradient.addColorStop(

        .5,

        "#22C55E"

    );

    lineGradient.addColorStop(

        1,

        "#16A34A"

    );

    ctx.strokeStyle =
        lineGradient;

    ctx.lineWidth = 3;

    ctx.lineCap =
        "round";

    ctx.lineJoin =
        "round";

    ctx.shadowColor =
        "rgba(34,197,94,.35)";

    ctx.shadowBlur = 12;

    ctx.stroke();

    ctx.shadowBlur = 0;

    // =====================================
    // PONTOS
    // =====================================

    points.forEach((point,index)=>{

        const isActive =
            hoveredTrendIndex===index;

        // Glow

        ctx.beginPath();

        ctx.arc(

            point.x,

            point.y,

            isActive ? 10 : 7,

            0,

            Math.PI*2

        );

        ctx.fillStyle =

            isActive

                ? "rgba(34,197,94,.25)"

                : "rgba(34,197,94,.12)";

        ctx.fill();

        // Ponto

        ctx.beginPath();

        ctx.arc(

            point.x,

            point.y,

            isActive ? 5 : 3,

            0,

            Math.PI*2

        );

        ctx.fillStyle="#22C55E";

        ctx.fill();

    });

    // =====================================
    // PONTO EM HOVER
    // =====================================

    if(

        hoveredTrendIndex>=0 &&

        points[hoveredTrendIndex]

    ){

        const p =

            points[
                hoveredTrendIndex
            ];

        // Linha Vertical

        ctx.beginPath();

        ctx.strokeStyle =
            "rgba(255,255,255,.12)";

        ctx.setLineDash([5,5]);

        ctx.moveTo(

            p.x,

            paddingTop

        );

        ctx.lineTo(

            p.x,

            height-paddingBottom

        );

        ctx.stroke();

        ctx.setLineDash([]);

        // Tooltip

        const value =

            p.value.toLocaleString("pt-BR") +

            " pesquisas";

        ctx.font =
            "600 11px Inter";

        const textWidth =

            ctx.measureText(value).width;

        const boxWidth =

            textWidth+20;

        const boxHeight = 28;

        let tx =

            p.x-boxWidth/2;

        let ty =

            p.y-42;

        if(tx<6)

            tx=6;

        if(tx+boxWidth>width-6)

            tx=

                width-boxWidth-6;

        if(ty<6)

            ty=

                p.y+16;

        // Fundo

        ctx.fillStyle=

            "rgba(17,24,39,.96)";

        ctx.beginPath();

        roundRect(

            ctx,

            tx,

            ty,

            boxWidth,

            boxHeight,

            8

        );

        ctx.fill();

        ctx.strokeStyle=

            "rgba(255,255,255,.08)";

        ctx.stroke();

        // Texto

        ctx.fillStyle="#FFF";

        ctx.textAlign="center";

        ctx.fillText(

            value,

            tx+boxWidth/2,

            ty+18

        );

    }
    // =====================================
// EVENTS
// =====================================

attachSearchTrendEvents();

function attachSearchTrendEvents(){

    if(trendEventsAttached)
        return;

    trendEventsAttached = true;

    canvas.addEventListener(

        "mousemove",

        e=>{

            const rect =
                canvas.getBoundingClientRect();

            // Corrige diferença entre tamanho CSS e tamanho real do canvas
            const scaleX =
                canvas.width /
                rect.width;

            const mouseX =

                (e.clientX - rect.left)

                * scaleX;

            const index =

                Math.round(

                    (

                        mouseX -

                        paddingLeft

                    )

                    /

                    graphWidth

                    *

                    (

                        values.length - 1

                    )

                );

            const newIndex =

                Math.max(

                    0,

                    Math.min(

                        index,

                        values.length - 1

                    )

                );

            // evita render desnecessário
            if(newIndex === hoveredTrendIndex)
                return;

            hoveredTrendIndex =
                newIndex;

            requestAnimationFrame(()=>{

                renderSearchTrend(data);

            });

        }

    );

    canvas.addEventListener(

        "mouseleave",

        ()=>{

            if(hoveredTrendIndex === -1)
                return;

            hoveredTrendIndex = -1;

            requestAnimationFrame(()=>{

                renderSearchTrend(data);

            });

        }

    );

}
searchTrendCache = {

    data,

    values,

    canvas,

    paddingLeft,

    paddingRight,

    paddingTop,

    paddingBottom,

    graphWidth,

    graphHeight

};

// reanexa eventos sempre
trendEventsAttached = false;

attachSearchTrendEvents();
}


function gerarTagsPorKeyword(videos, keyword){

  if(!Array.isArray(videos) || videos.length === 0) return [];

  const map = {};

  keyword = String(keyword || "").toLowerCase();

  videos.forEach(v => {

    const title = (v?.snippet?.title || "").toLowerCase();
    const views = Number(v?.statistics?.viewCount || 0);

    const weight = Math.log10(views + 1) * 10;

    // palavras do título
    const words = title.match(/\b[a-zA-ZÀ-ÿ]{4,}\b/g) || [];

    words.forEach(w => {
      map[w] = (map[w] || 0) + weight;
    });

  });

  // keyword base (mais importante)
  const base = keyword.match(/\b[a-zA-ZÀ-ÿ]{3,}\b/g) || [];

  base.forEach(w => {
    map[w] = (map[w] || 0) + 100;
  });

  return Object.entries(map)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,20)
    .map(([t])=>t);
}

// ======================================================
// 🔎 FETCH SEO REAL (VERSÃO PROFISSIONAL RESTAURADA)
// ======================================================
async function fetchTubeXSeoData(keyword){


  try{

if(window.__tubexFetchingSEO){
  console.warn("⛔ já executando");


  return;
}

    window.__tubexFetchingSEO = true;
if(
  window.__tubexLastSEOKeyword === keyword &&
  !window.__tubexForceRetry
){
  window.__tubexFetchingSEO = false;


  return;
}


window.__tubexLastSEOKeyword = keyword;

const plan = await new Promise(resolve => __tubexGetPlan(resolve));

const access = await canUseSeoPanel(plan, true);


if (!access.allowed) {


  const panel = document.getElementById("tab-seo");

  if(panel){
hidePanelLoading();
panel.innerHTML = `

  <!-- 🔥 RECRIA A BADGE AQUI -->
  <div id="seo-usage-badge-container"
       style="text-align:right;margin-bottom:6px;"></div>

  <div style="
    background: linear-gradient(180deg,#1a1a1a,#0f0f0f);
    padding:18px;
    border-radius:12px;
    color:#fff;
    text-align:center;
    border:1px solid #2a2a2a;
    box-shadow:0 10px 25px rgba(0,0,0,0.5);
  ">
    <div style="font-size:16px;font-weight:700;margin-bottom:8px;">
      ⚠️ Limite diário atingido
    </div>

    <div style="font-size:13px;color:#bbb;margin-bottom:14px;line-height:1.5;">
      Você já usou todas as análises SEO de hoje.<br>
      Continue analisando palavras-chave, concorrência e tendências <b>sem limites</b>.
    </div>

    <div style="
      background:#111;
      border:1px solid #2a2a2a;
      border-radius:10px;
      padding:12px;
      margin-bottom:14px;
      font-size:13px;
    ">
      🔓 Desbloqueie agora:
      <div style="margin-top:6px;color:#FFD700;font-weight:600;">
        ✔ SEO ilimitado<br>
        ✔ Análise completa de concorrência<br>
        ✔ Sugestões avançadas com IA
      </div>
    </div>

    <div style="
      font-size:12px;
      color:#999;
      margin-bottom:10px;
    ">
      🚀 Usado por criadores que crescem mais rápido
    </div>

    <a href="https://tubex.app.br/#planos" target="_blank"
      style="
        display:inline-block;
        background:#FFD700;
        color:#000;
        padding:10px 18px;
        border-radius:8px;
        font-weight:700;
        text-decoration:none;
        transition:0.2s;
      "
      onmouseover="this.style.opacity='0.85'"
      onmouseout="this.style.opacity='1'"
    >
      🔥 Desbloquear agora
    </a>

  </div>
`;
  }

updateSeoUsageBadge(
  window.__tubexPlano || "free",
  window.__tubexConsultasHoje || 0,
  window.__tubexLimite || 0
);

renderConsultaVisual();
  return;
}

    if(!keyword || keyword.trim().length < 2){
      console.warn("[TubeX] Keyword inválida");
      return;
    }

    console.log("[TubeX] Buscando SEO:", keyword);

let res;

try{

    res = await sendToBackground({

        action:"fetchSeoData",

        keyword

    });

}catch(e){

    console.error(
        "[TubeX] sendMessage falhou:",
        e
    );

    window.__tubexFetchingSEO = false;

    return;

}
if(res?.usage){

  console.log("📊 USAGE REAL:", res.usage);

  window.__tubexConsultasHoje = res.usage.count;
  window.__tubexLimite = res.usage.limit;

}

if(res && res.usage){

  window.__tubexConsultasHoje = res.usage.count;
  window.__tubexLimite = res.usage.limit;

  renderConsultaVisual();
}

// ============================
// 🔥 DEBUG PESADO (OBRIGATÓRIO)
// ============================



console.log("🔥 RES COMPLETA BACKGROUND:", res);

// =====================================
// 🔥 FALLBACK GLOBAL (COLE AQUI)
// =====================================
if(!res || !res.success){

  console.warn("🚫 API falhou → fallback ativado");

  // usa último resultado válido
  if(window.__tubexLastSeo){
    res = window.__tubexLastSeo;
    console.log("⚡ usando cache SEO");
  }else{
    // fallback bruto
    res = {
      success: true,
      volume: 50,
      competition: 50,
      items: window.__tubexSearchVideos || []
    };
  }
}

if(!window.__tubexRetryCount) window.__tubexRetryCount = 0;

if(res && res.success){
  window.__tubexRetryCount = 0;
}

// 💾 salva último válido
if(res && res.success){
  window.__tubexLastSeo = res;
}

if(!res && window.__tubexRetryCount < 2){

const planRetry = await new Promise(resolve => __tubexGetPlan(resolve));
const accessRetry = await canUseSeoPanel(planRetry, false);

if (!accessRetry.allowed) {
  console.warn("🚫 retry cancelado (plano bloqueado)");
  return;
}

  window.__tubexRetryCount++;

  setTimeout(() => {
    fetchTubeXSeoData(keyword);
  }, 1000);
}

// ============================
// 🔥 NORMALIZAÇÃO DE DADOS (FIX FINAL)
// ============================
let volume = null;
let competition = null;

let videos = [];

// =====================================
// ✅ PRIORIDADE 1: API (items)
// =====================================
if(res && Array.isArray(res.items) && res.items.length > 0){

  videos = res.items;
  console.log("✅ usando items direto:", videos.length);

}

// =====================================
// ✅ PRIORIDADE 2: fallback API (data.videos)
// =====================================
else if(Array.isArray(res?.data?.videos) && res.data.videos.length > 0){

  videos = res.data.videos;
  console.log("✅ usando fallback data.videos:", videos.length);

}

// =====================================
// 🔥 PRIORIDADE 3: CACHE LOCAL
// =====================================
else if(window.__tubexSearchVideos && window.__tubexSearchVideos.length > 0){

  console.warn("⚠️ usando cache local de vídeos");

  videos = window.__tubexSearchVideos;

}

// =====================================
// 🚨 PRIORIDADE 4: FALLBACK TOTAL
// =====================================
else{

    console.warn("⚠️ Nenhum vídeo retornado.");

    videos = [];

    // continua usando os dados do backend
}
// ======================================================
// 🚀 DADOS OFICIAIS DO BACKEND
// ======================================================

// Atualiza as variáveis existentes
volume = Number(res.volume || 0);

competition = Number(
    res.competitionScore ??
    res.competition ??
    0
);

interest = Number(
    res.interest || 0
);

opportunity = Number(
    res.opportunityScore || 0
);

youtubeMetrics =
    res.youtubeMetrics || {

        videoCount: 0,

        channelCount: 0,

        averageViews: 0,

        averageLikes: 0,

        averageComments: 0,

        maxViews: 0,

        minViews: 0,

        medianViews: 0

    };

console.log("🚀 BACKEND SEO", {

    volume,

    competition,

    interest,

    opportunity,

    youtubeMetrics

});
    // ======================================================
    // 🔒 NORMALIZAÇÃO
    // ======================================================
   volume = clamp(volume, 0, 100);
competition = clamp(competition, 0, 100);

  // ======================================================
// 🌍 ESTADO GLOBAL
// ======================================================
    window.__tubexVolume = volume;
    window.__tubexCompetition = competition;
// ======================================================
// 🚀 UI PRINCIPAL
// ======================================================
volume = Number(volume);
competition = Number(competition);
volume = Number(volume);
competition = Number(competition);
updateSeoUI(volume, competition);
renderConsultaVisual();

if(volume === 0 && videos.length){
  console.warn("⚠️ fallback inteligente ativado");
  const seo = tubexCalculateSEO(videos);
  volume = seo.volume;
  competition = seo.competition;
}

// ======================================================
// 🔥 VISIBILIDADE
// ======================================================

let seoScore;

// fallback seguro (NUNCA quebra pipeline)
try {

  if (window.__tubexSearchVideos && window.__tubexSearchVideos.length > 0) {

    seoScore = Math.round(
  (volume * 0.6) +
  ((competition) * 0.4)
);


  } else {

    seoScore = Math.round((volume + competition) / 2);

  }

} catch (e) {

  console.warn("⚠️ erro no cálculo avançado:", e);
  seoScore = Math.round((volume + competition) / 2);



}

window.__seoVolume = volume;
window.__seoCompetition = competition;
window.__seoInterest = interest;
window.__seoOpportunity = opportunity;

    calcularVisibilidade(
      cached.volume,
      cached.competition,
      seoScore
    );
const opportunityData = {

    score: Number(res.opportunityScore || 0),

    chance:
        Number(res.opportunityScore || 0) >= 75
            ? "alta"
            : Number(res.opportunityScore || 0) >= 50
            ? "média"
            : "baixa"

};

window.__tubexOpportunity = opportunityData;

const finalScore = Math.round(
    (seoScore * 0.6) +
    (opportunityData.score * 0.4)
);

window.__seoVolume = volume;
window.__seoCompetition = competition;
window.__seoInterest = interest;
window.__seoOpportunity = opportunity;

updateSeoGauge(finalScore);
hidePanelLoading();

waitForSeoDOM(() => {

  console.log("🎯 RENDER SEO UI");

  // =========================
  // 🏷️ TAGS
  // =========================
  if (videos.length) {

    const keyword = getCurrentYoutubeSearchQuery();
    const tags = gerarTagsPorKeyword(videos, keyword);

    if (typeof populateSuggestedTags === "function") {
      populateSuggestedTags(tags);
    }
  }

  // =========================
  // 🔥 PALAVRAS RELACIONADAS
  // =========================
  const related = gerarPalavrasRelacionadas(videos);

  if (typeof populateRelatedKeywords === "function") {
    populateRelatedKeywords(related);
  }

  // =========================
  // 🧠 TÍTULOS
  // =========================
  const titles = videos
    .slice(0, 10)
    .map(v => v?.snippet?.title)
    .filter(Boolean);

  if (typeof populateRelevantTitles === "function") {
    populateRelevantTitles(titles);
  }

  // =========================
  // 🎥 TOP VIDEO
  // =========================
  const validVideos = videos.filter(v =>
    v?.snippet && v?.statistics
  );

  if (validVideos.length) {

const top = [...validVideos].sort((a, b) =>
      Number(b.statistics.viewCount || 0) -
      Number(a.statistics.viewCount || 0)
    )[0];

    populateVideoStats({
      thumbnailUrl: top?.snippet?.thumbnails?.medium?.url || "",
      title: top?.snippet?.title || "Sem título",
      viewCount: Number(top?.statistics?.viewCount || 0),
      likeCount: Number(top?.statistics?.likeCount || 0),
      commentCount: Number(top?.statistics?.commentCount || 0),
      channelTitle: top?.snippet?.channelTitle || ""
    });
  }

// =====================================
// 📈 PESQUISAS DOS ÚLTIMOS 30 DIAS
// =====================================

console.log("====== SEARCH TREND ======");
console.log("volume:", volume);
console.log("competition:", competition);
console.log("keyword:", keyword);
console.log("trend backend:", res.trend);

if (

    typeof renderSearchTrend === "function" &&

    Array.isArray(res.trend)

){

    console.log(
        "Renderizando trend do backend."
    );

    renderSearchTrend(
        res.trend
    );

}else{

    console.warn(
        "Trend não recebido do backend."
    );

}

console.log("==========================");

});

    // ======================================================
    // 🎯 UI (BARRAS)
    // ======================================================
if(!Array.isArray(videos) || videos.length < 1){
  console.warn("⛔ SEO sem dados suficientes");
  return;
}

    // ======================================================
    // 🚀 RESTAURA MOTOR COMPLETO (SEM ADICIONAR NADA EXTERNO)
    // ======================================================

    try{

if(
    !chrome?.runtime?.id
){
    console.warn(
        "[TubeX] contexto da extensão inválido."
    );

    return;
}

      if(!location.pathname.startsWith("/results")){

        if(typeof renderVideoOpportunity === "function"){
          renderVideoOpportunity(); // 🔥 corrigido
        }

      }

      if(typeof initTubeXTagsAutoDetect === "function"){
        initTubeXTagsAutoDetect();
      }

      if(typeof carregarDadosTendencias === "function"){
const currentKeyword = getCurrentYoutubeSearchQuery();
carregarDadosTendencias(currentKeyword);
      }

    }catch(e){
      console.warn("[TubeX] erro módulos:", e);
    }

  }catch(err){

    console.error("[TubeX] ERRO fetch SEO:", err);
    applySeoFallback(window.__tubexSearchVideos || []);


  }
finally {

    // 🔥 GARANTE LIBERAÇÃO SEMPRE
    window.__tubexFetchingSEO = false;
}
}

function renderUpgradeBlock(count, limit){

  return `
    <div style="
      background: linear-gradient(135deg,#0f0f0f,#1a1a1a);
      border:1px solid #2a2a2a;
      border-radius:16px;
      padding:20px;
      text-align:center;
      box-shadow:0 20px 50px rgba(0,0,0,0.6);
      animation:fadeIn .3s ease;
    ">

      <!-- 🔒 TÍTULO -->
      <div style="
        font-size:16px;
        font-weight:800;
        color:#ff4d4d;
        margin-bottom:8px;
      ">
        🚫 Limite diário atingido
      </div>

      <!-- 📊 USO -->
      <div style="
        font-size:13px;
        color:#aaa;
        margin-bottom:14px;
      ">
        Você usou <b style="color:#FFD700">${count}/${limit}</b> análises hoje
      </div>

      <!-- 💎 VALOR -->
      <div style="
        background:#111;
        border:1px solid #2a2a2a;
        border-radius:12px;
        padding:14px;
        margin-bottom:16px;
        font-size:13px;
        color:#ddd;
        line-height:1.6;
      ">
        🔓 Desbloqueie agora:<br>
        <span style="color:#FFD700;font-weight:700;">
          ✔ SEO ilimitado<br>
          ✔ Dados reais do YouTube<br>
          ✔ IA de crescimento de canal
        </span>
      </div>

      <!-- 🚀 PROVA SOCIAL -->
      <div style="
        font-size:12px;
        color:#777;
        margin-bottom:14px;
      ">
        🚀 Criadores usam TubeX para crescer mais rápido
      </div>

      <!-- 🔥 BOTÃO PREMIUM -->
      <button id="tubex-upgrade-btn"
        style="
          width:100%;
          background:linear-gradient(135deg,#FFD700,#ffcc00);
          color:#000;
          border:none;
          padding:12px;
          border-radius:10px;
          font-weight:900;
          font-size:14px;
          cursor:pointer;
          transition:all .2s ease;
          box-shadow:0 6px 20px rgba(255,215,0,0.3);
        "
        onmouseover="this.style.transform='scale(1.03)'"
        onmouseout="this.style.transform='scale(1)'"
      >
        🚀 Desbloquear acesso ilimitado
      </button>

      <!-- 💬 URGÊNCIA -->
      <div style="
        font-size:11px;
        color:#666;
        margin-top:10px;
      ">
        ⚡ Liberação imediata • Sem limites
      </div>

    </div>
  `;
}

  // --- POPULA PALAVRAS RELACIONADAS ---
  function populateRelatedKeywords(keywords) {

  let list = document.getElementById('relatedKeywords');

  if (!list) {
    const panel = document.querySelector('#tab-seo') || document.body;

    list = document.createElement('ul');
    list.id = 'relatedKeywords';

    panel.appendChild(list);

    console.log("⚠️ created relatedKeywords dynamically");
  }

  list.innerHTML = '';

  keywords.forEach(kw => {
    const li = document.createElement('li');
    li.textContent = kw;
    list.appendChild(li);
  });

  console.log("✅ RELATED RENDERIZADO");
}


function monitorarMudancaTags() {

  const chipBar = document.querySelector('ytcp-chip-bar');
  if (!chipBar) return;

  if (window.tagsObserver) {
    window.tagsObserver.disconnect();
  }

  window.tagsObserver = new MutationObserver(() => {
    atualizarEstadoSugestoes();
  });

  window.tagsObserver.observe(chipBar, {
    childList: true,
    subtree: true
  });
}

function atualizarEstadoSugestoes() {
  // Só desabilite ou mude aparência dos botões conforme limite,
  // NÃO reinjete todo o container!
  // Exemplo:
  const { count, totalChars } = getTagCountAndChars();
  document.querySelectorAll('#suggestedTags span').forEach(span => {
    if (count >= 30 || totalChars + span.textContent.length + 1 > 500) {
      span.style.opacity = 0.4;
      span.style.pointerEvents = 'none';
    } else {
      span.style.opacity = 1;
      span.style.pointerEvents = 'auto';
    }
  });
}

function populateRelevantTitles(titles) {

  const list = document.getElementById('relevantTitles');

  if (!list) {
    console.warn("❌ #relevantTitles não encontrado");
    return;
  }

  if (!Array.isArray(titles) || !titles.length) {
    list.innerHTML = "<li style='color:#888'>Sem títulos encontrados</li>";
    return;
  }

  list.innerHTML = '';

  titles.forEach(title => {

    if (!title) return;

    const li = document.createElement('li');

    li.textContent = title;

    // estilo opcional (combina com seu UI)
    li.style.marginBottom = "6px";
    li.style.fontSize = "12px";
    li.style.color = "#ddd";

    list.appendChild(li);
  });

  console.log("✅ Títulos renderizados:", titles.length);
}


function waitForSeoDOM(callback){

  let tries = 0;

  const interval = setInterval(()=>{

    const panel =
      document.getElementById("tubex-seo-score-panel") ||
      document.getElementById("tubex-panel");

    if (panel) {

      clearInterval(interval);

      console.log("✅ SEO DOM PRONTO (FORÇADO)");

      callback();
    }

    tries++;

    if (tries > 50) {
      clearInterval(interval);
      console.warn("❌ SEO DOM NÃO ENCONTRADO (IGNORADO)");
      callback(); // 🔥 MESMO ASSIM EXECUTA
    }

  }, 200);
}


// ======================================================
// 🔁 FALLBACK CENTRALIZADO (RESTAURADO)
// ======================================================
function applySeoFallback(videos){

  try{

    // ❌ NÃO sobrescreve se já tem dados válidos
    if(window.__tubexVolume > 0 || window.__tubexCompetition > 0){
      console.warn("🛑 fallback bloqueado — já existe SEO válido");
      return;
    }

    const list = videos || [];

    const seo = tubexCalculateSEO(list);

    const volume = clamp(seo.volume, 0, 100);
    const competition = clamp(seo.competition, 0, 100);

    window.__tubexVolume = volume;
    window.__tubexCompetition = competition;

    updateSeoUI(volume, competition);

  }catch(e){
    console.error("[TubeX] erro fallback:", e);
  }
}


function updateSeoUI(volume, competition){

    let attempts = 0;

    const interval = setInterval(()=>{

        const volumeEl =
            document.getElementById("tubex-volume");

        const competitionEl =
            document.getElementById("tubex-competition");

        if(volumeEl && competitionEl){

            clearInterval(interval);

            // =====================================
            // NORMALIZA
            // =====================================

            volume = clamp(volume, 0, 100);
            competition = clamp(competition, 0, 100);

            // =====================================
            // BARRAS
            // =====================================

            volumeEl.style.width =
                volume + "%";

            competitionEl.style.width =
                competition + "%";

            // =====================================
            // CORES DAS BARRAS
            // =====================================

            volumeEl.style.background =
                volume >= 70
                    ? "#22C55E"
                    : volume >= 40
                    ? "#FACC15"
                    : "#EF4444";

            // Na TubeX: maior = menor concorrência
            competitionEl.style.background =
                competition >= 70
                    ? "#22C55E"
                    : competition >= 40
                    ? "#FACC15"
                    : "#EF4444";

            // =====================================
            // PONTEIROS
            // =====================================

            movePointer(
                "pointer-volume",
                volume
            );

            movePointer(
                "pointer-competition",
                competition
            );

            // =====================================
            // TEXTO DO VOLUME
            // =====================================

            const volumeValue =
                document.getElementById("volumeValue");

            if(volumeValue){

                let texto = "Muito Baixo";
                let cor = "#EF4444";

                if(volume >= 85){

                    texto = "Muito Alto";
                    cor = "#22C55E";

                }else if(volume >= 70){

                    texto = "Alto";
                    cor = "#4ADE80";

                }else if(volume >= 50){

                    texto = "Médio";
                    cor = "#FACC15";

                }else if(volume >= 30){

                    texto = "Baixo";
                    cor = "#F59E0B";

                }

                volumeValue.textContent = texto;
                volumeValue.style.color = cor;

            }

            // =====================================
            // TEXTO DA CONCORRÊNCIA
            // (100 = menor concorrência)
            // =====================================

            const competitionValue =
                document.getElementById("competitionValue");

            if(competitionValue){

                let texto = "Muito Alta";
                let cor = "#EF4444";

                if(competition >= 85){

                    texto = "Muito Baixa";
                    cor = "#22C55E";

                }else if(competition >= 70){

                    texto = "Baixa";
                    cor = "#4ADE80";

                }else if(competition >= 50){

                    texto = "Média";
                    cor = "#FACC15";

                }else if(competition >= 30){

                    texto = "Alta";
                    cor = "#F59E0B";

                }

                competitionValue.textContent = texto;
                competitionValue.style.color = cor;

            }

            // =====================================
            // LEGENDA
            // =====================================

            updateSeoLegendas(
                volume,
                competition
            );

            console.log(
                "✅ [TubeX UI OK]",
                {
                    volume,
                    competition
                }
            );
    return;

        }

        attempts++;

        if(attempts > 30){

            clearInterval(interval);

            console.warn(
                "❌ [TubeX] Timeout ao atualizar UI."
            );

        }

    }, 260);

}

function generateTrendFromData(videos){

  if(!videos || videos.length === 0) return [];

  const trendMap = {};
videos = (videos || []).filter(v =>
  v &&
  typeof v === "object"
);
  videos.forEach(v => {

    const date = new Date(v.snippet?.publishedAt || 0);

    const key = `${date.getFullYear()}-${date.getMonth()+1}`;

    const views = Number(v.statistics?.viewCount || 0);

    trendMap[key] = (trendMap[key] || 0) + views;

  });

  const sorted = Object.entries(trendMap)
    .sort((a,b)=> new Date(a[0]) - new Date(b[0]));

  return sorted.map(([_, v]) => v);
}

function renderTrendChart(videos){

const canvas = document.getElementById("trendChart");
  if(!canvas) return;

  const ctx = canvas.getContext("2d");

  const data = generateTrendFromData(videos);

  if(!data.length) return;

  const max = Math.max(...data);

  const width = canvas.width;
  const height = canvas.height;

  ctx.clearRect(0,0,width,height);

  ctx.beginPath();

  data.forEach((value, i) => {

    const x = (i / (data.length - 1)) * width;
    const y = height - (value / max) * height;

    if(i === 0){
      ctx.moveTo(x,y);
    } else {
      ctx.lineTo(x,y);
    }

  });

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#FFD700";
  ctx.stroke();
}

function initCopyTagsButton(){

  const btn = document.getElementById("btnCopyTags");

  if(!btn || btn.dataset.bound === "true") return;

  btn.dataset.bound = "true";

  btn.addEventListener("click", copiarTagsTubeX);

}

function getCompetitionColor(score){
  if(score < 40) return "#ef4444"; // difícil
  if(score < 70) return "#f59e0b"; // médio
  return "#22c55e"; // fácil
}

function setupValidacaoTab() {
  const btn = document.getElementById('val-run');
  if (!btn || btn.dataset.bound === '1') return;
  btn.dataset.bound = '1';

  btn.addEventListener('click', () => {
    const title = document.getElementById('val-title')?.value.trim() || '';
    const keyword = document.getElementById('val-keyword')?.value.trim() || '';
    const thumbWord = document.getElementById('val-thumb-word')?.value.trim() || '';
    const type = document.getElementById('val-type')?.value || '';
    const trend = document.getElementById('val-trend')?.value || 'ESTAVEL';
    const result = document.getElementById('val-result');

    if (!result) return;

    if (title.length < 5) {
      result.style.display = 'block';
      result.innerHTML = `
        <div style="background:#140f0f;border:1px solid #ff5555;color:#ff8888;
        padding:14px;border-radius:14px;font-size:14px;text-align:center;font-weight:600;">
          ⚠️ Preencha o <b>título do vídeo</b>.
        </div>`;
      return;
    }

    /* ===============================
       🔎 DADOS REAIS DO MERCADO (SEO)
    =============================== */
    const seoVolume = window.__tubexVolume || 50;        // 0–100
    const seoCompetition = window.__tubexCompetition || 50; // 0–100 (100 = fácil)

    const marketPressure = 1 - (seoCompetition / 100); // 0–1
    const demand = seoVolume / 100;


/* ===============================
   🔥 CONTEXTO INTELIGENTE (SaaS)
=============================== */

const TYPE_WEIGHTS = {

  tutorial: { ctr: 0.10, demand: 0.15, competition: -0.05 },
  review: { ctr: 0.14, demand: 0.18, competition: -0.08 },
  comparacao: { ctr: 0.16, demand: 0.20, competition: -0.10 },
  unboxing: { ctr: 0.18, demand: 0.12, competition: -0.06 },

  empreendedorismo: { ctr: 0.12, demand: 0.20, competition: -0.12 },
  marketing: { ctr: 0.14, demand: 0.22, competition: -0.14 },
  renda_extra: { ctr: 0.18, demand: 0.30, competition: -0.18 },

  gameplay: { ctr: 0.10, demand: 0.15, competition: -0.20 },
  react: { ctr: 0.20, demand: 0.18, competition: -0.15 },
  desafio: { ctr: 0.22, demand: 0.20, competition: -0.18 },

  opiniao: { ctr: -0.05, demand: 0.05, competition: 0.05 },
  polemica: { ctr: 0.25, demand: 0.25, competition: -0.20 },

  motivacao: { ctr: 0.18, demand: 0.20, competition: -0.12 },
  produtividade: { ctr: 0.12, demand: 0.15, competition: -0.10 },

  treino: { ctr: 0.14, demand: 0.18, competition: -0.12 },

  shorts: { ctr: 0.30, demand: 0.25, competition: -0.25 },
  podcast: { ctr: -0.10, demand: 0.05, competition: 0.02 },
  live: { ctr: -0.15, demand: 0.08, competition: 0.05 }
};

let contextScore = 1;

let adjustedDemand = demand;
let adjustedCompetition = marketPressure;

const weight = TYPE_WEIGHTS[type];

if (weight) {
  contextScore += weight.ctr;
  adjustedDemand += weight.demand;
  adjustedCompetition += weight.competition;
}

// tendência
if (trend === 'ALTA') contextScore += 0.15;
if (trend === 'BAIXA') contextScore -= 0.15;

// limites
contextScore = Math.max(0.6, Math.min(1.4, contextScore));
adjustedDemand = Math.max(0, Math.min(1.5, adjustedDemand));
adjustedCompetition = Math.max(0, Math.min(1.5, adjustedCompetition));


    /* ===============================
       🧠 ANÁLISE DO TÍTULO
    =============================== */
    let titleScore = 0;

    if (title.length >= 40 && title.length <= 70) titleScore += 0.25;
    if (/\?|como|segredo|ningu[eé]m|erro|pare de|isso/i.test(title)) titleScore += 0.25;
    if (keyword && title.toLowerCase().includes(keyword.toLowerCase())) titleScore += 0.30;
    if (title.split(' ').length < 4) titleScore -= 0.15;

    titleScore = Math.max(0, Math.min(1, titleScore));

    /* ===============================
       🖼️ THUMBNAIL (NOVO)
    =============================== */
    let thumbScore = 0;

    if (thumbWord.length >= 3) thumbScore += 0.4;
    if (thumbWord.length <= 12) thumbScore += 0.3;
    if (!title.toLowerCase().includes(thumbWord.toLowerCase())) thumbScore += 0.3;

    thumbScore = Math.max(0, Math.min(1, thumbScore));


    /* ===============================
       📊 CTR ESTIMADO (MODELO FINAL)
    =============================== */
  const ctrBase =
  3.2 +
  titleScore * 3.5 +
  thumbScore * 3.0 +
  demand * 1.8 -
  marketPressure * 2.4;



const ctrFinal = Math.max(
  2.0,
  Math.min(
    16,
    (ctrBase + (adjustedDemand * 2.2) - (adjustedCompetition * 2.5)) * contextScore
  )
);

    const ctrMin = (ctrFinal - 0.9).toFixed(1);
    const ctrMax = (ctrFinal + 0.9).toFixed(1);
    const ctrAvg = (parseFloat(ctrMin) + parseFloat(ctrMax)) / 2;

    /* ===============================
       🎨 CLASSIFICAÇÃO
    =============================== */
    let ctrColor = '#ff4444';
    let ctrLabel = 'CTR fraco';

    if (ctrAvg >= 6) {
      ctrColor = '#00ff88';
      ctrLabel = 'CTR forte';
    } else if (ctrAvg >= 4) {
      ctrColor = '#ffb020';
      ctrLabel = 'CTR moderado';
    }

 /* ===============================
   🖥️ UI — CTR PREMIUM (SaaS)
=============================== */

result.style.display = 'block';

result.innerHTML = `
<div style="
  background: linear-gradient(180deg, #0f172a 0%, #020617 100%);
  border: 1px solid rgba(148,163,184,0.15);
  border-radius: 16px;
  padding: 18px;
  box-shadow:
    0 10px 30px rgba(0,0,0,0.6),
    inset 0 1px 0 rgba(255,255,255,0.03);
  position: relative;
  overflow: hidden;
">

  <!-- Glow sutil -->
  <div style="
    position:absolute;
    top:-40%;
    left:-20%;
    width:140%;
    height:140%;
    background: radial-gradient(circle at center, ${ctrColor}22 0%, transparent 70%);
    pointer-events:none;
  "></div>

  <!-- Label -->
  <div style="
    font-size:11px;
    letter-spacing:.08em;
    text-transform:uppercase;
    color:#64748b;
    text-align:center;
    margin-bottom:6px;
  ">
    CTR Estimado
  </div>

  <!-- Valor principal -->
  <div style="
    font-size:30px;
    font-weight:800;
    text-align:center;
    color:${ctrColor};
    line-height:1.1;
    margin-bottom:6px;
  ">
    ${ctrMin}% — ${ctrMax}%
  </div>

  <!-- Status -->
  <div style="
    font-size:13px;
    font-weight:600;
    text-align:center;
    color:${ctrColor};
    margin-bottom:12px;
  ">
    ${ctrLabel}
  </div>

  <!-- Divider -->
  <div style="
    height:1px;
    background:linear-gradient(90deg,transparent,#1e293b,transparent);
    margin:10px 0 12px;
  "></div>

  <!-- Descrição -->
  <div style="
    font-size:12px;
    color:#94a3b8;
    text-align:center;
    line-height:1.5;
  ">
    Estimativa baseada em <b style="color:#e2e8f0;">título</b>,
    <b style="color:#e2e8f0;">thumbnail</b> e comportamento de busca.<br>
    <span style="color:#64748b;">
      O desempenho real depende do histórico e público do canal.
    </span>
  </div>

</div>
`;
  });
}



function updateSeoUsageBadge(plano, usadas, limite) {
  const container = document.getElementById('seo-usage-badge-container');
  if (!container) return;

  if (limite >= 9999) {
    container.innerHTML = `<div style="font-size:12px;font-weight:700;color:#FFD700;">Plano ${formatPlanoLabel(plano)} · Ilimitado</div>`;
  } else {
    const color = usadas >= limite - 1 ? '#ff4444' : '#FFD700';
    container.innerHTML = `<div style="font-size:12px;font-weight:700;color:${color};">Consultas hoje: ${usadas}/${limite}</div>`;
  }
}

async function enforceSeoAccess(plano){

  return new Promise(resolve => {

    canUseSeoPanel(plano, (canUse) => {
      resolve(canUse);
    });

  });

}


// ======================================================
// 🔐 SEO ACCESS CONTROL (ENTERPRISE)
// ======================================================
const SEO_LIMITS = {
  free: 5,
  start: 15,
  member: 25,
  pro: 50,
  expert: Infinity,
  owner: Infinity
};

const BONUS_DAILY = 5;

// 🔒 lock simples anti race condition
let seoLock = false;


function canUseSeoPanel(plano, increment = false){

  return new Promise((resolve) => {

    const today = new Date().toLocaleDateString();

    const limits = {
      free: 6,
      start: 15,
      member: 25,
      pro: 50,
      expert: Infinity,
      owner: Infinity
    };

    const limit = limits[plano] ?? 5;

    chrome.storage.local.get(
      ['seoPanelCount', 'seoPanelLastDate'],
      (items) => {

        let count = items.seoPanelCount || 0;
        let lastDate = items.seoPanelLastDate;

        // 🔄 reset diário
        if (lastDate !== today) {
          count = 0;
        }

        // 🔥 badge SEMPRE com valor real
        updateSeoUsageBadge(plano, count, limit);

        // 🔓 ilimitado
        if (limit === Infinity) {
          resolve({ allowed: true, count, limit });
          return;
        }

        // ❌ bloqueado
        if (count >= limit) {
          resolve({ allowed: false, count, limit });
          return;
        }

        // =========================================
        // 💰 CONSUMO CONTROLADO (SÓ SE PEDIR)
        // =========================================
        if (increment === true) {

          const newCount = count + 1;

          chrome.storage.local.set({
            seoPanelCount: newCount,
            seoPanelLastDate: today
          });

          updateSeoUsageBadge(plano, newCount, limit);

          resolve({
            allowed: true,
            count: newCount,
            limit
          });

          return;
        }

        // =========================================
        // 🔍 SÓ VALIDAÇÃO (SEM CONSUMIR)
        // =========================================
        resolve({
          allowed: true,
          count,
          limit
        });

      }
    );

  });

}

// Função para carregar Chart.js só uma vez, esperando estar DEFINIDO no window
function loadChartJs(callback) {
  if (window.Chart) return callback();
  if (window.loadingChartJs) {
    setTimeout(() => loadChartJs(callback), 100);
    return;
  }
  window.loadingChartJs = true;
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('libs/chart.min.js');
  script.onload = () => {
    // Aguarda de fato o Chart estar global (resolve bug do Chrome extension!)
    function waitForChart() {
      if (window.Chart) {
        window.loadingChartJs = false;
        callback();
      } else {
        setTimeout(waitForChart, 50);
      }
    }
    waitForChart();
  };
  document.head.appendChild(script);
}

function carregarDadosTendencias(keyword) {

if(!keyword || keyword.trim().length < 1){
  console.log("TubeX: keyword inválida");
  return;
}

if(
keyword === lastKeywordQueried &&
Date.now() - lastKeywordTime < 600000
){

const cacheKey = `tendenciasCache_${keyword.toLowerCase()}`;

chrome.storage.local.get([cacheKey],(r)=>{

const cached = r[cacheKey];

if(cached && cached.items){

mostrarEstatisticasTendencias(cached.items,keyword);

}

});

return;

}
lastKeywordQueried = keyword;
lastKeywordTime = Date.now();

const container = document.getElementById('tendencias-content');

container.textContent = 'Carregando dados de tendências...';

  const cacheKey = `tendenciasCache_${keyword.toLowerCase()}`;
  const CACHE_TTL = 1000 * 60 * 60 * 48; // 48 horas

  chrome.storage.local.get([cacheKey], (result) => {
    const cached = result[cacheKey];

    // ✅ Se cache válido
if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {

  const items = cached.items;

  if (Array.isArray(items) && items.length) {

    mostrarEstatisticasTendencias(items, keyword);

    return;

  }

}

    // ❌ Sem cache ou expirado → chama API
// ❌ Sem cache ou expirado → chama API
chrome.runtime.sendMessage(
  { action: 'fetchSeoData', keyword },
  (response) => {

    if(!response){
      console.warn("[TubeX] resposta vazia da API");
      return;
    }

    if(!response.success){
      console.warn("[TubeX] resposta falhou");
      return;
    }

    if(!response.items){
      console.warn("[TubeX] items indefinido");
      return;
    }

    // 🔥 NORMALIZAÇÃO SEGURA DOS ITEMS
    const items = Array.isArray(response.items) ? response.items : [];

    console.log("📊 ITEMS NORMALIZADOS:", items);

    // 🚨 VALIDAÇÃO
    if(items.length === 0){
      console.warn("[TubeX] tendências sem dados — ignorando fallback");
      return;
    }

    chrome.storage.local.set({
      [cacheKey]: {
        items,
        timestamp: Date.now()
      }
    });

    mostrarEstatisticasTendencias(items, keyword);
window.__tubexTrend = response.trend || [];

  }
);
  });
}

function tubexExtensionAlive(){
  try{
    return !!chrome.runtime?.id;
  }catch(e){
    return false;
  }
}


// === GRÁFICO CANVAS TENDÊNCIAS ===
// Helper para obter nome do mês em pt-BR
const mesesPtBr = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

// Função para gerar gráfico de tendência mensal e análise automática
function gerarGraficosTendencias(items, keyword) {
  // Usa o canvas que já existe no HTML dos cards!
  const canvas = document.getElementById('graficoTendencias');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

// ==========================================
// TEMA
// ==========================================

const isDark =
  document.documentElement.hasAttribute("dark");

const textPrimary = isDark
  ? "#F3F4F6"
  : "#111827";

const textSecondary = isDark
  ? "#6B7280"
  : "#6B7280";

const gridColor = isDark
  ? "rgba(255,255,255,.08)"
  : "rgba(0,0,0,.08)";

const titleColor = "#FACC15";

const pointColor = "#FACC15";

const lineColor = "#22D3EE";

  // Agrupa vídeos por mês/ano
  const porMes = {};
  items.forEach(v => {
    if (!v.snippet?.publishedAt || !v.statistics?.viewCount) return;
    const data = new Date(v.snippet.publishedAt);
    const mesAno = `${mesesPtBr[data.getMonth()]}/${data.getFullYear()}`;
    if (!porMes[mesAno]) porMes[mesAno] = 0;
    porMes[mesAno] += Number(Number(v?.statistics?.viewCount || 0));
  });

  // Ordena meses do mais antigo para o mais recente
  const mesesOrdenados = Object.keys(porMes).sort((a, b) => {
    const [mA, yA] = a.split('/'); const [mB, yB] = b.split('/');
    return new Date(`${yA}-${mesesPtBr.indexOf(mA)+1}-01`) - new Date(`${yB}-${mesesPtBr.indexOf(mB)+1}-01`);
  });

  // Só últimos 6~8 meses
  const ultimosMeses = mesesOrdenados.slice(-8);
  const dados = ultimosMeses.map(m => porMes[m]);

  // Layout e escala
  const w = canvas.width, h = canvas.height;
  const px = 40, py = 36; // padding x e y
  const zeroY = h - py;
  const maxY = Math.max(...dados) || 1;
  const stepX = (w - 2*px) / (ultimosMeses.length-1 || 1);
// ==========================================
// EIXO Y (ESCALA)
// ==========================================

ctx.font = "600 12px Inter, Arial";

ctx.fillStyle = textSecondary;

ctx.textAlign = "right";

for (let s = 0; s <= 4; s++) {

  const val = Math.round(
    maxY * (4 - s) / 4
  );

  const y =
    zeroY -
    (val / maxY) *
    (zeroY - py);

  // Valor da escala

  ctx.fillText(
    val.toLocaleString(),
    px - 8,
    y + 4
  );

  // Linha horizontal

  ctx.beginPath();

  ctx.strokeStyle = gridColor;

  ctx.lineWidth = 1;

  ctx.moveTo(
    px,
    y
  );

  ctx.lineTo(
    w - px,
    y
  );

  ctx.stroke();

}

  // ==========================================
// LINHA DO GRÁFICO
// ==========================================

ctx.beginPath();

ctx.strokeStyle = lineColor;

ctx.lineWidth = 3;

ctx.lineJoin = "round";

ctx.lineCap = "round";

ctx.shadowColor = "rgba(34,211,238,.25)";

ctx.shadowBlur = 12;

dados.forEach((v, i) => {

  const x = px + i * stepX;

  const y =
    zeroY -
    (v / maxY) *
    (zeroY - py);

  if (i === 0) {

    ctx.moveTo(x, y);

  } else {

    ctx.lineTo(x, y);

  }

});

ctx.stroke();

ctx.shadowBlur = 0;


// ==========================================
// PONTOS E LABELS
// ==========================================

dados.forEach((v, i) => {

  const x = px + i * stepX;

  const y =
    zeroY -
    (v / maxY) *
    (zeroY - py);

  // Glow

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    8,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    "rgba(250,204,21,.25)";

  ctx.fill();

  // Ponto

  ctx.beginPath();

  ctx.arc(
    x,
    y,
    4.5,
    0,
    Math.PI * 2
  );

  ctx.fillStyle =
    pointColor;

  ctx.fill();

  // Valor

  ctx.font =
    "600 11px Inter, Arial";

  ctx.fillStyle =
    textPrimary;

  ctx.textAlign =
    "center";

  ctx.fillText(
    v.toLocaleString(),
    x,
    y - 14
  );

  // Mês

  ctx.font =
    "600 11px Inter, Arial";

  ctx.fillStyle =
    textSecondary;

  ctx.fillText(
    ultimosMeses[i],
    x,
    zeroY + 22
  );

});


// ==========================================
// TÍTULO
// ==========================================

ctx.font =
  "700 16px Inter, Arial";

ctx.fillStyle =
  titleColor;

ctx.textAlign =
  "center";

ctx.fillText(

  "Tendência mensal de visualizações",

  w / 2,

  22

);


// ==========================================
// PAINEL DE DIAGNÓSTICO
// ==========================================

let detalhesDiv =
  document.getElementById(
    "detalhesTendenciaMes"
  );

if (!detalhesDiv) {

  detalhesDiv =
    document.createElement("div");

  detalhesDiv.id =
    "detalhesTendenciaMes";

  detalhesDiv.style.marginTop =
    "12px";

  detalhesDiv.style.fontSize =
    "13px";

  detalhesDiv.style.lineHeight =
    "1.6";

  canvas.parentNode.appendChild(
    detalhesDiv
  );

}
// ==========================================
// ANÁLISE DE TENDÊNCIA
// ==========================================

let tendencia = "ESTÁVEL";

let emoji = "➖";

let percent = 0;

let trendColor = "#FACC15";

if (dados.length > 5) {

  const mediasRecentes =

    dados
      .slice(-3)
      .reduce((a,b)=>a+b,0) / 3;

  const mediasAntigas =

    dados
      .slice(0,-3)
      .reduce((a,b)=>a+b,0) /

    Math.max(
      1,
      dados.length-3
    );

  percent = Math.round(

    (
      (mediasRecentes-mediasAntigas)

      /

      Math.max(1,mediasAntigas)

    )*100

  );

  if(percent>12){

    tendencia="ALTA";

    emoji="📈";

    trendColor="#22C55E";

  }

  else if(percent<-12){

    tendencia="BAIXA";

    emoji="📉";

    trendColor="#EF4444";

  }

  else{

    tendencia="ESTÁVEL";

    emoji="➖";

    trendColor="#FACC15";

  }

}

detalhesDiv.innerHTML = `

<div style="

display:flex;

align-items:center;

justify-content:space-between;

margin-bottom:10px;

">

<div style="

font-size:16px;

font-weight:700;

color:${textPrimary};

">

${emoji}
Tendência

</div>

<div style="

font-size:17px;

font-weight:800;

color:${trendColor};

">

${tendencia}

</div>

</div>

<div style="

margin-bottom:12px;

font-size:13px;

font-weight:700;

color:${trendColor};

">

${percent===0
  ? "--"
  : `${percent>0?"+":""}${percent}%`
}

</div>

<div style="

font-size:13px;

line-height:1.65;

color:${textSecondary};

">

A análise considera a soma das visualizações dos vídeos publicados contendo

<b style="color:${titleColor};">

${keyword}

</b>

agrupados por mês.

Isso permite identificar se o interesse pela palavra-chave está aumentando, diminuindo ou permanecendo estável ao longo do tempo.

</div>

`;
}



// --- NOVA FUNÇÃO: Painel de Estatísticas Avançadas de Tendências ---

// === CARDS PAINEL TENDÊNCIAS ===
function mostrarEstatisticasTendencias(items, keyword = '') {
  const container = document.getElementById('tendencias-content');
  if (!Array.isArray(items) || items.length === 0) {
    container.innerHTML = '<div style="padding:16px;text-align:center;">Nenhum dado encontrado para tendências.</div>';
    return;
  }

  // Só monta o esqueleto se ainda não existe
  if (!document.getElementById('cardsTendencias')) {
container.innerHTML = `
  <canvas id="graficoTendencias" width="380" height="180" style="display:block;margin:auto;margin-bottom:13px;border-radius:12px;background:#181818;"></canvas>
  <div id="detalhesTendenciaMes"></div>
  <div id="cardsTendencias"></div>
`;
  }

  // --- Calcula métricas ---
  const ordenado = items.slice().sort((a, b) =>
    Number(b.statistics?.viewCount || 0) - Number(a.statistics?.viewCount || 0)
  );
  const total = ordenado.length;
  const views = ordenado.map(v => Number(v.statistics?.viewCount || 0));
  const likes = ordenado.map(v => Number(v.statistics?.likeCount || 0));
  const comentarios = ordenado.map(v => Number(v.statistics?.commentCount || 0));
  const somaViews = views.reduce((a, b) => a + b, 0);
  const somaLikes = likes.reduce((a, b) => a + b, 0);
  const somaComentarios = comentarios.reduce((a, b) => a + b, 0);
  const media = somaViews / total;
  const mediaLikes = somaLikes / total;
  const mediaComentarios = somaComentarios / total;
  const maior = ordenado[0];
  const menor = ordenado[ordenado.length - 1];
  const engagement = (somaLikes + somaComentarios) / somaViews * 100;

  // Engajamento por vídeo
  let topEngagement = ordenado[0], maxEngagement = 0;
  ordenado.forEach(v => {
    const eng = ((Number(v.statistics?.likeCount || 0) + Number(v.statistics?.commentCount || 0)) / Number(v.statistics?.viewCount || 1)) * 100;
    if (eng > maxEngagement) {
      maxEngagement = eng;
      topEngagement = v;
    }
  });

  // Palavras comuns
  function extrairMaisComuns() {
    const stopwords = ['o','a','os','as','de','do','da','para','e','em','com','no','na','por','que','um','uma','é','no','ao','dos','nas','das','como','se','mais','menos','é','vai','são','ou','vão','por','você','meu','minha','seu','sua','para','pra'];
    const all = ordenado.map(v => v.snippet?.title || '').join(' ').toLowerCase().split(/[\s\-\.\!\?,"':;()]+/);
    const freq = {};
    all.forEach(w => { if (w.length > 2 && !stopwords.includes(w)) freq[w] = (freq[w] || 0) + 1; });
    return Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,5);
  }
  const comuns = extrairMaisComuns();

  // Recomendações automáticas
  let recomendacoes = '';
  if (maior && Number(maior.statistics?.viewCount) > 0) {
    recomendacoes += `<li>Vídeos com <b>${Math.round(maxEngagement)}%</b> de engajamento se destacam. Use mais CTAs e perguntas.</li>`;
    if (mediaLikes / media > 0.10) recomendacoes += '<li>Média de likes por view acima de 10%: o público está curtindo muito!</li>';
    if (comuns.length) recomendacoes += `<li>As palavras mais usadas nos títulos são: <b>${comuns.map(([w]) => w).join(', ')}</b>.</li>`;
    if (maior.snippet?.title && menor.snippet?.title && maior.snippet.title !== menor.snippet.title) {
      recomendacoes += `<li>O vídeo mais visto (<a class="tend-link" href="https://youtube.com/watch?v=${maior.id}" target="_blank">${maior.snippet.title.substring(0, 38)}...</a>) tem <b>${Number(maior.statistics?.viewCount).toLocaleString()} views</b>. Analise o porquê: thumbnail, título, tema, etc.</li>`;
    }
    if (keyword && !maior.snippet.title.toLowerCase().includes(keyword.toLowerCase())) {
      recomendacoes += `<li><b>A palavra-chave pesquisada ("${keyword}") não aparece nos vídeos mais vistos!</b></li>`;
    }
    if (engagement > 10) recomendacoes += `<li>Engajamento médio excelente: <b>${engagement.toFixed(1)}%</b>.</li>`;
    else recomendacoes += `<li>Engajamento baixo (${engagement.toFixed(1)}%). Incentive comentários e likes!</li>`;
  }

  

// Depois, gere todo o HTML dos cards normalmente:
const cardsHTML = `
  <div class="tend-card"><div class="tend-title">Métricas Gerais</div>
    <div class="tend-metric"><b>${total}</b> vídeos analisados</div>
    <div class="tend-metric"><b>${somaViews.toLocaleString()}</b> visualizações totais</div>
    <div class="tend-metric"><b>${Math.round(media).toLocaleString()}</b> visualizações em média por vídeo</div>
    <div class="tend-metric"><b>${somaLikes.toLocaleString()}</b> likes totais (<b>${(mediaLikes).toLocaleString(undefined,{maximumFractionDigits:1})}</b> em média)</div>
    <div class="tend-metric"><b>${somaComentarios.toLocaleString()}</b> comentários totais (<b>${(mediaComentarios).toLocaleString(undefined,{maximumFractionDigits:1})}</b> em média)</div>
    <div class="tend-metric"><b>Engajamento geral:</b> <b>${engagement.toFixed(2)}%</b></div>
  </div>
  <div class="tend-card"><div class="tend-title">Mais & Menos Visto</div>
    <div><b>Mais visto:</b> <a class="tend-link" href="https://youtube.com/watch?v=${maior.id}" target="_blank">${maior.snippet?.title?.substring(0, 45)}...</a> <b>(${Number(maior.statistics?.viewCount).toLocaleString()} views)</b></div>
    <div><b>Menos visto:</b> <a class="tend-link" href="https://youtube.com/watch?v=${menor.id}" target="_blank">${menor.snippet?.title?.substring(0, 45)}...</a> <b>(${Number(menor.statistics?.viewCount).toLocaleString()} views)</b></div>
  </div>
  <div class="tend-card"><div class="tend-title">Top 3 por Visualizações</div>
    ${ordenado.slice(0, 3).map((v, i) => 
      `${i+1}. <a class="tend-link" href="https://youtube.com/watch?v=${v.id}" target="_blank">${v.snippet?.title?.substring(0, 38)}...</a> <b>(${Number(v.statistics?.viewCount).toLocaleString()} views)</b>`
    ).join('<br>')}
  </div>
  <div class="tend-card"><div class="tend-title">Top Engajamento</div>
    <a class="tend-link" href="https://youtube.com/watch?v=${topEngagement.id}" target="_blank">${topEngagement.snippet?.title?.substring(0, 45)}...</a>
    <b>(${maxEngagement.toFixed(2)}%)</b>
  </div>
  <div class="tend-card"><div class="tend-title">Palavras mais comuns nos títulos</div>
    <div class="tend-keywords">
      ${comuns.map(([w, n]) => `<span>${w} <small style="color:#FFF">${n}x</small></span>`).join(' ')}
    </div>
  </div>
  <div class="tend-card tend-recom"><div class="tend-title">Recomendações Automáticas</div>
    <ul style="margin:0 0 0 10px;">${recomendacoes || '<li>Utilize os dados acima para aprimorar seus próximos vídeos!</li>'}</ul>
  </div>
`;

// Agora, só preencha os cards:
document.getElementById('cardsTendencias').innerHTML = cardsHTML;

// Depois, chame o gráfico:
setTimeout(() => gerarGraficosTendencias(items, keyword), 80);
}



let __tubexLastVideoUrl = null;



function enablePanel(panelId) {

  const panel = document.getElementById(`tab-${panelId}`);
  if (!panel) return;

  panel.style.display = 'block';

  unlockElement(panel);
}

function disablePanel(panelId) {

  const panel = document.getElementById(`tab-${panelId}`);
  if (!panel) return;

  panel.style.display = 'none';

  lockElement(panel);
}

function unlockElement(el) {

  el.classList.remove('tubex-locked');

  el.style.pointerEvents = '';
  el.style.opacity = '';

  const badge = el.querySelector('.tubex-lock-badge');
  if(badge) badge.remove();
}

function lockElement(el) {

  if(el.classList.contains('tubex-locked')) return;

  el.classList.add('tubex-locked');

  el.style.pointerEvents = 'none';
  el.style.opacity = '0.6';

  // 🔐 badge visual (sem mexer no HTML interno)
  const badge = document.createElement('div');
  badge.className = 'tubex-lock-badge';

  badge.style.cssText = `
    position:absolute;
    top:8px;
    right:10px;
    font-size:14px;
    color:#FFD700;
    pointer-events:none;
  `;

  badge.textContent = "🔒";

  el.style.position = "relative";
  el.appendChild(badge);
}



const cache = {};

function getLocalCache(key){
  if(cache[key] && Date.now() - cache[key].time < 600000){
    return cache[key].data;
  }
  return null;
}

function setLocalCache(key,data){
  cache[key] = {
    data:data,
    time:Date.now()
  };
}


(() => {
  if (window.tubexInitialized) return;

   // --- ESTADO GLOBAL ---
  const state = {
    keyword: '',
    data: null,
    volume: 0,
    competitionRaw: 0,
    trendValues: []
  };

function formatPlanoLabel(plano) {
  switch (plano) {
    case 'free': return 'Free';
    case 'start': return 'Start';
    case 'member': return 'Membro';
    case 'pro': return 'Pro';
    case 'expert': return 'Expert';
    case 'owner': return 'Owner';
    default: return plano;
  }
}




tubexSafeStorageGet(['userPlan'], ({ userPlan }) => {

  const plano = (userPlan || '').toLowerCase();

  const keyword = getCurrentYoutubeSearchQuery();
  if (!keyword) return;

  if(window.__tubexLastSeoKeyword === keyword){
    console.log("TubeX SEO já executado para:", keyword);
    return;
  }

window.__tubexLastSeoKeyword = keyword;

const cacheKey = `seoCache_${keyword.toLowerCase()}`;

chrome.storage.local.get([cacheKey], (result) => {

  const cached = result[cacheKey];

  if (cached && Date.now() - cached.timestamp < 86400000) {

    // ✅ Cache válido (< 24h)
    state.keyword = keyword;
    state.data = cached.data;
    state.volume = cached.volume;
    state.competitionRaw = cached.competitionRaw;
    state.competition = cached.competition;

    updateBars(cached.volume, cached.competition);

    if (cached?.data?.titles) {
      populateRelevantTitles(cached.data.titles);
    }

    populateVideoStats(cached.data.videoInfo);

    // ===========================
    // SEO SCORE
    // ===========================

    const seoScore = calculateSeoScore(
      cached.volume,
      cached.competition
    );

    let nivel = "Baixo";

    if (seoScore >= 75) {
      nivel = "Muito Alto";
    } else if (seoScore >= 60) {
      nivel = "Alto";
    } else if (seoScore >= 40) {
      nivel = "Médio";
    }

    const seoScoreEl = document.getElementById("seoScore");

    if (seoScoreEl) {
      seoScoreEl.innerHTML = `
        SEO Score:
let nivel = "Baixo";
let cor = "#EF4444"; // vermelho

if (current >= 75) {
  nivel = "Muito Alto";
  cor = "#22C55E"; // verde
} else if (current >= 60) {
  nivel = "Alto";
  cor = "#22C55E"; // verde
} else if (current >= 40) {
  nivel = "Médio";
  cor = "#FACC15"; // amarelo
}
          ${nivel} (${Math.round(seoScore)}%)
        </span>
      `;
    }

    
    renderTrendChart(cached.finalTrend);

    return;
  }

  // evita múltiplas chamadas da mesma keyword na sessão
  if (cache[keyword] === "loading") {
    console.log("TubeX: requisição já em andamento");
    return;
  }

cache[keyword] = "loading";

// ❌ Sem cache ou expirado → só aí verifica uso de plano
canUseSeoPanel(plano, (canUse) => {
      if (!canUse) {
        const seoContent = document.getElementById('tab-seo');
        if (seoContent) {
        seoContent.innerHTML = `
  <div style="
    background:#1a1a1a;
    border:1px solid #FFD70055;
    padding:22px;
    border-radius:10px;
    text-align:center;
    color:#fff;
  ">
    <div style="font-size:18px;font-weight:800;margin-bottom:8px;">
      🚀 Você atingiu o limite do plano ${formatPlanoLabel(plano)}
    </div>

    <div style="font-size:14px;margin-bottom:16px;color:#ccc;">
      Criadores que crescem rápido analisam <b>15 a 50 palavras por dia</b>.<br>
      Continue sua análise agora sem interrupções.
    </div>

    <div style="
      background:#111;
      padding:12px;
      border-radius:8px;
      margin-bottom:16px;
      font-size:13px;
      color:#FFD700;
    ">
      💎 Plano Start libera 3x mais análises<br>
      💎 Plano Pro libera 50 análises por dia<br>
      💎 Expert é ilimitado
    </div>

    <a href="https://www.tubex.app.br/#planos"
       target="_blank"
       style="
         display:inline-block;
         background:#FFD700;
         color:#121212;
         padding:12px 24px;
         border-radius:8px;
         font-weight:900;
         text-decoration:none;
         font-size:14px;
       ">
       🔓 Ativar Plano Agora
    </a>
  </div>
`;
        }
        return;

      }

      // ✅ Faz fetch da API e salva no cache local

      fetchSeoData(keyword);

    });
  });
});

function esperarPlanoPronto(callback){

  if(tubexPlanoPronto){
    callback();
    return;
  }

  const interval = setInterval(()=>{

    if(tubexPlanoPronto){
      clearInterval(interval);
      callback();
    }

  }, 100);

}

// =====================================================
// Classificação de métricas
// =====================================================

function getMetricInfo(value){

    if(value >= 85){

        return {
            texto: "Muito Alto",
            cor: "#22C55E"
        };

    }

    if(value >= 70){

        return {
            texto: "Alto",
            cor: "#4ADE80"
        };

    }

    if(value >= 50){

        return {
            texto: "Médio",
            cor: "#FACC15"
        };

    }

    if(value >= 30){

        return {
            texto: "Baixo",
            cor: "#F59E0B"
        };

    }

    return {
        texto: "Muito Baixo",
        cor: "#EF4444"
    };

}


// --- INJEÇÃO DO PAINEL COM ABAS ---
function initTubeXPanel() {
  // Só executar se estiver na página de pesquisa do YouTube
  if (!location.pathname.startsWith('/results') || !location.search.includes('search_query')) {
    return;
  }
  if (document.getElementById('tubex-panel')) return;

  // --- Estilos gerais e para abas (fichário) ---
  const style = document.createElement("style");

// ======================================
// TEMA
// ======================================

const isDark =
  document.documentElement.hasAttribute("dark");

// ==============================
// PAINEL
// ==============================

const panelBackground = isDark
  ? `linear-gradient(
      180deg,
      rgba(27,32,40,.78) 0%,
      rgba(18,22,28,.82) 100%
    )`
  : `linear-gradient(
      180deg,
      rgba(252,253,255,.88) 0%,
      rgba(245,247,250,.92) 100%
    )`;

const panelBorder = isDark
  ? "rgba(255,255,255,.08)"
  : "rgba(0,0,0,.08)";

// ==============================
// CARDS
// ==============================

const cardBg = isDark
  ? "rgba(255,255,255,.04)"
  : "rgba(255,255,255,.72)";

const cardBorder = isDark
  ? "rgba(255,255,255,.06)"
  : "rgba(0,0,0,.08)";

// ==============================
// BOTÕES
// ==============================

const buttonBg = isDark
  ? "rgba(255,255,255,.05)"
  : "rgba(255,255,255,.72)";

const buttonHover = isDark
  ? "rgba(255,255,255,.08)"
  : "rgba(255,255,255,.95)";

const buttonBorder = isDark
  ? "rgba(255,255,255,.08)"
  : "rgba(0,0,0,.08)";

const buttonHoverBorder = isDark
  ? "rgba(255,255,255,.12)"
  : "rgba(0,0,0,.12)";

const buttonText = isDark
  ? "#FFFFFF"
  : "#111827";

// ==============================
// TEXTOS
// ==============================

const textPrimary = isDark
  ? "#F3F4F6"
  : "#111827";

const textSecondary = isDark
  ? "#9CA3AF"
  : "#6B7280";

// ==============================
// DIVISORES
// ==============================

const divider = isDark
  ? "rgba(255,255,255,.06)"
  : "rgba(0,0,0,.08)";

// ==============================
// BARRAS
// ==============================

const barBackground = isDark
  ? "rgba(255,255,255,.08)"
  : "rgba(0,0,0,.08)";

// ==============================
// HOVER DOS CARDS
// ==============================

const cardHoverBorder = isDark
  ? "rgba(255,255,255,.12)"
  : "rgba(0,0,0,.12)";

// ==============================
// GRÁFICO
// ==============================

const chartBackground = isDark
  ? "rgba(255,255,255,.03)"
  : "rgba(255,255,255,.82)";

const chartGrid = isDark
  ? "rgba(255,255,255,.08)"
  : "rgba(0,0,0,.10)";

const chartText = isDark
  ? "#F3F4F6"
  : "#111827";

// ==============================
// CORES FIXAS DO TUBEX
// ==============================

const accent = "#FACC15";
const success = "#22C55E";
const warning = "#F59E0B";
const danger = "#EF4444";
const info = "#38BDF8";


style.textContent = `

#tubex-panel{

  position:fixed;

  top:50px;
  right:10px;

  width:360px;
  height:calc(100vh - 60px);

  background:${panelBackground};

  backdrop-filter:blur(18px) saturate(170%);
  -webkit-backdrop-filter:blur(18px) saturate(170%);

  color:${textPrimary};

  border:1px solid ${panelBorder};

  border-radius:18px;

  box-shadow:
    0 12px 36px rgba(0,0,0,.22),
    inset 0 1px 0 rgba(255,255,255,.04);

  padding:14px;

  overflow-y:auto;
  overflow-x:hidden;

  z-index:999999;

  transition:
    background .18s ease,
    border-color .18s ease,
    color .18s ease,
    box-shadow .18s ease;

}

#panel-content{

  flex:1;

  overflow-y:auto;

  padding:10px 4px;

  border-top:1px solid ${divider};

}

.card{

  background:${cardBg};

  backdrop-filter:blur(16px) saturate(170%);
  -webkit-backdrop-filter:blur(16px) saturate(170%);

  border:1px solid ${cardBorder};

  border-radius:14px;

  padding:14px;

  box-shadow:
    0 8px 24px rgba(0,0,0,.16),
    inset 0 1px 0 rgba(255,255,255,.04);

  transition:
    background .18s ease,
    border-color .18s ease,
    box-shadow .18s ease;

}

.card:hover{

  border-color:${isDark
    ? "rgba(255,255,255,.12)"
    : "rgba(0,0,0,.12)"};

}
#collapseBtn{

  position:absolute;

  top:6px;
  right:6px;

  width:26px;
  height:26px;

  background:#FACC15;

  color:#111827;

  border:none;

  border-radius:8px;

  font-weight:700;

  cursor:pointer;

  transition:
    transform .18s ease,
    filter .18s ease,
    box-shadow .18s ease;

  box-shadow:
    0 2px 8px rgba(250,204,21,.25);

  z-index:1000;

}

#collapseBtn:hover{

  transform:translateY(-1px);

  filter:brightness(1.06);

  box-shadow:
    0 4px 14px rgba(250,204,21,.35);

}

#tabs{

  display:flex;

  align-items:center;

  justify-content:center;

  gap:6px;

  margin-bottom:12px;

  padding-left:4px;

  padding-right:36px;

  flex-wrap:wrap;

}

#tubex-panel .tab-btn{

  flex:1;

  min-width:66px;

  background:${buttonBg};

  backdrop-filter:blur(16px) saturate(170%);
  -webkit-backdrop-filter:blur(16px) saturate(170%);

  color:${textPrimary};

  border:1px solid ${buttonBorder};

  border-radius:10px;

  padding:7px 8px;

  font-size:11px;

  font-weight:600;

  text-align:center;

  cursor:pointer;

  user-select:none;

  transition:
    background .18s ease,
    border-color .18s ease,
    color .18s ease,
    transform .15s ease,
    box-shadow .18s ease;

}

#tubex-panel .tab-btn:hover{

  background:${isDark
    ? "rgba(255,255,255,.08)"
    : "rgba(255,255,255,.95)"};

  border-color:${isDark
    ? "rgba(255,255,255,.12)"
    : "rgba(0,0,0,.12)"};

  transform:translateY(-1px);

}

#tubex-panel .tab-btn.active{

  background:linear-gradient(
    180deg,
    #FFE27A 0%,
    #FACC15 100%
  ) !important;

  color:#111827 !important;

  border:1px solid #EAB308 !important;

  font-weight:700;

  box-shadow:
    0 2px 10px rgba(250,204,21,.18),
    inset 0 1px 0 rgba(255,255,255,.35);

}

ul{

  padding-left:18px;

  max-height:100px;

  overflow-y:auto;

  margin:0 0 8px;

  font-size:12px;

  color:${textSecondary};

}

button.copy-btn{

  background:${buttonBg};

  backdrop-filter:blur(16px) saturate(170%);
  -webkit-backdrop-filter:blur(16px) saturate(170%);

  border:1px solid ${buttonBorder};

  color:${buttonText};

  padding:6px 12px;

  border-radius:8px;

  font-size:11px;

  font-weight:600;

  cursor:pointer;

  transition:
    background .18s ease,
    border-color .18s ease,
    transform .15s ease;

}

button.copy-btn:hover{

  background:${isDark
    ? "rgba(255,255,255,.08)"
    : "rgba(255,255,255,.95)"};

  border-color:${isDark
    ? "rgba(255,255,255,.12)"
    : "rgba(0,0,0,.12)"};

  transform:translateY(-1px);

}

.bar-pointer{

  position:absolute;

  top:-6px;

  left:0%;

  transform:translateX(-50%);

  width:0;
  height:0;

  border-left:6px solid transparent;
  border-right:6px solid transparent;
  border-top:8px solid #FFD84A;

  transition:left .6s ease;

  z-index:2;

}

.bar-container{

  position:relative;

  height:14px;

  background:${isDark
    ? "rgba(255,255,255,.08)"
    : "rgba(0,0,0,.08)"};

  border:1px solid ${cardBorder};

  border-radius:8px;

  overflow:visible;

  margin-bottom:8px;

}

.bar-fill{

  height:14px;

  width:0%;

  border-radius:8px 0 0 8px;

  transition:width .6s ease;

}

.bar-label{

  position:absolute;

  left:50%;
  top:0;

  transform:translateX(-50%);

  color:${textPrimary};

  font-size:11px;

  font-weight:700;

}

#loadingMessage,
#errorMessage{

  display:none;

  margin-top:10px;

  font-weight:700;

}

#loadingMessage{

  color:#FACC15;

}

#errorMessage{

  color:#EF4444;

}
`;

document.head.appendChild(style);

// ================================
// CONTAINER PRINCIPAL
// ================================

const panel = document.createElement("div");

panel.id = "tubex-panel";

panel.innerHTML = `

<button
id="collapseBtn"
title="Minimizar painel"
>
−
</button>

<!-- ================= HEADER ================= -->

<div style="

display:flex;
align-items:center;
justify-content:space-between;

padding:14px 16px;

margin-bottom:12px;

background:${cardBg};

backdrop-filter:blur(16px) saturate(170%);
-webkit-backdrop-filter:blur(16px) saturate(170%);

border:1px solid ${cardBorder};

border-radius:14px;

box-shadow:
inset 0 1px 0 rgba(255,255,255,.03);

">

<div>

<div style="
display:flex;
align-items:center;
gap:8px;
">

<div style="
font-size:13px;
font-weight:700;
letter-spacing:.4px;
">

<span style="color:${textPrimary};">Tube</span><span style="color:#FACC15;">X</span>

</div>

</div>

<div style="
margin-top:4px;

font-size:11px;

color:${textSecondary};

line-height:1.5;
">

Busca por Palavras-chave

</div>

</div>

<div
id="seo-usage-badge-container"
style="
display:flex;
align-items:center;
justify-content:center;
">
</div>

</div>

<!-- ================= TABS ================= -->

<div
id="tabs"
style="
display:flex;

gap:6px;

margin-bottom:14px;

overflow-x:auto;

scrollbar-width:none;

padding:0 2px;
">

${[
["seo","🔍 SEO"],
["tendencias","📈 Tendências"],
["scripts","📖 Roteiros"],
["ia","📖 IA"]
].map(([id,label],i)=>`

<div

class="tab-btn ${i===0?"active":""}"

data-tab="${id}"

style="

display:flex;
align-items:center;
justify-content:center;

flex:1;

padding:8px 10px;

font-size:11px;

font-weight:600;

white-space:nowrap;

border-radius:10px;

background:${
i===0
? "linear-gradient(135deg,#FFD84A,#FACC15)"
: buttonBg
};

border:1px solid ${
i===0
? "#FACC15"
: buttonBorder
};

color:${
i===0
? "#111827"
: buttonText
};

transition:
background .18s ease,
border-color .18s ease,
transform .15s ease,
color .18s ease;

">

${label}

</div>

`).join("")}

</div>

<!-- ================= CONTEÚDO ================= -->

<div
id="panel-content"
style="
padding:12px;
"
>

<!-- 🔍 TAB SEO -->

<div id="tab-seo" class="tab-content">

<div
id="seo-usage-badge-container"
style="
display:flex;
justify-content:flex-end;
margin-bottom:10px;
">
</div>

<!-- ================================================= -->
<!-- SEO SCORE -->
<!-- ================================================= -->

<div style="
padding:6px 0 8px;
text-align:center;
">

    <canvas
        id="seoGauge"
        width="320"
        height="205"
        style="
        display:block;
        margin:auto;
        max-width:100%;
        height:auto;
    ">
    </canvas>

    <div
        id="seoScore"
        style="
        margin-top:-8px;
        min-height:46px;
    ">
    </div>

</div>

<!-- ================================================= -->
<!-- VOLUME -->
<!-- ================================================= -->

<div style="margin-top:12px;">

    <div style="
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-bottom:6px;
    ">

        <span style="
        font-size:11px;
        font-weight:700;
        letter-spacing:.5px;
        color:${textSecondary};
        ">
            VOLUME
        </span>

        <span
            id="volumeValue"
            style="
            font-size:11px;
            font-weight:700;
            color:#22C55E;
        ">
            0%
        </span>

    </div>

    <div class="bar-container">

        <div
            id="tubex-volume"
            class="bar-fill"
            style="
            width:0%;
            background:#22C55E;
        ">
        </div>

        <div
            id="pointer-volume"
            class="bar-pointer">
        </div>

    </div>

</div>

<!-- ================================================= -->
<!-- CONCORRÊNCIA -->
<!-- ================================================= -->

<div style="margin-top:14px;">

    <div style="
    display:flex;
    justify-content:space-between;
    align-items:center;
    margin-bottom:6px;
    ">

        <span style="
        font-size:11px;
        font-weight:700;
        letter-spacing:.5px;
        color:${textSecondary};
        ">
            CONCORRÊNCIA
        </span>

        <span
            id="competitionValue"
            style="
            font-size:11px;
            font-weight:700;
            color:#F59E0B;
        ">
            0%
        </span>

    </div>

    <div class="bar-container">

        <div
            id="tubex-competition"
            class="bar-fill"
            style="
            width:0%;
            background:#F59E0B;
        ">
        </div>

        <div
            id="pointer-competition"
            class="bar-pointer">
        </div>

    </div>

</div>

<div

<!-- ================================================= -->
<!-- ESTIMATIVA -->
<!-- ================================================= -->

<div style="
margin-top:18px;
text-align:center;
">

    <div
        id="visibilidadeEstimativa"
        style="
        font-size:15px;
        font-weight:700;
        color:#FACC15;
        ">
        Calculando...
    </div>

    <div
        id="visibilidadeFeedback"
        style="
        margin-top:5px;
        max-width:280px;
        margin-left:auto;
        margin-right:auto;
        font-size:11px;
        line-height:1.5;
        color:${textSecondary};
        ">
    </div>

</div>

<!-- ================================================= -->
<!-- SEARCH TREND -->
<!-- ================================================= -->

<div
    id="searchTrendCard"
    style="

    margin-top:18px;

    background:#202124;

    border:1px solid #2E2F33;

    border-radius:10px;

    overflow:hidden;

">

    <!-- Header -->

    <div style="

        display:flex;

        align-items:center;

        justify-content:space-between;

        padding:12px 14px;

        border-bottom:1px solid rgba(255,255,255,.05);

    ">

        <div style="

            color:#FFFFFF;

            font-size:13px;

            font-weight:700;

        ">

            Pesquisas nos últimos 30 dias

        </div>

        <div
            id="trendDirection"
            style="

            font-size:11px;

            font-weight:600;

            color:#9AA0A6;

        ">

            ↗ Crescendo

        </div>

    </div>

    <!-- Canvas -->

    <div style="

        padding:8px 10px 2px;

    ">

  <canvas

    id="searchTrendChart"

    style="

        width:100%;

        height:145px;

        display:block;

    ">

</canvas>

    </div>

    <!-- Footer -->

    <div style="

        display:flex;

        justify-content:space-between;

        align-items:center;

        padding:6px 14px 12px;

        font-size:11px;

        color:#9AA0A6;

    ">

        <span id="searchAverage">

            Média diária

        </span>

        <span id="searchTrendPercent">

            +0%

        </span>

    </div>

</div>

  <!-- ================= PALAVRAS RELACIONADAS ================= -->

<div style="
height:1px;
background:${divider};
margin:18px 0;
"></div>

<div style="
display:flex;
align-items:center;
gap:6px;

font-size:13px;
font-weight:700;

color:${textPrimary};

margin-bottom:10px;
">

<span style="color:#FACC15;">🔍</span>

Palavras Relacionadas

</div>

<ul
id="relatedKeywords"
style="
margin:0;

padding-left:18px;

font-size:12px;

line-height:1.7;

color:${isDark ? "#9CA3AF" : "#374151"};

">
</ul>

<!-- Divider -->

<div style="
height:1px;
background:${divider};
margin:18px 0 14px;
"></div>




<!-- ================= TÍTULOS RELEVANTES ================= -->

<div style="
padding:2px 2px 14px;
">

<div style="
display:flex;
align-items:center;
gap:6px;

margin-bottom:10px;

font-size:13px;
font-weight:700;

color:${textPrimary};
">

<span style="color:#FACC15;">🎯</span>

Títulos Relevantes

</div>

<ul
id="relevantTitles"
style="
margin:0;

padding-left:18px;

font-size:12px;

line-height:1.7;

color:${isDark ? "#9CA3AF" : "#374151"};
">
</ul>

</div>

<!-- Divider -->

<div style="
height:1px;
background:${divider};
margin:18px 0 14px;
"></div>

<!-- ================= TAGS ================= -->

<div style="
padding:2px 2px 14px;
">

<div style="
display:flex;
justify-content:space-between;
align-items:center;

margin-bottom:12px;
">

<div style="
display:flex;
align-items:center;
gap:6px;

font-size:13px;
font-weight:700;

color:${textPrimary};
">

<span style="color:#FACC15;">🏷</span>

Tags Sugeridas

</div>

<button

id="copyTitleTags"

style="
background:${buttonBg};

backdrop-filter:blur(16px) saturate(170%);
-webkit-backdrop-filter:blur(16px) saturate(170%);

border:1px solid ${buttonBorder};

border-radius:8px;

padding:6px 12px;

font-size:11px;
font-weight:600;

color:${buttonText};

cursor:pointer;

transition:
background .18s ease,
border-color .18s ease,
transform .15s ease;
"

>

Copiar

</button>

</div>

<div
id="suggestedTags"
style="
display:flex;
flex-wrap:wrap;
gap:8px;
">
</div>

</div>

<!-- Divider -->

<div style="
height:1px;
background:${divider};
margin:18px 0;
"></div>

<!-- ================= VÍDEO EM DESTAQUE ================= -->

<div class="card">

<div style="

margin-bottom:18px;

">

<div style="
display:flex;
align-items:center;
gap:8px;

font-size:14px;
font-weight:700;

color:${textPrimary};

">

<span style="color:#FACC15;">🎬</span>

Vídeo em Destaque

</div>

<div style="
margin-top:4px;

font-size:11px;

color:${textSecondary};

line-height:1.5;
">

Analytics • SEO • Metadata • Performance

</div>

</div>

<div
id="videoStats"
style="
display:grid;

grid-template-columns:repeat(2,minmax(0,1fr));

gap:16px 18px;

font-size:12px;

line-height:1.75;

color:${textPrimary};
">
</div>

</div>

<div style="
height:1px;

background:${divider};

margin:20px 0;
"></div>

</div>

<div
id="loadingMessage"
style="
display:none;

padding:14px;

text-align:center;

font-size:12px;

font-weight:600;

color:#FACC15;

background:${cardBg};

border:1px solid ${cardBorder};

border-radius:12px;

backdrop-filter:blur(16px) saturate(170%);
-webkit-backdrop-filter:blur(16px) saturate(170%);
">

Carregando dados...

</div>

<div
id="errorMessage"
style="
display:none;

padding:14px;

text-align:center;

font-size:12px;

font-weight:600;

color:#EF4444;

background:${cardBg};

border:1px solid ${cardBorder};

border-radius:12px;

backdrop-filter:blur(16px) saturate(170%);
-webkit-backdrop-filter:blur(16px) saturate(170%);
">
</div>

</div>

<div
id="tab-validacao"
class="tab-content"
style="display:none;"
>

<!-- 🔝 HEADER -->

<div style="
background:${cardBg};

backdrop-filter:blur(16px) saturate(170%);
-webkit-backdrop-filter:blur(16px) saturate(170%);

border:1px solid ${cardBorder};

border-radius:14px;

padding:14px;

margin-bottom:14px;

text-align:center;

box-shadow:
inset 0 1px 0 rgba(255,255,255,.04);
">

<div style="
font-size:13px;
font-weight:700;

color:${textPrimary};

margin-bottom:4px;
">

🧠 Validação de Vídeo

</div>

<div style="
font-size:11px;

color:${textSecondary};

line-height:1.5;
">

Simulação baseada em CTR, título e contexto de busca

</div>

</div>

<!-- 📥 FORM -->

<div style="
display:flex;
flex-direction:column;
gap:12px;
">

<!-- TÍTULO -->

<div class="card">

<label style="
display:block;

margin-bottom:8px;

font-size:11px;

font-weight:600;

color:${textSecondary};
">

Título do vídeo

</label>

<textarea

id="val-title"

style="
width:100%;

height:60px;

box-sizing:border-box;

padding:10px 12px;

background:${buttonBg};

backdrop-filter:blur(16px) saturate(170%);
-webkit-backdrop-filter:blur(16px) saturate(170%);

border:1px solid ${buttonBorder};

border-radius:10px;

color:${textPrimary};

font-size:12px;

font-family:inherit;

resize:none;

outline:none;

transition:
border-color .18s ease,
background .18s ease;
"

></textarea>

</div>

<!-- KEYWORD -->

<div class="card">

<label style="
display:block;

margin-bottom:8px;

font-size:11px;

font-weight:600;

color:${textSecondary};
">

Palavra-chave

</label>

<input

id="val-keyword"

style="
width:100%;

box-sizing:border-box;

padding:10px 12px;

background:${buttonBg};

backdrop-filter:blur(16px) saturate(170%);
-webkit-backdrop-filter:blur(16px) saturate(170%);

border:1px solid ${buttonBorder};

border-radius:10px;

color:${textPrimary};

font-size:12px;

outline:none;

transition:
border-color .18s ease,
background .18s ease;
"

/>

</div>

<!-- GRID -->

<div style="
display:grid;
grid-template-columns:1fr 1fr;
gap:10px;
">

<div class="card">

<label style="
display:block;

margin-bottom:8px;

font-size:11px;

font-weight:600;

color:${textSecondary};
">

Tipo de Conteúdo

</label>

<select

id="val-type"

style="
width:100%;

box-sizing:border-box;

padding:10px 12px;

background:${buttonBg};

backdrop-filter:blur(16px) saturate(170%);
-webkit-backdrop-filter:blur(16px) saturate(170%);

border:1px solid ${buttonBorder};

border-radius:10px;

color:${textPrimary};

font-size:12px;

outline:none;

cursor:pointer;
">


    <!-- 🎓 EDUCAÇÃO -->
    <optgroup label="🎓 Educação">
      <option value="tutorial">Tutorial</option>
      <option value="aula">Aula Completa</option>
      <option value="explicacao">Explicação</option>
      <option value="guia">Guia Passo a Passo</option>
      <option value="dicas">Dicas Rápidas</option>
    </optgroup>

    <!-- 💻 TECNOLOGIA -->
    <optgroup label="💻 Tecnologia">
      <option value="review">Review</option>
      <option value="comparacao">Comparação</option>
      <option value="unboxing">Unboxing</option>
      <option value="setup">Setup / Configuração</option>
      <option value="noticias_tech">Notícias Tech</option>
    </optgroup>

    <!-- 💰 NEGÓCIOS / DINHEIRO -->
    <optgroup label="💰 Negócios & Dinheiro">
      <option value="empreendedorismo">Empreendedorismo</option>
      <option value="marketing">Marketing Digital</option>
      <option value="renda_extra">Renda Extra</option>
      <option value="investimentos">Investimentos</option>
      <option value="case">Estudo de Caso</option>
    </optgroup>

    <!-- 🎮 ENTRETENIMENTO -->
    <optgroup label="🎮 Entretenimento">
      <option value="gameplay">Gameplay</option>
      <option value="react">React</option>
      <option value="desafio">Desafio</option>
      <option value="vlog">Vlog</option>
      <option value="historia">Storytelling</option>
      <option value="curiosidade">Curiosidades</option>
    </optgroup>

    <!-- 🎭 OPINIÃO -->
    <optgroup label="🎭 Opinião">
      <option value="opiniao">Opinião</option>
      <option value="analise">Análise Crítica</option>
      <option value="polêmica">Polêmica</option>
      <option value="debate">Debate</option>
    </optgroup>

    <!-- 🧠 DESENVOLVIMENTO PESSOAL -->
    <optgroup label="🧠 Desenvolvimento Pessoal">
      <option value="motivacao">Motivacional</option>
      <option value="produtividade">Produtividade</option>
      <option value="habitos">Hábitos</option>
      <option value="mindset">Mindset</option>
    </optgroup>

    <!-- 🏋️ SAÚDE -->
    <optgroup label="🏋️ Saúde & Fitness">
      <option value="treino">Treino</option>
      <option value="dieta">Dieta</option>
      <option value="saude">Saúde</option>
      <option value="bem_estar">Bem-estar</option>
    </optgroup>

    <!-- 🎬 FORMATOS -->
    <optgroup label="🎬 Formatos">
      <option value="shorts">Shorts</option>
      <option value="longo">Vídeo Longo</option>
      <option value="serie">Série</option>
      <option value="ao_vivo">Live</option>
      <option value="podcast">Podcast</option>
    </optgroup>

    <!-- 🚀 CRESCIMENTO YOUTUBE -->
    <optgroup label="🚀 YouTube & Growth">
      <option value="seo">SEO YouTube</option>
      <option value="thumbnail">Thumbnail</option>
      <option value="algoritmo">Algoritmo</option>
      <option value="estrategia">Estratégia de Canal</option>
    </optgroup>

  </select>
</div>

      <div class="card">
        <label style="font-size:11px;color:#aaa;">Tendência</label>
        <select id="val-trend" style="
          width:100%;
          padding:8px;
          background:#1a1a1a;
          color:#f0c14b;
          border:1px solid #333;
          border-radius:8px;
          font-size:12px;
        ">
          <option value="ALTA">Alta</option>
          <option value="ESTAVEL">Estável</option>
          <option value="BAIXA">Baixa</option>
        </select>
      </div>

    </div>

    <!-- THUMB -->
    <div class="card">
      <label style="font-size:11px;color:#aaa;">Palavra da Thumbnail</label>
      <input
        id="val-thumb-word"
        placeholder="Ex: ERRO, SEGREDO..."
        style="
          width:100%;
          padding:8px;
          background:#1a1a1a;
          color:#f0c14b;
          border:1px solid #333;
          border-radius:8px;
          font-size:12px;
        "
      />
    </div>

    <!-- 🔥 BOTÃO -->
    <button id="val-run" style="
      background:linear-gradient(90deg,#FFD700,#f0c14b);
      color:#000;
      border:none;
      padding:12px;
      border-radius:10px;
      font-weight:700;
      cursor:pointer;
      font-size:13px;
      margin-top:6px;
      box-shadow:0 6px 18px rgba(0,0,0,0.4);
    ">
      ⚡ Calcular Chance
    </button>

    <!-- RESULT -->
    <div id="val-result" style="
      display:none;
      margin-top:6px;
      padding:12px;
      background:#0f0f0f;
      border:1px solid #2a2a2a;
      border-radius:10px;
    "></div>

    <!-- INFO -->
    <div style="
      font-size:10px;
      color:#777;
      text-align:center;
      margin-top:4px;
    ">
      *Resultado baseado em padrões de CTR e comportamento do público
    </div>

  </div>

</div>


<div id="tab-tendencias" class="tab-content" style="display:none;">
  <h3 style="text-align:center; margin-bottom:6px;">📈 Painel de Tendências</h3>
  <div id="tendencias-content">Carregando dados de tendências...</div>
</div>



  <div id="tab-shorts" class="tab-content" style="display:none;">
  <h3 style="text-align:center; margin-bottom:6px;">TubeX Shorts</h3>
  
  <div id="shortsTitleAnalysis" style="margin-bottom:8px; font-weight:bold;"></div>
  
  <div id="shortsEngagementChecklist" style="margin-bottom:8px;"></div>
  
  <div id="shortsHashtags" style="margin-bottom:8px;"></div>
  
  <div id="shortsPerformance" style="margin-bottom:8px;"></div>
</div>


      <div id="tab-vlogs" class="tab-content" style="display:none;">
        <h3 style="text-align:center; margin-bottom:6px;">Painel Vlogs</h3>

        <h4>Análise de Títulos Emocionais</h4>
        <textarea id="vlogTitleInput" placeholder="Digite o título do seu vlog..." style="width:100%; height:60px; margin-bottom:6px; background:#222; color:#f0c14b; border-radius:4px; border:1px solid #444; padding:6px;"></textarea>
        <button id="analyzeTitleBtn" class="copy-btn">Analisar Título</button>
        <div id="titleAnalysisResult" style="margin-top:6px; font-size:12px; color:#ccc;"></div>

        <hr style="border-color:#333; margin:8px 0;">

        <h4>Detector de Clickbait Saudável</h4>
        <textarea id="clickbaitInput" placeholder="Digite título ou descrição para análise..." style="width:100%; height:50px; margin-bottom:6px; background:#222; color:#f0c14b; border-radius:4px; border:1px solid #444; padding:6px;"></textarea>
        <button id="checkClickbaitBtn" class="copy-btn">Verificar Clickbait</button>
        <div id="clickbaitResult" style="margin-top:6px; font-size:12px; color:#ccc;"></div>

        <hr style="border-color:#333; margin:8px 0;">

        <h4>Checklist de Engajamento</h4>
        <ul id="engagementChecklist" style="color:#f0c14b; font-size:13px; list-style-type: square; padding-left:20px;">
          <li><input type="checkbox" id="chkHook" /> Gancho forte no início</li>
          <li><input type="checkbox" id="chkStory" /> História envolvente</li>
          <li><input type="checkbox" id="chkCallToAction" /> Chamada para ação clara</li>
          <li><input type="checkbox" id="chkThumbnail" /> Thumbnail atraente</li>
          <li><input type="checkbox" id="chkTags" /> Tags relevantes</li>
          <li><input type="checkbox" id="chkConsistency" /> Consistência na publicação</li>
        </ul>

        <hr style="border-color:#333; margin:8px 0;">

        <h4>Sugestões de Ganchos para Vlogs</h4>
        <button id="suggestHooksBtn" class="copy-btn">Gerar Sugestões</button>
        <ul id="hooksList" style="color:#DDD; font-size:12px; max-height:90px; overflow-y:auto; margin-top:4px;"></ul>

        <hr style="border-color:#333; margin:8px 0;">

        <h4>Dicas Rápidas para Vlogs</h4>
        <ul id="vlogTips" style="color:#f0c14b; font-size:12px; list-style-type: disc; padding-left:18px;">
          <li>Comece com um gancho forte.</li>
          <li>Conte uma história pessoal para conectar.</li>
          <li>Mantenha o ritmo dinâmico na edição.</li>
          <li>Use thumbnails vibrantes e chamativas.</li>
          <li>Finalize com uma chamada para ação clara.</li>
        </ul>

        <hr style="border-color:#333; margin:8px 0;">

        <h4>Sugestões de Hashtags</h4>
        <div id="vlogHashtags" style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:6px;">
          <span class="tag" style="background:#444; color:#f0c14b; padding:3px 6px; border-radius:6px; font-size:11px; cursor:pointer; user-select:none;">#vlog</span>
          <span class="tag" style="background:#444; color:#f0c14b; padding:3px 6px; border-radius:6px; font-size:11px; cursor:pointer; user-select:none;">#dailyvlog</span>
          <span class="tag" style="background:#444; color:#f0c14b; padding:3px 6px; border-radius:6px; font-size:11px; cursor:pointer; user-select:none;">#lifestyle</span>
          <span class="tag" style="background:#444; color:#f0c14b; padding:3px 6px; border-radius:6px; font-size:11px; cursor:pointer; user-select:none;">#vlogger</span>
          <span class="tag" style="background:#444; color:#f0c14b; padding:3px 6px; border-radius:6px; font-size:11px; cursor:pointer; user-select:none;">#youtuber</span>
          <span class="tag" style="background:#444; color:#f0c14b; padding:3px 6px; border-radius:6px; font-size:11px; cursor:pointer; user-select:none;">#behindthescenes</span>
        </div>
        <button id="copyVlogTagsBtn" class="copy-btn" style="width:100%;">Copiar Hashtags</button>
      </div>


<div id="tab-scripts" class="tab-content" style="display:none;">
  <h3 style="text-align:center; margin-bottom:6px;">Painel Roteiros</h3>
  <textarea id="scriptInput" placeholder="Digite seu roteiro aqui..." 
            style="width:100%; height:120px; margin-bottom:8px; background:#222; color:#f0c14b; border-radius:4px; border:1px solid #444; padding:6px;"></textarea>
  <button id="generateScriptBtn" class="copy-btn" style="margin-bottom:8px; width:100%;">Gerar Roteiro Automático</button>
  <button id="copyScriptBtn" class="copy-btn" style="margin-bottom:12px; width:100%;">Copiar Roteiro</button>
<button id="saveScriptBtn" style="width:100%; margin-top:6px;">Salvar Roteiro</button>
<button id="clearScriptBtn" style="width:100%; margin-top:6px;">Limpar Roteiro</button>
  <h4>Roteiro Final:</h4>
  <div id="scriptOutput" style="white-space:pre-wrap; background:#111; color:#f0c14b; padding:10px; border-radius:4px; min-height:80px; border:1px solid #444;"></div>
</div>

<div id="tab-ia" class="tab-content" style="display:none;">

    <!-- ====================================== -->
    <!-- HEADER -->
    <!-- ====================================== -->

    <h3 style="
        text-align:center;
        margin:0;
        color:#FFD54F;
        font-size:24px;
        font-weight:700;
    ">
        🚀 TubeX Workspace
    </h3>

    <div style="
        text-align:center;
        color:#8f8f8f;
        font-size:12px;
        margin:6px 0 20px;
        line-height:1.5;
    ">
        Planeje, escreva e otimize todo o seu vídeo em um único lugar.
    </div>

    <!-- ====================================== -->
    <!-- KEYWORD -->
    <!-- ====================================== -->

    <label style="
        display:block;
        font-size:12px;
        font-weight:600;
        color:#ddd;
        margin-bottom:6px;
    ">
        Tema ou Palavra-chave
    </label>

    <input
        id="iaKeywordInput"
        type="text"
        placeholder="Ex: Como crescer no YouTube"
        style="
            width:100%;
            box-sizing:border-box;
            height:42px;
            padding:0 12px;
            border-radius:8px;
            border:1px solid #3a3a3a;
            background:#1d1d1d;
            color:#fff;
            font-size:13px;
            margin-bottom:22px;
        "
    >

    <!-- ====================================== -->
    <!-- SCORE -->
    <!-- ====================================== -->

    <div style="margin-bottom:18px;">

        <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            margin-bottom:6px;
        ">

            <span style="
                color:#9ca3af;
                font-size:12px;
            ">
                SEO Score
            </span>

            <span
                id="tituloSeoScore"
                style="
                    font-size:12px;
                    font-weight:700;
                    color:#ef4444;
                "
            >
                0%
            </span>

        </div>

        <div style="
            width:100%;
            height:8px;
            background:#2b2b2b;
            border-radius:999px;
            overflow:hidden;
        ">

            <div
                id="tituloSeoBar"
                style="
                    width:0%;
                    height:100%;
                    background:#ef4444;
                    transition:.3s;
                "
            ></div>

        </div>

    </div>

    <!-- ====================================== -->
    <!-- TITULO -->
    <!-- ====================================== -->

    <div style="
        background:#111;
        border:1px solid #3a3a3a;
        border-radius:10px;
        padding:14px;
        margin-bottom:18px;
        box-sizing:border-box;
    ">

        <div style="
            color:#fff;
            font-weight:700;
            margin-bottom:12px;
            font-size:14px;
        ">
            🎯 Gerador de Títulos
        </div>

        <div style="
            display:flex;
            gap:8px;
            margin-bottom:12px;
        ">

            <select
                id="tipoTitulo"
                style="
                    flex:1;
                    background:#222;
                    color:#fff;
                    border:1px solid #444;
                    border-radius:8px;
                    padding:10px;
                "
            >

                <option value="tituloImpactante_panel">
                    ⚡ Impactante
                </option>

                <option value="tituloSEO_panel">
                    🔎 SEO
                </option>

                <option value="tituloEmocional_panel">
                    ❤️ Emocional
                </option>

            </select>

            <button
                id="btnGerarTitulo"
                class="copy-btn"
                style="
                    width:120px;
                "
            >
                ✨ Gerar
            </button>

        </div>

        <textarea
            id="workspaceTitulo"
            placeholder="Seu título aparecerá aqui..."
            oninput="atualizarTituloSEO()"
            style="
                width:100%;
                box-sizing:border-box;
                height:95px;
                resize:none;
                background:#1d1d1d;
                color:#fff;
                border:1px solid #3a3a3a;
                border-radius:8px;
                padding:12px;
                line-height:1.5;
                font-size:14px;
            "
        ></textarea>

    </div>

    <!-- ====================================== -->
    <!-- DESCRIÇÃO -->
    <!-- ====================================== -->

    <div style="
        background:#111;
        border:1px solid #3a3a3a;
        border-radius:10px;
        padding:14px;
        margin-bottom:18px;
        box-sizing:border-box;
    ">

        <div style="
            color:#fff;
            font-weight:700;
            margin-bottom:12px;
            font-size:14px;
        ">
            📝 Descrição Otimizada
        </div>

        <button
            id="btnDescricao"
            class="copy-btn"
            style="
                width:100%;
                margin-bottom:12px;
            "
        >
            ✨ Gerar Descrição
        </button>

        <textarea
            id="descricaoGerada"
            readonly
            style="
                width:100%;
                box-sizing:border-box;
                height:140px;
                resize:vertical;
                background:#1d1d1d;
                color:#FFD54F;
                border:1px solid #3a3a3a;
                border-radius:8px;
                padding:12px;
            "
        ></textarea>

    </div>

    <!-- ====================================== -->
    <!-- ROTEIRO -->
    <!-- ====================================== -->

    <div style="
        background:#111;
        border:1px solid #3a3a3a;
        border-radius:10px;
        padding:14px;
        box-sizing:border-box;
    ">

        <div style="
            color:#fff;
            font-weight:700;
            margin-bottom:12px;
            font-size:14px;
        ">
            💡 Roteiro Completo
        </div>

        <button
            id="btnRoteiroBasico"
            class="copy-btn"
            style="
                width:100%;
                margin-bottom:12px;
            "
        >
            ✨ Gerar Roteiro
        </button>

        <textarea
            id="roteiroBasico"
            readonly
            style="
                width:100%;
                box-sizing:border-box;
                height:220px;
                resize:vertical;
                background:#1d1d1d;
                color:#FFD54F;
                border:1px solid #3a3a3a;
                border-radius:8px;
                padding:12px;
                line-height:1.6;
            "
        ></textarea>

    </div>

</div>

  `;

setTimeout(() => {

  const collapseBtn = document.getElementById('collapseBtn');

  if (!collapseBtn) {
    console.warn("❌ collapseBtn não encontrado");
    return;
  }

  collapseBtn.onclick = () => {

    const panelEl = document.getElementById('tubex-panel');

    if (!panelEl) return;

    panelEl.style.display = 'none';

  };

}, 0);


setTimeout(() => {
  const seoTab = document.querySelector('.tab-btn[data-tab="seo"]');

  if (seoTab) {
    seoTab.click();
  }
}, 50);

  document.body.appendChild(panel); // <-- painel existe no DOM!

// Verifica se o container geral já existe, senão cria um novo
let tubexContainer = document.getElementById('tubex-container');
if (!tubexContainer) {
  tubexContainer = document.createElement('div');
  tubexContainer.id = 'tubex-container';

  tubexContainer.style.position = 'fixed';
  tubexContainer.style.top = '80px';       // Ajuste conforme necessário
  tubexContainer.style.right = '10px';     // Ajuste conforme necessário
  tubexContainer.style.width = '340px';    // Largura do painel
  tubexContainer.style.height = 'auto';
  tubexContainer.style.zIndex = '10000';
  tubexContainer.style.pointerEvents = 'auto';

  document.body.appendChild(tubexContainer);
}

setTimeout(() => {

  const btn = document.getElementById('copyTitleTags');

  if(!btn) return;

  // remove eventos antigos
  const clone = btn.cloneNode(true);
  btn.parentNode.replaceChild(clone, btn);

  clone.addEventListener('click', () => {

    const tags = window.__tubexTags || [];

    if(!tags.length){
      alert("Nenhuma tag encontrada.");
      return;
    }

    const texto = tags.join(", ");

    navigator.clipboard.writeText(texto)
      .then(() => {
        console.log("✅ COPY LIMPO:", texto);
      })
      .catch(() => {
        // fallback seguro
        const textarea = document.createElement("textarea");
        textarea.value = texto;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      });

  });

}, 1000);

// Remove painel antigo se existir para evitar duplicações
const oldPanel = document.getElementById('tubex-panel');
if (oldPanel) oldPanel.remove();

// Adiciona o painel dentro do container seguro
tubexContainer.appendChild(panel);


// Controle de colapso do painel (VERSÃO FINAL)
const collapseBtn = document.getElementById('collapseBtn');

if (collapseBtn) {
  collapseBtn.onclick = () => {
    panel.style.display = 'none';
    createMiniButton(); // 🔥 cria botão ⚡ ao minimizar
  };
}

// Controle de abas
const tabs = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
  tab.addEventListener('click', () => {

    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const selected = tab.dataset.tab;

    tabContents.forEach(tc => {
      tc.style.display = tc.id === `tab-${selected}` ? 'block' : 'none';
    });

    // =========================
    // 🔥 SHORTS (CORRIGIDO)
    // =========================
    if (selected === 'shorts') {
      console.log("🔥 Shorts clicado");

      fillShortsTab({
        keyword: getCurrentYoutubeSearchQuery?.() || "",
        videoInfo: {
          title: document.title || "",
          duration: 30
        }
      });
    }

    // =========================
    // 📖 SCRIPTS
    // =========================
    if (selected === 'scripts') {
      setupRoteiroFunctions?.();
    }

    // =========================
    // 🧠 VALIDAÇÃO
    // =========================
    if (selected === 'validacao') {
      setTimeout(() => {
        setupValidacaoTab?.();
      }, 50);
    }

if (selected === 'tendencias') {

  const containerTendencias = document.getElementById('tendencias-content');

  const keyword =
    getCurrentYoutubeSearchQuery() ||
    new URLSearchParams(location.search).get('search_query') ||
    '';

  if (!containerTendencias) return;

  if (!keyword) {
    containerTendencias.textContent =
      'Nenhuma palavra-chave para buscar tendências.';
    return;
  }

  const normalizedKeyword = keyword.trim().toLowerCase();

  // =========================================
  // 🚫 LOCK GLOBAL
  // =========================================
  if (window.__tubexTrendRunning) {
    console.log("⏳ tendência já rodando");
    return;
  }

  window.__tubexTrendRunning = true;

  // =========================================
  // 🔐 REQUEST TOKEN
  // =========================================
  const requestId = Date.now();
  window.__tubexTrendRequest = requestId;

  // =========================================
  // ⚡ CACHE
  // =========================================
  if (
    tendenciaCache[normalizedKeyword] &&
    Array.isArray(tendenciaCache[normalizedKeyword]) &&
    tendenciaCache[normalizedKeyword].length
  ) {
    mostrarEstatisticasTendencias(
      tendenciaCache[normalizedKeyword],
      normalizedKeyword
    );

    window.__tubexTrendRunning = false;
    return;
  }

  // =========================================
  // ⏳ LOADING
  // =========================================
  containerTendencias.textContent = 'Carregando dados de tendências...';

  // =========================================
  // 🚀 CHAMADA SEGURA (SEM AWAIT)
  // =========================================
  carregarDadosTendencias(normalizedKeyword)
    .then((data) => {

      // 🚫 ignora resposta antiga
      if (window.__tubexTrendRequest !== requestId) {
        console.log("🚫 resposta antiga ignorada");
        return;
      }

      if (!data || !Array.isArray(data) || !data.length) {
        containerTendencias.textContent = "Nenhuma tendência encontrada.";
        return;
      }

      tendenciaCache[normalizedKeyword] = data;

      mostrarEstatisticasTendencias(data, normalizedKeyword);

    })
    .catch((e) => {
      console.error("💥 erro tendências:", e);
      containerTendencias.textContent = "Erro ao carregar tendências.";
    })
    .finally(() => {
      window.__tubexTrendRunning = false;
    });
}
  });
});

// Função para gerar um roteiro automático profissional (já existente)
function generateScript() {
  const roteiroProfissional = 
`🎬 Introdução (Gancho):
- Você já se perguntou [problema impactante]?
- Fica comigo que hoje você vai descobrir como resolver isso de forma simples.

📌 Apresentação do Tema:
- Olá, eu sou [Seu Nome] e nesse vídeo vou te mostrar como [solução ou resultado esperado].

🧠 Desenvolvimento:
1. Contextualize o problema
2. Apresente a primeira dica ou passo com um exemplo prático
3. Apresente a segunda dica ou passo com uma analogia
4. Envolva o espectador com uma pergunta ou interação ("Comenta aqui...")

⚡ Transição para Conclusão:
- Agora que você já entendeu os passos, aqui vai um resumo rápido...

✅ Conclusão:
- Recapitule os principais pontos
- Convide para se inscrever, curtir e compartilhar
- Indique outro vídeo relevante

📢 CTA Final:
- E se quiser se aprofundar, tem um link na descrição que vai te ajudar ainda mais!`;

  const scriptInput = document.getElementById('scriptInput');
  if (scriptInput) {
    scriptInput.value = roteiroProfissional;
    updateScriptOutput();
  }
}

// Atualiza a visualização do roteiro (já existente)
function updateScriptOutput() {
  const scriptInput = document.getElementById('scriptInput');
  const scriptOutput = document.getElementById('scriptOutput');
  if (scriptInput && scriptOutput) {
    scriptOutput.textContent = scriptInput.value;
  }
}

// Copia o conteúdo do roteiro para a área de transferência (já existente)
function copyScript() {
  const scriptInput = document.getElementById('scriptInput');
  if (scriptInput) {
    navigator.clipboard.writeText(scriptInput.value).then(() => {
      showCopyFeedback("Roteiro copiado com sucesso!");
    }).catch(() => {
      showCopyFeedback("Erro ao copiar roteiro.");
    });
  }
}

// Feedback visual ao copiar (já existente)
function showCopyFeedback(message) {
  const feedback = document.createElement('div');
  feedback.textContent = message;
  feedback.style.position = 'fixed';
  feedback.style.bottom = '20px';
  feedback.style.left = '50%';
  feedback.style.transform = 'translateX(-50%)';
  feedback.style.background = '#333';
  feedback.style.color = '#f0c14b';
  feedback.style.padding = '10px 20px';
  feedback.style.borderRadius = '8px';
  feedback.style.boxShadow = '0 0 10px #000';
  feedback.style.zIndex = '9999';
  document.body.appendChild(feedback);
  setTimeout(() => document.body.removeChild(feedback), 2500);
}

// Função para limpar o roteiro
function clearScript() {
  const scriptInput = document.getElementById('scriptInput');
  if (scriptInput) {
    scriptInput.value = '';
    updateScriptOutput();
  }
}

// Função para salvar o roteiro no localStorage (para manter mesmo após atualizar a página)
function saveScript() {
  const scriptInput = document.getElementById('scriptInput');
  if (scriptInput) {
    const text = scriptInput.value;
    // Cria o blob do texto
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    // Cria link temporário e clica nele
    const a = document.createElement('a');
    a.href = url;
    a.download = 'roteiro-youtube.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
    showCopyFeedback("Roteiro baixado como .txt!");
  }
}


// Função para carregar roteiro salvo do localStorage
function loadScript() {
  const saved = localStorage.getItem('savedScript');
  if (saved) {
    const scriptInput = document.getElementById('scriptInput');
    if (scriptInput) {
      scriptInput.value = saved;
      updateScriptOutput();
    }
  }
}

// Variável para garantir que eventos sejam ligados só uma vez (já existente)
let roteiroSetupFeito = false;

// Conecta eventos dos botões e textarea + carrega roteiro salvo
function setupRoteiroFunctions() {
  if (roteiroSetupFeito) return;
  roteiroSetupFeito = true;

  const generateBtn = document.getElementById('generateScriptBtn');
  const copyBtn = document.getElementById('copyScriptBtn');
  const clearBtn = document.getElementById('clearScriptBtn');    // novo botão limpar
  const saveBtn = document.getElementById('saveScriptBtn');      // novo botão salvar
  const scriptInput = document.getElementById('scriptInput');

  if (generateBtn) generateBtn.addEventListener('click', generateScript);
  if (copyBtn) copyBtn.addEventListener('click', copyScript);
  if (clearBtn) clearBtn.addEventListener('click', clearScript);
  if (saveBtn) saveBtn.addEventListener('click', saveScript);
  if (scriptInput) scriptInput.addEventListener('input', updateScriptOutput);

  loadScript();  // Carrega roteiro salvo ao iniciar
  updateScriptOutput();
}



  // -- Funções específicas da aba Vlogs --

  // Análise simples de título emocional (exemplo rápido)
  function analyzeTitle(title) {
    if (!title) return 'Digite um título para analisar.';
    const positiveWords = ['incrível', 'surpresa', 'inesquecível', 'emocionante', 'melhor', 'único'];
    const negativeWords = ['chato', 'difícil', 'ruim', 'péssimo', 'decepcionante'];
    let score = 0;
    const lower = title.toLowerCase();
    positiveWords.forEach(w => { if (lower.includes(w)) score += 2; });
    negativeWords.forEach(w => { if (lower.includes(w)) score -= 2; });

    if (score > 2) return 'Título muito emocional e positivo! Ótimo para engajamento.';
    if (score > 0) return 'Título com emoção positiva moderada.';
    if (score === 0) return 'Título neutro, pode melhorar a emoção.';
    return 'Título com emoção negativa, cuidado com o impacto!';
  }

  // Detector básico de clickbait saudável (exemplo)
  function checkClickbait(text) {
    if (!text) return 'Digite um texto para analisar.';
    const clickbaitTriggers = ['inacreditável', 'você não vai acreditar', 'chocante', 'seu mundo vai mudar', 'segredo'];
    const lower = text.toLowerCase();
    const found = clickbaitTriggers.filter(w => lower.includes(w));
    if (found.length > 0) {
      return `Aviso: Possível clickbait detectado com palavras: ${found.join(', ')}. Use com moderação para não perder confiança do público.`;
    }
    return 'Nenhum clickbait detectado. Texto parece confiável.';
  }

  // Sugestões simples de ganchos para vlogs
  const vlogHooks = [
    'Você não vai acreditar no que aconteceu hoje!',
    'O dia mais estranho da minha vida...',
    'Descubra como eu melhorei meu canal em 1 mês!',
    'Venha comigo nessa aventura incrível!',
    'O segredo que ninguém te contou sobre vlog.',
    'Erro que quase arruinou meu vídeo!',
    'Como eu faço meus vlogs bombarem rápido.'
  ];

  // Elementos da aba Vlogs
  const titleInput = document.getElementById('vlogTitleInput');
  const analyzeBtn = document.getElementById('analyzeTitleBtn');
  const titleResult = document.getElementById('titleAnalysisResult');

  const clickbaitInput = document.getElementById('clickbaitInput');
  const clickbaitBtn = document.getElementById('checkClickbaitBtn');
  const clickbaitResult = document.getElementById('clickbaitResult');

  const hooksList = document.getElementById('hooksList');
  const suggestHooksBtn = document.getElementById('suggestHooksBtn');

  const copyVlogTagsBtn = document.getElementById('copyVlogTagsBtn');
  const vlogHashtags = document.getElementById('vlogHashtags');

  analyzeBtn.addEventListener('click', () => {
    const res = analyzeTitle(titleInput.value);
    titleResult.textContent = res;
  });

  clickbaitBtn.addEventListener('click', () => {
    const res = checkClickbait(clickbaitInput.value);
    clickbaitResult.textContent = res;
  });

  suggestHooksBtn.addEventListener('click', () => {
    hooksList.innerHTML = '';
    vlogHooks.forEach(hook => {
      const li = document.createElement('li');
      li.textContent = hook;
      hooksList.appendChild(li);
    });
  });

  // Copiar hashtags para área de transferência
 copyVlogTagsBtn.addEventListener('click', () => {

  const tagsElements = vlogHashtags.querySelectorAll('*');

  if (!tagsElements.length) {
    alert("Nenhuma hashtag encontrada.");
    return;
  }

  const tags = Array.from(tagsElements)
    .map(el => el.textContent.trim())
    .filter(t => t.length > 0)
    .join(', '); // 🔥 CORRETO

  navigator.clipboard.writeText(tags)
    .then(() => {
      console.log("✅ Copiado:", tags);
      alert('Hashtags copiadas!');
    })
    .catch(() => {
      // fallback (EXTENSÃO ÀS VEZES BLOQUEIA CLIPBOARD)
      const textarea = document.createElement("textarea");
      textarea.value = tags;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();

      alert('Hashtags copiadas!');
    });

});
 
}

function bindIAButtons() {

    // ============================
    // GERAR TÍTULO
    // ============================

    const btnTitulo =
        document.getElementById("btnGerarTitulo");

    if (btnTitulo && !btnTitulo.dataset.bound) {

        btnTitulo.dataset.bound = "1";

        btnTitulo.addEventListener("click", () => {

            const tipo =
                document.getElementById("tipoTitulo").value;

            gerarCampoIA(
                tipo,
                "workspaceTitulo",
                {
                    isInput: true
                }
            );

        });

    }

    // ============================
    // DESCRIÇÃO
    // ============================

    const btnDescricao =
        document.getElementById("btnDescricao");

    if (btnDescricao && !btnDescricao.dataset.bound) {

        btnDescricao.dataset.bound = "1";

        btnDescricao.addEventListener(
            "click",
            gerarDescricao
        );

    }

    // ============================
    // ROTEIRO
    // ============================

    const btnRoteiro =
        document.getElementById("btnRoteiroBasico");

    if (btnRoteiro && !btnRoteiro.dataset.bound) {

        btnRoteiro.dataset.bound = "1";

        btnRoteiro.addEventListener(
            "click",
            gerarRoteiro
        );

    }

}


function initPainelIA(){
  console.log("🔥 INIT IA OK");
}


function showToast(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.position = 'fixed';
  el.style.bottom = '20px';
  el.style.left = '50%';
  el.style.transform = 'translateX(-50%)';
  el.style.background = '#FFD700';
  el.style.color = '#000';
  el.style.padding = '10px 20px';
  el.style.borderRadius = '8px';
  el.style.boxShadow = '0 0 10px #000';
  el.style.zIndex = '9999';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

// Observa se o painel IA foi renderizado
const observer = new MutationObserver(() => {
  const input = document.getElementById("iaKeywordInput");
  if (input) {
    bindIAButtons();
    observer.disconnect();
  }
});
observer.observe(document.body, { childList: true, subtree: true });


// ✅ Cria botões de copiar e exportar texto IA
function criarBotoesExportacaoIA() {
  const abaIA = document.getElementById('tab-ia');
  if (!abaIA || document.getElementById('btnCopiarTudo')) return;

  const container = document.createElement('div');
  container.style.marginTop = '20px';

  const criarBotao = (id, texto, cor, onClick) => {
    const btn = document.createElement('button');
    btn.id = id;
    btn.textContent = texto;
    btn.style.marginRight = '10px';
    btn.style.padding = '8px 12px';
    btn.style.borderRadius = '8px';
    btn.style.border = 'none';
    btn.style.background = cor;
    btn.style.color = 'white';
    btn.style.cursor = 'pointer';
    btn.onclick = onClick;
    return btn;
  };

  const btnCopiar = criarBotao('btnCopiarTudo', '📋 Copiar Tudo', '#0f9d58', copiarTudoIA);
  const btnExportar = criarBotao('btnExportarTxt', '💾 Exportar .txt', '#4285f4', exportarTextoIA);

  container.appendChild(btnCopiar);
  container.appendChild(btnExportar);
  abaIA.appendChild(container);
}

function copiarTudoIA() {

    const campos = [

       "workspaceTitulo",
        "descricaoGerada",
        "hashtagsGeradas",
        "tagsAvancadas",
        "ideiasVideo",
        "roteiroBasico",
        "analiseTitulo",
        "ctaGeradas"

    ];

    let texto = "[Resumo IA do TubeX]\n\n";

    campos.forEach(id => {

        const el = document.getElementById(id);

        if (!el) return;

        let conteudo = "";

        if ("value" in el) {

            conteudo = (el.value || "").trim();

        } else {

            conteudo = (el.textContent || "").trim();

        }

        if (!conteudo) return;

        texto += `--- ${id} ---\n${conteudo}\n\n`;

    });

    navigator.clipboard
        .writeText(texto)
        .then(() => {

            alert("✅ Conteúdo copiado com sucesso!");

        })
        .catch(err => {

            console.error(err);

            alert("Erro ao copiar: " + err.message);

        });

}

function exportarTextoIA() {

    const campos = [

        "tituloImpactante",
        "tituloSEO",
        "tituloEmocional",
        "descricaoGerada",
        "hashtagsGeradas",
        "tagsAvancadas",
        "ideiasVideo",
        "roteiroBasico",
        "analiseTitulo",
        "ctaGeradas"

    ];

    let texto = "Resumo IA - TubeX\n\n";

    campos.forEach(id => {

        const el = document.getElementById(id);

        if (!el) return;

        let conteudo = "";

        if ("value" in el) {

            conteudo = (el.value || "").trim();

        } else {

            conteudo = (el.textContent || "").trim();

        }

        if (!conteudo) return;

        texto += `=== ${id} ===\n${conteudo}\n\n`;

    });

    const blob = new Blob(
        [texto],
        {
            type: "text/plain;charset=utf-8"
        }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;
    a.download = "resumo_ia_tubex.txt";

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);

}

// ======================================================
// OBSERVA ABA IA
// ======================================================

const observerIA = new MutationObserver(() => {

    const abaAtiva =
        document.querySelector(
            '.tab-btn.active[data-tab="ia"]'
        );

    const conteudoIA =
        document.getElementById("tab-ia");

    if (
        abaAtiva &&
        conteudoIA &&
        conteudoIA.style.display !== "none"
    ) {

        criarBotoesExportacaoIA();

    }

});

observerIA.observe(document.body, {

    childList: true,

    subtree: true

});

observerIA.observe(document.body, { childList: true, subtree: true });

// ======================================================
// IA
// ======================================================

async function gerarCampoIA(tipo, elementId, options = {}) {

    try {

        // =====================================
        // INPUT
        // =====================================

        const keyword =
            document
                .getElementById("iaKeywordInput")
                ?.value
                ?.trim();

        if (!keyword) {

            alert("Digite um tema primeiro.");

            return;

        }

        // =====================================
        // ELEMENTO
        // =====================================

        const el =
            document.getElementById(elementId);

        if (!el) {

            console.error(
                `❌ Elemento #${elementId} não encontrado.`
            );

            return;

        }

        // =====================================
        // LOADING
        // =====================================

        if ("value" in el) {

            el.value = "⏳ Gerando...";

        } else {

            el.textContent = "⏳ Gerando...";

        }



        console.log("📤 IA REQUEST", {
            tipo,
            elementId,
            keyword
        });

        // =====================================
        // CHAMADA BACKGROUND
        // =====================================

        const response = await new Promise((resolve) => {

            chrome.runtime.sendMessage(
                {
                    action: "gerarTextoIAPainel",
                    tipo,
                    prompt: keyword
                },
                (res) => {

                    if (chrome.runtime.lastError) {

                        console.error(
                            "💥 Runtime:",
                            chrome.runtime.lastError.message
                        );

                        resolve({
                            success: false,
                            error: chrome.runtime.lastError.message
                        });

                        return;

                    }

                    resolve(res);

                }
            );

        });

        console.log("📥 IA RESPONSE", response);

        // =====================================
        // VALIDAÇÃO
        // =====================================

        if (
            !response ||
            !response.success ||
            !response.text
        ) {

            console.error(
                "❌ IA ERRO:",
                response
            );

            const erro = "⚠ Erro ao gerar";

            if ("value" in el) {

                el.value = erro;

            } else {

                el.textContent = erro;

            }

            return;

        }
// =====================================
// SUCESSO
// =====================================

if ("value" in el) {

    el.value = response.text;

} else {

    el.textContent = response.text;

}

// =====================================
// Atualiza SEO do título
// =====================================

if (elementId === "workspaceTitulo") {

    try {

        atualizarTituloSEO();

    } catch (e) {

        console.error("Erro atualizarTituloSEO:", e);

    }

}

    } catch (e) {

        console.error(
            "💥 gerarCampoIA:",
            e
        );

        const el =
            document.getElementById(elementId);

        if (!el) return;

        if ("value" in el) {

            el.value = "⚠ Erro inesperado";

        } else {

            el.textContent = "⚠ Erro inesperado";

        }

    }

}



// ======================================================
// IA
// ======================================================

function gerarTituloImpactante() {

    gerarCampoIA(
        "tituloImpactante_panel",
        "tituloImpactante",
        {
            isInput:true
        }
    );

}
function gerarTituloSEO() {

    gerarCampoIA(
        "tituloSEO_panel",
        "tituloSEO"
    );

}
function gerarTituloEmocional() {

    gerarCampoIA(
        "tituloEmocional_panel",
        "tituloEmocional"
    );

}

function gerarDescricao(){

    gerarCampoIA(
        "descricao",
        "descricaoGerada"
    );

}

function gerarRoteiro(){

    gerarCampoIA(
        "script_generator",
        "roteiroBasico"
    );

}

function gerarAnaliseTitulo() {

    gerarCampoIA(
        "analise",
        "analiseTitulo"
    );

}



window.gerarDescricao = gerarDescricao;
window.gerarRoteiro = gerarRoteiro;
window.gerarAnaliseTitulo = gerarAnaliseTitulo;

function updateBars(volume, competition, retry = 0) {

  const volumeFill = document.getElementById('tubex-volume');
  const competitionFill = document.getElementById('tubex-competition');

  // 🔥 SE NÃO EXISTE → RETRY (ESSENCIAL PRA YOUTUBE SPA)
  if (!volumeFill || !competitionFill) {

    if (retry < 10) {
      console.warn(`⏳ UI não pronta... tentativa ${retry}`);
      setTimeout(() => {
        updateBars(volume, competition, retry + 1);
      }, 300);
    } else {
      console.error("❌ UI nunca apareceu (falha real)");
    }

    return;
  }

  // 🔒 NORMALIZA
  volume = clamp(volume, 0, 100);
  competition = clamp(competition, 0, 100);

  const volumeRounded = Math.round(volume);
  const competitionRounded = Math.round(competition);

  const volumeColor = getGradientColor(volumeRounded);
  const competitionColor = getGradientColor(competitionRounded);

  // 🔥 ATUALIZA BARRAS
  volumeFill.style.width = `${volumeRounded}%`;
  volumeFill.style.backgroundColor = volumeColor;

  competitionFill.style.width = `${competitionRounded}%`;
  competitionFill.style.backgroundColor = competitionColor;

  // 🔥 LABEL (PEGANDO DO CONTAINER CERTO)
  const volLabel = volumeFill.parentElement?.querySelector('.bar-label');
  const compLabel = competitionFill.parentElement?.querySelector('.bar-label');

  if (volLabel) volLabel.textContent = `${volumeRounded}%`;
  if (compLabel) compLabel.textContent = `${competitionRounded}%`;

  console.log("✅ UI OK:", volumeRounded, competitionRounded);
}


// --- GERA COR GRADIENTE VERMELHO-VERDE ---
function getGradientColor(percent) {
  // percent 0 (vermelho) a 100 (verde)
  const r = percent < 50 ? 255 : Math.floor(255 - ((percent - 50) * 2 * 255) / 100);
  const g = percent > 50 ? 255 : Math.floor((percent * 2 * 255) / 100);
  return `rgb(${r},${g},0)`;
}




 // --- POPULA TÍTULOS RELEVANTES ---
function populateRelevantTitles(titles) {

  let list = document.getElementById("relevantTitles");

  if (!list) {

    const panel =
      document.querySelector("#tab-seo") || document.body;

    list = document.createElement("ul");

    list.id = "relevantTitles";

    panel.appendChild(list);

    console.log("⚠️ created relevantTitles dynamically");

  }

  const isDark =
    document.documentElement.hasAttribute("dark");

  const textColor =
    isDark
      ? "#9CA3AF"
      : "#374151";

  list.innerHTML = "";

  titles.forEach(title => {

    const li =
      document.createElement("li");

    li.textContent = title;

    li.style.color = textColor;

    li.style.marginBottom = "6px";

    li.style.lineHeight = "1.6";

    list.appendChild(li);

  });

  console.log("✅ TITLES RENDERIZADO");

}


  // --- CÓPIA TÍTULO E TAGS ---
  function copyTitleAndTags() {
    if (!state.data) return;
    const title = state.data.keyword || '';
    const tags = state.data.suggestedTags ? state.data.suggestedTags.join(', ') : '';
    const textToCopy = `${title}\n\nTags: ${tags}`;
    navigator.clipboard.writeText(textToCopy).then(() => {
      alert('Título e tags copiados para a área de transferência!');
    });
  }

function initTabs(){

  const tabs = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {

    tab.onclick = () => {

      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      const selected = tab.dataset.tab;

      tabContents.forEach(tc => {
        tc.style.display =
          tc.id === `tab-${selected}` ? 'block' : 'none';
      });

    };

  });

}

// ======================================================
// 🎥 VIDEO STATS (GLOBAL)
// ======================================================
window.populateVideoStats = function(video) {

  const container = document.getElementById('videoStats');
  if (!container) return;

  if (!video || !video.title) {
    container.innerHTML = '<i>Sem dados do vídeo</i>';
    return;
  }

  container.innerHTML = `
    <img src="${video.thumbnailUrl || ''}" style="width:100%; border-radius:6px;">
    <div><strong>${video.title}</strong></div>
    <div>Views: ${(video.viewCount || 0).toLocaleString()}</div>
    <div>Likes: ${(video.likeCount || 0).toLocaleString()}</div>
    <div>Comentários: ${(video.commentCount || 0).toLocaleString()}</div>
    <div>Canal: ${video.channelTitle || ''}</div>
  `;
};

function tubexRenderVideoAndTrend(videos){

  if(!videos || !videos.length){
    console.warn("❌ sem vídeos");
    return;
  }

  // =========================
  // 🎥 TOP VIDEO
  // =========================
  const validVideos = videos.filter(v =>
    v?.statistics?.viewCount && v?.snippet
  );

  if(!validVideos.length){
    console.warn("❌ vídeos inválidos");
    return;
  }

  const top = validVideos.sort((a,b)=>
    Number(b.statistics.viewCount) - Number(a.statistics.viewCount)
  )[0];

  populateVideoStats({
    thumbnailUrl: top.snippet?.thumbnails?.medium?.url || "",
    title: top.snippet?.title || "Sem título",
    viewCount: Number(top.statistics?.viewCount || 0),
    likeCount: Number(top.statistics?.likeCount || 0),
    commentCount: Number(top.statistics?.commentCount || 0),
    channelTitle: top.snippet?.channelTitle || ""
  });

  // =========================
  // 📈 TREND
  // =========================
  const trend = generateTrendFromData(validVideos);

  if(trend.length){
renderTrendChart(videos);
  }else{
    console.warn("❌ trend vazio");
  }

}


function generateTrendFromData(items) {

  if (!Array.isArray(items) || items.length === 0) {
    console.warn("⚠️ sem dados para trend");
    return Array(12).fill(0);
  }

  const monthlyTrend = Array(12).fill(0);
  const today = new Date();

  items.forEach(item => {

    const views = Number(item?.statistics?.viewCount || 0);
    const published = item?.snippet?.publishedAt;

    if (!published) return;

    const publishedAt = new Date(published);

    const monthsAgo =
      (today.getFullYear() - publishedAt.getFullYear()) * 12 +
      (today.getMonth() - publishedAt.getMonth());

    if (monthsAgo >= 0 && monthsAgo < 12) {
monthlyTrend[11 - monthsAgo] += Math.log10(views + 1);
    }

  });

  const max = Math.max(...monthlyTrend);

  if (max === 0) return Array(12).fill(0);

return monthlyTrend.map(v =>
  max ? Math.round((v / max) * 100) : 0
);
}




function bloquearAbaAtualComOverlay() {
  // Descobre a aba ativa
  const activeTabBtn = document.querySelector('.tab-btn.active');
  if (!activeTabBtn) return;
  const activeTabName = activeTabBtn.dataset.tab;
  const activeTab = document.getElementById('tab-' + activeTabName);
  if (!activeTab) return;

  // Desabilita todos os elementos internos
  activeTab.querySelectorAll('input, button, textarea, select').forEach(el => {
    el.disabled = true;
    el.style.opacity = 0.5;
    el.style.pointerEvents = 'none';
  });

  // Remove overlay antigo se já houver
  const oldOverlay = activeTab.querySelector('.tubex-blocked-overlay');
  if (oldOverlay) oldOverlay.remove();

  // Cria overlay visual para indicar o bloqueio
  const overlay = document.createElement('div');
  overlay.className = 'tubex-blocked-overlay';
  overlay.style = `
    position:absolute;top:0;left:0;width:100%;height:100%;
    background:rgba(18,18,18,0.93);z-index:9999;
    display:flex;align-items:center;justify-content:center;
    color:#f0c14b;font-size:1.15em;font-weight:bold;pointer-events:auto;
    border-radius:8px;
  `;
  overlay.innerHTML = '🔒 Esta funcionalidade está disponível apenas para planos superiores.';
  activeTab.style.position = 'relative';
  activeTab.appendChild(overlay);
}



function desbloquearAbaAtual() {
  const activeTabBtn = document.querySelector('.tab-btn.active');
  if (!activeTabBtn) return;
  const activeTabName = activeTabBtn.dataset.tab;
  const activeTab = document.getElementById('tab-' + activeTabName);
  if (!activeTab) return;

  activeTab.querySelectorAll('input, button, textarea, select').forEach(el => {
    el.disabled = false;
    el.style.opacity = '';
    el.style.pointerEvents = '';
  });
  const oldOverlay = activeTab.querySelector('.tubex-blocked-overlay');
  if (oldOverlay) oldOverlay.remove();
}



  // --- FUNÇÃO AUXILIAR PARA COR GRADIENTE VERMELHO->VERDE ---
  function getGradientColor(percent) {
    // percent = 0 (vermelho) até 100 (verde)
    const r = percent < 50 ? 255 : Math.floor(255 - ((percent - 50) * 2 * 255) / 100);
    const g = percent > 50 ? 255 : Math.floor((percent * 2 * 255) / 100);
    return `rgb(${r},${g},0)`;
  }

  // --- FUNÇÕES DE STATUS E INICIALIZAÇÃO ---


  function showError(msg) {
    const error = document.getElementById('errorMessage');
    if (error) {
      error.style.display = msg ? 'block' : 'none';
      error.textContent = msg;
    }
  }

let lastKeyword = ''; // guarda última palavra buscada para evitar repetição

function onLocationChange() {
  const url = location.href;
  const path = location.pathname;
  const isStudio = location.hostname === 'studio.youtube.com';
  const isVideoEditPage = url.includes('/video/') && url.includes('/edit');
  const isSearchPage = path === '/results' && url.includes('search_query');
  const isWatchPage = path.startsWith('/watch');

  // 🔁 Limpar painéis fora do contexto correto
  const tubexPanel = document.getElementById('tubex-panel');
  if (tubexPanel && !isSearchPage) tubexPanel.remove();

  const seoPanel = document.getElementById('tubex-seo-score-panel');
  if (seoPanel && !(isStudio && isVideoEditPage)) seoPanel.remove();

  // ✅ Carregar painéis corretos
  if (isStudio && isVideoEditPage) {
  //  initSeoScorePanel();
  } else if (isSearchPage) {
    initTubeXPanel();
  } else if (isWatchPage) {
    garantirValidacaoPainel();
  }
}

function painelPrecisaValidar() {
  const cache = JSON.parse(localStorage.getItem('tubex_validacao_cache') || '{}');
  return !cache.planoEfetivo || cache.expira < Date.now();
}

function init() {

    console.log("🚦 TubeX init()");

    try{

        // =====================================
        // EXTENSÃO PRONTA?
        // =====================================

        if(!tubexExtensionAlive()){
            return;
        }

        // =====================================
        // REMOVE PAINEL ANTIGO
        // =====================================

        const oldPanel =
            document.getElementById("tubex-panel");

        if(oldPanel){
            oldPanel.remove();
        }

        // =====================================
        // VALIDA PLANO
        // =====================================

        console.log("🔐 Validando acesso...");

        if(painelPrecisaValidar()){

            checkUserAccess();

        }else{

            const cache = JSON.parse(

                localStorage.getItem(
                    "tubex_validacao_cache"
                ) || "{}"

            );

            liberarPainelComPlano(
                cache.planoEfetivo
            );

        }

        // =====================================
        // ATUALIZA URL
        // =====================================

        onLocationChange();

        // =====================================
        // BUSCA
        // =====================================

        const params =
            new URLSearchParams(
                location.search
            );

        const keyword =
            (
                params.get("search_query") || ""
            ).trim();

        const isSearchPage =

            location.pathname === "/results"

            &&

            keyword.length > 0;

        console.log({

            path:location.pathname,

            keyword,

            isSearchPage

        });

        if(!isSearchPage){
            return;
        }

        // =====================================
        // INPUT
        // =====================================

        const searchInput =

            document.querySelector(
                "input#search"
            )

            ||

            document.querySelector(
                "input#search-input"
            );

        let currentKeyword = keyword;

        if(
            searchInput &&
            searchInput.value.trim()
        ){

            currentKeyword =
                searchInput.value.trim();

        }

        if(!currentKeyword){

            showError(
                "Termo de busca não encontrado."
            );

            return;

        }

        // =====================================
        // SEO
        // =====================================

        if(currentKeyword !== lastKeyword){

            lastKeyword =
                currentKeyword;

            updateSeoTab(
                currentKeyword
            );

        }

        // =====================================
        // LISTENER
        // =====================================

        if(searchInput){

            setupKeywordListener(
                searchInput
            );

        }

        console.log("✅ init finalizado");

    }catch(err){

        console.error(
            "❌ Erro no init:",
            err
        );

    }

}



// =====================================================
// TubeX — Controle Central de Planos
// =====================================================

// 🔁 RESET GLOBAL (importantíssimo)
function resetAllFeatures() {
  disableTab('scripts');
  disableTab('seo');
  disableTab('vlogs');
  disableTab('shorts');
  disableTab('ia');
  disableTab('tendencias');

  bloquearBotaoHashtags('btn-buscar-tags-api');

  disableSummaryPanel?.();
  bloquearPainel?.('tubex-seo-score-panel');
  bloquearPainel?.('seo-score-panel');
  bloquearPainel?.('tubex-summary-panel');
}

// =====================================================
// FREE
// =====================================================
function initBasicFeatures() {
  console.log("✅ [FREE] Recursos básicos ativos");

  enableTab('scripts');
  enableTab('seo', 10);

  bloquearBotaoHashtags('btn-buscar-tags-api');

  enablePanel('tubex-seo-score-panel');
  removerBloqueioPainel('tubex-seo-score-panel');

  enableSummaryPanel();
  disableTab('tendencias');
}

// =====================================================
// START
// =====================================================
function initStartFeatures() {
  console.log("🔓 [START] Recursos do plano Start ativos");

  initBasicFeatures(); // herda FREE

  enableTab('seo', 25);
  disableSummaryPanel?.();

  enablePanel('seo-score-panel');
  enablePanel('tubex-seo-score-panel');

  bloquearBotaoHashtags('btn-buscar-tags-api');
  disableTab('tendencias');
}

// =====================================================
// MEMBER
// =====================================================
function initMemberFeatures() {
  console.log("🔓 [MEMBER] Recursos de membro ativos");

  initStartFeatures(); // herda START

  enableTab('vlogs');
  enableTab('shorts');
  enableTab('seo', 30);

  liberarBotaoHashtags();

  enablePanel('seo-score-panel');
  enablePanel('tubex-summary-panel');
  enableSummaryPanel();

  disableTab('tendencias');
}

// =====================================================
// PRO
// =====================================================
function initAdvancedFeatures() {
  console.log("🔓 [PRO] Recursos do plano Pro ativos");

  initMemberFeatures(); // herda MEMBER

  enableTab('seo', 50);
  enableTab('tendencias');

  liberarBotaoHashtags();
  enableSummaryPanel();
}

// =====================================================
// EXPERT
// =====================================================
function initCompleteFeatures() {
  console.log("🔓 [EXPERT] Recursos do plano Expert ativos");

  initAdvancedFeatures(); // herda PRO

  enableTab('ia');
  enableTab('tendencias');

  enableAIinSEO?.();
  liberarBotaoHashtags();
  enableSummaryPanel();
}

// =====================================================
// DISPATCHER (ESSENCIAL)
// =====================================================
function applyPlanFeatures(plan) {
  console.log('🧠 Aplicando plano:', plan);

  resetAllFeatures();

  switch (plan) {
    case 'expert':
      initCompleteFeatures();
      break;

    case 'pro':
      initAdvancedFeatures();
      break;

    case 'member':
      initMemberFeatures();
      break;

    case 'start':
      initStartFeatures();
      break;

    case 'free':
    default:
      initBasicFeatures();
      break;
  }
}


function enableTab(tabId, queryLimit = 0) {
  const tab = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (tab) {
    // Corrige o texto da aba dinamicamente
    const nomesAbas = {
      seo: '🔍 SEO',
      tendencias: '📈 Tendências',
      shorts: '🎥 Shorts',
      vlogs: '🎬 Vlogs',
      scripts: '📖 Roteiros',
      ia: 'Creator Workspace'
    };
    tab.innerHTML = nomesAbas[tabId] || '📁 Aba';
    tab.classList.remove('locked-tab');
    tab.style.pointerEvents = 'auto';
    tab.style.opacity = '1';
    tab.style.display = 'block';
    unlockElement(tab);
  }

  if (queryLimit > 0) {
    dailyQueryLimit = queryLimit;
    console.log(`🔧 Limite diário de consultas SEO: ${dailyQueryLimit}`);
  }
}

function disableTab(tabId, motivo = '') {
  const tab = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
  if (tab) {
    tab.classList.add('locked-tab');
    tab.style.pointerEvents = 'none';
    tab.style.opacity = 0.5;
    tab.style.display = 'block';
    // Deixa o nome e só coloca o cadeado no final
    tab.innerHTML = `${tab.innerText.split(' ')[0]} 🔒`;
    if (motivo) tab.title = motivo;
    else tab.title = 'Requer plano PRO ou EXPERT';
  }
}


function removerBloqueioPainel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const overlay = panel.querySelector('.painel-bloqueado');
  if (overlay) overlay.remove();

  // Reaplica overflow-y após remover overlay
  panel.style.overflowY = "auto";
}


function bloquearBotaoHashtags() {
  const btn = document.getElementById('btn-buscar-tags-api');
  if (btn) {
    btn.disabled = true;
    btn.style.pointerEvents = 'none';
    btn.style.opacity = '0.6';
    btn.innerHTML = '🔒 Gerar Hashtags <span style="font-size:12px;color:#f44;">(apenas para planos Membro ou +)</span>';
  }
}

function liberarBotaoHashtags() {
  const btn = document.getElementById('btn-buscar-tags-api');
  if (btn) {
    btn.disabled = false;
    btn.style.pointerEvents = 'auto';
    btn.style.opacity = '1';
    btn.innerHTML = 'Gerar Hashtags';
  }
}



function lockElement(el) {
  if (!el) return;
  el.style.pointerEvents = 'none';
  el.style.opacity = '0.5';

  if (!el.querySelector('.lock-icon')) {
    const lock = document.createElement('span');
    lock.textContent = ' 🔒';
    lock.className = 'lock-icon';
    lock.style.color = 'red';
    lock.style.fontWeight = 'bold';
    el.appendChild(lock);
  }
}

function unlockElement(el) {
  if (!el) return;
  el.style.pointerEvents = 'auto';
  el.style.opacity = '1';

  const lock = el.querySelector('.lock-icon');
  if (lock) lock.remove();
}

function enableAIinSEO() {
  console.log("🤖 [IA] IA liberada na aba SEO");
  window.aiEnabled = true;
}

function trackSEOQuery() {
  if (dailyQueryCount >= dailyQueryLimit) {
    alert('⚠️ Limite diário de consultas SEO atingido. Volte amanhã!');
    return false;
  }
  dailyQueryCount++;
  console.log(`🔍 Consulta SEO realizada. Total hoje: ${dailyQueryCount}/${dailyQueryLimit}`);
  return true;
}

function disableAllFeatures() {
  const tabs = ['scripts', 'seo', 'tendencias', 'vlogs', 'shorts', 'ia'];
  const panels = [
    'panel-seo', // ou o ID do container do painel SEO
    'panel-tendencias', // se tiver esse painel
    'tubex-seo-score-panel'
  ];

  tabs.forEach(id => {
    const tab = document.querySelector(`.tab-btn[data-tab="${id}"]`);
    if (tab) {
      tab.style.display = 'block';
      lockElement(tab);
    }
  });

  panels.forEach(id => {
    bloquearConteudoPainel(id, "Verificando Informações Inteligentes!");
  });

  // Resetando controles
  window.aiEnabled = false;
  dailyQueryLimit = 0;
  dailyQueryCount = 0;

  console.log("🔒 Todos os recursos foram desativados");
}

function desbloquearConteudoPainel(panelId) {
  let panel = document.getElementById(panelId);
  if (!panel) return;
  const overlay = panel.querySelector('.painel-bloqueado');
  if (overlay) overlay.remove();

  // Restaura rolagem, se for o caso
  panel.style.overflow = '';
}


function bloquearConteudoPainel(panelId, msg = "Verificando Informações Inteligentes, aguarde a validação.") {
  let panel = document.getElementById(panelId);
  if (!panel) return;
  if (panel.querySelector('.painel-bloqueado')) return;

  // Trava a rolagem do painel
  panel.style.overflow = 'hidden';

  // Overlay cobrindo tudo (absoluto dentro do painel)
  const overlay = document.createElement("div");
  overlay.className = "painel-bloqueado";
  overlay.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;">
      <span style="font-size:22px;margin-bottom:18px;display:block;">
        🔒 ${msg}
      </span>
      <a href="https://www.youtube.com/@gabrielbzago" target="_blank"
         style="margin-top:10px;padding:15px 28px;background:#FFC600;color:#121212;border-radius:8px;
         text-decoration:none;font-weight:bold;font-size:18px;box-shadow:0 2px 10px #0004;">
      </a>
    </div>
  `;
  overlay.style.cssText = `
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    width: 100%;
    height: 100%;
    background: #111;
    opacity: 1;
    z-index: 99999;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #FFC600;
    font-size: 18px;
    font-weight: bold;
    flex-direction: column;
    border-radius: 10px;
    text-align: center;
    pointer-events: all;
    box-shadow: 0 0 40px #0008 inset;
  `;
  // Garante position:relative no painel, mas só se ainda não estiver (evita bug)
  if (getComputedStyle(panel).position === "static") {
    panel.style.position = "relative";
  }

  panel.appendChild(overlay);
}



function showSubscribeBanner() {
  if (document.getElementById('subscribe-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'subscribe-banner';
  banner.innerHTML = '👋 Atualize a pagina para Recalibrar o Sistema.<br><small>Clique para fechar</small>';
  banner.onclick = () => {
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 300);
  };
  document.body.appendChild(banner);
}



// === Botões de upgrade ===
function createSubscriptionBanner() {
  const container = document.createElement('div');
  container.style.padding = '16px';
  container.style.background = '#111';
  container.style.borderRadius = '12px';
  container.style.marginTop = '16px';
  container.style.color = '#fff';
  container.style.boxShadow = '0 0 10px rgba(0,0,0,0.3)';

container.innerHTML = `
  <h3 style="margin: 0 0 8px">🔓 Liberar recursos avançados</h3>
  <p style="font-size: 14px">Escolha um plano para desbloquear mais ferramentas:</p>

  <div style="margin: 10px 0">

    <a href="https://seusite.com/checkout?plano=member" target="_blank"
      style="display:inline-block;background:#1e90ff;color:#fff;
      padding:8px 16px;border-radius:6px;text-decoration:none;margin:4px">
      🔹 Membro – R$14,99
    </a>

    <a href="https://seusite.com/checkout?plano=pro" target="_blank"
      style="display:inline-block;background:#28a745;color:#fff;
      padding:8px 16px;border-radius:6px;text-decoration:none;margin:4px">
      🔸 Pró – R$29,90 ⭐ Mais Popular
    </a>

    <a href="https://seusite.com/checkout?plano=expert" target="_blank"
      style="display:inline-block;background:#ffc107;color:#000;
      padding:8px 16px;border-radius:6px;text-decoration:none;margin:4px">
      🌟 Expert – R$59,90
    </a>

  </div>

  <p style="font-size: 12px; margin-top: 8px">
    💡 Plano Fundador – valores promocionais por tempo limitado.
  </p>
`;

  const target = document.body || document.querySelector('#tubex-panel') || document.querySelector('#tabs') || document.querySelector('main');
  if (target) {
    target.appendChild(container);
  }
}




function removerOverlayBloqueio() {
  let overlay = document.getElementById('tubex-loading-overlay');
  if (overlay) overlay.remove();
}



function checkUserAccess() {

if(!tubexExtensionAlive()){
    console.warn("TubeX: extensão reiniciada");
    return;
  }

  try {
    chrome.runtime.sendMessage({ action: 'checkSubscription' }, (response) => {
      console.log('[TubeX] Dados recebidos do background.js:', response);

      if (!response || !response.success) {
        console.warn("❌ [TubeX] Erro na resposta. Bloqueando recursos.");
       // createInscriptionBanner();
        disableAllFeatures();
 removeTubeXPanel();
  //  showSubscribeBanner(); // ou createInscriptionBanner(), depende do nome da sua função!
        return;
      }

      const {
        subscribed = false,
        isMember = false,
        hasPaidModule,
        plano,
        afiliado = ''
      } = response;

      // Atualiza localStorage
      if (plano) localStorage.setItem('tubex_plano', plano);
      if (afiliado) localStorage.setItem('tubex_afiliado', afiliado);

      // Lista de planos válidos
      const planosValidos = ['free', 'start', 'pro', 'advanced', 'expert', 'complete', 'member', 'owner'];

      // Determina plano efetivo com prioridade para hasPaidModule
      let planoEfetivo = String(plano || '').toLowerCase().trim();


// 🔐 OWNER: acesso total, ignora qualquer fallback
if (planoEfetivo === 'owner') {
  console.log("👑 Owner detectado — acesso total liberado");

  removeSubscriptionBanner();
  enableAllFeatures();
  initCompleteFeatures(); // ou initOwnerFeatures se existir
  removerOverlayBloqueio();

  return; // ⛔ MUITO IMPORTANTE
}


      console.log(`📦 Plano efetivo recebido: ${planoEfetivo}`);

      // Se planoEfetivo não for válido, for vazio ou vier null, trata como sem acesso


    if (!planosValidos.includes(planoEfetivo)) {
  console.warn("🚫 Plano inválido, ausente ou não reconhecido. Checando alternativas...");

  if (isMember) {
    planoEfetivo = 'member';
  } else if (subscribed) {
    planoEfetivo = 'free';
  } else {
    planoEfetivo = 'blocked'; // <- Aqui mudamos para bloquear total!
  }
}


      console.log(`✅ Plano final aplicado: ${planoEfetivo}`);

      // Remove banners e reseta
      removeSubscriptionBanner();
      disableAllFeatures();

switch (planoEfetivo) {
  case 'expert':
  case 'complete':
    console.log("🔓 Expert liberado");
    initCompleteFeatures();
    removerOverlayBloqueio();
    break;

  case 'pro':
  case 'advanced':
    console.log("🔓 Pro liberado");
    initAdvancedFeatures();
    removerOverlayBloqueio();
    break;

  case 'start':
    console.log("🔓 Start liberado");
    initStartFeatures();
    removerOverlayBloqueio();
    break;

  case 'member':
    console.log("🔓 Membro do canal liberado");
    initMemberFeatures();
    removerOverlayBloqueio();
    break;

  case 'free':
    console.log("🔓 [TubeX] Plano Free: Ativando recursos gratuitos.");
    initBasicFeatures();
    removerOverlayBloqueio();
    break;

  case 'blocked': // <- adicione esta linha!
  default:
    console.warn("❌ Sem acesso a recursos. Exibindo banner e removendo painel.");
    disableAllFeatures();
   // createInscriptionBanner();
    break;
}

removerOverlayBloqueio();
    });
  } catch (err) {
    console.error("🔥 Erro inesperado na verificação de acesso:", err);
   // createInscriptionBanner();
    disableAllFeatures();
  }
}


  // Função debounce para limitar chamadas consecutivas
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  // Configura listener no campo input para atualizar aba SEO ao digitar
  function setupKeywordListener(inputElement) {
    const debouncedFetch = debounce(() => {
      const keyword = inputElement.value.trim();
      if (keyword && keyword !== lastKeyword) {
        lastKeyword = keyword;
        updateSeoTab(keyword);
      }
    }, 1000);

    inputElement.addEventListener('input', debouncedFetch);
  }

  // Atualiza aba SEO chamando API e atualizando painel
  function updateSeoTab(keyword) {

  showLoading();

  showError('');
  chrome.storage.local.get(['userPlan'], ({ userPlan }) => {
    const plano = (userPlan || '').toLowerCase();
    canUseSeoPanel(plano, (canUse) => {
      if (!canUse) {
        showLoading(false);
        showError('Limite diário da aba SEO atingido! Faça upgrade para ilimitado.');
        const seoContent = document.getElementById('tab-seo');
        if (seoContent) {
          seoContent.innerHTML = `
            <div style="color: #fff; background: #2a2a2a; padding: 18px; border-radius: 8px;">
              <b>Limite diário da aba SEO atingido!</b><br>
              A aba está disponível <b>sem limites</b> nos planos <span style="color: #f0c14b;">PRO</span> e <span style="color: #f0c14b;">EXPERT</span>.<br>
              <a href="https://tubex.app.br/#planos" target="_blank" style="color: #f0c14b;">Faça upgrade</a>
            </div>
          `;
        }
        return;
      }
      // Só executa busca se estiver permitido

      sendToBackground({
  action: "fetchSeoData",
  keyword
})
.then(res => {

  showLoading(false);

  if(!res || !res.success){
    showError("Erro ao buscar dados");
    return;
  }

  initTubeXPanel(res.items || []);

})
.catch(err => {

  showLoading(false);
  showError('Erro ao buscar dados: ' + err.message);

});
    });
  });
}


  // Observa mudanças de URL internas do YouTube para disparar init()
  function observeUrlChange(callback) {
    let lastUrl = location.href;
    new MutationObserver(() => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        callback(currentUrl);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  // Inicializa script e configura observador de URL
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
  //document.getElementById('btnHashtags')?.addEventListener('click', window.gerarHashtags);
 // document.getElementById('btnTagsAvancadas')?.addEventListener('click', window.gerarTagsAvancadas);

      init();
      observeUrlChange(() => {
        init();
      });
    });
  } else {
    init();
    observeUrlChange(() => {
      init();
    });
  }


function getShadowRoot(selector, root = document) {
  const el = root.querySelector(selector);
  if (el && el.shadowRoot) {
    return el.shadowRoot;
  }
  return null;
}

function getEditorFields() {
  const fields = Array.from(
    document.querySelectorAll('div[contenteditable="true"][role="textbox"]')
  );

  return {
    titleDiv: fields[0] || null,
    descDiv: fields[1] || null,
    title: fields[0]?.innerText?.trim() || '',
    description: fields[1]?.innerText?.trim() || ''
  };
}

function initSeoScorePanel() {

  if (document.getElementById("tubex-seo-score-panel")) return;

  const oldPanel =
    document.getElementById(
      "tubex-seo-score-panel"
    );

  if (oldPanel) {
    oldPanel.remove();
  }

  if (
    !(
      location.href.includes("/video/") &&
      location.href.includes("/edit")
    )
  ) {
    return;
  }

  if (
    document.querySelector(
      "#tubex-seo-score-panel"
    )
  ) {
    return;
  }

  // ======================================
  // TEMA
  // ======================================

  const isDark =
    document.documentElement.hasAttribute("dark");

  const panelBg = isDark
    ? "rgba(28,32,39,.74)"
    : "rgba(252,253,255,.88)";

  const borderColor = isDark
    ? "rgba(255,255,255,.08)"
    : "rgba(0,0,0,.08)";

  const textPrimary = isDark
    ? "#F3F4F6"
    : "#111827";

  const textSecondary = isDark
    ? "#4B5563"
    : "#6B7280";

  const cardBg = isDark
    ? "rgba(255,255,255,.04)"
    : "rgba(255,255,255,.72)";

  const cardBorder = isDark
    ? "rgba(255,255,255,.06)"
    : "rgba(0,0,0,.08)";

  const buttonBg = isDark
    ? "rgba(255,255,255,.05)"
    : "rgba(255,255,255,.72)";

  const buttonBorder = isDark
    ? "rgba(255,255,255,.08)"
    : "rgba(0,0,0,.08)";

  const buttonText = isDark
    ? "#FFFFFF"
    : "#111827";

  const styleBase = `
    background:${cardBg};

    backdrop-filter:blur(18px) saturate(170%);
    -webkit-backdrop-filter:blur(18px) saturate(170%);

    border:1px solid ${cardBorder};

    border-radius:14px;

    padding:16px;

    margin-bottom:14px;

    color:${textPrimary};

    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.04);
  `;

  const panel =
    document.createElement("div");

  panel.id =
    "tubex-seo-score-panel";

  panel.classList.remove("minimized");

  panel.style.cssText = `
    position:fixed;

    top:100px;
    right:20px;

    width:340px;
    max-height:80vh;

    overflow-y:auto;

    padding:18px;

    background:${panelBg};

    backdrop-filter:blur(18px) saturate(170%);
    -webkit-backdrop-filter:blur(18px) saturate(170%);

    border:1px solid ${borderColor};

    border-radius:16px;

    color:${textPrimary};

    font-family:Inter,Arial,sans-serif;

    box-shadow:
      0 12px 32px rgba(0,0,0,.18),
      inset 0 1px 0 rgba(255,255,255,.04);

    z-index:9999999;

    transition:
      background .18s ease,
      border-color .18s ease,
      color .18s ease,
      box-shadow .18s ease;
  `;

   // Conteúdo do painel
panel.innerHTML = `

<div id="seo-panel-content" style="
  display:flex;
  flex-direction:column;
  gap:12px;
">

  <!-- 🔝 HEADER -->

<div style="
background:${cardBg};

backdrop-filter:blur(18px) saturate(170%);
-webkit-backdrop-filter:blur(18px) saturate(170%);

border:1px solid ${cardBorder};

border-radius:14px;

padding:16px;

text-align:center;

box-shadow:
inset 0 1px 0 rgba(255,255,255,.04);
">

<img
src="${chrome.runtime.getURL("logo.png")}"
style="
width:135px;
margin-bottom:8px;
user-select:none;
"/>

<div style="
font-size:12px;
color:${textSecondary};
line-height:1.5;
">
Inteligência para crescer no YouTube
</div>

</div>

<!-- SEO SCORE -->

<div style="
${styleBase}
">

<div style="
display:flex;
justify-content:space-between;
align-items:center;

margin-bottom:12px;
">

<div style="
font-size:13px;
font-weight:700;
color:#FACC15;
">

SEO Score

</div>

<div
id="seo-text"
style="
font-size:14px;
font-weight:700;
color:${textPrimary};
">

Calculando...

</div>

</div>

<div style="
width:100%;
height:22px;

background:${isDark
  ? "rgba(0,0,0,.22)"
  : "rgba(0,0,0,.05)"};

border-radius:999px;

overflow:hidden;

border:1px solid ${cardBorder};
">

<div
id="seo-bar"
style="
width:0%;
height:100%;

background:linear-gradient(
90deg,
#FFD84A,
#FACC15
);

transition:width .4s ease;
">
</div>

</div>

</div>

<!-- CHECKLIST -->

<div style="${styleBase}">

<div style="
font-size:13px;
font-weight:700;

color:#FACC15;

margin-bottom:12px;
">

✔ Checklist SEO

</div>

<ul
id="seo-checklist"
style="
margin:0;

padding-left:18px;

font-size:12px;

line-height:1.7;

color:${textSecondary};
">
</ul>

</div>

<!-- SUGESTÕES -->

<div style="${styleBase}">

<div style="
font-size:13px;
font-weight:700;

color:${textPrimary};

margin-bottom:12px;
">

💡 Sugestões

</div>

<ul
id="seo-suggestions"
style="
margin:0;

padding-left:18px;

font-size:12px;

line-height:1.7;

color:${textSecondary};
">
</ul>

</div>

<!-- ANÁLISE EMOCIONAL -->

<div style="${styleBase}">

<div style="
font-size:13px;
font-weight:700;

color:${textPrimary};

margin-bottom:12px;
">

🧠 Análise Emocional

</div>

<p
id="emotional-analysis-text"
style="
margin:0;

font-size:12px;

line-height:1.7;

color:${textSecondary};
">

Analisando...

</p>

</div>

<!-- RETENÇÃO -->

<div style="${styleBase}">

<div style="
font-size:13px;
font-weight:700;

color:${textPrimary};

margin-bottom:12px;
">

🔥 Dica de Retenção

</div>

<p
id="retention-tip-text"
style="
margin:0;

font-size:12px;

line-height:1.7;

color:${textSecondary};
">

Aguardando dados...

</p>

</div>

<!-- TAGS -->

<div style="${styleBase}">

<div style="
display:flex;
justify-content:space-between;
align-items:center;

margin-bottom:12px;
">

<div style="
font-size:13px;
font-weight:700;

color:${textPrimary};
">

🏷 Tags Sugeridas

</div>

<button
id="inserirTodasTags"
style="
height:36px;

padding:0 14px;

background:${buttonBg};

backdrop-filter:blur(18px);
-webkit-backdrop-filter:blur(18px);

border:1px solid ${buttonBorder};

border-radius:10px;

color:${buttonText};

font-size:12px;
font-weight:600;

cursor:pointer;

transition:
background .18s ease,
border-color .18s ease,
transform .15s ease;
">

Inserir Todas

</button>

</div>

<div
id="suggestedTags"
style="
display:flex;
flex-wrap:wrap;
gap:8px;
">
</div>

</div>

</div>

`;


 // ✅ Injeta o painel no corpo
document.body.appendChild(panel);
 bloquearConteudoPainel('tubex-seo-score-panel');

// Usa o mesmo seletor robusto do cálculo SEO
const editableDivs = Array.from(document.querySelectorAll('div[contenteditable="true"][role="textbox"]'));
const titleEl = editableDivs.find(div => div.innerText?.trim()?.length > 0);
const titulo = titleEl?.innerText.trim();

// --- Captura ID do vídeo do YouTube Studio corretamente ---
const match = window.location.href.match(/\/video\/([a-zA-Z0-9_-]{11})\/edit/);
const videoId = match ? match[1] : null;


const interval = setInterval(() => {
  const editableDivs = Array.from(
    document.querySelectorAll('div[contenteditable="true"][role="textbox"]')
  );

  const titleDiv = editableDivs[0];
  const descDiv  = editableDivs[1];
  const tagChips = document.querySelectorAll('yt-chip-cloud-chip-renderer');

  if (titleDiv && descDiv) {
    clearInterval(interval);
 calculateSeo();

let lastSeoUrl = location.href;
let seoPanelInterval = null;

let lastEditUrl = location.href;
function handleUrlChange() {
  if (location.href !== lastEditUrl) {
    lastEditUrl = location.href;
    if (location.href.includes('/video/') && location.href.includes('/edit')) {
      if (!document.getElementById('tubex-seo-score-panel')) {
       // initSeoScorePanel();
      }
    } else {
      removeSeoScorePanel();
    }
  }
}

      
const calcularSeoDebounced = debounce(calculateSeo, 400); // 400ms é ideal para Studio

titleDiv.addEventListener("input", calcularSeoDebounced);
descDiv.addEventListener("input", calcularSeoDebounced);
if (tagChips.length) {
  const tagContainer = tagChips[0].parentElement;
  new MutationObserver(calcularSeoDebounced).observe(tagContainer, { childList: true, subtree: true });
}
calculateSeo();

    }
  }, 500);
 
}

})();






// =====================================================
// 🚀 ESTIMATIVA DE ALCANCE (TUBEX AI)
// Baseada em dados oficiais do backend
// =====================================================

function calcularVisibilidade(){

    // ==========================
    // DADOS DO BACKEND
    // ==========================

    const volume =
        Number(window.__seoVolume || 0);

    const competition =
        Number(window.__seoCompetition || 0);

    const interest =
        Number(window.__seoInterest || 0);

    const opportunity =
        Number(window.__seoOpportunity || 0);

// ==========================
// SEO SCORE
// ==========================

// Volume pesa mais
const volumeScore =
    volume * 0.40;

// Concorrência invertida
const competitionScore =
    competition * 0.25;

// Opportunity
const opportunityScore =
    opportunity * 0.25;

// Google Trends
const trendScore =
    interest * 0.10;

// Soma
let seoScore =

    volumeScore +

    competitionScore +

    opportunityScore +

    trendScore;

// ==========================
// CURVA TUBEX
// ==========================

// comprime os valores altos
seoScore =

    Math.round(

        Math.pow(

            seoScore / 100,

            1.18

        ) * 100

    );

// Limite

seoScore =

Math.max(

    5,

    Math.min(

        100,

        seoScore

    )

);

    // ==========================
    // TEMA
    // ==========================

    const isDark =
        document.documentElement.hasAttribute("dark") ||
        document.documentElement.getAttribute("dark") !== null ||
        window.matchMedia("(prefers-color-scheme: dark)").matches;

    const textPrimary =
        isDark ? "#FACC15" : "#B45309";

    const textSecondary =
        isDark ? "#9CA3AF" : "#6B7280";

    // ==========================
    // PESOS
    // ==========================

    const volumeWeight =
        volume / 100;

    const competitionWeight =
        competition / 100;

    const interestWeight =
        interest / 100;

    const seoWeight =
        seoScore / 100;

    // ==========================
    // ESTIMATIVA
    // ==========================

const estimativa = Math.round(

    (

        seoWeight * 0.70 +

        competitionWeight * 0.20 +

        interestWeight * 0.10

    )

    * 15000

);
    // ==========================
    // FEEDBACK
    // ==========================

    let emoji = "";
    let feedback = "";

    if(estimativa >= 12000){

        emoji = "🚀";
        feedback = "Excelente potencial de alcance.";

    }

    else if(estimativa >= 8000){

        emoji = "📈";
        feedback = "Boa chance de alcançar novas audiências.";

    }

    else if(estimativa >= 5000){

        emoji = "⚠️";
        feedback = "Potencial moderado. Pequenas otimizações podem aumentar o alcance.";

    }

    else{

        emoji = "📉";
        feedback = "Baixo potencial. Revise título, thumbnail e palavra-chave.";

    }

    // ==========================
    // DOM
    // ==========================

    const estimativaDiv =
        document.getElementById(
            "visibilidadeEstimativa"
        );

    const feedbackDiv =
        document.getElementById(
            "visibilidadeFeedback"
        );

    if(estimativaDiv){

        estimativaDiv.style.color =
            textPrimary;

        estimativaDiv.style.transition =
            "opacity .25s ease";

        estimativaDiv.style.opacity = "0";

        requestAnimationFrame(()=>{

            estimativaDiv.textContent =
                `Estimativa de alcance: ${estimativa.toLocaleString()} impressões`;

            estimativaDiv.style.opacity = "1";

        });

    }

    if(feedbackDiv){

        feedbackDiv.style.color =
            textSecondary;

        feedbackDiv.style.transition =
            "opacity .25s ease";

        feedbackDiv.style.opacity = "0";

        requestAnimationFrame(()=>{

            feedbackDiv.innerHTML = `
                <span style="margin-right:4px;">
                    ${emoji}
                </span>

                ${feedback}
            `;

            feedbackDiv.style.opacity = "1";

        });

    }

}

// =====================================================
// OBSERVA MUDANÇA DE URL (SPA YOUTUBE)
// =====================================================

(() => {

    const pushState = history.pushState;
    const replaceState = history.replaceState;

    function notify(){

        window.dispatchEvent(
            new Event("locationchange")
        );

    }

    history.pushState = function(){

        const result =
            pushState.apply(this, arguments);

        notify();

        return result;

    };

    history.replaceState = function(){

        const result =
            replaceState.apply(this, arguments);

        notify();

        return result;

    };

    window.addEventListener(
        "popstate",
        notify
    );

})();








// Função para inserir todas as tags com delay e sem travar
function inserirTodasTags(tags) {
  if (!Array.isArray(tags) || !tags.length) return;
  let idx = 0;

  function next() {
    if (idx >= tags.length) return;
    inserirTagNoEditor(tags[idx], () => {
      idx++;
      setTimeout(next, 420); // ajuste o delay se necessário
    });
  }
  next();
}


function injectSuggestedTagsStyles(){

  if(document.getElementById("suggested-tags-style")){
    return;
  }

  const isDark =
    document.documentElement.hasAttribute("dark");

  const cardBg = isDark
    ? "rgba(255,255,255,.04)"
    : "rgba(255,255,255,.90)";

  const cardHover = isDark
    ? "rgba(255,255,255,.08)"
    : "#FFFFFF";

  const borderColor = isDark
    ? "rgba(255,255,255,.06)"
    : "rgba(0,0,0,.08)";

  const textPrimary = isDark
    ? "#F3F4F6"
    : "#111827";

  const textSecondary = isDark
    ? "#9CA3AF"
    : "#6B7280";

  const barBg = isDark
    ? "rgba(255,255,255,.08)"
    : "rgba(0,0,0,.08)";

  const style =
    document.createElement("style");

  style.id =
    "suggested-tags-style";

  style.textContent = `

#suggestedTags{

  display:grid;

  grid-template-columns:
    repeat(2,minmax(0,1fr));

  gap:8px;

  width:100%;

  margin-top:10px;

}

.tubex-tag{

  display:flex;

  flex-direction:column;

  gap:6px;

  padding:10px 12px;

  cursor:pointer;

  border-radius:12px;

  background:${cardBg};

  backdrop-filter:
    blur(16px)
    saturate(170%);

  -webkit-backdrop-filter:
    blur(16px)
    saturate(170%);

  border:1px solid ${borderColor};

  transition:
    background .18s ease,
    border-color .18s ease,
    transform .15s ease,
    box-shadow .18s ease;

  box-shadow:
    inset 0 1px 0 rgba(255,255,255,.04);

}

.tubex-tag:hover{

  background:${cardHover};

  border-color:
    rgba(250,204,21,.30);

  transform:
    translateY(-2px);

  box-shadow:
    0 8px 18px rgba(0,0,0,.12);

}

.tubex-tag-title{

  font-size:13px;

  font-weight:600;

  line-height:1.35;

  color:${textPrimary};

}

.tubex-tag-score{

  display:flex;

  justify-content:space-between;

  align-items:center;

  font-size:11px;

  color:${textSecondary};

}

.tubex-bar{

  width:100%;

  height:5px;

  overflow:hidden;

  border-radius:999px;

  background:${barBg};

}

.tubex-bar-fill{

  height:100%;

  border-radius:999px;

  transition:
    width .35s ease;

}

`;

  document.head.appendChild(style);

}

function populateSuggestedTags(tags) {

  if (!Array.isArray(tags) || !tags.length) {
    const container = document.getElementById('suggestedTags');
    if (container) container.innerHTML = "";
    return;
  }

  injectSuggestedTagsStyles();

const seoPanel =
    document.querySelector("#tubex-seo-score-panel") ||
    document.querySelector("#tubex-panel");

if(!seoPanel){

    console.warn("TubeX: painel SEO não encontrado.");

    return;

}

  let container = document.getElementById('suggestedTags');

  if (!container) {
    container = document.createElement('div');
    container.id = 'suggestedTags';
    seoPanel.appendChild(container);
  }

  container.innerHTML = '';

  // =========================
  // 🔥 NORMALIZA (SEM BLOQUEAR DEMAIS)
  // =========================
  const normalized = tags.map((t, i) => {

    let keyword = typeof t === "string" ? t : t.keyword;

    if (!keyword) return null;

    keyword = keyword.toLowerCase().trim();

    // 🔥 FILTRO LEVE (só remove lixo óbvio)
    if (
      keyword.length < 5 ||
      /(tamil|bangladesh)/.test(keyword)
    ) return null;

    return {
      keyword,
      score: t.score || Math.max(60, 100 - i * 5)
    };

  }).filter(Boolean);

  if (!normalized.length) {
    console.warn("⚠️ Nenhuma tag válida após filtro leve");
    return;
  }

  // =========================
  // 🔥 ORDENA
  // =========================
  normalized.sort((a, b) => b.score - a.score);

  // =========================
  // 🔥 SALVA GLOBAL
  // =========================
  window.__tubexTags = normalized.map(t => t.keyword);

  // =========================
// 🔥 RENDER
// =========================
normalized.forEach((tag) => {

  const { keyword, score } = tag;

  const color =
    score >= 75 ? "#29D17F" :
    score >= 50 ? "#FACC15" :
    "#F05C5C";

  const el = document.createElement("div");
  el.className = "tubex-tag";

  el.innerHTML = `
    <div class="tubex-tag-title">
      ${keyword}
    </div>

    <div
      class="tubex-tag-score"
      style="
        color:${color};
        font-weight:700;
      "
    >
      ${score}
    </div>
  `;

  el.onclick = () => {

    const { count, totalChars } = getTagCountAndChars();
  //    if (count >= 30 || totalChars + keyword.length + 1 > 500) {
    //    alert('Limite de tags atingido');
     //   return;
      //}

      inserirTagNoEditor(keyword);

      el.style.background = '#00cc44';

      setTimeout(() => {
        el.style.background = '#2f3640';
      }, 300);
    };

    container.appendChild(el);

  });

  console.log("✅ Tags renderizadas:", normalized);
}

window.gerarComIA = async function(tipo, prompt) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "gerarTextoIA", tipo, prompt }, (response) => {
      if (!response || !response.success) {
        console.error('[TubeX] Erro IA:', response?.error);
        reject(new Error(response?.error || "Erro ao chamar OpenAI"));
      } else {
        console.log('[TubeX] IA respondeu:', response.texto);
        resolve(response.texto);
      }
    });
  });
};





// 2) Observa mudanças na DOM (navegação interna do YouTube SPA)

function observeVideoChange() {

  const getId = () => {
    const match = location.href.match(/[?&]v=([^&]+)/);
    return match ? match[1] : null;
  };

  const check = () => {

    const vid = getId();

    if (!vid) return;

    if (vid === __tubexLastVideoId) return;

    __tubexLastVideoId = vid;

    console.log("🎯 Novo vídeo detectado:", vid);

    tryInitPanelForVideo();
  };

  // 🔥 roda ao iniciar
  check();

  // 🔥 hook SPA
  const push = history.pushState;
  history.pushState = function () {
    push.apply(this, arguments);
    setTimeout(check, 200);
  };

  const replace = history.replaceState;
  history.replaceState = function () {
    replace.apply(this, arguments);
    setTimeout(check, 200);
  };

  window.addEventListener('popstate', () => {
    setTimeout(check, 200);
  });

}



function garantirValidacaoPainel(callback) {

  // 🔒 evita chamadas duplicadas
  if (__tubexPlanoLoading) return;

  __tubexPlanoLoading = true;

  chrome.storage.local.get(['userEmail'], ({ userEmail }) => {

    if (!userEmail) {

      console.warn("⚠️ usuário sem email");

      tubexPlanoAtual = "free";
      tubexPlanoPronto = true;

      liberarPainelComPlano("free");
      esconderLoadingPainel();

      __tubexPlanoLoading = false;

      if (callback) callback("free");

      return;
    }

    chrome.runtime.sendMessage(
      { action: "verificarPlano", email: userEmail },
      (resp) => {

        let plano = "free";

        if (resp && resp.plano) {
          plano = resp.plano.toLowerCase().trim();
        }

        console.log("🧠 Plano detectado:", plano);

        tubexPlanoAtual = plano;
        tubexPlanoPronto = true;

        liberarPainelComPlano(plano);
        esconderLoadingPainel();

        __tubexPlanoLoading = false;

        if (callback) callback(plano);

      }
    );

  });

}


// =========================
// 🌍 Tubex I18N – ALL TABS (REAL WORKING)
// =========================

(function () {
  if (window.__ZBEE_I18N_REAL__) return;
  window.__ZBEE_I18N_REAL__ = true;

  const LANGS = ['pt', 'en'];

  function getLang() {
    const saved = localStorage.getItem('zbee_lang');
    if (saved && LANGS.includes(saved)) return saved;
    return (navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en';
  }

  const I18N = {
    pt: {
      tabs: {
        seo: "🔍 SEO",
        validacao: "🧠 CTR - Validação",
        tendencias: "📈 Tendências",
        vlogs: "🎬 Vlogs",
        scripts: "📖 Roteiros",
        ia: "Creator Workspace"
      },
      seo_slogan: "Descubra, Otimize e Domine o YouTube",
      seo_loading: "Carregando dados...",
      trends_title: "📈 Painel de Tendências",
      trends_loading: "Carregando dados de tendências...",
      ia_panel: "Workspace",
      ia_generator: "🔎 IA: Gerador de Conteúdo para YouTube",
      ia_placeholder: "Digite a palavra-chave ou ideia",
      val_title: "🧠 Validação de Vídeo (Beta)",
      val_desc: "Avalia compatibilidade algorítmica. Não garante resultados.",
      val_btn: "Calcular chance",
      scripts_panel: "Painel Roteiros",
      scripts_generate: "Gerar Roteiro Automático",
      scripts_copy: "Copiar Roteiro",
      scripts_save: "Salvar Roteiro",
      scripts_clear: "Limpar Roteiro",
      scripts_placeholder: "Digite seu roteiro aqui..."
    },

    en: {
      tabs: {
        seo: "🔍 SEO",
        validacao: "🧠 CTR Validation",
        tendencias: "📈 Trends",
        vlogs: "🎬 Vlogs",
        scripts: "📖 Scripts",
        ia: "Creator Workspace"
      },
      seo_slogan: "Discover, Optimize and Dominate YouTube",
      seo_loading: "Loading data...",
      trends_title: "📈 Trends Dashboard",
      trends_loading: "Loading trends data...",
      ia_panel: "AI Panel",
      ia_generator: "🔎 AI: YouTube Content Generator",
      ia_placeholder: "Enter a keyword or idea",
      val_title: "🧠 Video Validation (Beta)",
      val_desc: "Estimates algorithm compatibility. No guarantees.",
      val_btn: "Calculate chance",
      scripts_panel: "Scripts Panel",
      scripts_generate: "Generate Script",
      scripts_copy: "Copy Script",
      scripts_save: "Save Script",
      scripts_clear: "Clear Script",
      scripts_placeholder: "Type your script here..."
    }
  };

  window.applyI18n = function () {
    const lang = getLang();
    const t = I18N[lang];
    if (!t) return;

    document.querySelectorAll('.tab-btn').forEach(tab => {
      const key = tab.dataset.tab;
      if (key && t.tabs[key]) tab.textContent = t.tabs[key];
    });

    const slogan = document.querySelector('#tab-seo div[style*="italic"]');
    if (slogan) slogan.textContent = t.seo_slogan;

    const loading = document.getElementById('loadingMessage');
    if (loading) loading.textContent = t.seo_loading;

    const trendsTitle = document.querySelector('#tab-tendencias h3');
    if (trendsTitle) trendsTitle.textContent = t.trends_title;

    const iaPanel = document.querySelector('#tab-ia h3');
    if (iaPanel) iaPanel.textContent = t.ia_panel;

    const iaTitle = document.querySelector('#tab-ia h4');
    if (iaTitle) iaTitle.textContent = t.ia_generator;

    const iaInput = document.getElementById('iaKeywordInput');
    if (iaInput) iaInput.placeholder = t.ia_placeholder;

    const valTitle = document.querySelector('#tab-validacao h3');
    if (valTitle) valTitle.textContent = t.val_title;

    const valDesc = document.querySelector('#tab-validacao p');
    if (valDesc) valDesc.textContent = t.val_desc;

    const valBtn = document.getElementById('val-run');
    if (valBtn) valBtn.textContent = t.val_btn;

    const scriptsTitle = document.querySelector('#tab-scripts h3');
    if (scriptsTitle) scriptsTitle.textContent = t.scripts_panel;

    const genBtn = document.getElementById('generateScriptBtn');
    if (genBtn) genBtn.textContent = t.scripts_generate;

    const copyBtn = document.getElementById('copyScriptBtn');
    if (copyBtn) copyBtn.textContent = t.scripts_copy;

    const saveBtn = document.getElementById('saveScriptBtn');
    if (saveBtn) saveBtn.textContent = t.scripts_save;

    const clearBtn = document.getElementById('clearScriptBtn');
    if (clearBtn) clearBtn.textContent = t.scripts_clear;

    const scriptInput = document.getElementById('scriptInput');
    if (scriptInput) scriptInput.placeholder = t.scripts_placeholder;
  };

  function attachToggle() {
    if (document.getElementById('zbee-lang-toggle-top')) return;
    const center = document.querySelector('#center');
    if (!center) return;

    const wrap = document.createElement('div');
    wrap.id = 'zbee-lang-toggle-top';
    wrap.style.cssText = `
      display:flex;
      align-items:center;
      gap:6px;
      margin-left:8px;
      font-size:11px;
      color:#FFD700;
    `;

    const lang = getLang();

    wrap.innerHTML = `
      <span>PT</span>
      <label style="position:relative;width:34px;height:18px;display:inline-block;">
        <input type="checkbox" ${lang === 'en' ? 'checked' : ''} style="opacity:0">
        <span style="position:absolute;inset:0;background:#444;border-radius:20px;"></span>
        <span class="dot" style="position:absolute;width:14px;height:14px;left:2px;bottom:2px;background:#FFD700;border-radius:50%;transition:.2s;"></span>
      </label>
      <span>EN</span>
    `;

    const input = wrap.querySelector('input');
    const dot = wrap.querySelector('.dot');

    const sync = () => {
      dot.style.transform = input.checked ? 'translateX(16px)' : 'translateX(0)';
    };
    sync();

    input.onchange = () => {
      localStorage.setItem('zbee_lang', input.checked ? 'en' : 'pt');
      sync();
      window.applyI18n();
    };

    center.appendChild(wrap);
  }

const boot = setInterval(() => {
  if (document.getElementById('tubex-panel')) {
    clearInterval(boot);

    attachToggle();
    window.applyI18n();

    // 🔥 SUA LÓGICA ATUAL (mantém)
    document.querySelectorAll('.tab-btn').forEach(btn =>
      btn.addEventListener('click', () => setTimeout(window.applyI18n, 30))
    );

if(window.__tubexTabsInitialized){
  return;
}

window.__tubexTabsInitialized = true;

    // =========================================
    // 🚀 Controle das abas
    // =========================================
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;

      const tab = btn.dataset.tab;

      // troca abas
      document.querySelectorAll('.tab-content').forEach(c => {
        c.style.display = 'none';
      });

      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
      });

      const target = document.getElementById(`tab-${tab}`);
      if (target) target.style.display = 'block';

      btn.classList.add('active');

      // 🚀 AQUI CHAMA A FUNÇÃO
      if (tab === "shorts") {
        console.log("🔥 carregando shorts");

        fillShortsTab({
          keyword: getCurrentYoutubeSearchQuery?.() || "",
          videoInfo: {
            title: document.title || "",
            duration: 30
          }
        });
      }
    });
    }
}, 300);
})();






// ======================================================
// 🌍 TubeX AUTO I18N ENGINE (PRO)
// ======================================================

(function(){

if(window.__TUBEX_AUTO_I18N__) return;
window.__TUBEX_AUTO_I18N__ = true;

const LANGS = ["pt","en"];

function getLang(){
  const saved = localStorage.getItem("zbee_lang");
  if(saved && LANGS.includes(saved)) return saved;

  return (navigator.language || "en")
    .toLowerCase()
    .startsWith("pt") ? "pt" : "en";
}

const DICT = {

pt:{
seo:"🔍 SEO",
validacao:"🧠 CTR - Validação",
tendencias:"📈 Tendências",
shorts:"🎥 Shorts",
vlogs:"🎬 Vlogs",
scripts:"📖 Roteiros",
ia:"Creator Workspace",

seo_slogan:"Descubra, Otimize e Domine o YouTube",

loading:"Carregando dados...",

trends_title:"Painel de Tendências",

ia_panel:"Workspace",
ia_generator:"Gerador de Conteúdo IA",

keyword_placeholder:"Digite palavra-chave",

generate_script:"Gerar roteiro",
copy_script:"Copiar roteiro",
clear_script:"Limpar roteiro",

visibility_simulator:"Simulador de Visibilidade",

},

en:{
seo:"🔍 SEO",
validacao:"🧠 CTR Validation",
tendencias:"📈 Trends",
shorts:"🎥 Shorts",
vlogs:"🎬 Vlogs",
scripts:"📖 Scripts",
ia:"Creator Workspace",

seo_slogan:"Discover, Optimize and Dominate YouTube",

loading:"Loading data...",

trends_title:"Trends Dashboard",

ia_panel:"AI Panel",
ia_generator:"AI Content Generator",

keyword_placeholder:"Enter keyword",

generate_script:"Generate script",
copy_script:"Copy script",
clear_script:"Clear script",

visibility_simulator:"Visibility Simulator",
}

};

function translate(){

const lang = getLang();
const dict = DICT[lang];

if(!dict) return;

document.querySelectorAll("[data-i18n]").forEach(el=>{
const key = el.dataset.i18n;

if(dict[key]) el.innerText = dict[key];
});

document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{
const key = el.dataset.i18nPlaceholder;

if(dict[key]) el.placeholder = dict[key];
});

}

window.applyTubeXI18N = translate;

// executa
translate();

// observa mudanças no DOM (YouTube é SPA)
const observer = new MutationObserver(()=>{
translate();
});

observer.observe(document.body,{
childList:true,
subtree:true
});

})();



// ======================================================
// 🤖 FIX DEFINITIVO — ABA IA (EXPERT)
// ======================================================
(function initIATabFix() {

  if (window.__tubexIATabFix) return;
  window.__tubexIATabFix = true;

  function bindIA() {

    const tabBtn = document.querySelector('.tab-btn[data-tab="ia"]');

    if (!tabBtn || tabBtn.dataset.bound === "1") return;

    tabBtn.dataset.bound = "1";

    tabBtn.addEventListener("click", () => {

      const container = document.getElementById("tab-ia");

      if (!container) return;

      __tubexGetPlan((plano) => {

        // ============================
        // Apenas EXPERT libera IA
        // ============================

        const expert =
          String(plano || "")
            .toLowerCase()
            .includes("expert");

        if (!expert) {

          container.innerHTML = `
<div style="
padding:22px;
border-radius:16px;
background:linear-gradient(180deg,#1b1b1b,#252525);
border:1px solid rgba(255,215,0,.18);
box-shadow:0 10px 35px rgba(0,0,0,.45);
color:#fff;
overflow:hidden;
">

<div style="
font-size:42px;
text-align:center;
margin-bottom:8px;
">

🚀

</div>

<div style="
font-size:20px;
font-weight:800;
color:#FFD700;
text-align:center;
margin-bottom:10px;
">

TubeX Workspace

</div>

<div style="
font-size:13px;
line-height:1.7;
text-align:center;
color:#d5d5d5;
margin-bottom:20px;
">

Seu ambiente completo para planejar, criar,
otimizar e publicar vídeos com muito mais velocidade.

Tudo em um único lugar.

</div>

<div style="
background:#121212;
border:1px solid #363636;
border-radius:12px;
padding:15px;
margin-bottom:18px;
">

<div style="
font-size:14px;
font-weight:700;
color:#FFD700;
margin-bottom:12px;
">

✨ Recursos disponíveis

</div>

<div style="
line-height:2;
color:#e6e6e6;
">

🧠 Brainstorm de ideias

🎯 Títulos com análise de CTR

📝 Workspace para roteiro

📄 Descrição otimizada

🏷 SEO em tempo real

🤖 IA especializada em YouTube

📊 Score de otimização

📈 Sugestões estratégicas

💡 Organização do conteúdo

🚀 Muito mais em breve...

</div>

</div>

<div style="
background:#101010;
padding:14px;
border-left:4px solid #FFD700;
border-radius:8px;
margin-bottom:20px;
font-size:12px;
line-height:1.7;
color:#bfbfbf;
">

O Workspace foi criado para substituir dezenas de ferramentas.

Planeje, escreva, revise e otimize seus vídeos sem sair do TubeX.

</div>

<a
href="https://tubex.app.br/#planos"
target="_blank"
style="
display:block;
width:100%;
padding:15px;
background:#FFD700;
color:#000;
font-size:15px;
font-weight:800;
text-align:center;
border-radius:10px;
text-decoration:none;
">

🚀 Desbloquear Workspace

</a>

<div style="
margin-top:12px;
text-align:center;
font-size:11px;
color:#8b8b8b;
">

Disponível exclusivamente no plano
<b style="color:#FFD700;">EXPERT</b>

</div>

</div>`;

          return;

        }

        // ============================
        // EXPERT
        // ============================

        renderPainelIA();

      });

    });

  }

  setTimeout(bindIA, 500);

  window.addEventListener("yt-navigate-finish", () => {

    setTimeout(bindIA, 400);

  });

})();



// ======================================================
// 🔗 FIX DEFINITIVO — ABA TENDÊNCIAS (KEYWORD DO YOUTUBE)
// ======================================================

(function initTendenciasTabFix() {

    if (window.__tubexTendenciasFix) return;
    window.__tubexTendenciasFix = true;

    function bindTendencias() {

        const tabBtn =
            document.querySelector(
                '.tab-btn[data-tab="tendencias"]'
            );

        if (!tabBtn || tabBtn.dataset.bound === "1")
            return;

        tabBtn.dataset.bound = "1";

        tabBtn.addEventListener("click", () => {

            const container =
                document.getElementById("tendencias-content");

            if (!container) return;

            const keyword =
                getCurrentYoutubeSearchQuery();

            if (!keyword) {

                container.innerHTML = `
<div style="
padding:20px;
text-align:center;
color:#b5b5b5;
font-size:13px;
">

🔎 Faça uma pesquisa no YouTube para descobrir
o potencial de crescimento dessa ideia.

</div>
`;

                return;

            }

            __tubexGetPlan((plano)=>{

                canUseTendenciasPanel(plano,(allowed)=>{

                    if(allowed){

                        carregarDadosTendencias(keyword);

                        return;

                    }

container.innerHTML = `

<div style="
padding:22px;
border-radius:16px;
background:linear-gradient(180deg,#1a1a1a,#262626);
border:1px solid rgba(255,215,0,.18);
box-shadow:0 8px 35px rgba(0,0,0,.45);
color:#fff;
overflow:hidden;
">

<div style="
font-size:42px;
text-align:center;
margin-bottom:8px;
">
📈
</div>

<div style="
font-size:18px;
font-weight:800;
color:#FFD700;
text-align:center;
margin-bottom:8px;
">

Pare de criar vídeos no escuro.

</div>

<div style="
text-align:center;
font-size:13px;
line-height:1.7;
color:#d5d5d5;
margin-bottom:18px;
">

Descubra quais assuntos estão ganhando força,
publique antes da concorrência e aumente suas chances
de alcançar mais pessoas.

</div>

<div style="
background:#121212;
border:1px solid #353535;
border-radius:12px;
padding:15px;
margin-bottom:18px;
">

<div style="
font-size:14px;
font-weight:700;
color:#FFD700;
margin-bottom:12px;
">

✨ O Painel de Tendências mostra:

</div>

<div style="line-height:2;color:#e0e0e0;">

📈 Tendências em crescimento real<br>

🎯 Nível de oportunidade da palavra-chave<br>

🔥 Assuntos com maior potencial de alcance<br>

⚡ Ideias antes que fiquem saturadas<br>

🚀 Mais confiança para escolher seu próximo vídeo

</div>

</div>

<div style="
background:#101010;
border-left:4px solid #FFD700;
padding:14px;
border-radius:8px;
margin-bottom:18px;
font-size:12px;
color:#bfbfbf;
line-height:1.7;
">

💡 Os maiores canais tomam decisões baseadas em dados.
Enquanto outros publicam por tentativa e erro,
você pode identificar oportunidades antes delas explodirem.

</div>

<a
href="https://tubex.app.br/#planos"
target="_blank"
style="
display:block;
width:100%;
padding:14px;
background:#FFD700;
color:#000;
text-align:center;
font-size:15px;
font-weight:800;
border-radius:10px;
text-decoration:none;
transition:.2s;
">

🚀 DESBLOQUEAR PAINEL DE TENDÊNCIAS

</a>

<div style="
margin-top:12px;
font-size:11px;
text-align:center;
color:#8d8d8d;
">

Disponível nos planos
<b style="color:#FFD700;">Membro</b>,
<b style="color:#FFD700;">PRO</b> e
<b style="color:#FFD700;">EXPERT</b>

</div>

</div>

`;

                });

            });

        });

    }

    setTimeout(bindTendencias,500);

    window.addEventListener(
        "yt-navigate-finish",
        ()=>setTimeout(bindTendencias,400)
    );

})();

// ======================================================
// 📊 TubeX — Channel Stats (UI + API FINAL)
// ======================================================
(function () {
  if (window.__tubexChannelStatsFinal) return;
  window.__tubexChannelStatsFinal = true;

  // ======================
  // 🔎 Helpers
  // ======================
  function isChannelPage() {
    return (
      location.pathname.startsWith('/@') ||
      location.pathname.startsWith('/channel/')
    );
  }

  function getChannelId() {
    try {
      // 1️⃣ Meta tag (mais confiável)
      const meta = document.querySelector('meta[itemprop="channelId"]');
      if (meta?.content) return meta.content;

      // 2️⃣ ytInitialData moderno
      const id =
        window.ytInitialData
          ?.metadata
          ?.channelMetadataRenderer
          ?.externalId;
      if (id) return id;

      // 3️⃣ Fallback SPA
      const browse =
        window.ytInitialData
          ?.responseContext
          ?.serviceTrackingParams
          ?.flatMap(p => p.params || [])
          ?.find(p => p.key === 'browse_id')?.value;
      if (browse) return browse;

      return null;
    } catch {
      return null;
    }
  }




 

  // ======================
  // 🌐 API
  // ======================
function populateStats(retry = 0) {
  const channelId = getChannelId();

  // ⏳ ChannelId ainda não existe → tenta novamente
  if (!channelId) {
    if (retry < 15) {
      setTimeout(() => populateStats(retry + 1), 400);
    }
    return;
  }

  chrome.runtime.sendMessage(
    { action: 'fetchChannelStats', channelId },
    (res) => {
      if (!res || !res.success || !res.data) return;
      updateChannelStatsUI(res.data);
    }
  );
}

  // ======================
  // 🚀 Inject + SPA Safe
  // ======================
  function injectPanel() {
    if (!isChannelPage()) return;
    if (document.getElementById('tubex-channel-stats')) return;

    const actions =
      document.querySelector('yt-flexible-actions-view-model');

    const tabs =
      document.querySelector('#tabsContainer') ||
      document.querySelector('tp-yt-paper-tabs');

    if (!actions && !tabs) return;

    const panel = createPanel();

    if (actions) {
      actions.insertAdjacentElement('afterend', panel);
    } else if (tabs) {
      tabs.parentElement.insertBefore(panel, tabs);
    }

    populateStats();
  }

  // Evento global (caso outro módulo dispare stats)
  document.addEventListener('tubex-channel-stats', (e) => {
    if (e.detail) updateChannelStatsUI(e.detail);
  });

  // Inicial + SPA
  setTimeout(injectPanel, 1000);
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(injectPanel, 1000);
  });

})();



function formatPlanoLabel(plano) {
  switch (plano) {
    case 'free': return 'Free';
    case 'start': return 'Start';
    case 'pro': return 'Pro';
    case 'expert': return 'Expert';
    case 'owner': return 'Owner';
    default: return plano;
  }
}






async function buscarTagsDoVideoAtual(){

  const videoId = getVideoIdFromStudio();

  if(!videoId){
    console.warn("Sem videoId");
    return [];
  }

  let res = await sendToBackground({
    action: "getVideoData",
    videoId
  });

  console.log("📦 VIDEO DATA:", res);

  if(!res?.success) return [];

  const tags = res.data?.snippet?.tags || [];

  window.__tubexTags = tags;

  return tags;
}

function renderConsultaVisual(){

  const el = document.getElementById("tubex-consultas-info");
  if(!el) return;

  __tubexGetPlan((plan)=>{

    const usadas = getSeoUsage();
    const limite = getSeoLimitByPlan(plan);

    const estourou = usadas >= limite;

    el.innerHTML = `
      <div style="
        font-size:13px;
        font-weight:600;
        color:${estourou ? "#ff4d4d" : "#aaa"};
      ">
        📊 ${usadas}/${limite} consultas usadas hoje
      </div>
    `;

  });

}



function getSeoLimitByPlan(plan){

  switch(plan){
    case "start": return 15;
    case "member": return 25;
    case "pro": return 50;
    case "expert":
    case "owner": return 9999;
    case "free":
    default: return 5;
  }

}





// ======================================================
// 🔐 TUBEX LOGIN TOP BUTTON
// HOME ONLY + SPA SAFE
// ======================================================

window.__tubexLoginInjected = false;

function injectTubeXLoginButton(){

// =====================================
// HOME + SEARCH + WATCH
// =====================================

const isAllowedPage =

  location.pathname === "/"

  ||

  location.pathname === "/feed/subscriptions"

  ||

  location.pathname.startsWith(
    "/results"
  )

  ||

  location.pathname.startsWith(
    "/watch"
  );

if(!isAllowedPage){

  document
    .getElementById(
      "tubex-login-top-btn"
    )
    ?.remove();

  return;
}

  // =====================================
  // AVOID DUPLICATE
  // =====================================

  if(
    document.getElementById(
      "tubex-login-top-btn"
    )
  ){
    return;
  }

  // =====================================
  // RIGHT SECTION
  // =====================================

  const rightControls =

    document.querySelector(
      "#end"
    )

    ||

    document.querySelector(
      "ytd-masthead #buttons"
    );

  if(!rightControls){

    return;
  }

  // =====================================
  // BUTTON
  // =====================================

const btn =
  document.createElement("button");

btn.id =
  "tubex-login-top-btn";

btn.innerHTML = `
  &#9888; Sign in to
  <br>
  TubeX
`;

btn.style.cssText = `

  background:transparent;

  border:none;

  padding:0;

  margin-right:12px;

  color:#facc15;

  font-size:12px;

  font-weight:500;

  line-height:1.2;

  cursor:pointer;

  text-align:left;

  text-decoration:underline;

  opacity:.92;

  transition:
    opacity .18s ease,
    color .18s ease;

`;

btn.onmouseenter = ()=>{

  btn.style.opacity = "1";

  btn.style.color = "#fde047";

};

btn.onmouseleave = ()=>{

  btn.style.opacity = ".92";

  btn.style.color = "#EAB308";

};

  // =====================================
  // CLICK
  // =====================================

btn.onclick = ()=>{

  // fecha antigo
  document
    .getElementById(
      "tubex-dropdown"
    )
    ?.remove();

  // abre novo
  createTubeXMenu();

};

  // =====================================
  // INSERT
  // =====================================

  rightControls.prepend(btn);

  console.log(
    "✅ TubeX Login injected"
  );

}

// ======================================================
// 🚀 MENU
// ======================================================

function createTubeXMenu(){

  if(
    document.getElementById(
      "tubex-dropdown"
    )
  ){
    return;
  }

  const wrap =
    document.createElement("div");

  wrap.id =
    "tubex-dropdown";


wrap.innerHTML = `

<div id="tbx-overlay"></div>

<div id="tbx-panel">

    <!-- HEADER -->

    <div class="tbx-header">

        <div class="tbx-logo">

            <div class="tbx-logo-icon">
                ⚡
            </div>

            <div>

                <div class="tbx-title">
                    TubeX
                </div>

                <div class="tbx-subtitle">
                    SEO & AI Platform
                </div>

            </div>

        </div>

    </div>

    <!-- CONTENT -->

    <div class="tbx-body">

        <h2 class="tbx-welcome">

            Bem-vindo ao TubeX

        </h2>

        <p class="tbx-description">

            Conecte sua Conta Google para utilizar com segurança
            os recursos do TubeX que utilizam os
            <strong>YouTube API Services</strong>.

        </p>

        <div class="tbx-benefits">

            <div class="tbx-item">

                ✅ Análise SEO

            </div>

            <div class="tbx-item">

                ✅ Inteligência Artificial

            </div>

            <div class="tbx-item">

                ✅ Tendências do YouTube

            </div>

            <div class="tbx-item">

                ✅ Insights para Criadores

            </div>

        </div>

        <label class="tbx-consent">

            <input
                type="checkbox"
                id="tbx-accept"
            >

            <span>

                Li e concordo com os

                <a
                    href="https://tubex.app.br/terms"
                    target="_blank"
                >

                    Termos de Uso

                </a>

                ,

                <a
                    href="https://tubex.app.br/privacy"
                    target="_blank"
                >

                    Política de Privacidade

                </a>

                e reconheço que o TubeX utiliza
                <strong>YouTube API Services</strong>.
                Ao utilizar estas funcionalidades,
                também concordo com os

                <a
                    href="https://www.youtube.com/t/terms"
                    target="_blank"
                >

                    Termos de Serviço do YouTube

                </a>.

            </span>

        </label>

        <button
            id="tbx-login-btn"
            disabled
        >

            <svg
                width="18"
                height="18"
                viewBox="0 0 48 48"
            >

                <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.6 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12S17.4 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.3-.4-3.5z"/>

                <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15 19 12 24 12c3 0 5.7 1.1 7.8 3l5.7-5.7C34 6.1 29.3 4 24 4c-7.7 0-14.3 4.3-17.7 10.7z"/>

                <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.1 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.2-8l-6.5 5C9.7 39.5 16.3 44 24 44z"/>

                <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.4 5.7-6.5 7.2l6.2 5.2C38.8 37 44 31.1 44 24c0-1.3-.1-2.3-.4-3.5z"/>

            </svg>

            <span>

                Continuar com Google

            </span>

        </button>

        <div class="tbx-footer">

            <div class="tbx-security">

                🔒 O TubeX utiliza autenticação segura via
                Google OAuth.

            </div>

            <div class="tbx-security">

                Nenhuma senha da sua Conta Google é armazenada
                pelo TubeX.

            </div>

            <div class="tbx-security">

                O acesso poderá ser revogado a qualquer momento
                nas configurações da sua Conta Google.

            </div>

        </div>

    </div>

</div>

`;

document.body.appendChild(wrap);

// ======================================================
// STYLE
// ======================================================

let style =
  document.getElementById(
    "tubex-login-style"
  );

if(!style){

  style =
    document.createElement(
      "style"
    );

  style.id =
    "tubex-login-style";

}

style.innerHTML = `

/* =====================================================
   TUBEX LOGIN
===================================================== */

#tubex-dropdown{

position:fixed;
inset:0;

display:flex;
align-items:center;
justify-content:center;

z-index:999999999;

font-family:
Inter,
system-ui,
sans-serif;

}

/* ==========================================
   BACKDROP
========================================== */

#tbx-overlay{

position:absolute;
inset:0;

background:
rgba(0,0,0,.72);

backdrop-filter:
blur(8px);

animation:
tbxFade .25s ease;

}

@keyframes tbxFade{

from{

opacity:0;

}

to{

opacity:1;

}

}

/* ==========================================
   PANEL
========================================== */

#tbx-panel{

position:relative;

width:540px;
max-width:92vw;

overflow:hidden;

border-radius:24px;

background:

linear-gradient(
180deg,
#171b22 0%,
#111418 100%
);

border:

1px solid
rgba(255,255,255,.08);

box-shadow:

0 45px 120px
rgba(0,0,0,.55);

animation:

tbxOpen .25s ease;

z-index:10;

}

/* brilho superior */

#tbx-panel::before{

content:"";

position:absolute;

top:0;
left:0;
right:0;

height:1px;

background:

linear-gradient(
90deg,
transparent,
rgba(255,215,0,.55),
transparent
);

}

/* ==========================================
   OPEN
========================================== */

@keyframes tbxOpen{

from{

opacity:0;

transform:
translateY(-18px)
scale(.96);

}

to{

opacity:1;

transform:
translateY(0)
scale(1);

}

}

/* =====================================================
   HEADER
===================================================== */

.tbx-header{

padding:

34px
36px
28px;

background:

linear-gradient(
180deg,
rgba(255,255,255,.03),
transparent
);

border-bottom:

1px solid
rgba(255,255,255,.06);

}

/* ==========================================
   LOGO
========================================== */

.tbx-logo{

display:flex;

align-items:center;

gap:18px;

}

.tbx-logo-icon{

width:64px;
height:64px;

display:flex;
align-items:center;
justify-content:center;

border-radius:18px;

font-size:30px;

background:

linear-gradient(
135deg,
#FFD54A,
#F4B400
);

color:#111;

font-weight:700;

box-shadow:

0 14px 35px
rgba(255,200,0,.22);

flex-shrink:0;

}

/* ==========================================
   TITLES
========================================== */

.tbx-title{

font-size:32px;

font-weight:800;

color:#fff;

letter-spacing:.3px;

line-height:1;

}

.tbx-subtitle{

margin-top:8px;

font-size:13px;

font-weight:500;

color:#9ca3af;

letter-spacing:.4px;

text-transform:uppercase;

}

/* ==========================================
   BODY
========================================== */

.tbx-body{

padding:

34px
36px
38px;

}

.tbx-welcome{

margin:0;

font-size:30px;

font-weight:800;

line-height:1.2;

color:white;

}

.tbx-description{

margin-top:18px;

font-size:15px;

line-height:1.8;

color:#cfd4dc;

}

.tbx-description strong{

color:#FFD54A;

font-weight:700;

}

/* =====================================================
   BENEFITS
===================================================== */

.tbx-benefits{

display:grid;

grid-template-columns:
repeat(2,1fr);

gap:12px;

margin-top:28px;
margin-bottom:30px;

}

.tbx-item{

display:flex;

align-items:center;

gap:10px;

padding:

14px
16px;

background:

rgba(255,255,255,.03);

border:

1px solid
rgba(255,255,255,.05);

border-radius:14px;

font-size:13px;

font-weight:600;

color:#e5e7eb;

transition:
all .18s ease;

}

.tbx-item:hover{

transform:
translateY(-2px);

background:

rgba(255,255,255,.05);

border-color:

rgba(255,215,0,.18);

box-shadow:

0 8px 22px
rgba(0,0,0,.18);

}

/* =====================================================
   CONSENT
===================================================== */

.tbx-consent{

display:flex;

align-items:flex-start;

gap:14px;

margin-top:10px;
margin-bottom:30px;

padding:

18px;

background:

rgba(255,255,255,.025);

border:

1px solid
rgba(255,255,255,.06);

border-radius:16px;

transition:
all .18s ease;

}

.tbx-consent:hover{

border-color:

rgba(255,215,0,.16);

background:

rgba(255,255,255,.04);

}

.tbx-consent input{

margin-top:3px;

width:18px;
height:18px;

accent-color:#FFD54A;

cursor:pointer;

flex-shrink:0;

}

.tbx-consent span{

font-size:13px;

line-height:1.75;

color:#c9ced7;

}

.tbx-consent strong{

color:#FFD54A;

}

.tbx-consent a{

color:#FFD54A;

text-decoration:none;

font-weight:600;

transition:
opacity .15s ease;

}

.tbx-consent a:hover{

opacity:.85;

text-decoration:underline;

}

/* =====================================================
   GOOGLE BUTTON
===================================================== */

#tbx-login-btn{

width:100%;

height:56px;

margin-top:8px;

display:flex;
align-items:center;
justify-content:center;
gap:12px;

border:none;

border-radius:16px;

cursor:pointer;

font-size:15px;

font-weight:700;

letter-spacing:.2px;

background:

linear-gradient(
180deg,
#FFD54A,
#F4B400
);

color:#111;

transition:
all .20s ease;

box-shadow:

0 12px 30px
rgba(255,196,0,.25);

}

#tbx-login-btn svg{

flex-shrink:0;

}

#tbx-login-btn span{

display:flex;
align-items:center;

}

#tbx-login-btn:hover{

transform:

translateY(-2px);

box-shadow:

0 18px 40px
rgba(255,196,0,.35);

filter:

brightness(1.03);

}

#tbx-login-btn:active{

transform:

scale(.985);

box-shadow:

0 8px 20px
rgba(255,196,0,.25);

}

#tbx-login-btn:disabled{

cursor:not-allowed;

opacity:.55;

transform:none;

filter:none;

box-shadow:none;

background:

linear-gradient(
180deg,
#666,
#555
);

color:

rgba(255,255,255,.75);

}

/* ==========================================
   LOADING
========================================== */

#tbx-login-btn.loading{

pointer-events:none;

opacity:1;

background:

linear-gradient(
180deg,
#FFD54A,
#F4B400
);

}

#tbx-login-btn.loading span{

opacity:.85;

}

#tbx-login-btn.loading::after{

content:"";

width:18px;
height:18px;

border-radius:50%;

border:

2px solid
rgba(255,255,255,.35);

border-top-color:

#111;

animation:

tbxSpin .8s linear infinite;

margin-left:6px;

}

@keyframes tbxSpin{

to{

transform:

rotate(360deg);

}

}

/* =====================================================
   FOOTER
===================================================== */

.tbx-footer{

margin-top:28px;

padding-top:22px;

border-top:

1px solid
rgba(255,255,255,.06);

display:flex;
flex-direction:column;

gap:10px;

}

.tbx-security{

display:flex;

align-items:flex-start;

gap:10px;

font-size:12px;

line-height:1.7;

color:#9ca3af;

}

/* =====================================================
   SCROLL
===================================================== */

#tbx-panel{

max-height:92vh;

overflow-y:auto;

scrollbar-width:thin;

scrollbar-color:
rgba(255,255,255,.15)
transparent;

}

#tbx-panel::-webkit-scrollbar{

width:8px;

}

#tbx-panel::-webkit-scrollbar-track{

background:transparent;

}

#tbx-panel::-webkit-scrollbar-thumb{

background:

rgba(255,255,255,.12);

border-radius:20px;

}

#tbx-panel::-webkit-scrollbar-thumb:hover{

background:

rgba(255,255,255,.22);

}

/* =====================================================
   RESPONSIVE
===================================================== */

@media (max-width:700px){

#tbx-panel{

width:94vw;

border-radius:18px;

}

.tbx-header{

padding:24px;

}

.tbx-body{

padding:24px;

}

.tbx-title{

font-size:28px;

}

.tbx-welcome{

font-size:24px;

}

.tbx-description{

font-size:14px;

}

.tbx-benefits{

grid-template-columns:1fr;

}

#tbx-login-btn{

height:52px;

font-size:14px;

}

}

/* =====================================================
   SMALL DEVICES
===================================================== */

@media (max-width:420px){

.tbx-logo{

gap:14px;

}

.tbx-logo-icon{

width:52px;
height:52px;

font-size:24px;

}

.tbx-title{

font-size:24px;

}

.tbx-subtitle{

font-size:11px;

}

.tbx-welcome{

font-size:22px;

}

.tbx-consent{

padding:14px;

}

.tbx-consent span{

font-size:12px;

line-height:1.6;

}

.tbx-security{

font-size:11px;

}

}

`;

if(!document.getElementById(
  "tubex-login-style"
)){
  document.head.appendChild(style);
}

// ======================================================
// CONSENT ENABLE LOGIN
// ======================================================

const checkbox =
  document.getElementById(
    "tbx-accept"
  );

const loginBtn =
  document.getElementById(
    "tbx-login-btn"
  );

checkbox.addEventListener(

  "change",

  ()=>{

    loginBtn.disabled =
      !checkbox.checked;

  }

);


  // =====================================
  // CLOSE
  // =====================================

  document
    .getElementById(
      "tbx-overlay"
    )
    .onclick = ()=>{

      wrap.remove();

    };

  // =====================================
  // LOGIN
  // =====================================

  document
  .getElementById(
    "tbx-login-btn"
  )
  .onclick = async ()=>{

    const btn =
      document.getElementById(
        "tbx-login-btn"
      );

    btn.disabled = true;

    btn.innerText =
      "Conectando...";

    try{

      chrome.runtime.sendMessage(

        {
          action: "loginOAuth"
        },

        async (response)=>{

          console.log(
            "🔐 LOGIN RESPONSE:",
            response
          );

          // =====================================
          // runtime error
          // =====================================

          if(
            chrome.runtime.lastError
          ){

            console.error(
              chrome.runtime.lastError
            );

            btn.disabled = false;

            btn.innerText =
              "Continuar com Google";

            return;
          }

          // =====================================
          // login fail
          // =====================================

          if(
            !response ||
            !response.success
          ){

            console.error(
              "❌ LOGIN FAIL:",
              response
            );

            btn.disabled = false;

            btn.innerText =
              "Continuar com Google";

            alert(
              "Falha no login Google"
            );

            return;
          }

          // =====================================
          // SUCCESS
          // =====================================

          console.log(
            "✅ LOGIN OK"
          );

          btn.innerText =
            "Login realizado";

          // fecha modal
          document
            .getElementById(
              "tubex-dropdown"
            )
            ?.remove();

          // reload suave
          setTimeout(()=>{

            location.reload();

          },600);

        }

      );

    }catch(e){

      console.error(
        "💥 LOGIN ERROR:",
        e
      );

      btn.disabled = false;

      btn.innerText =
        "Continuar com Google";

    }

  };

}

// ======================================================
// 🚀 INIT
// ======================================================

function initTubeXTopButton(){

  injectTubeXLoginButton();

if(!window.__tubeXObserver){

  window.__tubeXObserver =
    new MutationObserver(()=>{

      injectTubeXLoginButton();

    });

  window.__tubeXObserver.observe(

    document.documentElement,

    {
      childList:true,
      subtree:true
    }

  );

}
}


// ======================================================
// START
// ======================================================

setTimeout(()=>{

  initTubeXTopButton();

},2500);
