// Free tool: paste your existing Cloudflare Page Rule (URL pattern + settings), get back
// (1) a deterministic, code-generated draft filter expression for the modern Rules engine
// (no AI involved in the syntax-critical part — this is pure string logic, not a guess) and
// (2) an AI-grounded breakdown of which modern Rule product (Cache Rules / Redirect Rules /
// Configuration Rules / Origin Rules / Transform Rules) each of your enabled Page Rule
// settings needs to move to, using ONLY Cloudflare's own official migration mapping table
// (RAG-lite: the model is restricted to the table below, not allowed to invent a setting or
// target that isn't listed).
// Built by BURNING AUTONOMY (Richend Digital / NEXT GROWTH).
// Data source: official Cloudflare docs (developers.cloudflare.com/rules/reference/page-rules-migration/,
// /ruleset-engine/rules-language/fields/reference/, /ruleset-engine/rules-language/operators/),
// checked 2026-07-13.
// Positioning: Cloudflare stopped allowing new Page Rules in 2024-2025 and is auto-migrating
// existing ones through 2025-2026, which has generated many confused Cloudflare Community
// threads ("major confusion", "no good replacements", "manual or auto?"). The official docs
// have a static, generic setting-to-category table, but as of this check there is no
// interactive tool that takes a user's actual Page Rule (their specific settings + URL
// pattern) and tells them exactly which rules they personally need to (re)create.
// Unofficial, independent project — not affiliated with or endorsed by Cloudflare.

const SITE_URL = "https://cf-pagerule-migrator.burningbros.workers.dev";
const REPO_URL = "https://github.com/Richend0913/cf-pagerule-migrator";
const INDEXNOW_KEY = "0414b4639387cecb9decef74889416dd";
const DATA_CHECKED = "2026-07-13";
const AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8-fast";
const DAILY_AI_CALLS_CAP = 300;
const MAX_OUTPUT_TOKENS = 320;

// Sibling free tools from the same project (BURNING AUTONOMY Track C). Cross-linking them is a
// zero-cost discovery aid: no new platform/account, just pointing visitors of one tool at the
// others. Filtered so each site never lists itself.
const RELATED_TOOLS = [
  { url: "https://workers-ai-cost-calculator.burningbros.workers.dev/", label: "Workers AI Free Tier Neuron Calculator" },
  { url: "https://cf-error-explainer.burningbros.workers.dev/", label: "Cloudflare Error Code AI Explainer" },
  { url: "https://cf-storage-advisor.burningbros.workers.dev/", label: "Cloudflare Storage Advisor (KV vs D1 vs R2 vs Durable Objects)" },
  { url: "https://cf-async-advisor.burningbros.workers.dev/", label: "Cloudflare Async Advisor (Queues vs Workflows vs Durable Objects vs Cron)" },
  { url: "https://cf-pagerule-migrator.burningbros.workers.dev/", label: "Cloudflare Page Rule Migration Advisor" },
].filter((t) => t.url !== SITE_URL + "/");
const RELATED_TOOLS_HTML = RELATED_TOOLS.map(
  (t) => `<a href="${t.url}" target="_blank" rel="noopener">${t.label}</a>`
).join(" &middot; ");

// Self-hosted traffic counter (same shared KV namespace + pattern as the other Track C tools —
// see workers-ai-cost-calculator / cf-error-explainer / cf-storage-advisor / cf-async-advisor).
// Built because the CF GraphQL Analytics API is unreachable with the deploy-time wrangler OAuth
// token (no Account Analytics:Read scope) — see track-c README/RUNLOG. Best-effort only: not
// deduped by visitor, no bot-detection beyond a common-crawler/self-test User-Agent filter, and
// concurrent KV writes can undercount slightly (eventual consistency). /stats is left public on
// purpose: publishing real measured numbers, even small ones, is the point (STRATEGY.md —
// verifiable measured data is how an anonymous AI-run tool earns trust).
const ANALYTICS_SITE = "cf-pagerule-migrator";
const SELF_TEST_UA = /curl|Playwright|HeadlessChrome|python-requests|wrangler/i;
const KNOWN_BOT_UA = /discordbot|slackbot|telegrambot|whatsapp|facebookexternalhit|twitterbot|linkedinbot|skypeuripreview|redditbot|pinterest|iframely|googlebot|google-inspectiontool|bingbot|duckduckbot|yandexbot|baiduspider|applebot|petalbot|sogou|bytespider|ahrefsbot|semrushbot|mj12bot|dotbot|gptbot|chatgpt-user|ccbot|claudebot|anthropic-ai|perplexitybot|slurp|ia_archiver/i;

async function recordHit(env, request) {
  if (!env.ANALYTICS) return;
  if (request.headers.get("X-Skip-Analytics") === "1") return;
  const ua = request.headers.get("User-Agent") || "";
  if (SELF_TEST_UA.test(ua) || KNOWN_BOT_UA.test(ua)) return;
  const day = new Date().toISOString().slice(0, 10);
  const key = `hits:${ANALYTICS_SITE}:${day}`;
  const cur = await env.ANALYTICS.get(key);
  const n = (cur ? parseInt(cur, 10) || 0 : 0) + 1;
  await env.ANALYTICS.put(key, String(n), { expirationTtl: 60 * 60 * 24 * 400 });
}

async function statsResponse(env) {
  if (!env.ANALYTICS) {
    return new Response(JSON.stringify({ error: "analytics not configured" }), { status: 503, headers: { "Content-Type": "application/json; charset=utf-8" } });
  }
  const list = await env.ANALYTICS.list({ prefix: `hits:${ANALYTICS_SITE}:` });
  const by_day = {};
  for (const k of list.keys) {
    const day = k.name.split(":")[2];
    const v = await env.ANALYTICS.get(k.name);
    by_day[day] = parseInt(v, 10) || 0;
  }
  const total = Object.values(by_day).reduce((a, b) => a + b, 0);
  const body = JSON.stringify({
    site: ANALYTICS_SITE,
    method: "self-hosted KV request counter on the '/' route only. Excludes requests sending an X-Skip-Analytics header, a self-test User-Agent (curl/Playwright/etc), or a known link-preview/search-crawler bot (Discordbot, Googlebot, Bingbot, GPTBot, etc). Not deduped by visitor. Not exact — measured trend only.",
    by_day,
    total,
  }, null, 2);
  return new Response(body, { headers: { "Content-Type": "application/json; charset=utf-8" } });
}

// Official Page Rules -> modern Rules migration mapping, verbatim from Cloudflare's own
// migration guide (developers.cloudflare.com/rules/reference/page-rules-migration/), checked
// 2026-07-13. [Page Rule setting, target Rule product ("N/A" = fully deprecated, no direct
// replacement)]
const PAGERULE_MAP = [
  ["Always Use HTTPS", "Redirect Rules (Single Redirects)"],
  ["Automatic HTTPS Rewrites", "Configuration Rules"],
  ["Browser Cache TTL", "Cache Rules"],
  ["Browser Integrity Check", "Configuration Rules"],
  ["Bypass Cache on Cookie", "Cache Rules"],
  ["Cache By Device Type", "Cache Rules"],
  ["Cache Deception Armor", "Cache Rules"],
  ["Cache Level", "Cache Rules"],
  ["Cache on Cookie", "Cache Rules"],
  ["Cache TTL By Status Code", "Cache Rules"],
  ["Custom Cache Key", "Cache Rules"],
  ["Disable Apps", "Configuration Rules"],
  ["Disable Performance", "N/A — deprecated, no direct replacement"],
  ["Disable Railgun", "N/A — deprecated, no direct replacement"],
  ["Disable Security", "N/A — deprecated, no direct replacement"],
  ["Disable Zaraz", "Configuration Rules"],
  ["Edge Cache TTL", "Cache Rules"],
  ["Email Obfuscation", "Configuration Rules"],
  ["Forwarding URL", "Redirect Rules (Single Redirects)"],
  ["Host Header Override", "Origin Rules"],
  ["IP Geolocation Header", "Transform Rules (Managed Transforms)"],
  ["Opportunistic Encryption", "Configuration Rules"],
  ["Origin Cache Control", "Cache Rules"],
  ["Origin Error Page Pass-thru", "Cache Rules"],
  ["Polish", "Configuration Rules"],
  ["Query String Sort", "Cache Rules"],
  ["Resolve Override", "Origin Rules"],
  ["Respect Strong ETags", "Cache Rules"],
  ["Response Buffering", "N/A — deprecated, no direct replacement"],
  ["Rocket Loader", "Configuration Rules"],
  ["Security Level", "Configuration Rules"],
  ["True Client IP Header", "Transform Rules (Managed Transforms)"],
  ["SSL", "Configuration Rules"],
  ["Web Application Firewall", "N/A — deprecated, no direct replacement"],
];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Deterministic (non-AI) conversion of a Page Rule URL match pattern into a draft modern-Rules
// filter expression, using Cloudflare's own documented `wildcard` operator (available on every
// plan, unlike `matches` regex which needs Business+). This is plain string logic — no model
// call, no hallucination risk on the syntax that actually gets pasted into a live CDN config.
function pageRuleToFilterExpr(rawPattern) {
  let pattern = String(rawPattern || "").trim();
  if (!pattern) return null;
  pattern = pattern.replace(/^https?:\/\//i, "");
  const slashIdx = pattern.indexOf("/");
  let host = slashIdx === -1 ? pattern : pattern.slice(0, slashIdx);
  let path = slashIdx === -1 ? "/*" : pattern.slice(slashIdx);
  if (!path) path = "/*";
  const q = (s) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const hostExpr = host.includes("*") ? `(http.host wildcard "${q(host)}")` : `(http.host eq "${q(host)}")`;
  const pathExpr = `(http.request.uri.path wildcard "${q(path)}")`;
  return `${hostExpr} and ${pathExpr}`;
}

const PAGE_TITLE = "Cloudflare Page Rule Migration Advisor (AI-Powered) — Free, No Login";
const PAGE_DESC = "Free tool: paste your existing Cloudflare Page Rule (URL pattern + settings), get a draft modern-Rules filter expression plus an AI breakdown of which Cache/Redirect/Configuration/Origin/Transform Rule each setting needs — grounded in Cloudflare's own official migration table.";

const SCHEMA_JSON = JSON.stringify({
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "name": "Cloudflare Page Rule Migration Advisor",
      "url": SITE_URL,
      "description": PAGE_DESC,
      "applicationCategory": "DeveloperApplication",
      "operatingSystem": "Any (browser-based)",
      "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
      "browserRequirements": "Requires JavaScript",
      "isAccessibleForFree": true,
      "sameAs": [REPO_URL],
    },
    {
      "@type": "WebPage",
      "@id": SITE_URL + "/",
      "url": SITE_URL + "/",
      "name": PAGE_TITLE,
      "description": PAGE_DESC,
      "isPartOf": { "@type": "WebSite", "url": SITE_URL, "name": "Cloudflare Page Rule Migration Advisor" },
    },
  ],
});

const UI = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${PAGE_TITLE}</title>
<meta name="description" content="${PAGE_DESC}">
<link rel="canonical" href="${SITE_URL}/">
<meta property="og:type" content="website">
<meta property="og:title" content="${PAGE_TITLE}">
<meta property="og:description" content="${PAGE_DESC}">
<meta property="og:url" content="${SITE_URL}/">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${PAGE_TITLE}">
<meta name="twitter:description" content="${PAGE_DESC}">
<script type="application/ld+json">${SCHEMA_JSON}</script>
<style>
:root{--ac:#f6821f;--ac2:#f38020}
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,"Segoe UI",Roboto,sans-serif;background:#0c0f16;color:#e6e8ee;line-height:1.6}
.wrap{max-width:820px;margin:0 auto;padding:28px 16px 80px}
h1{font-size:1.4rem;margin:.2em 0 .1em}
.sub{color:#9aa3b2;font-size:.92rem;margin-bottom:10px}
.badge{display:inline-block;background:rgba(246,130,31,.15);color:#ffb066;border:1px solid rgba(246,130,31,.4);font-size:.72rem;padding:3px 10px;border-radius:999px;margin:2px 4px 2px 0}
.card{background:#121722;border:1px solid #202838;border-radius:14px;padding:20px;margin:18px 0}
label{display:block;font-size:.82rem;color:#9aa3b2;margin:14px 0 4px}
select,input,textarea{width:100%;background:#0c0f16;color:#e6e8ee;border:1px solid #2a3346;border-radius:8px;padding:10px;font:inherit;font-size:.95rem}
textarea{resize:vertical;min-height:90px}
code{background:#0c0f16;border:1px solid #2a3346;border-radius:6px;padding:2px 6px;font-size:.85em}
button{margin-top:18px;background:linear-gradient(135deg,var(--ac),var(--ac2));color:#0c0f16;font-weight:800;border:0;border-radius:10px;padding:12px 18px;font-size:.95rem;cursor:pointer;width:100%}
button:disabled{opacity:.6;cursor:wait}
.result{margin-top:18px;padding:16px;border-radius:10px;font-size:.92rem;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.35);white-space:pre-wrap}
.err{background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.4)}
.exprbox{margin-top:14px;padding:14px;border-radius:10px;background:#0c0f16;border:1px solid #2a3346;font-family:ui-monospace,Consolas,monospace;font-size:.86rem;word-break:break-all;white-space:pre-wrap}
.exprlabel{font-size:.78rem;color:#6b7385;margin-top:16px}
.warn{font-size:.78rem;color:#ffb066;margin-top:6px}
.hint{font-size:.78rem;color:#6b7385;margin-top:6px}
.foot{margin-top:26px;font-size:.8rem;color:#7b8496;border-top:1px solid #1c2432;padding-top:16px}
.foot a{color:#5eead4}
.src{font-size:.78rem;color:#6b7385;margin-top:10px}
.src a{color:#93c5fd}
</style></head><body>
<div class="wrap">
<h1>Cloudflare Page Rule Migration Advisor</h1>
<p class="sub">Paste your existing Page Rule's URL pattern and enabled settings. You get back a draft filter expression for the modern Rules engine (generated by plain code, not AI — so the syntax is deterministic) plus an AI breakdown of exactly which Cache / Redirect / Configuration / Origin / Transform Rule each of your settings needs to move to, grounded in Cloudflare's own official migration table.</p>
<span class="badge">Free</span><span class="badge">No login</span><span class="badge">Real AI inference</span><span class="badge">Grounded in official docs</span>

<div class="card">
<label for="pattern">Page Rule URL match pattern</label>
<input id="pattern" type="text" placeholder="e.g. example.com/images/*">

<label for="settings">Which Page Rule settings are enabled? (paste as you see them, one per line or comma-separated — typos/rephrasing are fine)</label>
<textarea id="settings" placeholder="e.g. Cache Level: Cache Everything&#10;Edge Cache TTL: 1 month&#10;Always Use HTTPS: On&#10;Security Level: Essentially Off"></textarea>

<button id="go">Migrate this Page Rule</button>
<div id="out"></div>
</div>

<div class="foot">
This tool has two independent parts: the <strong>filter expression</strong> under "Draft filter expression" is generated by
deterministic code from your URL pattern using Cloudflare's own <code>wildcard</code> operator syntax (no AI involved,
no hallucination risk) — always verify it in the Cloudflare dashboard's rule builder before deploying, since Page Rule
patterns and the modern Rules language aren't 100% identical in edge cases. The <strong>settings breakdown</strong> asks
<a href="https://developers.cloudflare.com/workers-ai/" target="_blank" rel="noopener">Cloudflare Workers AI</a>
to match your enabled settings against Cloudflare's own
<a href="https://developers.cloudflare.com/rules/reference/page-rules-migration/" target="_blank" rel="noopener">official Page Rules migration table</a>
and report only what's in that table — not invent behavior. Data checked ${DATA_CHECKED}.
This is an independent, unofficial tool — not affiliated with or endorsed by Cloudflare, Inc. No login, no tracking, no data stored.
Source code: <a href="${REPO_URL}" target="_blank" rel="noopener">open on GitHub</a>.
<br>More free Cloudflare tools from the same project: ${RELATED_TOOLS_HTML}
</div>
</div>
<script>
const patEl = document.getElementById('pattern');
const setEl = document.getElementById('settings');
const out = document.getElementById('out');
const btn = document.getElementById('go');

function renderResult(data) {
  out.innerHTML = '';
  if (data.filterExpr) {
    const lbl = document.createElement('div');
    lbl.className = 'exprlabel';
    lbl.textContent = 'Draft filter expression (code-generated, not AI):';
    out.appendChild(lbl);
    const box = document.createElement('div');
    box.className = 'exprbox';
    box.textContent = data.filterExpr;
    out.appendChild(box);
    const warn = document.createElement('div');
    warn.className = 'warn';
    warn.textContent = 'Verify in the Cloudflare dashboard rule builder before deploying.';
    out.appendChild(warn);
  }
  if (data.breakdown) {
    const lbl2 = document.createElement('div');
    lbl2.className = 'exprlabel';
    lbl2.textContent = 'Settings breakdown (AI, grounded in the official table):';
    out.appendChild(lbl2);
    const div = document.createElement('div');
    div.className = 'result';
    div.textContent = data.breakdown;
    out.appendChild(div);
  }
  if (data.note) {
    const src = document.createElement('div');
    src.className = 'src';
    src.textContent = data.note;
    out.appendChild(src);
  }
}

function renderError(msg) {
  out.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'result err';
  div.textContent = msg;
  out.appendChild(div);
}

btn.addEventListener('click', async () => {
  const pattern = patEl.value.trim();
  const settings = setEl.value.trim();
  if (!pattern && !settings) {
    renderError('Enter a URL pattern and/or your enabled settings first.');
    return;
  }
  btn.disabled = true; btn.textContent = 'Migrating…';
  try {
    const res = await fetch('/api/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern, settings }),
    });
    const data = await res.json();
    if (!res.ok) { renderError(data.error || 'Something went wrong.'); return; }
    renderResult(data);
  } catch (e) {
    renderError('Network error — please try again.');
  } finally {
    btn.disabled = false; btn.textContent = 'Migrate this Page Rule';
  }
});
</script>
</body></html>`;

const ROBOTS_TXT = `User-agent: *
Allow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${SITE_URL}/</loc><changefreq>monthly</changefreq><priority>1.0</priority></url>
</urlset>
`;

async function checkAndIncrementQuota(env) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `quota:${day}`;
  const current = parseInt((await env.QUOTA.get(key)) || "0", 10);
  if (current >= DAILY_AI_CALLS_CAP) return false;
  await env.QUOTA.put(key, String(current + 1), { expirationTtl: 172800 });
  return true;
}

function buildPrompt(settings) {
  const factSheet = PAGERULE_MAP.map(([name, target]) => `${name} -> ${target}`).join("\n");
  return [
    {
      role: "system",
      content:
        "You are a terse, accurate Cloudflare Page Rules migration advisor. Below is Cloudflare's own official " +
        "table mapping every Page Rule setting to the modern Rules product it must be recreated in. You must ONLY " +
        "use settings and targets from this table exactly as given — do not invent a setting that isn't listed, do " +
        "not invent a target Rule product not in the table, and never substitute a similarly-named setting for the " +
        "one actually mentioned. The table has several HTTPS/TLS-related rows that are easy to confuse but map to " +
        "DIFFERENT targets — match strictly on which one the user actually named: 'Always Use HTTPS' (forces a " +
        "redirect to HTTPS) -> Redirect Rules; 'Automatic HTTPS Rewrites' (rewrites http:// links in HTML to " +
        "https://) -> Configuration Rules; 'SSL' (sets the SSL/TLS mode, e.g. Full/Flexible) -> Configuration " +
        "Rules; 'Opportunistic Encryption' -> Configuration Rules. These four are NOT interchangeable — pick only " +
        "the one whose description matches what the user described. Given the user's free-text description of " +
        "their enabled Page " +
        "Rule settings (their wording may not exactly match the table's setting names — match by meaning, but once " +
        "matched use that exact row, not a neighboring one), work in two steps: first internally list each matched " +
        "setting as 'Setting Name -> Target' using the EXACT row from the table, then in your visible answer group " +
        "by target Rule product, e.g. 'You'll need 1 Cache Rule (for: Cache Level, Edge Cache TTL) and 1 " +
        "Configuration Rule (for: Security Level).' Clearly flag any setting whose target is 'N/A — deprecated' as " +
        "having no direct replacement. If a described setting doesn't match anything in the table, say so plainly " +
        "instead of guessing. If the input is empty or too vague to match anything, say what you'd need instead. " +
        "Keep the answer under 160 words, plain text, no markdown headers.",
    },
    {
      role: "user",
      content:
        `Official Page Rules -> modern Rules migration table:\n${factSheet}\n\n` +
        `User's enabled Page Rule settings (free text, may be informally worded):\n${settings || "(not provided)"}\n\n` +
        "Which modern Rule product(s) does each setting need to move to?",
    },
  ];
}

export default {
  async fetch(request, env, execCtx) {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "") {
      if (execCtx) execCtx.waitUntil(recordHit(env, request));
      return new Response(UI, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    if (url.pathname === "/stats") {
      return statsResponse(env);
    }
    if (url.pathname === "/robots.txt") {
      return new Response(ROBOTS_TXT, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (url.pathname === "/sitemap.xml") {
      return new Response(SITEMAP_XML, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
    }
    if (url.pathname === `/${INDEXNOW_KEY}.txt`) {
      return new Response(INDEXNOW_KEY, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }

    if (url.pathname === "/api/migrate" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return Response.json({ error: "Invalid request body." }, { status: 400 });
      }
      const pattern = String(body.pattern || "").slice(0, 300);
      const settings = String(body.settings || "").slice(0, 1500);
      if (!pattern.trim() && !settings.trim()) {
        return Response.json({ error: "Enter a URL pattern and/or your enabled settings first." }, { status: 200 });
      }

      const filterExpr = pattern.trim() ? pageRuleToFilterExpr(pattern) : null;

      if (!settings.trim()) {
        return Response.json({ filterExpr, note: "No settings entered — showing the filter expression only." });
      }

      const okQuota = await checkAndIncrementQuota(env);
      if (!okQuota) {
        return Response.json(
          {
            filterExpr,
            note: "This tool's free daily AI recommendation quota is used up for today — the filter expression above still works, but the settings breakdown will resume tomorrow.",
          },
          { status: 200 }
        );
      }

      try {
        const messages = buildPrompt(settings);
        const aiResp = await env.AI.run(AI_MODEL, { messages, max_tokens: MAX_OUTPUT_TOKENS });
        const breakdown = (aiResp && (aiResp.response || aiResp.result)) || "";
        if (!breakdown) throw new Error("empty AI response");
        return Response.json({ filterExpr, breakdown });
      } catch (e) {
        return Response.json(
          { filterExpr, note: "The AI model didn't respond — please try again in a moment." },
          { status: 200 }
        );
      }
    }

    return new Response("Not found", { status: 404 });
  },
};
