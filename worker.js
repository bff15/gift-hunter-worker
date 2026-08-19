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
    .join("\
