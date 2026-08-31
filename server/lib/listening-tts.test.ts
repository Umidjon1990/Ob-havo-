import assert from "node:assert/strict";
import { test } from "node:test";
import { textToSpeechArabic, type ListeningPassage } from "./listening";

test("payment-blocked ElevenLabs switches the whole dialog to OpenAI without retrying", async () => {
  const originalFetch = global.fetch;
  const originalElevenLabsKey = process.env.ELEVENLABS_API_KEY;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalIntegrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const originalIntegrationBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const requests: Array<{ url: string; body: any }> = [];

  process.env.ELEVENLABS_API_KEY = "eleven-test-key";
  process.env.OPENAI_API_KEY = "openai-test-key";
  delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

  global.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ url, body });

    if (url.includes("api.elevenlabs.io")) {
      return new Response(JSON.stringify({
        detail: { type: "payment_required", code: "payment_issue" },
      }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    if (url === "https://api.openai.com/v1/audio/speech") {
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "audio/mpeg" },
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  }) as typeof fetch;

  const passage: ListeningPassage = {
    arabicText: "مرحبا بكم",
    topicAr: "اختبار الصوت",
    topicUz: "Ovoz testi",
    dialog: [
      { speaker: "M", text: "مرحبا بكم في درس اليوم" },
      { speaker: "F", text: "شكرا لك أنا مستعدة الآن" },
    ],
  };

  try {
    const audio = await textToSpeechArabic(passage, {
      maleVoiceId: "eleven-male",
      femaleVoiceId: "eleven-female",
    });

    assert.ok(audio);
    assert.equal(audio.length, 6);
    assert.equal(requests.filter(request => request.url.includes("elevenlabs")).length, 1);
    const openAiRequests = requests.filter(request => request.url.includes("api.openai.com"));
    assert.equal(openAiRequests.length, 2);
    assert.deepEqual(openAiRequests.map(request => request.body.voice), ["onyx", "coral"]);
    assert.ok(openAiRequests.every(request => request.body.model === "gpt-4o-mini-tts"));
  } finally {
    global.fetch = originalFetch;
    if (originalElevenLabsKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalElevenLabsKey;
    if (originalOpenAiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalOpenAiKey;
    if (originalIntegrationKey === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    else process.env.AI_INTEGRATIONS_OPENAI_API_KEY = originalIntegrationKey;
    if (originalIntegrationBaseUrl === undefined) delete process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
    else process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = originalIntegrationBaseUrl;
  }
});
