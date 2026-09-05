/**
 * TubeX public YouTube data adapter.
 * Primary source: public YouTube pages (no Data API quota).
 * Fallback: existing YouTube Data API code in the endpoint.
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const esc = s => String(s ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const decode = s => String(s||"").replace(/\\u0026/g,"&").replace(/\\u003d/g,"=").replace(/\\u002f/g,"/").replace(/\\"/g,'"');
const text = v => {
  if (!v) return "";
  if (typeof v === "string") return v;
  return String(v.simpleText || v.runs?.map(x=>x.text).join("") || "");
};
const walk = (v, fn) => {
  if (!v || typeof v !== "object") return;
  fn(v);
  for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x, fn);
};
function extractInitialData(html){
  const m = html.match(/var ytInitialData\s*=\s*(\{.*?\});<\/script>/s) || html.match(/ytInitialData\s*=\s*(\{.*?\});/s);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
function parseCount(v){
  const s=text(v).toLowerCase().replace(/\s/g,"").replace(/,/g,".");
  const n=parseFloat(s.replace(/[^0-9.]/g,""));
  if (!Number.isFinite(n)) return 0;
  if (s.includes("b")||s.includes("bi")) return Math.round(n*1e9);
  if (s.includes("m")||s.includes("mi")) return Math.round(n*1e6);
  if (s.includes("k")||s.includes("mil")) return Math.round(n*1e3);
  return Math.round(n);
}
async function getHtml(url){
  const r=await fetch(url,{headers:{"user-agent":UA,"accept-language":"pt-BR,pt;q=0.9,en;q=0.8"}});
  if(!r.ok) throw new Error(`public_youtube_http_${r.status}`);
  return r.text();
}
export async function searchPublicYoutube(keyword,{limit=50}={}){
  const html=await getHtml(`https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}&sp=CAI%253D`);
  const data=extractInitialData(await html);
  const out=[], seen=new Set();
  if(data) walk(data,node=>{
    const r=node?.videoRenderer;
    if(!r?.videoId || seen.has(r.videoId) || out.length>=limit) return;
    seen.add(r.videoId);
    out.push({id:r.videoId,snippet:{title:text(r.title),description:text(r.descriptionSnippet),publishedAt:null,channelId:r.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId||null,channelTitle:text(r.ownerText),thumbnails:r.thumbnail?.thumbnails||[]},statistics:{viewCount:String(parseCount(r.viewCountText)),likeCount:"0",commentCount:"0"},_public:true,_meta:{duration:text(r.lengthText),publishedText:text(r.publishedTimeText)}});
  });
  if(!out.length){
    const ids=[...new Set([...String(await getHtml(`https://www.youtube.com/results?search_query=${encodeURIComponent(keyword)}`)).matchAll(/"videoId":"([\w-]{11})"/g)].map(x=>x[1]))].slice(0,limit);
    for(const id of ids) out.push({id,snippet:{title:"",description:"",publishedAt:null},statistics:{viewCount:"0",likeCount:"0",commentCount:"0"},_public:true});
  }
  return {items:out,totalResults:null,source:"youtube_public"};
}
export async function getPublicChannel(channelId){
  const html=await getHtml(`https://www.youtube.com/channel/${encodeURIComponent(channelId)}/videos`);
  const data=extractInitialData(await html);
  let channel=null; const videos=[]; const seen=new Set();
  if(data) walk(data,node=>{
    const h=node?.c4TabbedHeaderRenderer;
    if(h && !channel) channel={id:channelId,snippet:{title:text(h.title),description:"",thumbnails:h.avatar?.thumbnails||[]},statistics:{subscriberCount:String(parseCount(h.subscriberCountText)),viewCount:"0",videoCount:"0"},_public:true};
    const r=node?.richItemRenderer?.content?.videoRenderer || node?.gridVideoRenderer;
    if(r?.videoId && !seen.has(r.videoId) && videos.length<50){seen.add(r.videoId); videos.push({id:r.videoId,snippet:{title:text(r.title),publishedAt:null,channelId,channelTitle:channel?.snippet?.title||""},statistics:{viewCount:String(parseCount(r.viewCountText)),likeCount:"0",commentCount:"0"},title:text(r.title),views:parseCount(r.viewCountText),publishedAt:"",_public:true});}
  });
  return {channel,videos};
}
export async function getPublicVideo(videoId){
  const html=await getHtml(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
  const title=(String(await html).match(/<meta name="title" content="([^"]+)"/)||[])[1]||"";
  return {id:videoId,snippet:{title:decode(title),description:"",publishedAt:null},statistics:{viewCount:"0",likeCount:"0",commentCount:"0"},contentDetails:{},status:{},_public:true};
}
