import os
import time
import json
import logging
from dataclasses import dataclass

import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)


@dataclass
class Task:
    id: str
    title: str
    description: str
    reward_usd: float
    skills: list[str]
    status: str = "open"


@dataclass
class Decision:
    accept: bool
    score: float
    reason: str
    bid_usd: float


class Marketplace:

    def __init__(self):
        self.base = os.getenv(
            "MARKETPLACE_BASE_URL", ""
        ).rstrip("/")

        self.key = os.getenv(
            "MARKETPLACE_API_KEY", ""
        )

        self.demo = not self.base

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json"
        }

    def tasks(self):

        if self.demo:

            return [
                Task(
                    "demo-1",
                    "Product data extraction",
                    "Collect public product names, prices and URLs and return clean JSON.",
                    25,
                    ["research", "web", "data"]
                ),

                Task(
                    "demo-2",
                    "Simple logo design",
                    "Create a brand logo from a supplied brief.",
                    40,
                    ["design"]
                ),

                Task(
                    "demo-3",
                    "Price comparison",
                    "Compare public prices for a list of products.",
                    15,
                    ["research", "data"]
                )
            ]

        response = requests.get(
            f"{self.base}/tasks",
            headers=self._headers(),
            timeout=30
        )

        response.raise_for_status()

        return [
            Task(**task)
            for task in response.json()
        ]

    def bid(self, task_id, bid_usd, message):

        if self.demo:

            logging.info(
                "DEMO BID | task=%s | $%.2f | %s",
                task_id,
                bid_usd,
                message
            )

            return {"accepted": True}

        response = requests.post(
            f"{self.base}/tasks/{task_id}/bids",
            headers=self._headers(),
            json={
                "amount_usd": bid_usd,
                "message": message
            },
            timeout=30
        )

        response.raise_for_status()

        return response.json()

    def submit(self, task_id, result):

        if self.demo:

            logging.info(
                "DEMO SUBMIT | task=%s | result=%s",
                task_id,
                result[:300]
            )

            return {"submitted": True}

        response = requests.post(
            f"{self.base}/tasks/{task_id}/submit",
            headers=self._headers(),
            json={
                "result": result
            },
            timeout=60
        )

        response.raise_for_status()

        return response.json()


class Worker:

    SKILLS = {
        "research",
        "web",
        "data",
        "analysis",
        "text",
        "automation",
        "translation"
    }

    def decide(self, task: Task):

        minimum_reward = float(
            os.getenv("MIN_REWARD_USD", "5")
        )

        if task.reward_usd < minimum_reward:

            return Decision(
                False,
                0,
                "reward below minimum",
                0
            )

        overlap = len(
            self.SKILLS.intersection(
                set(map(str.lower, task.skills))
            )
        )

        score = min(
            1.0,
            0.45 + overlap * 0.18
        )

        if overlap == 0:

            return Decision(
                False,
                score,
                "required skills unavailable",
                0
            )

        bid = round(
            max(
                5,
                task.reward_usd * 0.92
            ),
            2
        )

        return Decision(
            score >= 0.63,
            score,
            "skills match",
            bid
        )

    def execute(self, task: Task):

        return json.dumps(
            {
                "task_id": task.id,
                "status": "completed",
                "worker": os.getenv(
                    "WORKER_NAME",
                    "PaidWorker"
                ),
                "note": (
                    "Task execution adapter is ready; "
                    "connect the permitted marketplace/task tools."
                )
            },
            ensure_ascii=False
        )

    def verify(self, result):

        try:

            data = json.loads(result)

            return (
                data.get("status") == "completed"
                and bool(data.get("task_id"))
            )

        except Exception:

            return False


def main():

    marketplace = Marketplace()
    worker = Worker()

    dry_run = (
        os.getenv(
            "DRY_RUN",
            "true"
        ).lower() == "true"
    )

    auto_bid = (
        os.getenv(
            "AUTO_BID",
            "false"
        ).lower() == "true"
    )

    logging.info(
        "Worker started | demo=%s | dry_run=%s | auto_bid=%s",
        marketplace.demo,
        dry_run,
        auto_bid
    )

    while True:

        try:

            tasks = marketplace.tasks()

            tasks = tasks[
                :int(
                    os.getenv(
                        "MAX_TASKS_PER_CYCLE",
                        "10"
                    )
                )
            ]

            for task in tasks:

                decision = worker.decide(task)

                logging.info(
                    "TASK %s | $%.2f | score=%.2f | accept=%s | %s",
                    task.id,
                    task.reward_usd,
                    decision.score,
                    decision.accept,
                    decision.reason
                )

                if not decision.accept:
                    continue

                if not auto_bid:
                    continue

                marketplace.bid(
                    task.id,
                    decision.bid_usd,
                    "I can complete this task using my available research/data workflow."
                )

            if dry_run:

                logging.info(
                    "Dry-run: no real payment action is performed."
                )

            time.sleep(
                int(
                    os.getenv(
                        "POLL_SECONDS",
                        "30"
                    )
                )
            )

        except KeyboardInterrupt:

            logging.info(
                "Worker stopped."
            )

            break

        except Exception:

            logging.exception(
                "Cycle failed; retrying."
            )

            time.sleep(10)


if __name__ == "__main__":
    main()import os
import time
import json
import logging
from dataclasses import dataclass

import requests
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)


@dataclass
class Task:
    id: str
    title: str
    description: str
    reward_usd: float
    skills: list[str]
    status: str = "open"


@dataclass
class Decision:
    accept: bool
    score: float
    reason: str
    bid_usd: float


class Marketplace:

    def __init__(self):
        self.base = os.getenv(
            "MARKETPLACE_BASE_URL", ""
        ).rstrip("/")

        self.key = os.getenv(
            "MARKETPLACE_API_KEY", ""
        )

        self.demo = not self.base

    def _headers(self):
        return {
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json"
        }

    def tasks(self):

        if self.demo:

            return [
                Task(
                    "demo-1",
                    "Product data extraction",
                    "Collect public product names, prices and URLs and return clean JSON.",
                    25,
                    ["research", "web", "data"]
                ),

                Task(
                    "demo-2",
                    "Simple logo design",
                    "Create a brand logo from a supplied brief.",
                    40,
                    ["design"]
                ),

                Task(
                    "demo-3",
                    "Price comparison",
                    "Compare public prices for a list of products.",
                    15,
                    ["research", "data"]
                )
            ]

        response = requests.get(
            f"{self.base}/tasks",
            headers=self._headers(),
            timeout=30
        )

        response.raise_for_status()

        return [
            Task(**task)
            for task in response.json()
        ]

    def bid(self, task_id, bid_usd, message):

        if self.demo:

            logging.info(
                "DEMO BID | task=%s | $%.2f | %s",
                task_id,
                bid_usd,
                message
            )

            return {"accepted": True}

        response = requests.post(
            f"{self.base}/tasks/{task_id}/bids",
            headers=self._headers(),
            json={
                "amount_usd": bid_usd,
                "message": message
            },
            timeout=30
        )

        response.raise_for_status()

        return response.json()

    def submit(self, task_id, result):

        if self.demo:

            logging.info(
                "DEMO SUBMIT | task=%s | result=%s",
                task_id,
                result[:300]
            )

            return {"submitted": True}

        response = requests.post(
            f"{self.base}/tasks/{task_id}/submit",
            headers=self._headers(),
            json={
                "result": result
            },
            timeout=60
        )

        response.raise_for_status()

        return response.json()


class Worker:

    SKILLS = {
        "research",
        "web",
        "data",
        "analysis",
        "text",
        "automation",
        "translation"
    }

    def decide(self, task: Task):

        minimum_reward = float(
            os.getenv("MIN_REWARD_USD", "5")
        )

        if task.reward_usd < minimum_reward:

            return Decision(
                False,
                0,
                "reward below minimum",
                0
            )

        overlap = len(
            self.SKILLS.intersection(
                set(map(str.lower, task.skills))
            )
        )

        score = min(
            1.0,
            0.45 + overlap * 0.18
        )

        if overlap == 0:

            return Decision(
                False,
                score,
                "required skills unavailable",
                0
            )

        bid = round(
            max(
                5,
                task.reward_usd * 0.92
            ),
            2
        )

        return Decision(
            score >= 0.63,
            score,
            "skills match",
            bid
        )

    def execute(self, task: Task):

        return json.dumps(
            {
                "task_id": task.id,
                "status": "completed",
                "worker": os.getenv(
                    "WORKER_NAME",
                    "PaidWorker"
                ),
                "note": (
                    "Task execution adapter is ready; "
                    "connect the permitted marketplace/task tools."
                )
            },
            ensure_ascii=False
        )

    def verify(self, result):

        try:

            data = json.loads(result)

            return (
                data.get("status") == "completed"
                and bool(data.get("task_id"))
            )

        except Exception:

            return False


def main():

    marketplace = Marketplace()
    worker = Worker()

    dry_run = (
        os.getenv(
            "DRY_RUN",
            "true"
        ).lower() == "true"
    )

    auto_bid = (
        os.getenv(
            "AUTO_BID",
            "false"
        ).lower() == "true"
    )

    logging.info(
        "Worker started | demo=%s | dry_run=%s | auto_bid=%s",
        marketplace.demo,
        dry_run,
        auto_bid
    )

    while True:

        try:

            tasks = marketplace.tasks()

            tasks = tasks[
                :int(
                    os.getenv(
                        "MAX_TASKS_PER_CYCLE",
                        "10"
                    )
                )
            ]

            for task in tasks:

                decision = worker.decide(task)

                logging.info(
                    "TASK %s | $%.2f | score=%.2f | accept=%s | %s",
                    task.id,
                    task.reward_usd,
                    decision.score,
                    decision.accept,
                    decision.reason
                )

                if not decision.accept:
                    continue

                if not auto_bid:
                    continue

                marketplace.bid(
                    task.id,
                    decision.bid_usd,
                    "I can complete this task using my available research/data workflow."
                )

            if dry_run:

                logging.info(
                    "Dry-run: no real payment action is performed."
                )

            time.sleep(
                int(
                    os.getenv(
                        "POLL_SECONDS",
                        "30
                    )
                )
            )

        except KeyboardInterrupt:

            logging.info(
                "Worker stopped."
            )

            break

        except Exception:

            logging.exception(
                "Cycle failed; retrying."
            )

            time.sleep(10)


if __name__ == "__main__":
    main()  return rules.map((r, index) => ({
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
