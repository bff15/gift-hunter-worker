const NVIDIA_URL =
  "https://integrate.api.nvidia.com/v1/chat/completions";

const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";

const RULES = [
  "لا يوجد شراء أو طلب شراء",
  "لا يوجد إيداع مالي",
  "لا توجد رسوم أو Gas أو Network Fee",
  "لا توجد بطاقة ائتمان أو بطاقة بنكية",
  "لا يوجد اشتراك مدفوع",
  "لا يتطلب تثبيت تطبيق",
  "لا يتطلب تنزيل برنامج",
  "لا يتطلب امتلاك لعبة أو منتج",
  "لا يتطلب تسجيل دخول",
  "لا يتطلب إنشاء حساب",
  "لا يتطلب تسجيلًا مدفوعًا",
  "لا يتطلب تأكيد البريد الإلكتروني",
  "لا يتطلب رقم هاتف أو SMS أو OTP",
  "لا يتطلب CAPTCHA كشرط إضافي",
  "لا يتطلب KYC",
  "لا يتطلب إثبات هوية",
  "لا يتطلب جواز سفر أو وثائق",
  "لا يتطلب رفع وثائق",
  "لا يتطلب ربط محفظة",
  "لا يتطلب توقيع رسالة",
  "لا يتطلب تنفيذ معاملة Blockchain",
  "لا يتطلب إحالة أو دعوة أصدقاء",
  "لا يتطلب متابعة حساب",
  "لا يتطلب إعجابًا",
  "لا يتطلب مشاركة",
  "لا يتطلب تعليقًا",
  "لا يتطلب اشتراكًا في قناة",
  "لا يتطلب Telegram أو Discord",
  "لا يتطلب استطلاعًا",
  "لا يتطلب مشاهدة فيديو",
  "لا يتطلب مشاهدة إعلانات",
  "لا يتطلب إكمال مهام",
  "لا يعتمد على جمع نقاط",
  "لا يعتمد على Credits أو XP",
  "المكافأة مالية أو عملة رقمية حقيقية",
  "العرض مجاني بالكامل دون مقابل"
];

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
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPageText(html) {
  const text = cleanText(html);

  return text.length > 50000
    ? text.slice(0, 50000)
    : text;
}

function buildPrompt(candidate) {
  const rulesText = RULES
    .map((rule, i) => `${i + 1}. ${rule}`)
    .join("\n");

  return `
أنت محرك تحقق شديد الصرامة للعروض المجانية.

يجب أن تتحقق من العرض التالي مقابل جميع الشروط الـ37.

قاعدة أساسية:
- PASS فقط إذا كان الشرط مثبتًا بوضوح من النص.
- FAIL إذا كان الشرط مخالفًا.
- UNKNOWN إذا لم توجد معلومات كافية.
- UNKNOWN يعتبر رفضًا.
- لا تستنتج أن العرض مجاني من كلمة "Free" وحدها.
- لا تخمن.
- إذا كان هناك أي شرط غير واضح، يجب رفض العرض.

الشروط:

${rulesText}

أعد JSON فقط بهذا الشكل:

{
  "eligible": false,
  "passed": 0,
  "failed": 0,
  "unknown": 0,
  "rules": [
    {
      "id": 1,
      "status": "PASS",
      "evidence": "..."
    }
  ],
  "reason": "..."
}

العرض:

العنوان:
${cleanText(candidate.title)}

الوصف:
${cleanText(candidate.description)}

القيمة:
${cleanText(candidate.value)}

نوع العرض:
${cleanText(candidate.type)}

الرابط:
${candidate.url}

نص المصدر:
${cleanText(candidate.sourceText)}
`;
}

async function askNvidia(env, messages) {
  const response = await fetch(NVIDIA_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.NVIDIA_API_KEY}`,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      messages,
      max_tokens: 10000,
      temperature: 1,
      top_p: 0.95,
      stream: false
    })
  });

  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    throw new Error(
      `NVIDIA HTTP ${response.status}: ${text.slice(0, 1000)}`
    );
  }

  return data;
}

async function fetchSource(url) {
  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, 15000);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "Gift-Hunter/1.0"
      },
      redirect: "follow",
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType =
      response.headers.get("content-type") || "";

    const text = await response.text();

    return {
      status: response.status,
      contentType,
      text: extractPageText(text)
    };
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonFromModel(text) {
  const cleaned = String(text)
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {}

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(
        cleaned.slice(start, end + 1)
      );
    } catch {}
  }

  return null;
}

function validateDecision(result) {
  if (!result || typeof result !== "object") {
    return {
      eligible: false,
      passed: 0,
      failed: 0,
      unknown: RULES.length,
      rules: [],
      reason: "تعذر تحليل شروط العرض"
    };
  }

  const rules = Array.isArray(result.rules)
    ? result.rules
    : [];

  let passed = 0;
  let failed = 0;
  let unknown = 0;

  for (let i = 1; i <= RULES.length; i++) {
    const rule = rules.find(
      x => Number(x.id) === i
    );

    const status =
      String(rule?.status || "UNKNOWN")
        .toUpperCase();

    if (status === "PASS") {
      passed++;
    } else if (status === "FAIL") {
      failed++;
    } else {
      unknown++;
    }
  }

  return {
    eligible:
      passed === RULES.length &&
      failed === 0 &&
      unknown === 0,

    passed,
    failed,
    unknown,
    rules,
    reason:
      passed === RULES.length &&
      failed === 0 &&
      unknown === 0
        ? "اجتاز جميع الشروط الـ37"
        : "تم رفض العرض لأن جميع الشروط الـ37 لم تثبت"
  };
}

export default {
  async fetch(request, env) {
    const origin =
      request.headers.get("Origin") || "*";

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
      });
    }

    const url = new URL(request.url);

    /*
     * اختبار الخادم
     */
    if (
      request.method === "GET" &&
      url.pathname === "/"
    ) {
      return json(
        {
          ok: true,
          service: "Gift Hunter NVIDIA Proxy",
          status: "online"
        },
        200,
        origin
      );
    }

    /*
     * اختبار NVIDIA
     */
    if (
      request.method === "GET" &&
      url.pathname === "/test"
    ) {
      if (!env.NVIDIA_API_KEY) {
        return json(
          {
            ok: false,
            error: "NVIDIA_API_KEY is not configured"
          },
          500,
          origin
        );
      }

      try {
        const data = await askNvidia(env, [
          {
            role: "user",
            content:
              "Reply with exactly: NVIDIA TEST OK"
          }
        ]);

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
            error: String(error)
          },
          502,
          origin
        );
      }
    }

    /*
     * تحليل عرض واحد
     */
    if (
      request.method === "POST" &&
      url.pathname === "/analyze"
    ) {
      if (!env.NVIDIA_API_KEY) {
        return json(
          {
            ok: false,
            error:
              "NVIDIA_API_KEY is not configured"
          },
          500,
          origin
        );
      }

      let candidate;

      try {
        candidate = await request.json();
      } catch {
        return json(
          {
            ok: false,
            error: "Invalid JSON"
          },
          400,
          origin
        );
      }

      if (
        !candidate ||
        !candidate.url
      ) {
        return json(
          {
            ok: false,
            error: "Candidate URL is required"
          },
          400,
          origin
        );
      }

      try {
        const page = await fetchSource(
          candidate.url
        );

        candidate.sourceText =
          page.text;

        const prompt =
          buildPrompt(candidate);

        const data = await askNvidia(env, [
          {
            role: "system",
            content:
              "أنت محرك تحقق محافظ. أعد JSON فقط."
          },
          {
            role: "user",
            content: prompt
          }
        ]);

        const modelText =
          data?.choices?.[0]?.message?.content ||
          "";

        const parsed =
          parseJsonFromModel(modelText);

        const decision =
          validateDecision(parsed);

        return json(
          {
            ok: true,
            candidate: {
              title:
                cleanText(candidate.title),
              url: candidate.url
            },
            decision
          },
          200,
          origin
        );
      } catch (error) {
        return json(
          {
            ok: false,
            error: String(error),
            eligible: false
          },
          502,
          origin
        );
      }
    }

    /*
     * توافق مع الواجهة القديمة
     */
    if (
      request.method === "POST" &&
      url.pathname === "/nvidia"
    ) {
      if (!env.NVIDIA_API_KEY) {
        return json(
          {
            ok: false,
            error:
              "NVIDIA_API_KEY is not configured"
          },
          500,
          origin
        );
      }

      let body;

      try {
        body = await request.json();
      } catch {
        return json(
          {
            ok: false,
            error: "Invalid JSON request"
          },
          400,
          origin
        );
      }

      if (
        !body ||
        !Array.isArray(body.messages)
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
            error: String(error)
          },
          502,
          origin
        );
      }
    }

    return json(
      {
        ok: false,
        error: "Endpoint not found"
      },
      404,
      origin
    );
  }
};
