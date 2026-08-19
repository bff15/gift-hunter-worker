const NVIDIA_URL =
  "https://integrate.api.nvidia.com/v1/chat/completions";

const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";

// نفس ترتيب الشروط المستخدم في Gift Hunter.
const RULES = [
  {id:1,name:"لا يوجد شراء أو طلب مدفوع"},
  {id:2,name:"لا يوجد إيداع"},
  {id:3,name:"لا توجد رسوم أو عمولة"},
  {id:4,name:"لا يوجد اشتراك مدفوع"},
  {id:5,name:"لا توجد بطاقة دفع"},
  {id:6,name:"لا يلزم تثبيت تطبيق"},
  {id:7,name:"لا يلزم تنزيل لعبة"},
  {id:8,name:"لا يلزم امتلاك لعبة"},
  {id:9,name:"لا يلزم تسجيل الدخول"},
  {id:10,name:"لا يلزم إنشاء حساب"},
  {id:11,name:"لا يلزم تأكيد البريد"},
  {id:12,name:"لا يلزم رقم هاتف"},
  {id:13,name:"لا توجد CAPTCHA إلزامية"},
  {id:14,name:"لا يوجد KYC"},
  {id:15,name:"لا يلزم إثبات هوية"},
  {id:16,name:"لا يلزم جواز سفر أو وثائق"},
  {id:17,name:"لا يلزم رفع مستندات"},
  {id:18,name:"لا يلزم ربط محفظة"},
  {id:19,name:"لا يلزم توقيع رسالة"},
  {id:20,name:"لا توجد معاملة بلوكشين مطلوبة"},
  {id:21,name:"لا توجد إحالة مطلوبة"},
  {id:22,name:"لا يلزم دعوة أصدقاء"},
  {id:23,name:"لا يلزم متابعة حساب"},
  {id:24,name:"لا يلزم إعجاب"},
  {id:25,name:"لا يلزم مشاركة"},
  {id:26,name:"لا يلزم تعليق"},
  {id:27,name:"لا يلزم اشتراك بقناة"},
  {id:28,name:"لا يوجد استطلاع"},
  {id:29,name:"لا توجد مشاهدة فيديو إلزامية"},
  {id:30,name:"لا توجد إعلانات أو مشاهدة إعلانات"},
  {id:31,name:"لا توجد مهام إلزامية"},
  {id:32,name:"لا يعتمد على نقاط"},
  {id:33,name:"لا يعتمد على رصيد نقاط"},
  {id:34,name:"لا يعتمد على XP أو نظام تقدم"},
  {id:35,name:"المكافأة ليست لعبة أو عنصرًا غير مالي"},
  {id:36,name:"المكافأة مالية أو رقمية ذات قيمة"},
  {id:37,name:"يوجد تصريح صريح بأن المكافأة مجانية دون مقابل"}
];

const MAX_SOURCE_BYTES = 900000;
const MAX_TEXT = 28000;
const MAX_CANDIDATES_PER_SOURCE = 3;
const FETCH_TIMEOUT = 12000;

const MONEY_RE =
  /\b(?:cash|money|usd|dollar|eur|euro|gbp|prize|cash prize|gift card|crypto|cryptocurrency|token|coin|airdrop|usdt|usdc|btc|bitcoin|ethereum|eth|sol|solana|reward)\b|(?:نقد|مال|جائزة مالية|بطاقة هدية|عملة رقمية|توكن|عملة|إيردروب|مكافأة)/i;

const FREE_RE =
  /\b(?:free|completely free|100% free|no purchase necessary|no purchase required|free to enter|free entry)\b|(?:مجاني|مجانا|مجاناً|دون شراء|لا يلزم شراء|بدون شراء)/i;

const NEGATIVE_RE =
  /\b(?:purchase|buy|order|deposit|fee|gas|network fee|subscription fee|credit card|debit card|install|download app|download game|login|sign in|signup|sign-up|register|email verification|verify email|phone|sms|otp|captcha|recaptcha|hcaptcha|kyc|identity verification|passport|document upload|connect wallet|sign message|transaction|referral|refer a friend|invite friends|follow|like|share|comment|subscribe|survey|watch video|watch ads|advertisement|complete tasks|points|credits|xp)\b|(?:شراء|دفع|إيداع|رسوم|عمولة|اشتراك مدفوع|بطاقة ائتمان|تثبيت|تنزيل|تسجيل الدخول|إنشاء حساب|تأكيد البريد|رقم الهاتف|رسالة نصية|رمز|كابتشا|إثبات الهوية|جواز|رفع وثائق|ربط المحفظة|توقيع|معاملة|إحالة|دعوة أصدقاء|متابعة|إعجاب|مشاركة|تعليق|اشتراك|استطلاع|مشاهدة فيديو|إعلانات|مهام|نقاط|رصيد|خبرة)/i;

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400"
  };
}

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin)
    }
  });
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u0000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(html) {
  return cleanText(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  );
}

function decodeHtml(s) {
  return String(s || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function absoluteUrl(base, href) {
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

function sameOrRelatedHost(a, b) {
  try {
    const ah = new URL(a).hostname.replace(/^www\./, "");
    const bh = new URL(b).hostname.replace(/^www\./, "");
    return ah === bh;
  } catch {
    return false;
  }
}

function titleFromUrl(url) {
  try {
    const p = new URL(url).pathname.split("/").filter(Boolean).pop() || "";
    return decodeURIComponent(p)
      .replace(/\.(html?|php|aspx?)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase())
      .slice(0, 180);
  } catch {
    return "";
  }
}

function parseMeta(html, baseUrl) {
  const out = {};
  const metaRe = /<meta\b[^>]*(?:property|name)\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/gi;
  let m;

  while ((m = metaRe.exec(html))) {
    const key = m[1].toLowerCase();

    if (
      [
        "og:title",
        "og:description",
        "og:url",
        "description",
        "twitter:title",
        "twitter:description"
      ].includes(key)
    ) {
      out[key] = decodeHtml(m[2]);
    }
  }

  if (out["og:url"]) {
    out.url = absoluteUrl(baseUrl, out["og:url"]);
  }

  return out;
}

function extractJsonLd(html, baseUrl) {
  const items = [];
  const re =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let m;

  while ((m = re.exec(html))) {
    const raw = m[1].trim();

    if (!raw) continue;

    try {
      const data = JSON.parse(raw);
      const stack = Array.isArray(data) ? [...data] : [data];

      while (stack.length) {
        const x = stack.shift();

        if (!x || typeof x !== "object") continue;

        if (Array.isArray(x)) {
          stack.push(...x);
          continue;
        }

        if (x["@graph"] && Array.isArray(x["@graph"])) {
          stack.push(...x["@graph"]);
        }

        const type = Array.isArray(x["@type"])
          ? x["@type"].join(" ")
          : String(x["@type"] || "");

        const title = x.name || x.headline || x.title;
        const description = x.description || x.abstract || "";

        const url = absoluteUrl(
          baseUrl,
          x.url || x.mainEntityOfPage || ""
        );

        const text = cleanText(
          [
            title,
            description,
            x.text,
            x.offers?.price,
            x.offers?.priceCurrency
          ]
            .filter(Boolean)
            .join(" ")
        );

        if (
          title &&
          (url || MONEY_RE.test(text) || FREE_RE.test(text))
        ) {
          items.push({
            title: cleanText(title),
            description: cleanText(description),
            url: url || baseUrl,
            type: cleanText(type),
            sourceText: text
          });
        }
      }
    } catch {}
  }

  return items;
}

function extractAnchors(html, baseUrl) {
  const items = [];

  const re =
    /<a\b([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;

  let m;

  while ((m = re.exec(html))) {
    const href = absoluteUrl(baseUrl, m[2]);

    if (!href || !/^https?:\/\//i.test(href)) continue;

    if (
      /\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|rar)(?:$|\?)/i.test(href)
    ) {
      continue;
    }

    const anchorText = stripHtml(m[4]);
    const attrs = cleanText(`${m[1]} ${m[3]}`);

    const contextStart = Math.max(0, m.index - 900);
    const contextEnd = Math.min(
      html.length,
      re.lastIndex + 1400
    );

    const context = stripHtml(
      html.slice(contextStart, contextEnd)
    );

    const combined = cleanText(
      `${anchorText} ${attrs} ${context}`
    );

    const score =
      (MONEY_RE.test(combined) ? 4 : 0) +
      (FREE_RE.test(combined) ? 3 : 0) +
      (NEGATIVE_RE.test(combined) ? -2 : 0) +
      (anchorText.length >= 8 ? 1 : 0);

    if (score < 3) continue;

    items.push({
      title: anchorText || titleFromUrl(href),
      description: context.slice(0, 7000),
      url: href,
      type: "Discovered offer",
      sourceText: combined,
      score
    });
  }

  return items;
}

function dedupeCandidates(items) {
  const map = new Map();

  for (const item of items) {
    const url = item.url || "";

    if (!url) continue;

    let u;

    try {
      u = new URL(url);
      u.hash = "";
    } catch {
      continue;
    }

    if (
      /\/(?:login|signin|sign-in|signup|register|account|cart|checkout)\b/i.test(
        u.pathname
      )
    ) {
      continue;
    }

    const key = u.href;
    const existing = map.get(key);

    if (
      !existing ||
      Number(item.score || 0) >
        Number(existing.score || 0)
    ) {
      map.set(key, {
        ...item,
        url: key
      });
    }
  }

  return [...map.values()]
    .sort(
      (a, b) =>
        Number(b.score || 0) -
        Number(a.score || 0)
    )
    .slice(0, MAX_CANDIDATES_PER_SOURCE);
}

async function fetchText(url) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT
  );

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,

      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; GiftHunter/2.0; +https://workers.dev)"
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const contentType =
      res.headers.get("content-type") || "";

    if (
      contentType &&
      !/text\/html|application\/xhtml\+xml|text\/plain|application\/json/i.test(
        contentType
      )
    ) {
      throw new Error(
        `Unsupported content type: ${contentType}`
      );
    }

    const text = await res.text();

    return {
      finalUrl: res.url || url,
      html: text.slice(0, MAX_SOURCE_BYTES),
      contentType
    };
  } finally {
    clearTimeout(timer);
  }
}

function discoverCandidates(sourceUrl, html) {
  const meta = parseMeta(html, sourceUrl);
  const jsonLd = extractJsonLd(html, sourceUrl);
  const anchors = extractAnchors(html, sourceUrl);

  const sourceText =
    stripHtml(html).slice(0, MAX_TEXT);

  const all = [
    ...jsonLd.map(x => ({
      ...x,
      score: 5
    })),
    ...anchors
  ];

  if (
    MONEY_RE.test(sourceText) &&
    FREE_RE.test(sourceText)
  ) {
    all.push({
      title:
        meta["og:title"] ||
        meta["twitter:title"] ||
        titleFromUrl(sourceUrl),

      description:
        meta["og:description"] ||
        meta["twitter:description"] ||
        sourceText.slice(0, 7000),

      url: sourceUrl,

      type: "Source page offer",

      sourceText,

      score: 4
    });
  }

  return dedupeCandidates(all);
}

function buildPrompt(candidate) {
  const rulesText = RULES
    .map(r => `${r.id}. ${r.name}`)
    .join("\n");

  return `
أنت محقق عروض مجانية شديد الصرامة.

مهمتك ليست تخمين أن العرض مجاني.
يجب أن تثبت كل شرط من الشروط الـ37 من النص المتاح.

قواعد القرار:

1) PASS = الشرط مثبت بوضوح من النص.
2) FAIL = النص يثبت أن الشرط مخالف أو مطلوب.
3) UNKNOWN = لا توجد أدلة كافية.
4) أي UNKNOWN يعني رفض العرض.
5) أي FAIL يعني رفض العرض.
6) لا تعتبر كلمة "free" وحدها دليلًا على كل الشروط.
7) لا تفترض أن التسجيل مجاني أو أن الرسوم غير موجودة إذا لم يذكر المصدر ذلك.
8) يجب أن تكون المكافأة نفسها مالية أو عملة رقمية ذات قيمة.
9) يجب أن يكون العرض مجانيًا بالكامل دون مقابل.
10) أعد JSON فقط، بلا Markdown.

الشروط:

${rulesText}

العرض:

العنوان:
${cleanText(candidate.title)}

الرابط:
${candidate.url}

الوصف:
${cleanText(candidate.description)}

النوع:
${cleanText(candidate.type)}

نص الدليل:
${cleanText(candidate.sourceText).slice(0, MAX_TEXT)}

أعد:

{
  "eligible": false,
  "passed": 0,
  "failed": 0,
  "unknown": 0,
  "rules": [
    {
      "id": 1,
      "status": "PASS|FAIL|UNKNOWN",
      "evidence": "دليل قصير من النص"
    }
  ],
  "reason": "سبب مختصر"
}

يجب أن تحتوي rules على جميع الأرقام 1 إلى 37.
`;
}

async function askNvidia(env, messages) {
  if (!env.NVIDIA_API_KEY) {
    throw new Error(
      "NVIDIA_API_KEY is not configured"
    );
  }

  const res = await fetch(NVIDIA_URL, {
    method: "POST",

    headers: {
      "Authorization":
        `Bearer ${env.NVIDIA_API_KEY}`,

      "Accept":
        "application/json",

      "Content-Type":
        "application/json"
    },

    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,

      max_tokens: 12000,

      temperature: 1,

      top_p: 0.95,

      stream: false
    })
  });

  const text = await res.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = {
      raw: text
    };
  }

  if (!res.ok) {
    throw new Error(
      `NVIDIA HTTP ${res.status}: ${text.slice(0, 1200)}`
    );
  }

  return data;
}

function parseModelJson(content) {
  const cleaned = String(content || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first >= 0 && last > first) {
    try {
      return JSON.parse(
        cleaned.slice(first, last + 1)
      );
    } catch {}
  }

  return null;
}

function validateDecision(parsed) {
  const byId = new Map(
    Array.isArray(parsed?.rules)
      ? parsed.rules.map(x => [
          Number(x.id),
          x
        ])
      : []
  );

  const rules = RULES.map(rule => {
    const x = byId.get(rule.id);

    const status =
      x?.status === "PASS"
        ? "PASS"
        : x?.status === "FAIL"
        ? "FAIL"
        : "UNKNOWN";

    return {
      id: rule.id,
      name: rule.name,
      status,

      evidence:
        cleanText(x?.evidence).slice(0, 500)
    };
  });

  const failed =
    rules.filter(
      x => x.status === "FAIL"
    ).length;

  const unknown =
    rules.filter(
      x => x.status === "UNKNOWN"
    ).length;

  const passed =
    rules.filter(
      x => x.status === "PASS"
    ).length;

  return {
    eligible:
      passed === 37 &&
      failed === 0 &&
      unknown === 0,

    passed,
    failed,
    unknown,

    rules,

    reason:
      passed === 37
        ? "اجتاز جميع الشروط الـ37"
        : "رفض: لم يثبت كل شرط من الشروط الـ37"
  };
}

function cheapReject(candidate) {
  const text = cleanText(
    [
      candidate.title,
      candidate.description,
      candidate.sourceText,
      candidate.type
    ].join(" ")
  );

  if (!MONEY_RE.test(text)) {
    return {
      reject: true,
      reason:
        "لا يوجد دليل واضح على مكافأة مالية أو رقمية"
    };
  }

  if (!FREE_RE.test(text)) {
    return {
      reject: true,
      reason:
        "لا يوجد تصريح واضح بالمجانية"
    };
  }

  return {
    reject: false
  };
}

async function analyzeCandidate(
  env,
  candidate
) {
  const cheap =
    cheapReject(candidate);

  if (cheap.reject) {
    return {
      eligible: false,

      passed: 0,
      failed: 0,
      unknown: 37,

      rules: RULES.map(r => ({
        id: r.id,
        name: r.name,
        status: "UNKNOWN",
        evidence: cheap.reason
      })),

      reason: cheap.reason
    };
  }

  const data =
    await askNvidia(env, [
      {
        role: "system",
        content:
          "أنت محقق صارم. أعد JSON فقط ولا تخمن."
      },

      {
        role: "user",
        content:
          buildPrompt(candidate)
      }
    ]);

  const content =
    data?.choices?.[0]?.message?.content ||
    "";

  const parsed =
    parseModelJson(content);

  if (!parsed) {
    return {
      eligible: false,

      passed: 0,
      failed: 0,
      unknown: 37,

      rules: RULES.map(r => ({
        id: r.id,
        name: r.name,
        status: "UNKNOWN",
        evidence:
          "تعذر الحصول على قرار JSON موثوق"
      })),

      reason:
        "رفض آمن: تعذر التحقق"
    };
  }

  return validateDecision(parsed);
}

async function scanSource(
  env,
  source
) {
  try {
    const page =
      await fetchText(source.url);

    const candidates =
      discoverCandidates(
        page.finalUrl,
        page.html
      );

    const results = [];

    for (
      const candidate of candidates
    ) {
      try {
        let enriched = {
          ...candidate
        };

        if (
          candidate.url &&
          !sameOrRelatedHost(
            candidate.url,
            page.finalUrl
          )
        ) {
          continue;
        }

        if (
          candidate.url &&
          candidate.url !== page.finalUrl
        ) {
          try {
            const offerPage =
              await fetchText(
                candidate.url
              );

            const offerText =
              stripHtml(
                offerPage.html
              ).slice(
                0,
                MAX_TEXT
              );

            enriched = {
              ...candidate,

              url:
                offerPage.finalUrl ||
                candidate.url,

              description:
                cleanText(
                  candidate.description
                ) +
                " " +
                offerText.slice(
                  0,
                  7000
                ),

              sourceText:
                cleanText(
                  candidate.sourceText
                ) +
                " " +
                offerText
            };
          } catch {
            // نستخدم دليل صفحة المصدر فقط.
          }
        }

        const decision =
          await analyzeCandidate(
            env,
            enriched
          );

        results.push({
          title:
            cleanText(
              enriched.title
            ),

          description:
            cleanText(
              enriched.description
            ).slice(0, 5000),

          value:
            extractValue(
              enriched.sourceText
            ),

          type:
            cleanText(
              enriched.type ||
              "Financial/Crypto"
            ),

          expires:
            "غير محدد",

          url:
            enriched.url,

          source:
            source.name,

          ruleResults:
            decision.rules,

          verification:
            decision,

          eligible:
            decision.eligible
        });

      } catch {
        // فشل مرشح واحد لا يوقف بقية المصدر.
      }
    }

    return {
      source: source.name,
      url: source.url,

      candidatesFound:
        candidates.length,

      candidates:
        results
    };

  } catch (error) {
    return {
      source: source.name,
      url: source.url,

      candidatesFound: 0,

      candidates: [],

      error:
        String(error)
    };
  }
}

function extractValue(text) {
  const t =
    cleanText(text);

  const m =
    t.match(
      /(?:\$|USD|USDT|USDC|EUR|€|GBP|£)\s?\d+(?:[.,]\d+)?/i
    );

  return m
    ? m[0]
    : "";
}

async function handleScan(
  request,
  env,
  origin
) {
  let body;

  try {
    body =
      await request.json();
  } catch {
    return json(
      {
        ok: false,
        error:
          "Invalid JSON"
      },
      400,
      origin
    );
  }

  if (
    !Array.isArray(
      body?.urls
    )
  ) {
    return json(
      {
        ok: false,
        error:
          "urls must be an array"
      },
      400,
      origin
    );
  }

  if (
    body.urls.length > 12
  ) {
    return json(
      {
        ok: false,
        error:
          "Maximum 12 sources per scan request"
      },
      400,
      origin
    );
  }

  const sources =
    body.urls
      .map(x => ({
        name:
          cleanText(
            x?.name ||
            "Source"
          ),

        url:
          String(
            x?.url || ""
          ).trim()
      }))
      .filter(
        x =>
          /^https?:\/\//i.test(
            x.url
          )
      );

  const results = [];

  let totalCandidates = 0;

  for (
    const source of sources
  ) {
    const result =
      await scanSource(
        env,
        source
      );

    totalCandidates +=
      result.candidatesFound;

    results.push(
      result
    );
  }

  const candidates =
    results.flatMap(
      x =>
        x.candidates || []
    );

  return json(
    {
      ok: true,

      sourcesRequested:
        sources.length,

      candidatesFound:
        totalCandidates,

      candidates,

      sourceResults:
        results.map(x => ({
          source:
            x.source,

          url:
            x.url,

          candidatesFound:
            x.candidatesFound,

          error:
            x.error || null
        }))
    },
    200,
    origin
  );
}

export default {
  async fetch(
    request,
    env
  ) {
    const origin =
      request.headers.get(
        "Origin"
      ) || "*";

    if (
      request.method ===
      "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,

          headers:
            corsHeaders(
              origin
            )
        }
      );
    }

    const url =
      new URL(
        request.url
      );

    if (
      request.method ===
        "GET" &&
      url.pathname === "/"
    ) {
      return json(
        {
          ok: true,

          service:
            "Gift Hunter NVIDIA Proxy",

          status:
            "online",

          mode:
            "source-discovery-and-37-rule-verification"
        },
        200,
        origin
      );
    }

    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/test"
    ) {
      try {
        const data =
          await askNvidia(
            env,
            [
              {
                role: "user",
                content:
                  "Reply with exactly: NVIDIA TEST OK"
              }
            ]
          );

        return json(
          {
            ok: true,
            nvidia: data
          },
          200,
          origin
        );

      } catch (error) {
        return json(
          {
            ok: false,
            error:
              String(error)
          },
          502,
          origin
        );
      }
    }

    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/scan"
    ) {
      return handleScan(
        request,
        env,
        origin
      );
    }

    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/nvidia"
    ) {
      let body;

      try {
        body =
          await request.json();
      } catch {
        return json(
          {
            ok: false,
            error:
              "Invalid JSON"
          },
          400,
          origin
        );
      }

      if (
        !Array.isArray(
          body?.messages
        )
      ) {
        return json(
          {
            ok: false,
            error:
              "messages must be an array"
          },
          400,
          origin
        );
      }

      try {
        const data =
          await askNvidia(
            env,
            body.messages
          );

        return json(
          {
            ok: true,
            status: 200,
            data
          },
          200,
          origin
        );

      } catch (error) {
        return json(
          {
            ok: false,
            error:
              String(error)
          },
          502,
          origin
        );
      }
    }

    return json(
      {
        ok: false,
        error:
          "Endpoint not found"
      },
      404,
      origin
    );
  }
};
