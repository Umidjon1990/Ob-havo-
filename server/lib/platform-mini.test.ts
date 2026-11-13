import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import { normalizeMiniTest, registerMiniTestApi, validServiceKey } from "./platform-mini";

const key = "k".repeat(40);
const reading = {
  id: "r1",
  contentType: "reading",
  titleAr: "عنوان",
  titleUz: "Sarlavha",
  testDate: "2026-11-13",
  level: "A1A2",
  createdAt: "2026-11-13T06:00:00Z",
  payload: JSON.stringify({
    contentType: "reading",
    passage: { titleAr: "عنوان", paragraphsAr: ["أ", "ب", "ج"], paragraphsUz: ["a", "b", "c"], topicUz: "Mavzu" },
    quizzes: [
      { type: "multiple_choice", question: "س1", options: ["1", "2", "3", "4"], correctIndex: 2, explanation: "ت" },
      { question: "bad", options: ["x"], correctIndex: 5 },
    ],
  }),
};
const listening = {
  ...reading,
  id: "l1",
  contentType: "listening",
  audioBase64: "AAAA",
  payload: JSON.stringify({
    contentType: "listening",
    passage: { dialog: [{ speaker: "F", text: "مرحبا" }, { speaker: "M", text: "أهلا" }], topicUz: "Salom" },
    quizzes: [{ question: "س", options: ["a", "b", "c", "d"], correctIndex: 0, explanation: "" }],
  }),
};

test("service key is required and compared safely", () => {
  assert.equal(validServiceKey(key, key), true);
  assert.equal(validServiceKey("wrong", key), false);
  assert.equal(validServiceKey(key, "short"), false);
  assert.equal(validServiceKey(undefined, key), false);
});

test("payloads normalize to one safe shape and drop invalid questions", () => {
  const r: any = normalizeMiniTest(reading);
  assert.equal(r.type, "reading");
  assert.deepEqual(r.paragraphsAr, ["أ", "ب", "ج"]);
  assert.equal(r.questions.length, 1);
  assert.equal(r.questions[0].correctIndex, 2);
  const l: any = normalizeMiniTest(listening);
  assert.equal(l.type, "listening");
  assert.equal(l.hasAudio, true);
  assert.equal(l.transcript[0].speaker, "F");
  assert.equal(normalizeMiniTest({ ...reading, payload: "{" }), null);
});

test("mini-test API refuses callers without the key and serves list and detail", async () => {
  process.env.PLATFORM_SERVICE_SECRET = key;
  const app = express();
  registerMiniTestApi(app, {
    list: async () => [{ ...reading, hasAudio: false }, { ...listening, hasAudio: true }],
    get: async (id) => [reading, listening].find((t) => t.id === id),
  });
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + (server.address() as any).port;
  try {
    assert.equal((await fetch(base + "/api/platform/mini-tests")).status, 403);
    const h = { "x-platform-key": key };
    const list = await (await fetch(base + "/api/platform/mini-tests", { headers: h })).json();
    assert.equal(list.tests.length, 2);
    assert.equal(list.tests[1].hasAudio, true);
    assert.equal(list.tests[0].payload, undefined);
    const one = await (await fetch(base + "/api/platform/mini-tests/l1", { headers: h })).json();
    assert.equal(one.test.questions[0].correctIndex, 0);
    assert.equal(one.test.audioBase64, undefined);
    assert.equal((await fetch(base + "/api/platform/mini-tests/nope", { headers: h })).status, 404);
    assert.equal((await fetch(base + "/api/platform/mini-tests/..%2Fx", { headers: h })).status, 404);
  } finally {
    server.close();
  }
});
