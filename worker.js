const NVIDIA_URL =
  "https://integrate.api.nvidia.com/v1/chat/completions";

const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";

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

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "*";

    // معالجة CORS
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin),
      });
    }

    const url = new URL(request.url);

    // اختبار الخادم
    if (request.method === "GET" && url.pathname === "/") {
      return json(
        {
          ok: true,
          service: "Gift Hunter NVIDIA Proxy",
          status: "online",
        },
        200,
        origin
      );
    }

    // نقطة الاتصال بـ NVIDIA
    if (url.pathname === "/nvidia") {
      if (request.method !== "POST") {
        return json(
          {
            ok: false,
            error: "Only POST is allowed on /nvidia",
          },
          405,
          origin
        );
      }

      // التأكد من وجود المفتاح
      if (!env.NVIDIA_API_KEY) {
        return json(
          {
            ok: false,
            error: "NVIDIA_API_KEY is not configured on the server",
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
            error: "Invalid JSON request",
          },
          400,
          origin
        );
      }

      if (!body || !Array.isArray(body.messages)) {
        return json(
          {
            ok: false,
            error: "messages must be an array",
          },
          400,
          origin
        );
      }

      // نسمح للتطبيق بتحديد الموديل،
      // لكن نستخدم موديلًا افتراضيًا إذا لم يرسله.
      const payload = {
        model: body.model || DEFAULT_MODEL,
        messages: body.messages,

        max_tokens:
          typeof body.max_tokens === "number"
            ? Math.min(body.max_tokens, 8192)
            : 4096,

        temperature:
          typeof body.temperature === "number"
            ? Math.max(0, Math.min(body.temperature, 1))
            : 0.1,

        top_p:
          typeof body.top_p === "number"
            ? Math.max(0, Math.min(body.top_p, 1))
            : 1,

        stream: false,
      };

      try {
        const response = await fetch(NVIDIA_URL, {
          method: "POST",

          headers: {
            "Authorization": `Bearer ${env.NVIDIA_API_KEY}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
          },

          body: JSON.stringify(payload),
        });

        const text = await response.text();

        // نحاول إرجاع JSON كما هو من NVIDIA
        let data;

        try {
          data = JSON.parse(text);
        } catch {
          data = {
            raw: text,
          };
        }

        return json(
          {
            ok: response.ok,
            status: response.status,
            data,
          },
          response.status,
          origin
        );
      } catch (error) {
        return json(
          {
            ok: false,
            error: "Failed to connect to NVIDIA API",
            details: String(error),
          },
          502,
          origin
        );
      }
    }

    return json(
      {
        ok: false,
        error: "Endpoint not found",
      },
      404,
      origin
    );
  },
};
