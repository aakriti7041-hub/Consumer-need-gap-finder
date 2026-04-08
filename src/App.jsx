import { useState, useEffect, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, ScatterChart, Scatter, ZAxis
} from "recharts";
import _ from "lodash";

const API = "https://mosaicfellowship.in/api/data/npd/reviews";
const PAGES = 60;

const C = {
  bg: "#06090F", surface: "#0D1117", card: "#131A24", border: "#1C2536", hover: "#182030",
  accent: "#38BDF8", accentDim: "rgba(56,189,248,0.10)",
  amber: "#FBBF24", amberDim: "rgba(251,191,36,0.12)",
  red: "#F87171", redDim: "rgba(248,113,113,0.12)",
  green: "#34D399", greenDim: "rgba(52,211,153,0.12)",
  violet: "#A78BFA", violetDim: "rgba(167,139,250,0.12)",
  pink: "#F472B6", pinkDim: "rgba(244,114,182,0.12)",
  text: "#E2E8F0", muted: "#7C8DB5",
};
const PAL = ["#38BDF8","#FBBF24","#F87171","#34D399","#A78BFA","#F472B6","#6366F1","#14B8A6","#FB923C","#818CF8","#2DD4BF","#E879F9"];

function parseNeeds(raw){if(!raw)return[];if(Array.isArray(raw))return raw.filter(Boolean);try{const p=JSON.parse(raw);return Array.isArray(p)?p.filter(Boolean):[];}catch{return[];}}
function pretty(s){return s.replace(/_/g," ").replace(/\b\w/g,c=>c.toUpperCase());}
function pct(n,d){return d?Math.round(n/d*100):0;}
function getMedian(arr){if(!arr.length)return 1;const s=[...arr].sort((a,b)=>a-b);const m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}

function needScoreFn(count,avgRating,avgHelpful,medianCount,maxHelpful){
  const fq=Math.min(count/Math.max(medianCount,1),1);
  const fr=Math.max(0,5-avgRating)/4;
  const va=maxHelpful>0?Math.min(avgHelpful/maxHelpful,1):0;
  return Math.round((fq*0.35+fr*0.40+va*0.20)*1000)/10;
}

function prodRelFn(count,avgRating,avgHelpful,maxCount,maxHelpful){
  const vol=Math.min(count/Math.max(maxCount,1),1);
  const fr=Math.max(0,5-avgRating)/4;
  const va=maxHelpful>0?Math.min(avgHelpful/maxHelpful,1):0;
  return Math.round((vol*0.45+fr*0.35+va*0.20)*1000)/10;
}

const Pill=({text,color,bg})=><span style={{display:"inline-block",padding:"2px 10px",borderRadius:20,fontSize:11,fontWeight:600,color,background:bg,whiteSpace:"nowrap"}}>{text}</span>;
const Metric=({icon,label,value,sub,color=C.accent})=>(
  <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 20px",flex:"1 1 155px"}}>
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
      <span style={{fontSize:15}}>{icon}</span>
      <span style={{color:C.muted,fontSize:10,textTransform:"uppercase",letterSpacing:1.5,fontWeight:700,fontFamily:"'Outfit',sans-serif"}}>{label}</span>
    </div>
    <div style={{fontSize:26,fontWeight:800,color,letterSpacing:-1,fontFamily:"'Outfit',sans-serif"}}>{value}</div>
    {sub&&<div style={{color:C.muted,fontSize:10,marginTop:2,fontFamily:"'Outfit',sans-serif"}}>{sub}</div>}
  </div>
);
const Tip=({active,payload,label})=>{if(!active||!payload?.length)return null;return(<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.text,fontFamily:"'Outfit',sans-serif",boxShadow:"0 8px 32px rgba(0,0,0,.4)"}}><div style={{fontWeight:700,marginBottom:3}}>{label}</div>{payload.map((p,i)=><div key={i} style={{color:p.color||C.accent}}>{p.name}: {typeof p.value==="number"?Math.round(p.value*100)/100:p.value}</div>)}</div>);};
const Section=({title,sub,children,glow})=>(<div style={{background:glow?`linear-gradient(135deg,${C.accentDim},${C.violetDim})`:C.card,border:`1px solid ${glow?C.accent+"33":C.border}`,borderRadius:14,padding:22,marginBottom:20}}>{title&&<div style={{fontSize:15,fontWeight:700,marginBottom:sub?2:14,fontFamily:"'Outfit',sans-serif"}}>{title}</div>}{sub&&<div style={{fontSize:12,color:C.muted,marginBottom:14,fontFamily:"'Outfit',sans-serif"}}>{sub}</div>}{children}</div>);

const rc=r=>r<2.5?C.red:r<3.5?C.amber:C.green;

export default function App(){
  const [reviews,setReviews]=useState([]);
  const [loading,setLoading]=useState(true);
  const [progress,setProgress]=useState(0);
  const [pagesLoaded,setPagesLoaded]=useState(0);
  const [err,setErr]=useState(null);
  const [tab,setTab]=useState("exec");
  const [selNeed,setSelNeed]=useState(null);
  const [selProd,setSelProd]=useState(null);

  useEffect(()=>{
    let stop=false;
    (async()=>{
      const all=[];
      for(let b=0;b<PAGES&&!stop;b+=10){
        const ps=[];
        for(let p=b;p<Math.min(b+10,PAGES);p++)
          ps.push(fetch(`${API}?page=${p+1}&limit=100`).then(r=>r.json()).then(d=>d.data||[]).catch(()=>[]));
        const res=await Promise.all(ps);
        res.forEach(r=>{if(Array.isArray(r))all.push(...r);});
        if(stop)return;
        setPagesLoaded(Math.min(b+10,PAGES));
        setProgress((Math.min(b+10,PAGES)/PAGES)*100);
      }
      if(!stop){setReviews(all);setLoading(false);}
    })().catch(e=>{if(!stop)setErr(e.message);});
    return()=>{stop=true;};
  },[]);

  const A=useMemo(()=>{
    if(!reviews.length)return null;
    const brands=_.uniq(reviews.map(r=>r.competitor_brand).filter(Boolean)).sort();
    const products=_.uniq(reviews.map(r=>r.product_reviewed).filter(Boolean)).sort();
    const totalReviews=reviews.length;
    const reviewsWithNeeds=reviews.filter(r=>parseNeeds(r.detected_unmet_needs).length>0).length;

    const flat=[];
    reviews.forEach(r=>{
      parseNeeds(r.detected_unmet_needs).forEach(n=>{
        flat.push({need:n,brand:r.competitor_brand,product:r.product_reviewed,rating:r.rating,helpful:r.helpful_votes||0,text:r.review_text||"",verified:r.verified_purchase,platform:r.platform});
      });
    });

    const groups=_.groupBy(flat,"need");
    const needCounts=Object.values(groups).map(items=>items.length);
    const medianNeed=getMedian(needCounts);
    const needHelpfuls=Object.values(groups).map(items=>_.meanBy(items,"helpful"));
    const maxNeedHelpful=Math.max(...needHelpfuls,1);

    const needStats=Object.entries(groups).map(([need,items])=>{
      const count=items.length;
      const avgRating=_.meanBy(items,"rating");
      const avgHelpful=_.meanBy(items,"helpful");
      const brandsHit=_.uniq(items.map(i=>i.brand));
      const productsHit=_.uniq(items.map(i=>i.product));
      const verifiedPct=pct(items.filter(i=>i.verified).length,count);
      const score=needScoreFn(count,avgRating,avgHelpful,medianNeed,maxNeedHelpful);

      // Product breakdown within need
      const byProduct=_.groupBy(items,"product");
      const prodCounts=Object.values(byProduct).map(pi=>pi.length);
      const maxProdCount=Math.max(...prodCounts,1);
      const maxProdHelpful=Math.max(...Object.values(byProduct).map(pi=>_.meanBy(pi,"helpful")),1);
      const productBreakdown=Object.entries(byProduct).map(([prod,pItems])=>{
        const pBrands=_.uniq(pItems.map(i=>i.brand));
        // Brand breakdown within this PRODUCT+NEED combo
        const byBrandInProd=_.groupBy(pItems,"brand");
        const brandInProd=Object.entries(byBrandInProd).map(([brand,bItems])=>{
          return{brand,count:bItems.length,avgRating:_.meanBy(bItems,"rating"),avgHelpful:_.meanBy(bItems,"helpful")};
        }).sort((a,b)=>a.avgRating-b.avgRating);
        return{product:prod,count:pItems.length,avgRating:_.meanBy(pItems,"rating"),avgHelpful:_.meanBy(pItems,"helpful"),brands:pBrands,score:prodRelFn(pItems.length,_.meanBy(pItems,"rating"),_.meanBy(pItems,"helpful"),maxProdCount,maxProdHelpful),brandBreakdown:brandInProd,sampleReviews:[...pItems].sort((a,b)=>b.helpful-a.helpful).slice(0,6)};
      }).sort((a,b)=>b.score-a.score);

      // Co-occurrence
      const coNeeds={};
      reviews.forEach(r=>{
        const rNeeds=parseNeeds(r.detected_unmet_needs);
        if(rNeeds.includes(need))rNeeds.forEach(n2=>{if(n2!==need)coNeeds[n2]=(coNeeds[n2]||0)+1;});
      });
      const coOccurList=Object.entries(coNeeds).sort((a,b)=>b[1]-a[1]).slice(0,10);

      return{need,count,avgRating,avgHelpful,brandsHit,productsHit,verifiedPct,score,productBreakdown,coOccurList};
    }).sort((a,b)=>b.score-a.score);

    // Top 3 recs for exec summary
    const topRecs=needStats.slice(0,3).map(n=>{
      const topProd=n.productBreakdown[0];
      const topCoOccur=n.coOccurList.slice(0,2).map(([name])=>name);
      // Brands from the TOP PRODUCT (not need level)
      const weakBrands=topProd?topProd.brandBreakdown.slice(0,2):[];
      return{...n,product:topProd,coNeeds:topCoOccur,weakBrands};
    });

    return{brands,products,totalReviews,reviewsWithNeeds,needStats,topRecs};
  },[reviews]);

  const selNeedData=useMemo(()=>A?.needStats.find(n=>n.need===selNeed)||null,[A,selNeed]);
  const selProdData=useMemo(()=>selNeedData?.productBreakdown.find(p=>p.product===selProd)||null,[selNeedData,selProd]);

  if(err)return<div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',sans-serif",color:C.red}}><div style={{textAlign:"center"}}><div style={{fontSize:22,fontWeight:700}}>Data load failed</div><div style={{color:C.muted,marginTop:8}}>{err}</div></div></div>;

  if(loading)return(
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:"'Outfit',sans-serif"}}>
      <div style={{fontSize:42,fontWeight:800,color:C.accent,letterSpacing:-2,marginBottom:6}}>NEED-GAP FINDER</div>
      <div style={{color:C.muted,fontSize:13,letterSpacing:4,textTransform:"uppercase",marginBottom:48}}>Consumer Intelligence Dashboard</div>
      <div style={{width:360,height:4,background:C.border,borderRadius:2,overflow:"hidden"}}><div style={{width:`${progress}%`,height:"100%",background:`linear-gradient(90deg,${C.accent},${C.violet})`,borderRadius:2,transition:"width .3s"}}/></div>
      <div style={{color:C.muted,fontSize:12,marginTop:14}}>Fetching reviews... {pagesLoaded}/{PAGES} pages ({Math.round(progress)}%)</div>
    </div>
  );
  if(!A)return null;

  const tabs=[
    {id:"exec",label:"Executive Summary",icon:"📋"},
    {id:"needs",label:"Need Rankings",icon:"📊"},
    {id:"deep",label:"Deep Dive",icon:"🔍"},
    {id:"rec",label:"Recommendation",icon:"🎯"},
    {id:"method",label:"Methodology",icon:"📐"},
  ];

  return(
    <div style={{minHeight:"100vh",background:C.bg,fontFamily:"'Outfit',sans-serif",color:C.text}}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet"/>

      <header style={{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"12px 24px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:32,height:32,borderRadius:8,background:`linear-gradient(135deg,${C.accent},${C.violet})`,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:15,color:C.bg}}>N</div>
          <div>
            <div style={{fontSize:14,fontWeight:700,letterSpacing:-.5}}>Consumer Need-Gap Finder</div>
            <div style={{fontSize:10,color:C.muted}}>{A.totalReviews.toLocaleString()} reviews · {A.brands.length} brands · {A.products.length} products · {A.needStats.length} needs</div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {selNeed&&<><Pill text={pretty(selNeed)} color={C.bg} bg={C.accent}/>{selProd&&<><span style={{color:C.muted}}>→</span><Pill text={selProd} color={C.bg} bg={C.amber}/></>}<button onClick={()=>{setSelNeed(null);setSelProd(null);}} style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:14}}>✕</button></>}
        </div>
      </header>

      <div style={{display:"flex",gap:1,padding:"8px 24px 0",overflowX:"auto"}}>
        {tabs.map(t=><button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"8px 14px",border:"none",borderRadius:"8px 8px 0 0",cursor:"pointer",fontSize:12,fontWeight:600,fontFamily:"'Outfit',sans-serif",background:tab===t.id?C.card:"transparent",color:tab===t.id?C.accent:C.muted,borderBottom:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent",whiteSpace:"nowrap"}}>{t.icon} {t.label}</button>)}
      </div>

      <main style={{padding:"20px 24px 48px",maxWidth:1400,margin:"0 auto"}}>

        {/* ═══ EXECUTIVE SUMMARY ═══ */}
        {tab==="exec"&&<>
          <div style={{fontSize:16,fontWeight:700,marginBottom:2}}>Executive Summary</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:20}}>The full picture in 30 seconds.</div>

          <div style={{display:"flex",gap:12,marginBottom:24,flexWrap:"wrap"}}>
            <Metric icon="📄" label="Total Reviews" value={A.totalReviews.toLocaleString()}/>
            <Metric icon="😤" label="With Complaints" value={A.reviewsWithNeeds.toLocaleString()} sub={`${pct(A.reviewsWithNeeds,A.totalReviews)}% of all reviews`} color={C.red}/>
            <Metric icon="🏷️" label="Brands" value={A.brands.length} color={C.violet}/>
            <Metric icon="🧴" label="Products" value={A.products.length} color={C.pink}/>
            <Metric icon="⚡" label="Needs Found" value={A.needStats.length} color={C.amber}/>
          </div>

          <Section title="Top 5 Unmet Needs" sub="35% frequency + 40% frustration + 20% validation (helpful votes)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={A.needStats.slice(0,5).map(n=>({...n,label:pretty(n.need)}))} layout="vertical" margin={{left:10,right:30}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false}/>
                <XAxis type="number" domain={[0,100]} tick={{fill:C.muted,fontSize:11}} axisLine={{stroke:C.border}}/>
                <YAxis type="category" dataKey="label" width={200} tick={{fill:C.text,fontSize:12}} axisLine={false} tickLine={false}/>
                <Tooltip content={<Tip/>}/>
                <Bar dataKey="score" name="Score" radius={[0,6,6,0]} barSize={24}>
                  {A.needStats.slice(0,5).map((_,i)=><Cell key={i} fill={PAL[i]} fillOpacity={.85}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>

          <div style={{fontSize:15,fontWeight:700,marginBottom:4}}>Top 3 Product Opportunities</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:14}}>For each top need: the best product, needs to bundle, and brands to target (at the product level).</div>

          {A.topRecs.map((rec,ri)=>(
            <div key={rec.need} style={{background:ri===0?`linear-gradient(135deg,${C.accentDim},${C.violetDim})`:C.card,border:`1px solid ${ri===0?C.accent+"44":C.border}`,borderRadius:14,padding:22,marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                <div>
                  <div style={{fontSize:10,color:ri===0?C.accent:C.muted,textTransform:"uppercase",letterSpacing:2,fontWeight:700,marginBottom:6}}>
                    {ri===0?"🥇 Top Recommendation":ri===1?"🥈 Runner-Up":"🥉 Third Option"}
                  </div>
                  <div style={{fontSize:20,fontWeight:800,lineHeight:1.3}}>
                    Build a better <span style={{color:C.amber}}>{rec.product?.product||"—"}</span> that solves <span style={{color:C.accent}}>"{pretty(rec.need)}"</span>
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0,marginLeft:16}}>
                  <div style={{fontSize:28,fontWeight:800,color:PAL[ri]}}>{rec.score}</div>
                  <div style={{fontSize:10,color:C.muted}}>Need Score</div>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12,marginBottom:14}}>
                {[["Reviews",rec.count,C.accent],["Avg Rating","★ "+rec.avgRating.toFixed(1),rc(rec.avgRating)],["Avg Helpful",rec.avgHelpful.toFixed(0),C.violet],["Verified",rec.verifiedPct+"%",rec.verifiedPct>70?C.green:C.amber]].map(([l,v,c])=>(
                  <div key={l}><div style={{fontSize:9,color:C.muted,textTransform:"uppercase"}}>{l}</div><div style={{fontSize:15,fontWeight:700,color:c}}>{v}</div></div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:14}}>
                <div>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:4}}>Best Product</div>
                  <div style={{fontSize:14,fontWeight:700,color:C.amber}}>{rec.product?.product||"—"}</div>
                  <div style={{fontSize:10,color:C.muted}}>{rec.product?.count} reviews · ★ {rec.product?.avgRating?.toFixed(1)} · Score {rec.product?.score}</div>
                </div>
                <div>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:4}}>Bundle With</div>
                  {rec.coNeeds.length>0?rec.coNeeds.map(n=><div key={n} style={{fontSize:12,marginBottom:2}}>{pretty(n)}</div>):<div style={{fontSize:12,color:C.muted}}>—</div>}
                </div>
                <div>
                  <div style={{fontSize:10,color:C.muted,textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:4}}>Target Brands (for {rec.product?.product})</div>
                  {rec.weakBrands.map(b=><div key={b.brand} style={{fontSize:12,marginBottom:2}}>{b.brand} <span style={{color:C.red}}>★ {b.avgRating.toFixed(1)}</span></div>)}
                </div>
              </div>
              <button onClick={()=>{setSelNeed(rec.need);setSelProd(null);setTab("deep");}} style={{marginTop:12,background:"transparent",border:`1px solid ${C.accent}44`,borderRadius:8,padding:"6px 16px",fontSize:11,fontWeight:600,color:C.accent,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>Explore this need →</button>
            </div>
          ))}
        </>}

        {/* ═══ NEED RANKINGS ═══ */}
        {tab==="needs"&&<>
          <div style={{fontSize:16,fontWeight:700,marginBottom:2}}>Need Rankings</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:20}}>All {A.needStats.length} unmet needs scored and ranked. Click any to explore.</div>

          <Section title="Need Opportunity Scores" sub="35% frequency (median-normalized) + 40% frustration + 20% validation (helpful votes)">
            <ResponsiveContainer width="100%" height={Math.min(A.needStats.length*38,600)}>
              <BarChart data={A.needStats.map(n=>({...n,label:pretty(n.need)}))} layout="vertical" margin={{left:10,right:30}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false}/>
                <XAxis type="number" domain={[0,100]} tick={{fill:C.muted,fontSize:11}} axisLine={{stroke:C.border}}/>
                <YAxis type="category" dataKey="label" width={210} tick={{fill:C.text,fontSize:11}} axisLine={false} tickLine={false}/>
                <Tooltip content={<Tip/>}/>
                <Bar dataKey="score" name="Score" radius={[0,6,6,0]} barSize={22} cursor="pointer" onClick={(d)=>{setSelNeed(d.need);setSelProd(null);setTab("deep");}}>
                  {A.needStats.map((_,i)=><Cell key={i} fill={PAL[i%PAL.length]} fillOpacity={.85}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Detailed Scores">
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
                <thead><tr style={{background:C.surface}}>
                  {["#","Need","Score","Reviews","Avg Rating","Avg Helpful","Products","Verified %"].map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:"left",color:C.muted,fontWeight:600,fontSize:10,textTransform:"uppercase",letterSpacing:1,borderBottom:`1px solid ${C.border}`}}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {A.needStats.map((n,i)=>(
                    <tr key={n.need} onClick={()=>{setSelNeed(n.need);setSelProd(null);setTab("deep");}}
                      style={{borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}
                      onMouseEnter={e=>e.currentTarget.style.background=C.hover}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <td style={{padding:"8px 12px",fontWeight:700,color:i<3?C.accent:C.muted}}>{i+1}</td>
                      <td style={{padding:"8px 12px",fontWeight:600}}>{pretty(n.need)}</td>
                      <td style={{padding:"8px 12px",fontWeight:700,color:n.score>70?C.accent:n.score>50?C.amber:C.muted}}>{n.score}</td>
                      <td style={{padding:"8px 12px"}}>{n.count}</td>
                      <td style={{padding:"8px 12px",color:rc(n.avgRating)}}>★ {n.avgRating.toFixed(1)}</td>
                      <td style={{padding:"8px 12px",color:C.violet,fontWeight:600}}>{n.avgHelpful.toFixed(0)}</td>
                      <td style={{padding:"8px 12px"}}>{n.productsHit.length}</td>
                      <td style={{padding:"8px 12px"}}><Pill text={`${n.verifiedPct}%`} color={n.verifiedPct>70?C.green:C.amber} bg={n.verifiedPct>70?C.greenDim:C.amberDim}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Opportunity Map" sub="X = frequency, Y = frustration. Top-right = biggest opportunities. Size = helpful votes.">
            <ResponsiveContainer width="100%" height={380}>
              <ScatterChart margin={{left:10,right:20,top:10,bottom:20}}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border}/>
                <XAxis type="number" dataKey="count" name="Frequency" tick={{fill:C.muted,fontSize:10}} axisLine={{stroke:C.border}} label={{value:"Frequency (reviews)",position:"bottom",fill:C.muted,fontSize:10}}/>
                <YAxis type="number" dataKey="frust" name="Frustration" domain={[0,5]} tick={{fill:C.muted,fontSize:10}} axisLine={{stroke:C.border}} label={{value:"Frustration (5 - rating)",angle:-90,position:"insideLeft",fill:C.muted,fontSize:10}}/>
                <ZAxis type="number" dataKey="avgHelpful" range={[40,400]} name="Helpful"/>
                <Tooltip content={({active,payload})=>{if(!active||!payload?.length)return null;const d=payload[0].payload;return<div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.text}}><div style={{fontWeight:700}}>{pretty(d.need)}</div><div>Reviews: {d.count} · ★{d.avgRating?.toFixed(1)} · Helpful: {d.avgHelpful?.toFixed(0)} · Score: {d.score}</div></div>}}/>
                <Scatter data={A.needStats.map(n=>({...n,frust:5-n.avgRating}))} fill={C.accent} fillOpacity={.6} cursor="pointer" onClick={(d)=>{if(d?.need){setSelNeed(d.need);setSelProd(null);setTab("deep");}}}/>
              </ScatterChart>
            </ResponsiveContainer>
          </Section>
        </>}

        {/* ═══ DEEP DIVE ═══ */}
        {tab==="deep"&&<>
          {!selNeed?
            <div style={{textAlign:"center",padding:"80px 0"}}>
              <div style={{fontSize:48,marginBottom:16}}>🔍</div>
              <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Select a need to explore</div>
              <div style={{color:C.muted,fontSize:13,marginBottom:20}}>Go to Need Rankings or Executive Summary and click a need.</div>
              <button onClick={()=>setTab("needs")} style={{background:C.accent,color:C.bg,border:"none",borderRadius:8,padding:"10px 24px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>Go to Need Rankings</button>
            </div>
          :selNeedData&&<>
            <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:4}}>
              <div style={{fontSize:16,fontWeight:700}}>Deep Dive: {pretty(selNeed)}</div>
              <Pill text={`Score: ${selNeedData.score}`} color={C.bg} bg={C.accent}/>
            </div>
            <div style={{fontSize:12,color:C.muted,marginBottom:20}}>Which products to build, which brands to target, what to bundle.</div>

            <div style={{display:"flex",gap:12,marginBottom:20,flexWrap:"wrap"}}>
              <Metric icon="📄" label="Reviews" value={selNeedData.count}/>
              <Metric icon="⭐" label="Avg Rating" value={`★ ${selNeedData.avgRating.toFixed(1)}`} color={rc(selNeedData.avgRating)}/>
              <Metric icon="👍" label="Avg Helpful" value={selNeedData.avgHelpful.toFixed(0)} color={C.violet}/>
              <Metric icon="🏷️" label="Brands" value={selNeedData.brandsHit.length} color={C.pink}/>
              <Metric icon="✓" label="Verified" value={`${selNeedData.verifiedPct}%`} color={selNeedData.verifiedPct>70?C.green:C.amber}/>
            </div>

            {/* Products for this need */}
            <Section title={`Which products should you build to solve "${pretty(selNeed)}"?`} sub="Product Relevance Score = 45% volume + 35% frustration + 20% validation. Click a product to see brand-level data.">
              <ResponsiveContainer width="100%" height={Math.min(selNeedData.productBreakdown.length*36,500)}>
                <BarChart data={selNeedData.productBreakdown.map(p=>({...p,label:p.product}))} layout="vertical" margin={{left:10,right:30}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false}/>
                  <XAxis type="number" domain={[0,100]} tick={{fill:C.muted,fontSize:11}} axisLine={{stroke:C.border}}/>
                  <YAxis type="category" dataKey="label" width={180} tick={{fill:C.text,fontSize:11}} axisLine={false} tickLine={false}/>
                  <Tooltip content={<Tip/>}/>
                  <Bar dataKey="score" name="Relevance Score" radius={[0,5,5,0]} barSize={20} cursor="pointer" onClick={(d)=>setSelProd(d.product)}>
                    {selNeedData.productBreakdown.map((_,i)=><Cell key={i} fill={selProd===selNeedData.productBreakdown[i]?.product?C.amber:PAL[(i+3)%PAL.length]} fillOpacity={selProd===selNeedData.productBreakdown[i]?.product?1:.85}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Section>

            {/* Product cards */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(280px, 1fr))",gap:14,marginBottom:20}}>
              {selNeedData.productBreakdown.slice(0,8).map((p,pi)=>(
                <div key={p.product} onClick={()=>setSelProd(p.product)} style={{background:selProd===p.product?C.hover:C.card,border:`1px solid ${selProd===p.product?C.amber:C.border}`,borderRadius:14,padding:16,cursor:"pointer",transition:"all .15s"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <span style={{fontSize:18,fontWeight:800,color:PAL[(pi+3)%PAL.length]}}>{p.score}</span>
                      <span style={{fontWeight:700,fontSize:14}}>{p.product}</span>
                    </div>
                    <Pill text={`★ ${p.avgRating.toFixed(1)}`} color={rc(p.avgRating)} bg={p.avgRating<2.5?C.redDim:C.amberDim}/>
                  </div>
                  <div style={{fontSize:11,color:C.muted}}>{p.count} reviews · Avg helpful: {p.avgHelpful.toFixed(0)} · {p.brands.length} brands</div>
                </div>
              ))}
            </div>

            {/* ── BRAND VULNERABILITY — NOW AT PRODUCT LEVEL ── */}
            {selProdData&&<>
              <Section title={`Brand vulnerability for "${pretty(selNeed)}" in ${selProd}`} sub={`Which brands are worst at ${selProd} specifically for this need? These are the customers to steal.`}>
                <ResponsiveContainer width="100%" height={Math.max(selProdData.brandBreakdown.length*32,150)}>
                  <BarChart data={selProdData.brandBreakdown.map(b=>({...b,label:b.brand}))} layout="vertical" margin={{left:10,right:30}}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false}/>
                    <XAxis type="number" domain={[0,5]} tick={{fill:C.muted,fontSize:11}} axisLine={{stroke:C.border}}/>
                    <YAxis type="category" dataKey="label" width={160} tick={{fill:C.text,fontSize:11}} axisLine={false} tickLine={false}/>
                    <Tooltip content={<Tip/>}/>
                    <Bar dataKey="avgRating" name="Avg Rating" radius={[0,5,5,0]} barSize={18}>
                      {selProdData.brandBreakdown.map((b,i)=><Cell key={i} fill={rc(b.avgRating)} fillOpacity={.8}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))",gap:10,marginTop:14}}>
                  {selProdData.brandBreakdown.slice(0,5).map(b=>(
                    <div key={b.brand} style={{background:C.surface,borderRadius:8,padding:12,textAlign:"center"}}>
                      <div style={{fontSize:14,fontWeight:700}}>{b.brand}</div>
                      <div style={{fontSize:22,fontWeight:800,color:rc(b.avgRating),marginTop:4}}>★ {b.avgRating.toFixed(1)}</div>
                      <div style={{fontSize:10,color:C.muted}}>{b.count} reviews · {b.avgHelpful.toFixed(0)} avg helpful</div>
                    </div>
                  ))}
                </div>
              </Section>

              {/* Sample reviews for selected product+need */}
              <Section title={`Customer voice: "${pretty(selNeed)}" in ${selProd}`} sub="Sorted by helpful votes — most validated first.">
                {selProdData.sampleReviews.slice(0,5).map((it,idx)=>(
                  <div key={idx} style={{background:C.surface,borderRadius:8,padding:"10px 14px",marginBottom:8,fontSize:12,borderLeft:`3px solid ${rc(it.rating)}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontWeight:600,color:C.accent}}>{it.brand}</span>
                      <div style={{display:"flex",gap:10}}>
                        <span style={{color:rc(it.rating)}}>★ {it.rating}</span>
                        <span style={{color:C.violet}}>👍 {it.helpful}</span>
                        {it.verified?<Pill text="Verified" color={C.green} bg={C.greenDim}/>:null}
                      </div>
                    </div>
                    <div style={{color:C.muted,lineHeight:1.5}}>{it.text.slice(0,280)}{it.text.length>280?"...":""}</div>
                  </div>
                ))}
              </Section>
            </>}

            {!selProd&&<div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:22,marginBottom:20,textAlign:"center"}}>
              <div style={{fontSize:14,color:C.muted}}>👆 Click a product above to see brand-level vulnerability and sample reviews for that specific product + need combination.</div>
            </div>}

            {/* Co-occurrence */}
            {selNeedData.coOccurList.length>0&&
              <Section title="Frequently Co-Occurring Needs" sub={`When customers mention "${pretty(selNeed)}", they also mention these. Bundle them in one product.`}>
                {selNeedData.coOccurList.slice(0,8).map(([coNeed,count],i)=>(
                  <div key={coNeed} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${C.border}`}}>
                    <span style={{fontWeight:700,color:i<3?C.accent:C.muted,width:20}}>{i+1}</span>
                    <Pill text={pretty(selNeed)} color={C.accent} bg={C.accentDim}/>
                    <span style={{color:C.muted}}>+</span>
                    <Pill text={pretty(coNeed)} color={C.violet} bg={C.violetDim}/>
                    <span style={{marginLeft:"auto",fontWeight:700}}>{count} reviews</span>
                  </div>
                ))}
              </Section>
            }
          </>}
        </>}

        {/* ═══ RECOMMENDATION ═══ */}
        {tab==="rec"&&<>
          {!selNeed?
            <div style={{textAlign:"center",padding:"80px 0"}}>
              <div style={{fontSize:48,marginBottom:16}}>🔍</div>
              <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>Select a need first</div>
              <button onClick={()=>setTab("needs")} style={{background:C.accent,color:C.bg,border:"none",borderRadius:8,padding:"10px 24px",fontSize:13,fontWeight:700,cursor:"pointer",fontFamily:"'Outfit',sans-serif"}}>Go to Need Rankings</button>
            </div>
          :selNeedData&&(()=>{
            const topProd=selNeedData.productBreakdown[0];
            const topCoOccur=selNeedData.coOccurList.slice(0,3);
            const bundled=topCoOccur.map(([name])=>name);
            // Brands from TOP PRODUCT level
            const weakBrands=topProd?topProd.brandBreakdown.slice(0,3):[];
            return<>
              <Section glow>
                <div style={{fontSize:10,color:C.accent,textTransform:"uppercase",letterSpacing:3,fontWeight:700,marginBottom:12}}>🎯 Product Launch Recommendation</div>
                <h2 style={{fontSize:24,fontWeight:800,color:C.text,margin:"0 0 20px",letterSpacing:-.8,lineHeight:1.3}}>
                  Launch a better <span style={{color:C.amber}}>{topProd?.product||"product"}</span> that solves <span style={{color:C.accent}}>"{pretty(selNeed)}"</span>
                  {bundled.length>0&&<span style={{color:C.muted,fontWeight:500}}>, bundled with {bundled.map(n=>pretty(n)).join(" & ")}</span>}
                </h2>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:14}}>
                    <div style={{fontSize:10,color:C.accent,textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:4}}>Primary Need</div>
                    <div style={{fontSize:20,fontWeight:800}}>{pretty(selNeed)}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:4}}>Score {selNeedData.score}/100 · {selNeedData.count} reviews · ★ {selNeedData.avgRating.toFixed(1)} · {selNeedData.avgHelpful.toFixed(0)} avg helpful · {selNeedData.verifiedPct}% verified</div>
                  </div>
                  <div style={{background:"rgba(0,0,0,0.2)",borderRadius:10,padding:14}}>
                    <div style={{fontSize:10,color:C.amber,textTransform:"uppercase",letterSpacing:1,fontWeight:700,marginBottom:4}}>Product to Build</div>
                    <div style={{fontSize:20,fontWeight:800}}>{topProd?.product||"—"}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:4}}>Relevance {topProd?.score}/100 · {topProd?.count} reviews · ★ {topProd?.avgRating?.toFixed(1)} · {topProd?.avgHelpful?.toFixed(0)} avg helpful</div>
                  </div>
                </div>
              </Section>

              <Section title="Why this need?">
                <div style={{fontSize:13,color:C.muted,lineHeight:1.8}}>
                  <strong style={{color:C.accent}}>{pretty(selNeed)}</strong> scored <strong style={{color:C.accent}}>{selNeedData.score}/100</strong> — #{A.needStats.findIndex(n=>n.need===selNeed)+1} of {A.needStats.length} needs. It appears in <strong style={{color:C.text}}>{selNeedData.count}</strong> reviews across <strong style={{color:C.text}}>{selNeedData.brandsHit.length}</strong> brands. Avg rating when mentioned: <strong style={{color:C.red}}>★ {selNeedData.avgRating.toFixed(1)}</strong>. Avg helpful votes: <strong style={{color:C.violet}}>{selNeedData.avgHelpful.toFixed(0)}</strong>. {selNeedData.verifiedPct}% from verified purchases.
                </div>
              </Section>

              <Section title="Why this product?">
                <div style={{fontSize:13,color:C.muted,lineHeight:1.8}}>
                  Among products where "{pretty(selNeed)}" appears, <strong style={{color:C.amber}}>{topProd?.product}</strong> scored highest at <strong style={{color:C.amber}}>{topProd?.score}/100</strong> with <strong style={{color:C.text}}>{topProd?.count}</strong> reviews, avg rating <strong style={{color:C.red}}>★ {topProd?.avgRating?.toFixed(1)}</strong>, and <strong style={{color:C.violet}}>{topProd?.avgHelpful?.toFixed(0)} avg helpful votes</strong>. {topProd?.brands.length} brands sell this product.
                </div>
              </Section>

              {bundled.length>0&&<Section title="Bundle these needs" sub="Co-occur frequently — one product solving all maximizes differentiation.">
                <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:10}}>
                  <Pill text={pretty(selNeed)} color={C.bg} bg={C.accent}/>
                  {bundled.map((n,i)=><span key={n} style={{display:"contents"}}><span style={{color:C.muted}}>+</span><Pill text={pretty(n)} color={C.bg} bg={PAL[(i+2)%PAL.length]}/></span>)}
                </div>
                {topCoOccur.map(([coNeed,count],i)=>(
                  <div key={i} style={{fontSize:12,color:C.muted,marginBottom:4}}>{pretty(selNeed)} + {pretty(coNeed)}: <strong style={{color:C.text}}>{count} reviews mention both</strong></div>
                ))}
              </Section>}

              <Section title={`Target these brands (for ${topProd?.product})`} sub="Lowest rated brands for this specific product + need combination. Their customers switch first.">
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(200px, 1fr))",gap:12}}>
                  {weakBrands.map(b=>(
                    <div key={b.brand} style={{background:C.surface,borderRadius:10,padding:14,textAlign:"center"}}>
                      <div style={{fontSize:15,fontWeight:700}}>{b.brand}</div>
                      <div style={{fontSize:24,fontWeight:800,color:rc(b.avgRating),marginTop:4}}>★ {b.avgRating.toFixed(1)}</div>
                      <div style={{fontSize:11,color:C.muted}}>{b.count} reviews · {b.avgHelpful.toFixed(0)} avg helpful</div>
                    </div>
                  ))}
                </div>
              </Section>
            </>;
          })()}
        </>}

        {/* ═══ METHODOLOGY ═══ */}
        {tab==="method"&&<>
          <div style={{fontSize:16,fontWeight:700,marginBottom:2}}>Methodology</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:24}}>How we analyzed 6,000 reviews and arrived at our recommendations. Two scoring formulas, each answering a distinct question.</div>

          {/* The Problem */}
          <Section title="The Problem We're Solving">
            <div style={{fontSize:13,color:C.muted,lineHeight:1.8}}>
              We have 6,000 customer reviews from 15 competitor D2C brands. Each review has a rating (1-5 stars), helpful votes from other shoppers, and tagged unmet needs. The CPO wants to know: <strong style={{color:C.text}}>which unmet needs are the biggest opportunities, and what specific product should we build next?</strong>
            </div>
            <div style={{fontSize:13,color:C.muted,lineHeight:1.8,marginTop:12}}>
              The brief tells us: <em>"A need that is mentioned frequently, frustrates customers deeply (low ratings), and is validated by other shoppers (high helpful votes) is more valuable than a rare complaint with mixed sentiment."</em> Our formulas are designed around exactly these three signals.
            </div>
          </Section>

          {/* Formula 1 */}
          <Section title="Formula 1: Need Opportunity Score" sub="Answers: 'Which unmet needs are the biggest opportunities?'">
            <div style={{fontSize:14,fontWeight:700,color:C.accent,marginBottom:16,fontFamily:"monospace"}}>
              Score = Frequency × 0.35 + Frustration × 0.40 + Validation × 0.20
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:16}}>
              {/* Frequency */}
              <div style={{background:C.surface,borderRadius:12,padding:18,borderLeft:`4px solid ${C.accent}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.accent}}>Frequency — 35% weight</div>
                  <Pill text="35%" color={C.bg} bg={C.accent}/>
                </div>
                <div style={{fontSize:13,color:C.text,fontWeight:600,marginBottom:6}}>What it measures: How many reviews mention this need?</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:8}}>
                  We count the unique reviews that mention each need, then normalize by dividing by the <strong style={{color:C.text}}>median count across all needs</strong> (capped at 1.0). This is called dynamic median normalization.
                </div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:8}}>
                  <strong style={{color:C.text}}>Why median normalization instead of a fixed number?</strong> If we used a fixed baseline like "80 reviews," then a need with 80 mentions and one with 500 mentions would both max out at the same frequency score. That's misleading. By using the median, the formula adapts to the actual data distribution — needs well above the median score high, niche needs score low.
                </div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
                  <strong style={{color:C.text}}>Why 35% and not higher?</strong> Frequency tells us the SIZE of the opportunity — more mentions = more unhappy customers. But frequency alone can be misleading: a need mentioned 500 times with an average 3.5-star rating is a mild annoyance, not deep pain. We need frustration to confirm it's real. That's why frustration gets 40% (higher).
                </div>
              </div>

              {/* Frustration */}
              <div style={{background:C.surface,borderRadius:12,padding:18,borderLeft:`4px solid ${C.red}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.red}}>Frustration — 40% weight (highest)</div>
                  <Pill text="40%" color={C.bg} bg={C.red}/>
                </div>
                <div style={{fontSize:13,color:C.text,fontWeight:600,marginBottom:6}}>What it measures: How angry are customers when they mention this need?</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:8}}>
                  Calculated as: <span style={{fontFamily:"monospace",color:C.text}}>(5 − average rating) ÷ 4</span>. A 1-star average gives frustration = 1.0 (maximum). A 5-star average gives 0 (no frustration).
                </div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:8}}>
                  <strong style={{color:C.text}}>Why is this the HIGHEST weighted factor?</strong> Because the brief explicitly says "frustrates customers deeply (low ratings)" is a key signal. More importantly, from a business perspective: customers who leave 1-2 star reviews are the ones who <strong style={{color:C.text}}>actually switch brands</strong>. They're actively looking for alternatives. A customer who gives 3.5 stars is mildly annoyed but probably won't bother switching. Our target is the deeply frustrated — they're our acquisition pool.
                </div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
                  <strong style={{color:C.text}}>Example:</strong> If "Vegan Certification" has an avg rating of 2.1 → frustration = (5-2.1)/4 = 0.725. That's very high — customers who care about vegan certification are genuinely angry when products fail them.
                </div>
              </div>

              {/* Validation */}
              <div style={{background:C.surface,borderRadius:12,padding:18,borderLeft:`4px solid ${C.violet}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.violet}}>Validation — 20% weight</div>
                  <Pill text="20%" color={C.bg} bg={C.violet}/>
                </div>
                <div style={{fontSize:13,color:C.text,fontWeight:600,marginBottom:6}}>What it measures: Do OTHER shoppers agree this complaint matters?</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:8}}>
                  Calculated as: <span style={{fontFamily:"monospace",color:C.text}}>avg helpful votes ÷ max avg helpful across all needs</span>. This normalizes helpful votes so that the most validated need gets 1.0 and others score relative to it.
                </div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:8}}>
                  <strong style={{color:C.text}}>Why include this?</strong> The brief explicitly says: "validated by other shoppers (high helpful votes) is more valuable than a rare complaint with mixed sentiment." If a review gets 80 helpful votes, that means 80 other shoppers read it and said "yes, I have this problem too." That's social proof. A complaint with 2 helpful votes might be one person's unique experience.
                </div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
                  <strong style={{color:C.text}}>Why only 20% and not more?</strong> Helpful votes are partly influenced by platform (Amazon reviews get more views than Brand Website reviews) and review age (older reviews accumulate more votes). It's a supporting signal that confirms whether a complaint is widely felt, not the primary driver. The brief also lists it third, after frequency and frustration.
                </div>
              </div>
            </div>

            <div style={{marginTop:16,fontSize:12,color:C.muted,lineHeight:1.7}}>
              <strong style={{color:C.text}}>What we deliberately excluded:</strong> We tested Brand Spread (how many brands have this need) as a factor but removed it — all 15 needs appear across nearly all brands, so it adds zero differentiation to the ranking.
            </div>
          </Section>

          {/* Formula 2 */}
          <Section title="Formula 2: Product Relevance Score" sub="Answers: 'For a given need, which product type should we build?'">
            <div style={{fontSize:14,fontWeight:700,color:C.amber,marginBottom:16,fontFamily:"monospace"}}>
              Score = Volume × 0.45 + Frustration × 0.35 + Validation × 0.20
            </div>

            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:16}}>
              <div style={{background:C.surface,borderRadius:12,padding:18,borderLeft:`4px solid ${C.amber}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.amber}}>Volume — 45% weight (highest)</div>
                  <Pill text="45%" color={C.bg} bg={C.amber}/>
                </div>
                <div style={{fontSize:13,color:C.text,fontWeight:600,marginBottom:6}}>What it measures: How many people have this specific need for this specific product?</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:8}}>
                  Calculated as: reviews mentioning this need for this product ÷ max across all products for this need.
                </div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
                  <strong style={{color:C.text}}>Why is Volume highest here (45%) while Frequency was only 35% in Formula 1?</strong> In Formula 1, we compare needs against each other — and pain quality matters more than raw count. But in Formula 2, we've already selected the need. Now we're asking "which product has the most people with THIS problem?" Here, sheer volume of affected customers is the most important factor because we want to build the product where the most people will benefit.
                </div>
              </div>

              <div style={{background:C.surface,borderRadius:12,padding:18,borderLeft:`4px solid ${C.red}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.red}}>Frustration — 35% weight</div>
                  <Pill text="35%" color={C.bg} bg={C.red}/>
                </div>
                <div style={{fontSize:13,color:C.text,fontWeight:600,marginBottom:6}}>How angry are people about this need for this specific product?</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
                  Same calculation: (5 − avg rating) ÷ 4. Still important because two products might both have 40 reviews about the same need, but if one has avg rating 1.5 and the other 3.5, the first is where customers are actually leaving. Slightly lower weight than in Formula 1 because within a specific need, volume differentiates more than frustration.
                </div>
              </div>

              <div style={{background:C.surface,borderRadius:12,padding:18,borderLeft:`4px solid ${C.violet}`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <div style={{fontSize:14,fontWeight:700,color:C.violet}}>Validation — 20% weight</div>
                  <Pill text="20%" color={C.bg} bg={C.violet}/>
                </div>
                <div style={{fontSize:13,color:C.text,fontWeight:600,marginBottom:6}}>Do other shoppers validate this problem for this product?</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
                  Avg helpful votes for this need+product combination, normalized to the max across products. Same weight as Formula 1 — it's a confirmation signal, not a primary driver.
                </div>
              </div>
            </div>
          </Section>

          {/* Additional Analysis */}
          <Section title="Additional Analysis (No Formula — Raw Data)">
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
              <div style={{background:C.surface,borderRadius:12,padding:18}}>
                <div style={{fontSize:13,fontWeight:700,color:C.green,marginBottom:8}}>Need Co-Occurrence</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
                  We count how often two needs appear together in the SAME review. If "Vegan Certification" and "Allergen Labeling" co-occur in 150 reviews, that means building one product that solves both captures an entire frustrated customer segment. No formula — just raw count, sorted by frequency.
                </div>
              </div>
              <div style={{background:C.surface,borderRadius:12,padding:18}}>
                <div style={{fontSize:13,fontWeight:700,color:C.pink,marginBottom:8}}>Brand Vulnerability (at Product Level)</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
                  For each need + product combination, we show which brands have the lowest average rating. This is done at the <strong style={{color:C.text}}>product level, not the need level</strong> — because "Brand X is bad at Vegan Certification" is too vague. "Brand X's Plant Protein Shake has ★ 1.8 for Vegan Certification" is specific and actionable.
                </div>
              </div>
              <div style={{background:C.surface,borderRadius:12,padding:18}}>
                <div style={{fontSize:13,fontWeight:700,color:C.amber,marginBottom:8}}>Verified Purchase %</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
                  Shown as a signal confidence indicator. If 86% of reviews for a need are from verified buyers, we can trust the data. If only 30%, the signal might include noise from non-buyers. Not in the formula — but displayed alongside scores for transparency.
                </div>
              </div>
              <div style={{background:C.surface,borderRadius:12,padding:18}}>
                <div style={{fontSize:13,fontWeight:700,color:C.accent,marginBottom:8}}>Sample Reviews</div>
                <div style={{fontSize:12,color:C.muted,lineHeight:1.7}}>
                  For each product + need combination, we show actual customer reviews sorted by helpful votes (most validated first). This lets the CPO read the real voice of the customer and sanity-check the quantitative scores.
                </div>
              </div>
            </div>
          </Section>

          {/* Design Decisions */}
          <Section title="Key Design Decisions">
            <div style={{display:"grid",gridTemplateColumns:"1fr",gap:12}}>
              {[
                ["Need-First Approach","The brief says: 'find the most important unmet needs and rank them — then tell R&D which product to pursue.' We follow this exact order: rank needs first, then drill into products and brands within each need.","Why not product-first? Because starting with products limits thinking. The CPO hasn't decided whether to build a Face Wash or a Protein Shake — they want to know WHERE the biggest gap is, then figure out the product form."],
                ["No Category Analysis","The dataset has inconsistent product-to-category mappings (e.g., 'Iron Supplement' appears under both 'Hair Care' and 'Skin Care'). Category-level analysis would produce misleading results, so we dropped it entirely and go straight from needs to products.","Products are reliable (a 'Face Wash' is always a face wash). Categories are not."],
                ["Brand Analysis at Product Level","Brand vulnerability is shown for a specific need + product combination, NOT at the need level alone. 'Brand X is weak on Vegan Certification' is vague. 'Brand X's Plant Protein Shake scores ★ 1.8 on Vegan Certification' is specific and actionable.","This is how the CPO actually makes targeting decisions — at the product level."],
                ["Dynamic Median Normalization","Frequency is normalized to the median count across all needs, not a fixed number. This ensures the formula adapts to the data rather than using an arbitrary baseline.","Tested and confirmed: with a fixed baseline of 80, a niche need with 80 mentions scored the same as one with 500 mentions. With median normalization, the ranking correctly separates big from small."],
                ["No Double Counting","Volume counts unique reviews with complaints, not total need mentions. A review mentioning 4 needs counts as 1 unhappy customer, not 4 complaints.","The CPO cares about how many PEOPLE are unhappy, not how many complaint tags exist."],
              ].map(([title,explanation,rationale],i)=>(
                <div key={title} style={{background:C.surface,borderRadius:12,padding:18}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.text,marginBottom:6}}>{i+1}. {title}</div>
                  <div style={{fontSize:12,color:C.muted,lineHeight:1.7,marginBottom:6}}>{explanation}</div>
                  <div style={{fontSize:11,color:C.accent,lineHeight:1.6,fontStyle:"italic"}}>{rationale}</div>
                </div>
              ))}
            </div>
          </Section>
        </>}

      </main>
    </div>
  );
}
