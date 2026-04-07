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
const PAL = ["#38BDF8", "#FBBF24", "#F87171", "#34D399", "#A78BFA", "#F472B6", "#6366F1", "#14B8A6", "#FB923C", "#818CF8", "#2DD4BF", "#E879F9"];

function parseNeeds(raw) { if (!raw) return []; if (Array.isArray(raw)) return raw.filter(Boolean); try { const p = JSON.parse(raw); return Array.isArray(p) ? p.filter(Boolean) : []; } catch { return []; } }
function pretty(s) { return s.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()); }
function pct(n, d) { return d ? Math.round(n / d * 100) : 0; }
function getMedian(arr) { if (!arr.length) return 1; const s = [...arr].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/*
  FORMULA 1: Need Opportunity Score — "Which needs are biggest?"
  35% Frequency (unique reviews / median — dynamic normalization)
  40% Frustration ((5 - avg rating) / 4 — HIGHEST weight, pain drives switching)
  20% Validation (avg helpful votes / max — brief requires this signal)
*/
function needScoreFn(count, avgRating, avgHelpful, medianCount, maxHelpful) {
  const fq = Math.min(count / Math.max(medianCount, 1), 1);
  const fr = Math.max(0, 5 - avgRating) / 4;
  const va = maxHelpful > 0 ? Math.min(avgHelpful / maxHelpful, 1) : 0;
  return Math.round((fq * 0.35 + fr * 0.40 + va * 0.20) * 1000) / 10;
}

/*
  FORMULA 2: Product Relevance Score (within a need) — "Which product to build?"
  45% Volume (reviews with this need for this product / max across products)
  35% Frustration ((5 - avg rating for need+product) / 4)
  20% Validation (avg helpful for need+product / max across products)
*/
function prodRelFn(count, avgRating, avgHelpful, maxCount, maxHelpful) {
  const vol = Math.min(count / Math.max(maxCount, 1), 1);
  const fr = Math.max(0, 5 - avgRating) / 4;
  const va = maxHelpful > 0 ? Math.min(avgHelpful / maxHelpful, 1) : 0;
  return Math.round((vol * 0.45 + fr * 0.35 + va * 0.20) * 1000) / 10;
}

/* ── Components ── */
const Pill = ({ text, color, bg }) => <span style={{ display: "inline-block", padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, color, background: bg, whiteSpace: "nowrap" }}>{text}</span>;
const Metric = ({ icon, label, value, sub, color = C.accent }) => (
  <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: "16px 20px", flex: "1 1 155px" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
      <span style={{ fontSize: 15 }}>{icon}</span>
      <span style={{ color: C.muted, fontSize: 10, textTransform: "uppercase", letterSpacing: 1.5, fontWeight: 700, fontFamily: "'Outfit',sans-serif" }}>{label}</span>
    </div>
    <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: -1, fontFamily: "'Outfit',sans-serif" }}>{value}</div>
    {sub && <div style={{ color: C.muted, fontSize: 10, marginTop: 2, fontFamily: "'Outfit',sans-serif" }}>{sub}</div>}
  </div>
);
const Tip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (<div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.text, fontFamily: "'Outfit',sans-serif", boxShadow: "0 8px 32px rgba(0,0,0,.4)" }}>
    <div style={{ fontWeight: 700, marginBottom: 3 }}>{label}</div>
    {payload.map((p, i) => <div key={i} style={{ color: p.color || C.accent }}>{p.name}: {typeof p.value === "number" ? Math.round(p.value * 100) / 100 : p.value}</div>)}
  </div>);
};
const Section = ({ title, sub, children, glow }) => (
  <div style={{ background: glow ? `linear-gradient(135deg,${C.accentDim},${C.violetDim})` : C.card, border: `1px solid ${glow ? C.accent + "33" : C.border}`, borderRadius: 14, padding: 22, marginBottom: 20 }}>
    {title && <div style={{ fontSize: 15, fontWeight: 700, marginBottom: sub ? 2 : 14, fontFamily: "'Outfit',sans-serif" }}>{title}</div>}
    {sub && <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, fontFamily: "'Outfit',sans-serif" }}>{sub}</div>}
    {children}
  </div>
);

/* ═══════════════════════ MAIN ═══════════════════════ */
export default function App() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [pagesLoaded, setPagesLoaded] = useState(0);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("exec");
  const [selNeed, setSelNeed] = useState(null);

  useEffect(() => {
    let stop = false;
    (async () => {
      const all = [];
      for (let b = 0; b < PAGES && !stop; b += 10) {
        const ps = [];
        for (let p = b; p < Math.min(b + 10, PAGES); p++)
          ps.push(fetch(`${API}?page=${p + 1}&limit=100`).then(r => r.json()).then(d => d.data || []).catch(() => []));
        const res = await Promise.all(ps);
        res.forEach(r => { if (Array.isArray(r)) all.push(...r); });
        if (stop) return;
        setPagesLoaded(Math.min(b + 10, PAGES));
        setProgress((Math.min(b + 10, PAGES) / PAGES) * 100);
      }
      if (!stop) { setReviews(all); setLoading(false); }
    })().catch(e => { if (!stop) setErr(e.message); });
    return () => { stop = true; };
  }, []);

  const A = useMemo(() => {
    if (!reviews.length) return null;
    const brands = _.uniq(reviews.map(r => r.competitor_brand).filter(Boolean)).sort();
    const products = _.uniq(reviews.map(r => r.product_reviewed).filter(Boolean)).sort();
    const totalReviews = reviews.length;
    const reviewsWithNeeds = reviews.filter(r => parseNeeds(r.detected_unmet_needs).length > 0).length;

    const flat = [];
    reviews.forEach(r => {
      parseNeeds(r.detected_unmet_needs).forEach(n => {
        flat.push({ need: n, brand: r.competitor_brand, product: r.product_reviewed, rating: r.rating, helpful: r.helpful_votes || 0, text: r.review_text || "", verified: r.verified_purchase, platform: r.platform });
      });
    });

    const groups = _.groupBy(flat, "need");
    const needCounts = Object.values(groups).map(items => items.length);
    const medianNeed = getMedian(needCounts);
    const needHelpfuls = Object.values(groups).map(items => _.meanBy(items, "helpful"));
    const maxNeedHelpful = Math.max(...needHelpfuls, 1);

    const needStats = Object.entries(groups).map(([need, items]) => {
      const count = items.length;
      const avgRating = _.meanBy(items, "rating");
      const avgHelpful = _.meanBy(items, "helpful");
      const brandsHit = _.uniq(items.map(i => i.brand));
      const productsHit = _.uniq(items.map(i => i.product));
      const verifiedPct = pct(items.filter(i => i.verified).length, count);
      const score = needScoreFn(count, avgRating, avgHelpful, medianNeed, maxNeedHelpful);

      const byProduct = _.groupBy(items, "product");
      const prodCounts = Object.values(byProduct).map(pi => pi.length);
      const maxProdCount = Math.max(...prodCounts, 1);
      const maxProdHelpful = Math.max(...Object.values(byProduct).map(pi => _.meanBy(pi, "helpful")), 1);
      const productBreakdown = Object.entries(byProduct).map(([prod, pItems]) => {
        return { product: prod, count: pItems.length, avgRating: _.meanBy(pItems, "rating"), avgHelpful: _.meanBy(pItems, "helpful"), brands: _.uniq(pItems.map(i => i.brand)), score: prodRelFn(pItems.length, _.meanBy(pItems, "rating"), _.meanBy(pItems, "helpful"), maxProdCount, maxProdHelpful) };
      }).sort((a, b) => b.score - a.score);

      const byBrand = _.groupBy(items, "brand");
      const brandBreakdown = Object.entries(byBrand).map(([brand, bItems]) => {
        return { brand, count: bItems.length, avgRating: _.meanBy(bItems, "rating"), avgHelpful: _.meanBy(bItems, "helpful") };
      }).sort((a, b) => a.avgRating - b.avgRating);

      const coNeeds = {};
      reviews.forEach(r => {
        const rNeeds = parseNeeds(r.detected_unmet_needs);
        if (rNeeds.includes(need)) rNeeds.forEach(n2 => { if (n2 !== need) coNeeds[n2] = (coNeeds[n2] || 0) + 1; });
      });
      const coOccurList = Object.entries(coNeeds).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const sampleReviews = [...items].sort((a, b) => b.helpful - a.helpful).slice(0, 8);

      return { need, count, avgRating, avgHelpful, brandsHit, productsHit, verifiedPct, score, productBreakdown, brandBreakdown, coOccurList, sampleReviews };
    }).sort((a, b) => b.score - a.score);

    const topRecs = needStats.slice(0, 3).map(n => {
      const topProd = n.productBreakdown[0];
      const topCoOccur = n.coOccurList.slice(0, 2).map(([name]) => name);
      const weakBrands = n.brandBreakdown.slice(0, 2);
      return { ...n, product: topProd, coNeeds: topCoOccur, weakBrands };
    });

    return { brands, products, totalReviews, reviewsWithNeeds, needStats, topRecs };
  }, [reviews]);

  const selNeedData = useMemo(() => A?.needStats.find(n => n.need === selNeed) || null, [A, selNeed]);

  if (err) return <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit',sans-serif", color: C.red }}><div style={{ textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 700 }}>Data load failed</div><div style={{ color: C.muted, marginTop: 8 }}>{err}</div></div></div>;

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit',sans-serif" }}>
      <div style={{ fontSize: 42, fontWeight: 800, color: C.accent, letterSpacing: -2, marginBottom: 6 }}>NEED-GAP FINDER</div>
      <div style={{ color: C.muted, fontSize: 13, letterSpacing: 4, textTransform: "uppercase", marginBottom: 48 }}>Consumer Intelligence Dashboard</div>
      <div style={{ width: 360, height: 4, background: C.border, borderRadius: 2, overflow: "hidden" }}><div style={{ width: `${progress}%`, height: "100%", background: `linear-gradient(90deg,${C.accent},${C.violet})`, borderRadius: 2, transition: "width .3s" }} /></div>
      <div style={{ color: C.muted, fontSize: 12, marginTop: 14 }}>Fetching reviews... {pagesLoaded}/{PAGES} pages ({Math.round(progress)}%)</div>
    </div>
  );
  if (!A) return null;

  const tabs = [
    { id: "exec", label: "Executive Summary", icon: "📋" },
    { id: "needs", label: "Need Rankings", icon: "📊" },
    { id: "deep", label: "Deep Dive", icon: "🔍" },
    { id: "rec", label: "Recommendation", icon: "🎯" },
  ];

  const rc = r => r < 2.5 ? C.red : r < 3.5 ? C.amber : C.green;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "'Outfit',sans-serif", color: C.text }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

      <header style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg,${C.accent},${C.violet})`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 15, color: C.bg }}>N</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -.5 }}>Consumer Need-Gap Finder</div>
            <div style={{ fontSize: 10, color: C.muted }}>{A.totalReviews.toLocaleString()} reviews · {A.brands.length} brands · {A.products.length} products · {A.needStats.length} needs</div>
          </div>
        </div>
        {selNeed && <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Pill text={pretty(selNeed)} color={C.bg} bg={C.accent} />
          <button onClick={() => setSelNeed(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>}
      </header>

      <div style={{ display: "flex", gap: 1, padding: "8px 24px 0", overflowX: "auto" }}>
        {tabs.map(t => <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "8px 14px", border: "none", borderRadius: "8px 8px 0 0", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'Outfit',sans-serif", background: tab === t.id ? C.card : "transparent", color: tab === t.id ? C.accent : C.muted, borderBottom: tab === t.id ? `2px solid ${C.accent}` : "2px solid transparent", whiteSpace: "nowrap" }}>{t.icon} {t.label}</button>)}
      </div>

      <main style={{ padding: "20px 24px 48px", maxWidth: 1400, margin: "0 auto" }}>

        {/* ═══ EXECUTIVE SUMMARY ═══ */}
        {tab === "exec" && <>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Executive Summary</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>The full picture in 30 seconds.</div>

          <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
            <Metric icon="📄" label="Total Reviews" value={A.totalReviews.toLocaleString()} />
            <Metric icon="😤" label="With Complaints" value={A.reviewsWithNeeds.toLocaleString()} sub={`${pct(A.reviewsWithNeeds, A.totalReviews)}% of all reviews`} color={C.red} />
            <Metric icon="🏷️" label="Brands" value={A.brands.length} color={C.violet} />
            <Metric icon="🧴" label="Products" value={A.products.length} color={C.pink} />
            <Metric icon="⚡" label="Needs Found" value={A.needStats.length} color={C.amber} />
          </div>

          <Section title="Top 5 Unmet Needs" sub="35% frequency + 40% frustration + 20% validation (helpful votes)">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={A.needStats.slice(0, 5).map(n => ({ ...n, label: pretty(n.need) }))} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: C.border }} />
                <YAxis type="category" dataKey="label" width={200} tick={{ fill: C.text, fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="score" name="Score" radius={[0, 6, 6, 0]} barSize={24}>
                  {A.needStats.slice(0, 5).map((_, i) => <Cell key={i} fill={PAL[i]} fillOpacity={.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>

          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Top 3 Product Opportunities</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>For each top need: the best product to build, needs to bundle, and brands to target.</div>

          {A.topRecs.map((rec, ri) => (
            <div key={rec.need} style={{ background: ri === 0 ? `linear-gradient(135deg,${C.accentDim},${C.violetDim})` : C.card, border: `1px solid ${ri === 0 ? C.accent + "44" : C.border}`, borderRadius: 14, padding: 22, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: ri === 0 ? C.accent : C.muted, textTransform: "uppercase", letterSpacing: 2, fontWeight: 700, marginBottom: 6 }}>
                    {ri === 0 ? "🥇 Top Recommendation" : ri === 1 ? "🥈 Runner-Up" : "🥉 Third Option"}
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>
                    Build a better <span style={{ color: C.amber }}>{rec.product?.product || "—"}</span> that solves <span style={{ color: C.accent }}>"{pretty(rec.need)}"</span>
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 16 }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: PAL[ri] }}>{rec.score}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>Need Score</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
                {[["Reviews", rec.count, C.accent], ["Avg Rating", "★ " + rec.avgRating.toFixed(1), rc(rec.avgRating)], ["Avg Helpful", rec.avgHelpful.toFixed(0), C.violet], ["Verified", rec.verifiedPct + "%", rec.verifiedPct > 70 ? C.green : C.amber]].map(([l, v, c]) => (
                  <div key={l}><div style={{ fontSize: 9, color: C.muted, textTransform: "uppercase" }}>{l}</div><div style={{ fontSize: 15, fontWeight: 700, color: c }}>{v}</div></div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Best Product</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.amber }}>{rec.product?.product || "—"}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{rec.product?.count} reviews · ★ {rec.product?.avgRating?.toFixed(1)} · Score {rec.product?.score}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Bundle With</div>
                  {rec.coNeeds.length > 0 ? rec.coNeeds.map(n => <div key={n} style={{ fontSize: 12, marginBottom: 2 }}>{pretty(n)}</div>) : <div style={{ fontSize: 12, color: C.muted }}>—</div>}
                </div>
                <div>
                  <div style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Target Brands</div>
                  {rec.weakBrands.map(b => <div key={b.brand} style={{ fontSize: 12, marginBottom: 2 }}>{b.brand} <span style={{ color: C.red }}>★ {b.avgRating.toFixed(1)}</span></div>)}
                </div>
              </div>
              <button onClick={() => { setSelNeed(rec.need); setTab("deep"); }} style={{ marginTop: 12, background: "transparent", border: `1px solid ${C.accent}44`, borderRadius: 8, padding: "6px 16px", fontSize: 11, fontWeight: 600, color: C.accent, cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>Explore this need →</button>
            </div>
          ))}
        </>}

        {/* ═══ NEED RANKINGS ═══ */}
        {tab === "needs" && <>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Need Rankings</div>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>All {A.needStats.length} unmet needs scored and ranked. Click any to explore.</div>

          <Section title="Need Opportunity Scores" sub="35% frequency (median-normalized) + 40% frustration + 20% validation (helpful votes)">
            <ResponsiveContainer width="100%" height={Math.min(A.needStats.length * 38, 600)}>
              <BarChart data={A.needStats.map(n => ({ ...n, label: pretty(n.need) }))} layout="vertical" margin={{ left: 10, right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: C.border }} />
                <YAxis type="category" dataKey="label" width={210} tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip content={<Tip />} />
                <Bar dataKey="score" name="Score" radius={[0, 6, 6, 0]} barSize={22} cursor="pointer" onClick={(d) => { setSelNeed(d.need); setTab("deep"); }}>
                  {A.needStats.map((_, i) => <Cell key={i} fill={PAL[i % PAL.length]} fillOpacity={.85} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>

          <Section title="Detailed Scores">
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ background: C.surface }}>
                  {["#", "Need", "Score", "Reviews", "Avg Rating", "Avg Helpful", "Products", "Verified %"].map(h => (
                    <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: C.muted, fontWeight: 600, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, borderBottom: `1px solid ${C.border}` }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {A.needStats.map((n, i) => (
                    <tr key={n.need} onClick={() => { setSelNeed(n.need); setTab("deep"); }}
                      style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                      onMouseEnter={e => e.currentTarget.style.background = C.hover}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "8px 12px", fontWeight: 700, color: i < 3 ? C.accent : C.muted }}>{i + 1}</td>
                      <td style={{ padding: "8px 12px", fontWeight: 600 }}>{pretty(n.need)}</td>
                      <td style={{ padding: "8px 12px", fontWeight: 700, color: n.score > 70 ? C.accent : n.score > 50 ? C.amber : C.muted }}>{n.score}</td>
                      <td style={{ padding: "8px 12px" }}>{n.count}</td>
                      <td style={{ padding: "8px 12px", color: rc(n.avgRating) }}>★ {n.avgRating.toFixed(1)}</td>
                      <td style={{ padding: "8px 12px", color: C.violet, fontWeight: 600 }}>{n.avgHelpful.toFixed(0)}</td>
                      <td style={{ padding: "8px 12px" }}>{n.productsHit.length}</td>
                      <td style={{ padding: "8px 12px" }}><Pill text={`${n.verifiedPct}%`} color={n.verifiedPct > 70 ? C.green : C.amber} bg={n.verifiedPct > 70 ? C.greenDim : C.amberDim} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Opportunity Map" sub="X = frequency, Y = frustration. Top-right = biggest opportunities. Size = helpful votes.">
            <ResponsiveContainer width="100%" height={380}>
              <ScatterChart margin={{ left: 10, right: 20, top: 10, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis type="number" dataKey="count" name="Frequency" tick={{ fill: C.muted, fontSize: 10 }} axisLine={{ stroke: C.border }} label={{ value: "Frequency (reviews)", position: "bottom", fill: C.muted, fontSize: 10 }} />
                <YAxis type="number" dataKey="frust" name="Frustration" domain={[0, 5]} tick={{ fill: C.muted, fontSize: 10 }} axisLine={{ stroke: C.border }} label={{ value: "Frustration (5 - rating)", angle: -90, position: "insideLeft", fill: C.muted, fontSize: 10 }} />
                <ZAxis type="number" dataKey="avgHelpful" range={[40, 400]} name="Helpful" />
                <Tooltip content={({ active, payload }) => { if (!active || !payload?.length) return null; const d = payload[0].payload; return <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.text }}><div style={{ fontWeight: 700 }}>{pretty(d.need)}</div><div>Reviews: {d.count} · ★{d.avgRating?.toFixed(1)} · Helpful: {d.avgHelpful?.toFixed(0)} · Score: {d.score}</div></div> }} />
                <Scatter data={A.needStats.map(n => ({ ...n, frust: 5 - n.avgRating }))} fill={C.accent} fillOpacity={.6} cursor="pointer" onClick={(d) => { if (d?.need) { setSelNeed(d.need); setTab("deep"); } }} />
              </ScatterChart>
            </ResponsiveContainer>
          </Section>
        </>}

        {/* ═══ DEEP DIVE ═══ */}
        {tab === "deep" && <>
          {!selNeed ?
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Select a need to explore</div>
              <div style={{ color: C.muted, fontSize: 13, marginBottom: 20 }}>Go to Need Rankings or Executive Summary and click a need.</div>
              <button onClick={() => setTab("needs")} style={{ background: C.accent, color: C.bg, border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>Go to Need Rankings</button>
            </div>
            : selNeedData && <>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Deep Dive: {pretty(selNeed)}</div>
                <Pill text={`Score: ${selNeedData.score}`} color={C.bg} bg={C.accent} />
              </div>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 20 }}>Which products to build, which brands to target, what to bundle.</div>

              <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <Metric icon="📄" label="Reviews" value={selNeedData.count} />
                <Metric icon="⭐" label="Avg Rating" value={`★ ${selNeedData.avgRating.toFixed(1)}`} color={rc(selNeedData.avgRating)} />
                <Metric icon="👍" label="Avg Helpful" value={selNeedData.avgHelpful.toFixed(0)} color={C.violet} />
                <Metric icon="🏷️" label="Brands" value={selNeedData.brandsHit.length} color={C.pink} />
                <Metric icon="🧴" label="Products" value={selNeedData.productsHit.length} color={C.amber} />
                <Metric icon="✓" label="Verified" value={`${selNeedData.verifiedPct}%`} color={selNeedData.verifiedPct > 70 ? C.green : C.amber} />
              </div>

              <Section title={`Which products should you build to solve "${pretty(selNeed)}"?`} sub="Product Relevance Score = 45% volume + 35% frustration + 20% validation.">
                <ResponsiveContainer width="100%" height={Math.min(selNeedData.productBreakdown.length * 36, 500)}>
                  <BarChart data={selNeedData.productBreakdown.map(p => ({ ...p, label: p.product }))} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: C.border }} />
                    <YAxis type="category" dataKey="label" width={180} tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Bar dataKey="score" name="Relevance Score" radius={[0, 5, 5, 0]} barSize={20}>
                      {selNeedData.productBreakdown.map((_, i) => <Cell key={i} fill={PAL[(i + 3) % PAL.length]} fillOpacity={.85} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Section>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14, marginBottom: 20 }}>
                {selNeedData.productBreakdown.slice(0, 8).map((p, pi) => (
                  <div key={p.product} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18, fontWeight: 800, color: PAL[(pi + 3) % PAL.length] }}>{p.score}</span>
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{p.product}</span>
                      </div>
                      <Pill text={`★ ${p.avgRating.toFixed(1)}`} color={rc(p.avgRating)} bg={p.avgRating < 2.5 ? C.redDim : C.amberDim} />
                    </div>
                    <div style={{ fontSize: 11, color: C.muted }}>{p.count} reviews · Avg helpful: {p.avgHelpful.toFixed(0)} · {p.brands.length} brands</div>
                  </div>
                ))}
              </div>

              <Section title={`Which brands are worst at "${pretty(selNeed)}"?`} sub="Sorted by avg rating when this need is mentioned. Lowest = steal their customers first.">
                <ResponsiveContainer width="100%" height={Math.max(selNeedData.brandBreakdown.length * 30, 150)}>
                  <BarChart data={selNeedData.brandBreakdown.map(b => ({ ...b, label: b.brand }))} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                    <XAxis type="number" domain={[0, 5]} tick={{ fill: C.muted, fontSize: 11 }} axisLine={{ stroke: C.border }} />
                    <YAxis type="category" dataKey="label" width={160} tick={{ fill: C.text, fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Bar dataKey="avgRating" name="Avg Rating" radius={[0, 5, 5, 0]} barSize={18}>
                      {selNeedData.brandBreakdown.map((b, i) => <Cell key={i} fill={rc(b.avgRating)} fillOpacity={.8} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Section>

              {selNeedData.coOccurList.length > 0 &&
                <Section title="Frequently Co-Occurring Needs" sub={`When customers mention "${pretty(selNeed)}", they also mention these. Bundle them in one product.`}>
                  {selNeedData.coOccurList.slice(0, 8).map(([coNeed, count], i) => (
                    <div key={coNeed} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${C.border}` }}>
                      <span style={{ fontWeight: 700, color: i < 3 ? C.accent : C.muted, width: 20 }}>{i + 1}</span>
                      <Pill text={pretty(selNeed)} color={C.accent} bg={C.accentDim} />
                      <span style={{ color: C.muted }}>+</span>
                      <Pill text={pretty(coNeed)} color={C.violet} bg={C.violetDim} />
                      <span style={{ marginLeft: "auto", fontWeight: 700 }}>{count} reviews</span>
                    </div>
                  ))}
                </Section>
              }

              <Section title="Sample Reviews" sub="Sorted by helpful votes (most validated first).">
                {selNeedData.sampleReviews.slice(0, 6).map((it, idx) => (
                  <div key={idx} style={{ background: C.surface, borderRadius: 8, padding: "10px 14px", marginBottom: 8, fontSize: 12, borderLeft: `3px solid ${rc(it.rating)}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: C.accent }}>{it.brand} — {it.product}</span>
                      <div style={{ display: "flex", gap: 10 }}>
                        <span style={{ color: rc(it.rating) }}>★ {it.rating}</span>
                        <span style={{ color: C.violet }}>👍 {it.helpful}</span>
                        {it.verified ? <Pill text="Verified" color={C.green} bg={C.greenDim} /> : null}
                      </div>
                    </div>
                    <div style={{ color: C.muted, lineHeight: 1.5 }}>{it.text.slice(0, 280)}{it.text.length > 280 ? "..." : ""}</div>
                  </div>
                ))}
              </Section>
            </>}
        </>}

        {/* ═══ RECOMMENDATION ═══ */}
        {tab === "rec" && <>
          {!selNeed ?
            <div style={{ textAlign: "center", padding: "80px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Select a need first</div>
              <button onClick={() => setTab("needs")} style={{ background: C.accent, color: C.bg, border: "none", borderRadius: 8, padding: "10px 24px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>Go to Need Rankings</button>
            </div>
            : selNeedData && (() => {
              const topProd = selNeedData.productBreakdown[0];
              const topCoOccur = selNeedData.coOccurList.slice(0, 3);
              const bundled = topCoOccur.map(([name]) => name);
              const weakBrands = selNeedData.brandBreakdown.slice(0, 3);
              return <>
                <Section glow>
                  <div style={{ fontSize: 10, color: C.accent, textTransform: "uppercase", letterSpacing: 3, fontWeight: 700, marginBottom: 12 }}>🎯 Product Launch Recommendation</div>
                  <h2 style={{ fontSize: 24, fontWeight: 800, color: C.text, margin: "0 0 20px", letterSpacing: -.8, lineHeight: 1.3 }}>
                    Launch a better <span style={{ color: C.amber }}>{topProd?.product || "product"}</span> that solves <span style={{ color: C.accent }}>"{pretty(selNeed)}"</span>
                    {bundled.length > 0 && <span style={{ color: C.muted, fontWeight: 500 }}>, bundled with {bundled.map(n => pretty(n)).join(" & ")}</span>}
                  </h2>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 10, color: C.accent, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Primary Need</div>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{pretty(selNeed)}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Score {selNeedData.score}/100 · {selNeedData.count} reviews · ★ {selNeedData.avgRating.toFixed(1)} · {selNeedData.avgHelpful.toFixed(0)} avg helpful · {selNeedData.verifiedPct}% verified</div>
                    </div>
                    <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: 14 }}>
                      <div style={{ fontSize: 10, color: C.amber, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 4 }}>Product to Build</div>
                      <div style={{ fontSize: 20, fontWeight: 800 }}>{topProd?.product || "—"}</div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>Relevance {topProd?.score}/100 · {topProd?.count} reviews · ★ {topProd?.avgRating?.toFixed(1)} · {topProd?.avgHelpful?.toFixed(0)} avg helpful</div>
                    </div>
                  </div>
                </Section>

                <Section title="Why this need?">
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
                    <strong style={{ color: C.accent }}>{pretty(selNeed)}</strong> scored <strong style={{ color: C.accent }}>{selNeedData.score}/100</strong> — #{A.needStats.findIndex(n => n.need === selNeed) + 1} of {A.needStats.length} needs. It appears in <strong style={{ color: C.text }}>{selNeedData.count}</strong> reviews across <strong style={{ color: C.text }}>{selNeedData.brandsHit.length}</strong> brands. When mentioned, avg rating drops to <strong style={{ color: C.red }}>★ {selNeedData.avgRating.toFixed(1)}</strong> and gets <strong style={{ color: C.violet }}>{selNeedData.avgHelpful.toFixed(0)} avg helpful votes</strong>. {selNeedData.verifiedPct}% from verified purchases.
                  </div>
                </Section>

                <Section title="Why this product?">
                  <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.8 }}>
                    Among products where "{pretty(selNeed)}" appears, <strong style={{ color: C.amber }}>{topProd?.product}</strong> scored highest at <strong style={{ color: C.amber }}>{topProd?.score}/100</strong> with <strong style={{ color: C.text }}>{topProd?.count}</strong> reviews, avg rating <strong style={{ color: C.red }}>★ {topProd?.avgRating?.toFixed(1)}</strong>, and <strong style={{ color: C.violet }}>{topProd?.avgHelpful?.toFixed(0)} avg helpful votes</strong>.
                  </div>
                </Section>

                {bundled.length > 0 && <Section title="Bundle these needs" sub="Co-occur frequently — one product solving all maximizes differentiation.">
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
                    <Pill text={pretty(selNeed)} color={C.bg} bg={C.accent} />
                    {bundled.map((n, i) => <span key={n} style={{ display: "contents" }}><span style={{ color: C.muted }}>+</span><Pill text={pretty(n)} color={C.bg} bg={PAL[(i + 2) % PAL.length]} /></span>)}
                  </div>
                  {topCoOccur.map(([coNeed, count], i) => (
                    <div key={i} style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{pretty(selNeed)} + {pretty(coNeed)}: <strong style={{ color: C.text }}>{count} reviews mention both</strong></div>
                  ))}
                </Section>}

                <Section title="Target these brands" sub="Lowest rated for this need — their customers switch first.">
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                    {weakBrands.map(b => (
                      <div key={b.brand} style={{ background: C.surface, borderRadius: 10, padding: 14, textAlign: "center" }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{b.brand}</div>
                        <div style={{ fontSize: 24, fontWeight: 800, color: C.red, marginTop: 4 }}>★ {b.avgRating.toFixed(1)}</div>
                        <div style={{ fontSize: 11, color: C.muted }}>{b.count} reviews · {b.avgHelpful.toFixed(0)} avg helpful</div>
                      </div>
                    ))}
                  </div>
                </Section>

                <Section title="Methodology">
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div style={{ background: C.surface, borderRadius: 10, padding: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 8 }}>Formula 1: Need Opportunity Score</div>
                      <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>"Which needs are biggest?"</div>
                      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                        <strong>35% Frequency</strong> — Reviews with this need, median-normalized.<br />
                        <strong>40% Frustration</strong> — (5 − avg rating) ÷ 4. Highest weight: pain drives switching.<br />
                        <strong>20% Validation</strong> — Avg helpful votes. Social proof.
                      </div>
                    </div>
                    <div style={{ background: C.surface, borderRadius: 10, padding: 16 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: C.amber, marginBottom: 8 }}>Formula 2: Product Relevance Score</div>
                      <div style={{ fontSize: 12, color: C.text, marginBottom: 4 }}>"Which product to build for this need?"</div>
                      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                        <strong>45% Volume</strong> — Reviews with this need for this product ÷ max.<br />
                        <strong>35% Frustration</strong> — (5 − avg rating) ÷ 4.<br />
                        <strong>20% Validation</strong> — Avg helpful for need+product.
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 12, lineHeight: 1.6 }}>
                    Both formulas include all 3 signals from the brief: frequency, frustration (low ratings), and validation (helpful votes). Brand spread was tested but removed — all needs appear across ~15 brands, adding no differentiation.
                  </div>
                </Section>
              </>;
            })()}
        </>}

      </main>
    </div>
  );
}
