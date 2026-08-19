const NVIDIA_URL =
  "https://integrate.api.nvidia.com/v1/chat/completions";

const DEFAULT_MODEL =
  "nvidia/nemotron-3-super-120b-a12b";

const MAX_SOURCE_CHARS = 12000;
const MAX_TOTAL_CHARS = 50000;
const MAX_LINKS_PER_SOURCE = 12;

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization",
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

/* -------------------------------------------------------
   تنظيف HTML وتحويله إلى نص قابل للتحليل
------------------------------------------------------- */

function decodeHtml(text) {
  return String(text || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripHtml(html) {
  return decodeHtml(
    String(html || "")
      .replace(
        /<script[\s\S]*?<\/script>/gi,
        " "
      )
      .replace(
        /<style[\s\S]*?<\/style>/gi,
        " "
      )
      .replace(
        /<noscript[\s\S]*?<\/noscript>/gi,
        " "
      )
      .replace(
        /<svg[\s\S]*?<\/svg>/gi,
        " "
      )
      .replace(
        /<iframe[\s\S]*?<\/iframe>/gi,
        " "
      )
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function cleanText(text) {
  return String(text || "")
    .replace(/\u0000/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

/* -------------------------------------------------------
   حماية بسيطة من SSRF
------------------------------------------------------- */

function validHostname(hostname) {
  if (!hostname) return false;

  if (
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(
      hostname
    )
  ) {
    return false;
  }

  if (
    hostname === "::1" ||
    hostname.endsWith(".local")
  ) {
    return false;
  }

  return true;
}

/* -------------------------------------------------------
   قراءة المصدر
------------------------------------------------------- */

async function fetchText(url) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 Gift-Hunter/2.0",
      "Accept":
        "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8",
      "Accept-Language":
        "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  const type =
    response.headers.get("content-type") || "";

  const raw = await response.text();

  let text;

  if (/json/i.test(type)) {
    text = raw;
  } else {
    text = stripHtml(raw);
  }

  return cleanText(text);
}

/* -------------------------------------------------------
   استخراج الروابط من الصفحة
------------------------------------------------------- */

function extractLinks(html, baseUrl) {
  const links = [];

  const regex =
    /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>/gi;

  let match;

  while (
    (match = regex.exec(html)) !== null &&
    links.length < MAX_LINKS_PER_SOURCE
  ) {
    try {
      const absolute =
        new URL(match[1], baseUrl);

      if (
        absolute.protocol === "https:" &&
        validHostname(absolute.hostname)
      ) {
        links.push(absolute.toString());
      }
    } catch {}
  }

  return [...new Set(links)];
}

/* -------------------------------------------------------
   قراءة مصدر مع محاولة العثور على صفحات الشروط
------------------------------------------------------- */

async function readSource(item) {
  const originalUrl = new URL(item.url);

  if (
    originalUrl.protocol !== "https:" ||
    !validHostname(originalUrl.hostname)
  ) {
    throw new Error("Invalid source URL");
  }

  const response = await fetch(
    originalUrl.toString(),
    {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 Gift-Hunter/2.0",
        "Accept":
          "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.8",
        "Accept-Language":
          "en-US,en;q=0.9",
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}`
    );
  }

  const type =
    response.headers.get("content-type") || "";

  const raw = await response.text();

  let text;

  if (/json/i.test(type)) {
    text = raw;
  } else {
    text = stripHtml(raw);
  }

  text = cleanText(text);

  if (!text || text.length < 80) {
    throw new Error("Source has insufficient readable text");
  }

  /*
    نبحث عن روابط مهمة داخل الصفحة.
    لا نعتبرها دليلًا بحد ذاتها؛ فقط نحاول قراءة
    صفحة الشروط/القواعد إذا كانت واضحة.
  */

  const discoveredLinks =
    /html/i.test(type)
      ? extractLinks(raw, originalUrl.toString())
      : [];

  const usefulLinks =
    discoveredLinks.filter((link) =>
      /(terms|rules|official|giveaway|contest|sweepstake|airdrop|reward|eligib|faq|condition)/i.test(
        link
      )
    ).slice(0, 4);

  const extraTexts = [];

  for (const link of usefulLinks) {
    try {
      const extra =
        await fetchText(link);

      if (extra && extra.length >= 80) {
        extraTexts.push(
          `\n\n--- RELATED PAGE ---\nURL: ${link}\n${extra.slice(
            0,
            5000
          )}`
        );
      }
    } catch {}
  }

  const combined =
    cleanText(
      text.slice(0, MAX_SOURCE_CHARS) +
      extraTexts.join("")
    );

  return {
    name:
      item.name ||
      originalUrl.hostname,

    url: originalUrl.toString(),

    text: combined.slice(
      0,
      MAX_SOURCE_CHARS + 18000
    ),

    discoveredPages:
      usefulLinks.length,
  };
}

/* -------------------------------------------------------
   NVIDIA
------------------------------------------------------- */

async function askNvidia(messages, options = {}) {
  if (!options.apiKey) {
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
          `Bearer ${options.apiKey}`,
        Accept:
          "application/json",
        "Content-Type":
          "application/json",
      },

      body: JSON.stringify({
        model:
          options.model ||
          DEFAULT_MODEL,

        messages,

        max_tokens:
          options.maxTokens || 12000,

        temperature:
          options.temperature ?? 0,

        top_p:
          options.topP ?? 1,

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

  return {
    data,
    content: String(content),
  };
}

/* -------------------------------------------------------
   استخراج JSON من رد NVIDIA
------------------------------------------------------- */

function parseJsonResponse(content) {
  let text = String(content || "")
    .trim();

  text = text
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {}

  const first =
    text.indexOf("{");

  const last =
    text.lastIndexOf("}");

  if (
    first >= 0 &&
    last > first
  ) {
    try {
      return JSON.parse(
        text.slice(first, last + 1)
      );
    } catch {}
  }

  return {
    candidates: [],
  };
}

/* -------------------------------------------------------
   بناء قائمة الشروط
------------------------------------------------------- */

function buildRules(rules) {
  if (!Array.isArray(rules)) {
    return [];
  }

  return rules.map((r, index) => ({
    id:
      Number.isFinite(Number(r.id))
        ? Number(r.id)
        : index + 1,

    name:
      String(r.name || ""),

    bad:
      Array.isArray(r.bad)
        ? r.bad.map(String)
        : [],

    good:
      Array.isArray(r.good)
        ? r.good.map(String)
        : [],
  }));
}

/* -------------------------------------------------------
   فحص أن النتيجة تحتوي على 37 شرطًا فعلًا
------------------------------------------------------- */

function verifyRuleResults(
  candidate,
  rules
) {
  const results =
    Array.isArray(
      candidate?.ruleResults
    )
      ? candidate.ruleResults
      : [];

  const byId = new Map();

  for (const r of results) {
    const id = Number(r?.id);

    if (!Number.isFinite(id)) {
      continue;
    }

    if (!byId.has(id)) {
      byId.set(id, r);
    }
  }

  const normalized = [];

  for (const rule of rules) {
    const r = byId.get(rule.id);

    if (!r) {
      normalized.push({
        id: rule.id,
        status: "UNKNOWN",
        evidence: "",
      });

      continue;
    }

    const status =
      String(r.status || "")
        .toUpperCase();

    let safeStatus =
      "UNKNOWN";

    if (
      status === "PASS" ||
      status === "FAIL"
    ) {
      safeStatus = status;
    }

    normalized.push({
      id: rule.id,
      status: safeStatus,
      evidence:
        String(r.evidence || "")
          .slice(0, 800),
    });
  }

  const passed =
    normalized.filter(
      x => x.status === "PASS"
    ).length;

  const failed =
    normalized.filter(
      x => x.status === "FAIL"
    ).length;

  const unknown =
    normalized.filter(
      x => x.status === "UNKNOWN"
    ).length;

  return {
    rules: normalized,
    passed,
    failed,
    unknown,

    eligible:
      normalized.length === 37 &&
      passed === 37 &&
      failed === 0 &&
      unknown === 0,
  };
}

/* -------------------------------------------------------
   طبقة أمان إضافية:
   لا نقبل نتيجة بلا دليل نصي حقيقي.
------------------------------------------------------- */

function evidenceIsValid(
  ruleResults
) {
  if (!Array.isArray(ruleResults)) {
    return false;
  }

  for (const rule of ruleResults) {
    if (
      rule.status === "PASS" &&
      !String(
        rule.evidence || ""
      ).trim()
    ) {
      return false;
    }
  }

  return true;
}

/* -------------------------------------------------------
   تحليل أولي: استخراج العروض فقط
------------------------------------------------------- */

async function discoverCandidates(
  sources,
  rules,
  env
) {
  const ruleSummary =
    rules.map(
      r =>
        `RULE ${r.id}: ${r.name}\n` +
        `FORBIDDEN: ${r.bad.join(", ")}\n` +
        `REQUIRED: ${r.good.join(", ")}`
    ).join("\n\n");

  const sourceText =
    sources.map(
      (s, i) =>
        `SOURCE ${i + 1}
NAME: ${s.name}
URL: ${s.url}

TEXT:
${s.text}`
    ).join(
      "\n\n==============================\n\n"
    );

  const system = `
You are the first-stage Gift Hunter extraction engine.

Your job is ONLY to find genuine financial or cryptocurrency
free-gift offers that are explicitly present in the supplied
source text.

Do NOT invent offers.

Do NOT infer missing information.

Do NOT treat a directory name as an offer.

Every URL must come from the supplied source.

Extract only offers that have enough direct text to investigate.

Return ONLY JSON:

{
  "candidates": [
    {
      "title": "",
      "description": "",
      "value": "",
      "type": "Financial|Crypto",
      "expires": "",
      "url": "",
      "source": "",
      "requirements": "",
      "terms": "",
      "faq": ""
    }
  ]
}

Important:
- A reward must have monetary or crypto/digital value.
- "Free trial", discount, coupon, points with no monetary value,
  job, survey-only reward, affiliate commission, cashback,
  purchase discount, or ordinary promotion is not automatically
  a qualifying gift.
- Do not decide final eligibility here.
- If evidence is insufficient, do not invent it.

RULES FOR THE SECOND STAGE:
${ruleSummary}
`;

  const result =
    await askNvidia(
      [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: sourceText.slice(
            0,
            MAX_TOTAL_CHARS
          ),
        },
      ],
      {
        apiKey:
          env.NVIDIA_API_KEY,

        maxTokens: 10000,

        temperature: 0,

        topP: 1,
      }
    );

  const parsed =
    parseJsonResponse(
      result.content
    );

  return Array.isArray(
    parsed?.candidates
  )
    ? parsed.candidates
    : [];
}

/* -------------------------------------------------------
   المرحلة الثانية:
   التحقق من كل شرط على حدة
------------------------------------------------------- */

async function verifyCandidates(
  candidates,
  rules,
  env
) {
  if (!candidates.length) {
    return [];
  }

  const ruleText =
    rules.map(
      r =>
        `RULE ${r.id}
NAME: ${r.name}
FORBIDDEN INDICATORS:
${r.bad.join(", ")}

REQUIRED POSITIVE EVIDENCE:
${r.good.join(", ")}`
    ).join("\n\n");

  const candidateText =
    candidates
      .slice(0, 20)
      .map(
        (c, i) =>
          `CANDIDATE ${i + 1}

TITLE: ${c.title}
DESCRIPTION: ${c.description}
VALUE: ${c.value}
TYPE: ${c.type}
EXPIRES: ${c.expires}
URL: ${c.url}
SOURCE: ${c.source}
REQUIREMENTS: ${c.requirements}
TERMS: ${c.terms}
FAQ: ${c.faq}`
      )
      .join(
        "\n\n==============================\n\n"
      );

  const system = `
You are the FINAL and EXTREMELY STRICT Gift Hunter verifier.

You must verify every candidate against EXACTLY 37 rules.

CRITICAL:

1. PASS requires direct evidence contained in the candidate data.
2. Missing evidence = UNKNOWN.
3. Ambiguous evidence = UNKNOWN.
4. Contradictory evidence = UNKNOWN unless the text clearly resolves it.
5. A condition that requires payment, purchase, deposit, subscription,
   paid membership, paid transaction, or another prohibited action
   causes the relevant rule to FAIL.
6. "No purchase necessary" is NOT a failure.
7. Never infer that something is free merely because it is called
   "giveaway", "airdrop", "bonus", "reward", or "free".
8. Rule 36 MUST have direct evidence that the reward itself has
   monetary or cryptocurrency/digital-asset value.
9. Rule 37 MUST have direct evidence that receiving the reward is
   free and does not require a prohibited payment/action.
10. A candidate is eligible ONLY if ALL 37 rules are PASS.
11. If even ONE rule is UNKNOWN or FAIL, eligible MUST be false.
12. Every rule must have an evidence explanation.
13. Do not invent evidence.
14. Do not invent URLs.
15. Do not change the candidate URL.

Return ONLY valid JSON:

{
  "candidates": [
    {
      "title": "",
      "description": "",
      "value": "",
      "type": "",
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

The ruleResults array MUST contain exactly one entry
for EVERY supplied rule ID.

RULES:
${ruleText}
`;

  const result =
    await askNvidia(
      [
        {
          role: "system",
          content: system,
        },
        {
          role: "user",
          content: candidateText,
        },
      ],
      {
        apiKey:
          env.NVIDIA_API_KEY,

        maxTokens: 14000,

        temperature: 0,

        topP: 1,
      }
    );

  const parsed =
    parseJsonResponse(
      result.content
    );

  return Array.isArray(
    parsed?.candidates
  )
    ? parsed.candidates
    : [];
}

/* -------------------------------------------------------
   توحيد النتيجة وإجبارها على 37/37
------------------------------------------------------- */

function normalizeCandidate(
  candidate,
  rules
) {
  if (!candidate) {
    return null;
  }

  const verification =
    verifyRuleResults(
      candidate,
      rules
    );

  const hasEvidence =
    evidenceIsValid(
      verification.rules
    );

  const eligible =
    verification.eligible &&
    hasEvidence;

  return {
    title:
      String(candidate.title || "")
        .trim(),

    description:
      String(
        candidate.description || ""
      ).trim(),

    value:
      String(candidate.value || "")
        .trim(),

    type:
      String(candidate.type || "")
        .trim(),

    expires:
      String(candidate.expires || "")
        .trim(),

    url:
      String(candidate.url || "")
        .trim(),

    source:
      String(candidate.source || "")
        .trim(),

    requirements:
      String(
        candidate.requirements || ""
      ).trim(),

    terms:
      String(candidate.terms || "")
        .trim(),

    faq:
      String(candidate.faq || "")
        .trim(),

    eligible,

    verification: {
      passed:
        verification.passed,

      failed:
        verification.failed,

      unknown:
        verification.unknown,

      total:
        rules.length,

      evidenceComplete:
        hasEvidence,

      rules:
        verification.rules,
    },
  };
}

/* -------------------------------------------------------
   /scan
------------------------------------------------------- */

async function handleScan(
  request,
  env,
  origin
) {
  if (!env.NVIDIA_API_KEY) {
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
          "Invalid JSON",
      },
      400,
      origin
    );
  }

  if (
    !Array.isArray(body?.urls) ||
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

  const rules =
    buildRules(body.rules);

  /*
    أمان مهم:
    التطبيق يجب أن يرسل 37 شرطًا.
  */

  if (rules.length !== 37) {
    return json(
      {
        ok: false,
        error:
          "Exactly 37 rules are required",
        receivedRules:
          rules.length,
      },
      400,
      origin
    );
  }

  /* ---------------------------------------------------
     قراءة المصادر
  --------------------------------------------------- */

  const sources = [];

  const sourceErrors = [];

  for (
    const item of body.urls
  ) {
    try {
      const source =
        await readSource(item);

      sources.push(source);
    } catch (error) {
      sourceErrors.push({
        name:
          item?.name || "",

        url:
          item?.url || "",

        error:
          String(error)
            .slice(0, 300),
      });
    }
  }

  if (!sources.length) {
    return json(
      {
        ok: true,

        readableSources: 0,

        discoveredPages: 0,

        candidatesFound: 0,

        eligibleCount: 0,

        candidates: [],

        sourceErrors,
      },
      200,
      origin
    );
  }

  /* ---------------------------------------------------
     المرحلة الأولى: اكتشاف العروض
  --------------------------------------------------- */

  let discovered;

  try {
    discovered =
      await discoverCandidates(
        sources,
        rules,
        env
      );
  } catch (error) {
    return json(
      {
        ok: false,

        stage:
          "candidate-discovery",

        error:
          String(error)
            .slice(0, 1200),

        readableSources:
          sources.length,

        sourceErrors,
      },
      502,
      origin
    );
  }

  /* ---------------------------------------------------
     المرحلة الثانية: تحقق 37 شرط
  --------------------------------------------------- */

  let verified;

  try {
    verified =
      await verifyCandidates(
        discovered,
        rules,
        env
      );
  } catch (error) {
    return json(
      {
        ok: false,

        stage:
          "37-rule-verification",

        error:
          String(error)
            .slice(0, 1200),

        readableSources:
          sources.length,

        candidatesFound:
          discovered.length,

        sourceErrors,
      },
      502,
      origin
    );
  }

  /* ---------------------------------------------------
     طبقة تحقق محلية نهائية
  --------------------------------------------------- */

  const normalized =
    verified
      .map(
        c =>
          normalizeCandidate(
            c,
            rules
          )
      )
      .filter(Boolean);

  /*
    لا نرسل إلى التطبيق إلا النتائج التي:

    37 قاعدة
    37 PASS
    0 FAIL
    0 UNKNOWN
    evidence موجود لكل PASS
  */

  const eligible =
    normalized.filter(
      c =>
        c.eligible === true &&
        c.verification.total === 37 &&
        c.verification.passed === 37 &&
        c.verification.failed === 0 &&
        c.verification.unknown === 0 &&
        c.verification.evidenceComplete === true
    );

  return json(
    {
      ok: true,

      mode:
        "strict-two-stage-37-rule-verification",

      readableSources:
        sources.length,

      discoveredPages:
        sources.reduce(
          (sum, s) =>
            sum +
            Number(
              s.discoveredPages || 0
            ),
          0
        ),

      candidatesFound:
        normalized.length,

      eligibleCount:
        eligible.length,

      /*
        مهم:
        candidates هنا تحتوي المؤهلة فقط.
        أي نتيجة لم تصل إلى 37/37 لا تظهر للتطبيق.
      */

      candidates:
        eligible,

      rejected:
        normalized.length -
        eligible.length,

      sourceErrors,
    },
    200,
    origin
  );
}

/* -------------------------------------------------------
   Worker
------------------------------------------------------- */

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
            corsHeaders(origin),
        }
      );
    }

    const url =
      new URL(request.url);

    /* اختبار الخادم */

    if (
      request.method === "GET" &&
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
            "strict-two-stage-37-rule-verification",

          rules:
            37,
        },
        200,
        origin
      );
    }

    /* اختبار NVIDIA */

    if (
      request.method === "GET" &&
      url.pathname === "/test"
    ) {
      try {
        const result =
          await askNvidia(
            [
              {
                role: "user",
                content:
                  "Reply with exactly: NVIDIA TEST OK",
              },
            ],
            {
              apiKey:
                env.NVIDIA_API_KEY,

              maxTokens: 100,

              temperature: 0,
            }
          );

        return json(
          {
            ok: true,

            nvidia:
              result.data,
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
                .slice(0, 1000),
          },
          502,
          origin
        );
      }
    }

    /* الفحص */

    if (
      request.method === "POST" &&
      url.pathname === "/scan"
    ) {
      return handleScan(
        request,
        env,
        origin
      );
    }

    /* توافق مع /nvidia */

    if (
      request.method === "POST" &&
      url.pathname === "/nvidia"
    ) {
      if (!env.NVIDIA_API_KEY) {
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
        const result =
          await askNvidia(
            body.messages,
            {
              apiKey:
                env.NVIDIA_API_KEY,

              model:
                body.model ||
                DEFAULT_MODEL,

              maxTokens:
                Math.min(
                  Number(
                    body.max_tokens
                  ) || 4096,
                  14000
                ),

              temperature:
                typeof body.temperature ===
                "number"
                  ? Math.max(
                      0,
                      Math.min(
                        body.temperature,
                        1
                      )
                    )
                  : 0.1,
            }
          );

        return json(
          {
            ok: true,

            status: 200,

            data:
              result.data,
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
                .slice(0, 1200),
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
