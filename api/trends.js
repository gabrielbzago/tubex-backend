// ============================================================
// TubeX Google Trends Engine v1.0
// trends.js
// ============================================================

export default async function handler(req, res) {

    // ========================================================
    // 🌎 CORS
    // ========================================================

    const origin = req.headers.origin || "*";

    res.setHeader(
        "Access-Control-Allow-Origin",
        origin
    );

    res.setHeader(
        "Access-Control-Allow-Credentials",
        "true"
    );

    res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,POST,OPTIONS"
    );

    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type,x-api-key"
    );

    if (req.method === "OPTIONS") {

        return res.status(200).end();

    }

    // ========================================================
    // 🔐 API KEY
    // ========================================================

    if (

        req.headers["x-api-key"]

        !==

        process.env.API_KEY

    ){

        return res.status(403).json({

            success:false,

            error:"unauthorized"

        });

    }

    // ========================================================
    // METHOD
    // ========================================================

    if(req.method !== "POST"){

        return res.status(405).json({

            success:false,

            error:"method_not_allowed"

        });

    }

    try{

        // ====================================================
        // BODY
        // ====================================================

        const body =

            typeof req.body === "string"

            ?

            JSON.parse(req.body)

            :

            req.body;

        const keyword =

            String(

                body?.keyword || ""

            )

            .trim();

        const geo =

            String(

                body?.geo || "BR"

            )

            .toUpperCase();

        const days =

            Number(

                body?.days || 90

            );

        if(!keyword){

            return res.status(400).json({

                success:false,

                error:"keyword_required"

            });

        }

        // ====================================================
        // CACHE
        // ====================================================

        global.tubexTrendCache =

            global.tubexTrendCache || {};

        const cacheKey =

            `${keyword.toLowerCase()}_${geo}_${days}`;

        const cached =

            global.tubexTrendCache[cacheKey];

        if(

            cached

            &&

            cached.expires > Date.now()

        ){

            console.log(

                "⚡ GOOGLE TRENDS CACHE:",

                keyword

            );

            return res.json(

                cached.data

            );

        }

        console.log(

            "📈 GOOGLE TRENDS:",

            keyword

        );

        // ====================================================
        // HELPERS
        // ====================================================

        function normalizeKeyword(text=""){

            return text

                .normalize("NFD")

                .replace(/[\u0300-\u036f]/g,"")

                .toLowerCase()

                .trim();

        }

        function average(arr){

            if(!arr.length)

                return 0;

            return (

                arr.reduce(

                    (a,b)=>a+b,

                    0

                )

                /

                arr.length

            );

        }

        function last(arr){

            return arr.length

                ?

                arr[arr.length-1]

                :

                0;

        }

        function growth(oldValue,newValue){

            if(oldValue<=0)

                return 0;

            return (

                (

                    newValue-oldValue

                )

                /

                oldValue

            )*100;

        }

               // ====================================================
        // 🌎 GOOGLE TRENDS CLIENT
        // ====================================================

        const GOOGLE_HOST =
            "https://trends.google.com";

        async function fetchGoogle(url){

            const response = await fetch(url,{
                headers:{
                    "User-Agent":
                        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138 Safari/537.36",
                    "Accept":"application/json,text/plain,*/*",
                    "Accept-Language":"pt-BR,pt;q=0.9,en;q=0.8"
                }
            });

            if(!response.ok){

                throw new Error(
                    "google_http_"+response.status
                );

            }

            return await response.text();

        }

        // ====================================================
        // CRIA O EXPLORE REQUEST
        // ====================================================

        const exploreRequest = {

            comparisonItem:[
                {

                    keyword,

                    geo,

                    time:`today ${days}-d`

                }

            ],

            category:0,

            property:""

        };

        // ====================================================
        // PEDE O WIDGET AO GOOGLE
        // ====================================================

        const exploreURL =

            GOOGLE_HOST+

            "/trends/api/explore?hl=pt-BR&tz=180&req="+

            encodeURIComponent(

                JSON.stringify(

                    exploreRequest

                )

            );

        const rawExplore =

            await fetchGoogle(

                exploreURL

            );

        // ====================================================
        // REMOVE O PREFIXO DO GOOGLE
        // ====================================================

        const exploreJSON =

            JSON.parse(

                rawExplore.replace(

                    /^\)\]\}',?/,

                    ""

                )

            );

        if(

            !exploreJSON.widgets ||

            !exploreJSON.widgets.length

        ){

            throw new Error(

                "widgets_not_found"

            );

        }

        // ====================================================
        // LOCALIZA O WIDGET
        // INTEREST OVER TIME
        // ====================================================

        const timelineWidget =

            exploreJSON.widgets.find(

                w=>

                    w.id===

                    "TIMESERIES"

            );

        if(!timelineWidget){

            throw new Error(

                "timeline_widget_not_found"

            );

        }

        // ====================================================
        // LOCALIZA RELATED QUERIES
        // ====================================================

        const relatedQueriesWidget =

            exploreJSON.widgets.find(

                w=>

                    w.id===

                    "RELATED_QUERIES"

            );

        // ====================================================
        // LOCALIZA RELATED TOPICS
        // ====================================================

        const relatedTopicsWidget =

            exploreJSON.widgets.find(

                w=>

                    w.id===

                    "RELATED_TOPICS"

            );

        // ====================================================
        // LOCALIZA REGIONS
        // ====================================================

        const regionWidget =

            exploreJSON.widgets.find(

                w=>

                    w.id===

                    "GEO_MAP"

            );

        console.log(

            "✅ Widgets carregados"

        );

        console.log({

            timeline:!!timelineWidget,

            queries:!!relatedQueriesWidget,

            topics:!!relatedTopicsWidget,

            region:!!regionWidget

        });

        // ====================================================
        // MONTA URL DO TIMESERIES
        // ====================================================

        const timelineURL =

            GOOGLE_HOST+

            "/trends/api/widgetdata/multiline?hl=pt-BR&tz=180&req="+

            encodeURIComponent(

                JSON.stringify(

                    timelineWidget.request

                )

            )+

            "&token="+

            encodeURIComponent(

                timelineWidget.token

            );

        // ====================================================
        // BAIXA O HISTÓRICO
        // ====================================================

        const rawTimeline =

            await fetchGoogle(

                timelineURL

            );

        const timelineJSON =

            JSON.parse(

                rawTimeline.replace(

                    /^\)\]\}',?/,

                    ""

                )

            );

        const timelineData =

            timelineJSON.default

            ?.timelineData

            ||[];

        console.log(

            "📈 Dias retornados:",

            timelineData.length

        );

 
        // ====================================================
        // 📊 PROCESSA HISTÓRICO
        // ====================================================

        const interest = timelineData.map(item => ({

            date: Number(item.time),

            formattedDate: item.formattedTime,

            value: Number(item.value?.[0] || 0)

        }));

        const values =

            interest.map(i => i.value);

        // ====================================================
        // MÉDIAS
        // ====================================================

        const avg90 =

            average(values);

        const avg30 =

            average(

                values.slice(-30)

            );

        const avg7 =

            average(

                values.slice(-7)

            );

        const current =

            last(values);

        const peak =

            Math.max(...values);

        const minimum =

            Math.min(...values);

        // ====================================================
        // CRESCIMENTO
        // ====================================================

        const previous30 =

            average(

                values.slice(-60,-30)

            );

        const previous7 =

            average(

                values.slice(-14,-7)

            );

        const growth30 =

            growth(

                previous30,

                avg30

            );

        const growth7 =

            growth(

                previous7,

                avg7

            );

        // ====================================================
        // MOMENTUM
        // ====================================================

        let momentum = "stable";

        if(growth30 > 40){

            momentum = "exploding";

        }

        else if(growth30 > 15){

            momentum = "rising";

        }

        else if(growth30 < -25){

            momentum = "falling";

        }

        // ====================================================
        // TREND SCORE
        // ====================================================

        let trendScore = 0;

        // Popularidade atual
        trendScore += current * 0.35;

        // Média dos últimos 30 dias
        trendScore += avg30 * 0.25;

        // Pico recente
        trendScore += peak * 0.10;

        // Crescimento
        trendScore += Math.max(

            0,

            Math.min(

                100,

                growth30 + 50

            )

        ) * 0.30;

        trendScore =

            Math.round(

                trendScore

            );

        if(trendScore>100)

            trendScore=100;

        if(trendScore<0)

            trendScore=0;

        // ====================================================
        // CLASSIFICAÇÃO
        // ====================================================

        let level = "low";

        if(trendScore>=85){

            level="exploding";

        }

        else if(trendScore>=70){

            level="hot";

        }

        else if(trendScore>=50){

            level="good";

        }

        else if(trendScore>=30){

            level="stable";

        }

        else{

            level="low";

        }

        // ====================================================
        // DIREÇÃO
        // ====================================================

        let direction = "→";

        if(growth30>8)

            direction="↑";

        if(growth30>25)

            direction="↗";

        if(growth30>45)

            direction="🚀";

        if(growth30<-8)

            direction="↓";

        if(growth30<-25)

            direction="↘";

        // ====================================================
        // QUALIDADE DA TENDÊNCIA
        // ====================================================

        const volatility =

            peak-minimum;

        let consistency = 100;

        if(volatility>70)

            consistency=40;

        else if(volatility>50)

            consistency=60;

        else if(volatility>30)

            consistency=80;

        // ====================================================
        // OPORTUNIDADE
        // ====================================================

        let opportunityScore =

            Math.round(

                trendScore*0.75 +

                consistency*0.25

            );

        if(opportunityScore>100)

            opportunityScore=100;

        // ====================================================
        // DASHBOARD
        // ====================================================

        const dashboard={

            keyword,

            geo,

            period:days,

            trendScore,

            opportunityScore,

            current,

            average90:Math.round(avg90),

            average30:Math.round(avg30),

            average7:Math.round(avg7),

            peak,

            minimum,

            growth30:

                Number(

                    growth30.toFixed(1)

                ),

            growth7:

                Number(

                    growth7.toFixed(1)

                ),

            momentum,

            level,

            direction,

            consistency,

            history:interest

        };

        console.log("📊 Trend Dashboard");

        console.table({

            Trend:trendScore,

            Opportunity:opportunityScore,

            Growth30:growth30,

            Growth7:growth7,

            Momentum:momentum

        });

           // ====================================================
        // 🔥 RELATED QUERIES
        // ====================================================

        async function fetchWidgetData(widget){

            if(!widget)
                return null;

            const url =

                GOOGLE_HOST +

                "/trends/api/widgetdata/" +

                widget.id.toLowerCase() +

                "?hl=pt-BR&tz=180&req=" +

                encodeURIComponent(
                    JSON.stringify(widget.request)
                ) +

                "&token=" +

                encodeURIComponent(widget.token);

            const raw = await fetchGoogle(url);

            return JSON.parse(

                raw.replace(/^\)\]\}',?/, "")

            );

        }

        // ====================================================
        // BAIXA QUERIES
        // ====================================================

        let relatedQueries = {
            top:[],
            rising:[]
        };

        if(relatedQueriesWidget){

            try{

                const json =
                    await fetchWidgetData(
                        relatedQueriesWidget
                    );

                const ranked =
                    json.default?.rankedList || [];

                ranked.forEach(list=>{

                    if(list.rankedKeyword){

                        const items =
                            list.rankedKeyword.map(i=>({

                                query:
                                    i.query || "",

                                value:
                                    i.value || 0,

                                formatted:
                                    i.formattedValue || ""

                            }));

                        if(list.rankedKeywordType==="TOP"){

                            relatedQueries.top=items;

                        }

                        if(list.rankedKeywordType==="RISING"){

                            relatedQueries.rising=items;

                        }

                    }

                });

            }

            catch(err){

                console.error(

                    "Related Queries",

                    err

                );

            }

        }

        // ====================================================
        // RELATED TOPICS
        // ====================================================

        let relatedTopics={

            top:[],

            rising:[]

        };

        if(relatedTopicsWidget){

            try{

                const json=

                    await fetchWidgetData(

                        relatedTopicsWidget

                    );

                const ranked=

                    json.default?.rankedList || [];

                ranked.forEach(list=>{

                    if(!list.rankedTopic)
                        return;

                    const items=

                        list.rankedTopic.map(i=>({

                            title:

                                i.topic?.title || "",

                            type:

                                i.topic?.type || "",

                            value:

                                i.value || 0,

                            formatted:

                                i.formattedValue || ""

                        }));

                    if(list.rankedTopicType==="TOP"){

                        relatedTopics.top=items;

                    }

                    if(list.rankedTopicType==="RISING"){

                        relatedTopics.rising=items;

                    }

                });

            }

            catch(err){

                console.error(

                    "Related Topics",

                    err

                );

            }

        }

        // ====================================================
        // INTEREST BY REGION
        // ====================================================

        let regions=[];

        if(regionWidget){

            try{

                const json=

                    await fetchWidgetData(

                        regionWidget

                    );

                const geo=

                    json.default?.geoMapData || [];

                regions=

                    geo.map(r=>({

                        region:

                            r.geoName,

                        value:

                            r.value?.[0] || 0

                    }))

                    .sort(

                        (a,b)=>

                            b.value-a.value

                    )

                    .slice(0,20);

            }

            catch(err){

                console.error(

                    "Regions",

                    err

                );

            }

        }

        // ====================================================
        // ANÁLISE INTELIGENTE
        // ====================================================

        const insights=[];

        if(growth30>40){

            insights.push(

                "🚀 Tendência acelerando rapidamente."

            );

        }

        if(current>80){

            insights.push(

                "🔥 Interesse muito alto neste momento."

            );

        }

        if(opportunityScore>85){

            insights.push(

                "⭐ Excelente oportunidade para produzir conteúdo."

            );

        }

        if(relatedQueries.rising.length){

            insights.push(

                "📈 Existem buscas relacionadas crescendo."

            );

        }

        if(regions.length){

            insights.push(

                `🌎 Maior interesse em ${regions[0].region}.`

            );

        }

        // ====================================================
        // ADICIONA AO DASHBOARD
        // ====================================================

        dashboard.relatedQueries =
            relatedQueries;

        dashboard.relatedTopics =
            relatedTopics;

        dashboard.regions =
            regions;

        dashboard.insights =
            insights;

        console.log(

            "✅ Related Queries:",

            relatedQueries.top.length,

            relatedQueries.rising.length

        );

        console.log(

            "✅ Related Topics:",

            relatedTopics.top.length,

            relatedTopics.rising.length

        );

        console.log(

            "✅ Regions:",

            regions.length

        );

            // ====================================================
        // 🧠 TUBEX INTELLIGENCE ENGINE
        // ====================================================

        function normalize(value,min,max){

            if(max-min===0)
                return 0;

            return (

                (value-min)

                /

                (max-min)

            )*100;

        }

        // ====================================================
        // RISCO DE SATURAÇÃO
        // ====================================================

        let saturationScore = 0;

        if(current>95)
            saturationScore+=30;

        if(avg30>90)
            saturationScore+=25;

        if(peak>95)
            saturationScore+=20;

        if(growth30<5)
            saturationScore+=15;

        if(relatedQueries.top.length>15)
            saturationScore+=10;

        if(saturationScore>100)
            saturationScore=100;

        // ====================================================
        // CHANCE DE VIRALIZAÇÃO
        // ====================================================

        let viralScore = 0;

        viralScore += trendScore * 0.45;

        viralScore += Math.max(
            0,
            growth30
        ) * 0.35;

        viralScore += consistency * 0.20;

        viralScore =

            Math.round(

                viralScore

            );

        if(viralScore>100)
            viralScore=100;

        // ====================================================
        // DIFICULDADE
        // ====================================================

        let difficulty="Low";

        if(saturationScore>70){

            difficulty="High";

        }

        else if(saturationScore>40){

            difficulty="Medium";

        }

        // ====================================================
        // RECOMENDAÇÃO
        // ====================================================

        let recommendation="";

        if(

            opportunityScore>=90

        ){

            recommendation=

                "Produza este conteúdo imediatamente.";

        }

        else if(

            opportunityScore>=75

        ){

            recommendation=

                "Excelente oportunidade de crescimento.";

        }

        else if(

            opportunityScore>=60

        ){

            recommendation=

                "Boa oportunidade.";

        }

        else{

            recommendation=

                "Existem palavras melhores neste momento.";

        }

        // ====================================================
        // ALERTAS
        // ====================================================

        const alerts=[];

        if(

            growth30>50

        ){

            alerts.push({

                type:"success",

                title:"Explodindo",

                description:

                    "Esta busca está crescendo rapidamente."

            });

        }

        if(

            saturationScore>80

        ){

            alerts.push({

                type:"warning",

                title:"Mercado Saturado",

                description:

                    "A concorrência tende a ser alta."

            });

        }

        if(

            growth30<-30

        ){

            alerts.push({

                type:"danger",

                title:"Queda",

                description:

                    "O interesse está diminuindo."

            });

        }

        // ====================================================
        // ESTRELAS
        // ====================================================

        function stars(score){

            if(score>=95)

                return "★★★★★";

            if(score>=80)

                return "★★★★☆";

            if(score>=60)

                return "★★★☆☆";

            if(score>=40)

                return "★★☆☆☆";

            return "★☆☆☆☆";

        }

        // ====================================================
        // ADICIONA AO DASHBOARD
        // ====================================================

        dashboard.saturationScore =
            saturationScore;

        dashboard.viralScore =
            viralScore;

        dashboard.difficulty =
            difficulty;

        dashboard.recommendation =
            recommendation;

        dashboard.alerts =
            alerts;

        dashboard.stars =
            stars(opportunityScore);

        dashboard.engine="TubeX Trend Engine";

        dashboard.version="1.0";

        console.log("🧠 Intelligence");

        console.table({

            Trend:trendScore,

            Viral:viralScore,

            Saturation:saturationScore,

            Opportunity:opportunityScore

        });

        // ====================================================
        // CACHE
        // ====================================================

        global.tubexTrendCache[cacheKey]={

            expires:

                Date.now()

                +

                (1000*60*30),

            data:{

                success:true,

                ...dashboard

            }

        };

        // ====================================================
        // RESPONSE
        // ====================================================

        return res.json({

            success:true,

            ...dashboard

        });

    }

    catch(err){

        console.error(

            "GOOGLE TRENDS",

            err

        );

        return res.status(500).json({

            success:false,

            error:err.message

        });

    }

}