const NVIDIA_URL =
  "https://integrate.api.nvidia.com/v1/chat/completions";

const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";

const MAX_SOURCE_TEXT = 14000;
const MAX_PAGE_TEXT = 9000;
const MAX_DISCOVERED_LINKS = 35;
const MAX_OFFER_PAGES = 4;
const FETCH_TIMEOUT = 12000;

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status = 200, origin = "*") {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
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
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
  );
}

function hostAllowed(hostname) {
  return (
    hostname &&
    !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(hostname)
  );
}

function absoluteUrl(base, href) {
  try {
    return new URL(href, base).href;
  } catch {
    return "";
  }
}

function sameHost(a, b) {
  try {
    return (
      new URL(a).hostname.replace(/^www\./i, "") ===
      new URL(b).hostname.replace(/^www\./i, "")
    );
  } catch {
    return false;
  }
}

function titleFromUrl(url) {
  try {
    const p =
      new URL(url).pathname.split("/").filter(Boolean).pop() || "";

    return decodeURIComponent(p)
      .replace(/\.(html?|php|aspx?)$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .slice(0, 180);
  } catch {
    return "";
  }
}

function isUsefulLink(url) {
  if (!url || !/^https?:\/\//i.test(url)) return false;

  return (
    !/\.(jpg|jpeg|png|gif|svg|webp|ico|css|js|xml|zip|rar|mp4|mp3|pdf)(?:[?#]|$)/i.test(
      url
    ) &&
    !/(\/login|\/signin|\/sign-in|\/signup|\/sign-up|\/register|\/account|\/cart|\/checkout|\/privacy|\/terms|\/cookie)/i.test(
      url
    )
  );
}

function linkScore(text, url) {
  const t = `${text} ${url}`.toLowerCase();

  let score = 0;

  if (
    /(giveaway|contest|sweepstake|prize|reward|bonus|airdrop|claim|freebie|free|cash|money|crypto|token|coin|gift card)/i.test(
      t
    )
  ) {
    score += 6;
  }

  if (/(offer|promo|promotion|win|winner|earn|claim|drop)/i.test(t)) {
    score += 3;
  }

  if (/(buy|purchase|subscription|deposit|fee|referral|invite|survey|points)/i.test(t)) {
    score -= 1;
  }

  if (text && text.length >= 8) score += 1;

  return score;
}

function extractLinks(html, baseUrl) {
  const found = [];
  const re =
    /<a\b([^>]*?)href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  let m;

  while ((m = re.exec(html))) {
    const url = absoluteUrl(baseUrl, m[2]);

    if (!isUsefulLink(url)) continue;

    const text = stripHtml(m[3]).slice(0, 300);
    const score = linkScore(text, url);

    found.push({
      url,
      text,
      score,
    });
  }

  const seen = new Set();

  return found
    .sort((a, b) => b.score - a.score)
    .filter((x) => {
      const key = x.url.split("#")[0];

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    })
    .slice(0, MAX_DISCOVERED_LINKS);
}

function extractMeta(html) {
  const result = {};

  const re =
    /<meta\b[^>]*(?:name|property)\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']*)["'][^>]*>/gi;

  let m;

  while ((m = re.exec(html))) {
    const key = m[1].toLowerCase();

    if (
      key === "og:title" ||
      key === "og:description" ||
      key === "description" ||
      key === "twitter:title" ||
      key === "twitter:description"
    ) {
      result[key] = cleanText(m[2]);
    }
  }

  return result;
}

async function fetchPage(url) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    FETCH_TIMEOUT
  );

  try {
    const u = new URL(url);

    if (
      u.protocol !== "https:" ||
      !hostAllowed(u.hostname)
    ) {
      throw new Error("Invalid source URL");
    }

    const response = await fetch(u.toString(), {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,

      headers: {
        "User-Agent":
          "Gift-Hunter/2.0 source-reader",
        "Accept":
          "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const type =
      response.headers.get("content-type") || "";

    const raw = await response.text();

    const text = /json/i.test(type)
      ? cleanText(raw)
      : stripHtml(raw);

    return {
      requestedUrl: url,
      finalUrl: response.url || url,
      contentType: type,
      raw: raw.slice(0, 700000),
      text: text.slice(0, MAX_PAGE_TEXT),
      meta: /json/i.test(type)
        ? {}
        : extractMeta(raw),
    };
  } finally {
    clearTimeout(timer);
  }
}

function buildSourcePackage(page) {
  const links = extractLinks(
    page.raw,
    page.finalUrl
  );

  const linkText = links
    .map(
      (x, i) =>
        `${i + 1}. ${
          x.text || titleFromUrl(x.url)
        } | ${x.url}`
    )
    .join("\n");

  return {
    name: page.finalUrl,
    url: page.finalUrl,

    text: [
      "PAGE TEXT:",
      page.text,
      "",
      "META:",
      JSON.stringify(page.meta),
      "",
      "DISCOVERED LINKS:",
      linkText,
    ]
      .join("\n")
      .slice(0, MAX_SOURCE_TEXT),

    links,
  };
}

function selectOfferLinks(source) {
  return source.links
    .filter((x) =>
      sameHost(x.url, source.url)
    )
    .filter((x) => x.score >= 3)
    .slice(0, MAX_OFFER_PAGES);
}

async function readSources(items) {
  const sources = [];

  for (const item of items) {
    try {
      const page = await fetchPage(
        String(item.url || "").trim()
      );

      const source =
        buildSourcePackage(page);

      source.name =
        item.name ||
        new URL(page.finalUrl).hostname;

      sources.push(source);

      const offerLinks =
        selectOfferLinks(source);

      for (const link of offerLinks) {
        if (
          sources.length >=
          items.length + MAX_OFFER_PAGES
        ) {
          break;
        }

        try {
          const offerPage =
            await fetchPage(link.url);

          sources.push({
            name: source.name,
            url: offerPage.finalUrl,

            text: [
              `SOURCE PAGE: ${source.url}`,
              `OFFER PAGE: ${offerPage.finalUrl}`,
              "",
              "OFFER PAGE TEXT:",
              offerPage.text,
              "",
              "OFFER META:",
              JSON.stringify(
                offerPage.meta
              ),
            ]
              .join("\n")
              .slice(0, MAX_SOURCE_TEXT),

            links: [],
            discoveredFrom: source.url,
          });
        } catch {
          // فشل الصفحة الفرعية لا يوقف المصدر.
        }
      }
    } catch {
      // فشل مصدر واحد لا يوقف الدفعة.
    }
  }

  return sources;
}

function rulesToText(rules) {
  if (
    !Array.isArray(rules) ||
    !rules.length
  ) {
    return (
      "The application supplied no rule definitions. " +
      "Do not invent missing rules."
    );
  }

  return rules
    .map((r) => {
      return [
        `RULE ${r.id}: ${r.name || ""}`,
        `Forbidden indicators: ${
          (r.bad || []).join(", ")
        }`,
        `Required positive evidence: ${
          (r.good || []).join(", ")
        }`,
      ].join("\n");
    })
    .join("\n\n");
}

function buildPrompt(sources, rules) {
  const sourceText = sources
    .map((s, i) => {
      return [
        `SOURCE ${i + 1}`,
        `NAME: ${s.name}`,
        `URL: ${s.url}`,
        "TEXT:",
        s.text,
        "",
        "IMPORTANT:",
        "The source may be a directory. Extract specific offers only when the supplied text actually identifies them.",
      ].join("\n");
    })
    .join(
      "\n\n====================\n\n"
    );

  return `
You are the strict Gift Hunter verifier.

Analyze ONLY the supplied source material.

IMPORTANT CHANGE:

Do NOT reject a source merely because the source page does not contain the words "free", "cash", "money", "crypto", or similar.

First discover specific offers from:
- page text
- headings
- metadata
- discovered links
- offer-page text

Then inspect the supplied offer-page text when available.

Only after discovering a candidate should the 37 rules be applied.

Never invent information.

For every candidate:

- use the exact URL found in the supplied material;
- extract title, description, value, type and expiration when explicitly present;
- identify requirements/terms/FAQ when present;
- produce exactly one rule result for every supplied rule;
- PASS requires direct evidence;
- FAIL requires clear evidence that the prohibited condition exists;
- UNKNOWN means the evidence is missing, ambiguous, conditional, or contradictory;
- an UNKNOWN is NOT a pass;
- any FAIL or UNKNOWN makes the candidate ineligible.

Special requirements:

- Rule 36 requires direct evidence that the reward is monetary or a crypto/digital asset of value.
- Rule 37 requires direct evidence that the reward is free without payment or the prohibited action.
- Do not treat an ordinary product discount as free money.
- Do not treat loyalty points as cash unless the supplied evidence clearly establishes monetary/crypto value.
- Do not turn a giveaway directory listing into a verified eligible offer without evidence from the supplied text.
- If the source does not provide enough evidence, return UNKNOWN and reject the candidate.
- Negative phrases such as "no purchase necessary" must NOT be interpreted as a failure for a purchase rule.

Return ONLY valid JSON:

{
  "candidates": [
    {
      "title": "",
      "description": "",
      "value": "",
      "type": "Financial/Crypto",
      "expires": "",
      "url": "",
      "source": "",
      "requirements": "",
      "terms": "",
      "faq": "",
      "ruleResults": [
        {
          "id": 1,
          "status": "PASS|FAIL|UNKNOWN",
          "evidence": ""
        }
      ]
    }
  ]
}

RULES:
${rulesToText(rules)}

SOURCES:
${sourceText}
`;
}

async function analyzeWithNvidia(
  sources,
  rules,
  env
) {
  if (!env.NVIDIA_API_KEY) {
    throw new Error(
      "NVIDIA_API_KEY is not configured"
    );
  }

  const response = await fetch(
    NVIDIA_URL,
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${env.NVIDIA_API_KEY}`,
        Accept:
          "application/json",
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        model: DEFAULT_MODEL,

        messages: [
          {
            role: "system",
            content:
              "You are a strict evidence-based verifier. Return JSON only.",
          },
          {
            role: "user",
            content:
              buildPrompt(
                sources,
                rules
              ),
          },
        ],

        max_tokens: 14000,
        temperature: 0.2,
        top_p: 0.95,
        stream: false,
      }),
    }
  );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `NVIDIA HTTP ${response.status}: ${text.slice(
        0,
        800
      )}`
    );
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "NVIDIA returned invalid JSON"
    );
  }

  const content =
    data?.choices?.[0]?.message?.content ||
    "";

  const match =
    content.match(/\{[\s\S]*\}/);

  if (!match) {
    return {
      candidates: [],
      nvidiaRaw:
        content.slice(0, 4000),
    };
  }

  let parsed;

  try {
    parsed =
      JSON.parse(match[0]);
  } catch {
    return {
      candidates: [],
      nvidiaRaw:
        content.slice(0, 4000),
    };
  }

  return {
    candidates:
      Array.isArray(
        parsed.candidates
      )
        ? parsed.candidates
        : [],
  };
}

function normalizeAndVerify(
  item,
  sourceName,
  rules
) {
  if (
    !item ||
    typeof item !== "object"
  ) {
    return null;
  }

  const title = cleanText(
    item.title || item.name
  );

  const description = cleanText(
    item.description ||
      item.details ||
      item.summary
  );

  const value = cleanText(
    item.value ||
      item.amount ||
      ""
  );

  const url = String(
    item.url ||
      item.link ||
      ""
  ).trim();

  if (
    !title ||
    !url ||
    !/^https?:\/\//i.test(url)
  ) {
    return null;
  }

  const supplied =
    Array.isArray(
      item.ruleResults
    )
      ? item.ruleResults
      : [];

  const byId =
    new Map(
      supplied.map((r) => [
        Number(r.id),
        r,
      ])
    );

  const ruleResults =
    (
      Array.isArray(rules)
        ? rules
        : []
    ).map((rule) => {
      const r =
        byId.get(
          Number(rule.id)
        );

      const status =
        r?.status === "PASS"
          ? "PASS"
          : r?.status === "FAIL"
            ? "FAIL"
            : "UNKNOWN";

      return {
        id: rule.id,
        name:
          rule.name || "",
        status,
        evidence:
          cleanText(
            r?.evidence
          ).slice(0, 700),
      };
    });

  const failed =
    ruleResults.filter(
      (r) =>
        r.status === "FAIL"
    ).length;

  const unknown =
    ruleResults.filter(
      (r) =>
        r.status === "UNKNOWN"
    ).length;

  const passed =
    ruleResults.filter(
      (r) =>
        r.status === "PASS"
    ).length;

  const eligible =
    ruleResults.length === 37 &&
    passed === 37 &&
    failed === 0 &&
    unknown === 0;

  return {
    title,
    description,
    value,

    type: cleanText(
      item.type ||
        "Financial/Crypto"
    ),

    expires: cleanText(
      item.expires ||
        "غير محدد"
    ),

    url,

    source:
      cleanText(
        item.source
      ) ||
      sourceName ||
      "Worker",

    requirements:
      cleanText(
        item.requirements
      ),

    terms:
      cleanText(
        item.terms
      ),

    faq:
      cleanText(
        item.faq
      ),

    verification: {
      results: ruleResults,
      passed,
      failed,
      unknown,
      eligible,
    },

    eligible,
  };
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
        error: "Invalid JSON",
      },
      400,
      origin
    );
  }

  if (
    !Array.isArray(
      body?.urls
    ) ||
    body.urls.length === 0 ||
    body.urls.length > 10
  ) {
    return json(
      {
        ok: false,
        error:
          "urls must contain 1-10 sources",
      },
      400,
      origin
    );
  }

  if (
    !Array.isArray(
      body?.rules
    ) ||
    body.rules.length !== 37
  ) {
    return json(
      {
        ok: false,
        error:
          "Exactly 37 rules are required from the application",
      },
      400,
      origin
    );
  }

  const sources =
    await readSources(
      body.urls
    );

  if (!sources.length) {
    return json(
      {
        ok: true,
        candidates: [],
        readableSources: 0,
        discoveredPages: 0,
      },
      200,
      origin
    );
  }

  try {
    const result =
      await analyzeWithNvidia(
        sources,
        body.rules,
        env
      );

    const normalized = [];

    for (
      const item of
      result.candidates || []
    ) {
      const candidate =
        normalizeAndVerify(
          item,
          item?.source || "",
          body.rules
        );

      if (candidate) {
        normalized.push(
          candidate
        );
      }
    }

    /*
     * طبقة أمان نهائية:
     * التطبيق لا يستلم إلا العروض
     * التي اجتازت 37/37.
     */
    const eligible =
      normalized.filter(
        (x) =>
          x.eligible === true &&
          x.verification
            .passed === 37 &&
          x.verification
            .failed === 0 &&
          x.verification
            .unknown === 0
      );

    return json(
      {
        ok: true,

        readableSources:
          sources.length,

        discoveredPages:
          sources.length,

        candidatesFound:
          normalized.length,

        eligibleCount:
          eligible.length,

        candidates:
          eligible,
      },
      200,
      origin
    );
  } catch (e) {
    return json(
      {
        ok: false,
        error:
          String(e).slice(
            0,
            1200
          ),

        readableSources:
          sources.length,

        discoveredPages:
          sources.length,
      },
      502,
      origin
    );
  }
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
            ),
        }
      );
    }

    const url =
      new URL(
        request.url
      );

    /*
     * اختبار الخادم
     */
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
          status: "online",
          mode:
            "deep-source-discovery-then-37-rule-verification",
        },
        200,
        origin
      );
    }

    /*
     * اختبار NVIDIA
     */
    if (
      request.method ===
        "GET" &&
      url.pathname ===
        "/test"
    ) {
      try {
        const data =
          await fetch(
            NVIDIA_URL,
            {
              method: "POST",

              headers: {
                Authorization:
                  `Bearer ${env.NVIDIA_API_KEY}`,

                Accept:
                  "application/json",

                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  model:
                    DEFAULT_MODEL,

                  messages: [
                    {
                      role: "user",
                      content:
                        "Reply with exactly: NVIDIA TEST OK",
                    },
                  ],

                  max_tokens: 100,
                  temperature: 0,
                  stream: false,
                }),
            }
          );

        const text =
          await data.text();

        let result;

        try {
          result =
            JSON.parse(
              text
            );
        } catch {
          result = {
            raw: text,
          };
        }

        return json(
          {
            ok: data.ok,
            nvidia:
              result,
          },
          data.status,
          origin
        );
      } catch (e) {
        return json(
          {
            ok: false,
            error:
              String(e),
          },
          502,
          origin
        );
      }
    }

    /*
     * البحث العميق
     */
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

    /*
     * اتصال NVIDIA مباشر
     */
    if (
      request.method ===
        "POST" &&
      url.pathname ===
        "/nvidia"
    ) {
      if (
        !env.NVIDIA_API_KEY
      ) {
        return json(
          {
            ok: false,
            error:
              "NVIDIA_API_KEY is not configured",
          },
          500,
          origin
        );
      }

      let body;

      try {
        body =
          await request.json();
      } catch {
        return json(
          {
            ok: false,
            error:
              "Invalid JSON request",
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
              "messages must be an array",
          },
          400,
          origin
        );
      }

      try {
        const response =
          await fetch(
            NVIDIA_URL,
            {
              method: "POST",

              headers: {
                Authorization:
                  `Bearer ${env.NVIDIA_API_KEY}`,

                Accept:
                  "application/json",

                "Content-Type":
                  "application/json",
              },

              body:
                JSON.stringify({
                  ...body,

                  model:
                    body.model ||
                    DEFAULT_MODEL,

                  stream: false,
                }),
            }
          );

        const text =
          await response.text();

        let data;

        try {
          data =
            JSON.parse(
              text
            );
        } catch {
          data = {
            raw: text,
          };
        }

        return json(
          {
            ok:
              response.ok,

            status:
              response.status,

            data,
          },
          response.status,
          origin
        );
      } catch (e) {
        return json(
          {
            ok: false,
            error:
              String(e),
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
          "Endpoint not found",
      },
      404,
      origin
    );
  },
};
