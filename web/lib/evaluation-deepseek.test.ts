import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { tonightMcpServer } from "./mcp/server.ts";

/**
 * DeepSeek as a backend of the live runner, checked without a model call or a network
 * (docs/work/vibe-hypotheses §12.3).
 *
 * The adapter is driven against a stub `fetch` that plays both DeepSeek and the Tonight
 * proxy; the revision check against a stub reader and a scratch git repository; the
 * awaited turn loop against a backend that answers late. Nothing here starts a server.
 */

const EVALUATION = new URL("../../skills/tonight-recommend/evaluation/", import.meta.url);
const load = async <T>(name: string) => (await import(new URL(name, EVALUATION).href)) as T;

type Usage = {
  at: string;
  ms: number;
  model: string | null;
  finish_reason: string | null;
  prompt_cache_hit_tokens: number;
  prompt_cache_miss_tokens: number;
  completion_tokens: number;
  reasoning_tokens: number;
};
type Turn = {
  answer: string;
  session: string;
  failure: string | null;
  model: string | null;
  fingerprint: string | null;
  requests: Usage[];
};
type Backend = { turn: (said: string, config: string, resume: string | null, system: string) => Promise<Turn> };
type DeepSeek = {
  deepseekBackend: (options: {
    key: string;
    model?: string;
    base?: string;
    fetch: typeof fetch;
    now?: () => Date;
    maxRequests?: number;
  }) => Backend;
  functionTools: (tools: unknown[]) => { type: string; function: { name: string; parameters: Record<string, unknown> } }[];
  MAX_TOKENS: number;
  REASONING_EFFORT: string;
};
type Lean = {
  stopsTheRun: (failure: unknown) => boolean;
  runTurns: (
    requests: { key: string; text: string }[],
    options: { turn: (sent: string, resume: string | null) => Promise<unknown>; boundary: () => number | Promise<number> },
  ) => Promise<{ key: string; sent: string | null; failure: string | null; calls: [number, number]; session: string }[]>;
};
type Revision = {
  INSTRUCTION_FILES: string[];
  catalogDigest: (tools: { name: string; description?: string }[]) => string;
  expectedCatalog: (serverFile: string) => string;
  waitForCatalog: (options: {
    expected: string;
    read: () => Promise<string>;
    timeoutMs?: number;
    intervalMs?: number;
    sleep?: (ms: number) => Promise<void>;
    clock?: () => number;
  }) => Promise<string>;
  swapInstructions: (options: {
    target: string;
    git: (args: string[]) => string;
    on?: (event: string, handler: () => void) => void;
    exit?: (code: number) => void;
  }) => { head: string; against: string; restore: () => void };
  gitIn: (cwd: string) => (args: string[]) => string;
};

const deepseek = await load<DeepSeek>("deepseek.mjs");
const lean = await load<Lean>("lean.mjs");
const revision = await load<Revision>("revision.mjs");

const KEY = "sk-test-0123456789abcdef";
const PROXY = "http://localhost:3997/mcp";
const API = "https://api.example.test";

/** The per-run MCP config the CLI reads, as the runner writes it. */
function config(): string {
  const dir = mkdtempSync(join(tmpdir(), "tonight-ds-"));
  const file = join(dir, "mcp.json");
  writeFileSync(
    file,
    JSON.stringify({ mcpServers: { tonight: { type: "http", url: PROXY, headers: { Authorization: "Bearer tonight-token" } } } }),
  );
  return file;
}

type Reply = { status?: number; body: unknown } | { raw: string; status?: number } | Error | "timeout";

/**
 * A stub of both ends. DeepSeek answers from a script, one reply per request; the MCP
 * proxy lists one tool and answers each call from `tools`. Every request is kept.
 */
function stub(replies: Reply[], tools: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const sent: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const impl = (async (url: string, init: { body: string; headers: Record<string, string> }) => {
    const body = JSON.parse(init.body) as Record<string, unknown>;
    sent.push({ url, body, headers: init.headers });
    if (url === PROXY) {
      const method = body.method as string;
      const params = body.params as { name: string; arguments: Record<string, unknown> };
      const handler =
        method === "tools/list"
          ? (tools["tools/list"] ?? (() => ({ result: { tools: [{ name: "get_taste", description: "Read it.", inputSchema: { $schema: "x", type: "object", properties: {} } }] } })))
          : (tools[params.name] ?? (() => ({ result: { content: [{ type: "text", text: "{}" }] } })));
      const answer = handler(params?.arguments ?? {}) as { http?: number; raw?: string };
      // A hop that fails answers as it really would: a status and a body of its own.
      if (answer.http !== undefined) return new Response(answer.raw ?? "", { status: answer.http });
      return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, ...answer })}\n\n`, { status: 200 });
    }
    const reply = replies.shift();
    if (reply === undefined) throw new Error("the script ran out");
    if (reply === "timeout") throw Object.assign(new Error("aborted"), { name: "TimeoutError" });
    if (reply instanceof Error) throw reply;
    if ("raw" in reply) return new Response(reply.raw, { status: reply.status ?? 200 });
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  }) as unknown as typeof fetch;
  return { impl, sent, api: () => sent.filter((one) => one.url === `${API}/chat/completions`) };
}

const usage = { prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 20, completion_tokens: 30, completion_tokens_details: { reasoning_tokens: 12 } };
const answer = (message: Record<string, unknown>, finish = "stop") => ({
  body: { model: "deepseek-v4-pro", system_fingerprint: "fp_1", choices: [{ finish_reason: finish, message: { role: "assistant", ...message } }], usage },
});
const calling = (...calls: { id: string; name: string; args: string }[]) =>
  answer(
    {
      content: "",
      reasoning_content: "I should read their taste.",
      tool_calls: calls.map(({ id, name, args }) => ({ id, type: "function", function: { name, arguments: args } })),
    },
    "tool_calls",
  );

const backend = (replies: Reply[], tools?: Record<string, (args: Record<string, unknown>) => unknown>, maxRequests?: number) => {
  const ends = stub(replies, tools);
  return { ...ends, agent: deepseek.deepseekBackend({ key: KEY, base: API, fetch: ends.impl, maxRequests }) };
};

test("a turn runs the tools in order through the proxy and ends on the model's answer", async () => {
  const { agent, sent, api } = backend(
    [
      calling({ id: "c1", name: "get_taste", args: "{}" }, { id: "c2", name: "record_verdict", args: '{"film":{"title":"X","year":2008}}' }),
      answer({ content: "Saved, and here is why.", reasoning_content: "Done." }),
    ],
    { record_verdict: () => ({ result: { isError: true, content: [{ type: "text", text: '{"reason":"vibe_required"}' }] } }) },
  );
  const turn = await agent.turn("I liked it.", config(), null, "THE SKILLS");

  assert.equal(turn.failure, null);
  assert.equal(turn.answer, "Saved, and here is why.");
  assert.equal(turn.model, "deepseek-v4-pro");
  assert.equal(turn.fingerprint, "fp_1");

  // Through the proxy, as the CLI would: the list, then each call in the model's order.
  const proxied = sent.filter((one) => one.url === PROXY).map((one) => [one.body.method, (one.body.params as { name?: string }).name]);
  assert.deepEqual(proxied, [["tools/list", undefined], ["tools/call", "get_taste"], ["tools/call", "record_verdict"]]);
  assert.equal(sent.find((one) => one.url === PROXY)?.headers.Authorization, "Bearer tonight-token");

  // What the model was sent: the skills as the system prompt, Tonight's tools only, the
  // settings stated, and on the second request every message so far — the assistant's
  // whole, reasoning included, and each tool result under its call's id.
  const [first, second] = api().map((one) => one.body);
  assert.deepEqual((first!.messages as { role: string; content: string }[])[0], { role: "system", content: "THE SKILLS" });
  assert.deepEqual((first!.tools as { function: { name: string; parameters: Record<string, unknown> } }[]).map((tool) => tool.function.name), ["get_taste"]);
  assert.equal("$schema" in (first!.tools as { function: { parameters: Record<string, unknown> } }[])[0]!.function.parameters, false);
  assert.deepEqual(first!.thinking, { type: "enabled" });
  assert.equal(first!.reasoning_effort, deepseek.REASONING_EFFORT);
  assert.equal(first!.max_tokens, deepseek.MAX_TOKENS);
  const replayed = second!.messages as Record<string, unknown>[];
  assert.equal(replayed[2]!.reasoning_content, "I should read their taste.", "the reasoning was not sent back");
  assert.deepEqual(replayed.slice(3), [
    { role: "tool", tool_call_id: "c1", content: "{}" },
    { role: "tool", tool_call_id: "c2", content: 'Error: {"reason":"vibe_required"}' },
  ]);

  // Every request accounted for, apart from the turn.
  assert.equal(turn.requests.length, 2);
  assert.deepEqual(
    turn.requests.map(({ finish_reason, prompt_cache_hit_tokens, prompt_cache_miss_tokens, completion_tokens, reasoning_tokens }) => [
      finish_reason, prompt_cache_hit_tokens, prompt_cache_miss_tokens, completion_tokens, reasoning_tokens,
    ]),
    [["tool_calls", 100, 20, 30, 12], ["stop", 100, 20, 30, 12]],
  );
  assert.match(turn.requests[0]!.at, /^\d{4}-\d{2}-\d{2}T/);
});

test("a resumed turn continues the same conversation, reasoning included; an unknown one does not", async () => {
  const { agent, api } = backend([answer({ content: "First.", reasoning_content: "R1" }), answer({ content: "Second." })]);
  const file = config();
  const one = await agent.turn("Hello.", file, null, "SKILLS");
  const two = await agent.turn("{title:2} resolved", file, one.session, "SKILLS");
  assert.equal(two.session, one.session);
  assert.equal(two.answer, "Second.");
  const messages = api()[1]!.body.messages as Record<string, unknown>[];
  assert.deepEqual(messages.map((one) => one.role), ["system", "user", "assistant", "user"]);
  assert.equal(messages[2]!.reasoning_content, "R1", "an earlier turn's reasoning was dropped while tools are present");

  const lost = await agent.turn("Again.", file, "no-such-session", "SKILLS");
  assert.match(lost.failure ?? "", /^did not resume/);
});

test("only a stop is an answer: every other ending fails the turn, keeping the usage before it", async () => {
  for (const finish of ["length", "content_filter", "insufficient_system_resource", null]) {
    const { agent } = backend([calling({ id: "c1", name: "get_taste", args: "{}" }), answer({ content: "partial" }, finish as string)]);
    const turn = await agent.turn("Go.", config(), null, "S");
    assert.equal(turn.failure, `deepseek finish_reason ${finish ?? "missing"}`);
    assert.equal(turn.answer, "");
    assert.equal(turn.requests.length, 2, `${finish}: the usage before the failure was lost`);
  }
  // A stop that still carries tool calls is not an answer either.
  const { agent } = backend([answer({ content: "x", tool_calls: [{ id: "c", type: "function", function: { name: "get_taste", arguments: "{}" } }] }, "stop")]);
  assert.equal((await agent.turn("Go.", config(), null, "S")).failure, "deepseek finish_reason stop");
});

test("arguments that are not JSON, and a JSON-RPC error, are answered to the model as errors", async () => {
  const { agent, api, sent } = backend(
    [
      calling({ id: "bad", name: "get_taste", args: "{not json" }, { id: "rpc", name: "update_vibe", args: "{}" }),
      answer({ content: "Sorry." }),
    ],
    { update_vibe: () => ({ error: { code: -32602, message: "Invalid params: name is required" } }) },
  );
  const turn = await agent.turn("Go.", config(), null, "S");
  assert.equal(turn.failure, null);
  const tools = (api()[1]!.body.messages as Record<string, unknown>[]).filter((one) => one.role === "tool");
  assert.deepEqual(tools, [
    { role: "tool", tool_call_id: "bad", content: "Error: arguments are not valid JSON" },
    { role: "tool", tool_call_id: "rpc", content: "Error: Invalid params: name is required" },
  ]);
  // The one with bad arguments never reached Tonight.
  assert.equal(sent.filter((one) => one.url === PROXY && (one.body.params as { name?: string }).name === "get_taste").length, 0);
});

test("transport failures, a timeout and the request cap fail the turn — and every failed attempt is still accounted", async () => {
  // Each failed attempt is one API request on the books: when, how long, how it ended,
  // and usage it did not report as null — never zero, never missing.
  const attempt = (turn: Turn) => {
    assert.equal(turn.requests.length, 1, "a failed attempt is missing from the accounting");
    const [one] = turn.requests as (Usage & { outcome: string; status: number | null; usage_reported: boolean })[];
    assert.match(one!.at, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(typeof one!.ms, "number");
    return one!;
  };

  const reset = await backend([new Error("ECONNRESET")]).agent.turn("Go.", config(), null, "S");
  assert.match(reset.failure ?? "", /^deepseek request failed: ECONNRESET/);
  assert.equal(attempt(reset).outcome, "transport_error");

  const slow = await backend(["timeout"]).agent.turn("Go.", config(), null, "S");
  assert.match(slow.failure ?? "", /timed out after 300s/);
  assert.equal(attempt(slow).outcome, "transport_error");

  const gateway = await backend([{ raw: "<html>bad gateway</html>", status: 502 }]).agent.turn("Go.", config(), null, "S");
  assert.match(gateway.failure ?? "", /^deepseek HTTP 502 — <html>bad gateway/);
  const failed = attempt(gateway);
  assert.deepEqual(
    [failed.outcome, failed.status, failed.usage_reported, failed.prompt_cache_hit_tokens, failed.completion_tokens],
    ["http_error", 502, false, null, null],
  );

  const garbled = await backend([{ raw: "not json" }]).agent.turn("Go.", config(), null, "S");
  assert.equal(garbled.failure, "deepseek answered something that is not JSON");
  assert.equal(attempt(garbled).outcome, "not_json");

  const looping = Array.from({ length: 5 }, (_, n) => calling({ id: `c${n}`, name: "get_taste", args: "{}" }));
  const capped = await backend(looping, {}, 3).agent.turn("Go.", config(), null, "S");
  assert.equal(capped.failure, "error_max_turns");
  assert.equal(capped.requests.length, 3);
});

test("a hop to Tonight that fails is a failed turn, never an answer the model reads; a real JSON-RPC error is", async () => {
  // The proxy's own 502, exactly as it answers when the server is unreachable.
  const unreachable = { http: 502, raw: JSON.stringify({ error: "the evaluation proxy could not reach Tonight" }) };
  const call = await backend(
    [calling({ id: "c1", name: "record_verdict", args: "{}" }), answer({ content: "All saved!" })],
    { record_verdict: () => unreachable },
  ).agent.turn("Go.", config(), null, "S");
  assert.equal(call.failure, "mcp tools/call record_verdict: HTTP 502, no JSON-RPC answer");
  assert.equal(call.answer, "", "a turn whose write never reached Tonight came back as an answer");

  const list = await backend([answer({ content: "x" })], { "tools/list": () => unreachable }).agent.turn("Go.", config(), null, "S");
  assert.equal(list.failure, "mcp tools/list: HTTP 502, no JSON-RPC answer");
  assert.equal(list.requests.length, 0, "the model was asked anything without its tools");

  // A failure status with a genuine JSON-RPC error is the server's answer, and the model is told it.
  const rpc = backend(
    [calling({ id: "c1", name: "update_vibe", args: "{}" }), answer({ content: "Sorry." })],
    { update_vibe: () => ({ http: 400, raw: JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "Invalid params" } }) }) },
  );
  const told = await rpc.agent.turn("Go.", config(), null, "S");
  assert.equal(told.failure, null);
  const tool = (rpc.api()[1]!.body.messages as Record<string, unknown>[]).find((one) => one.role === "tool");
  assert.equal(tool?.content, "Error: Invalid params");
});

test("no money or a refused key stops the invocation, and the key never leaves the adapter", async () => {
  const broke = await backend([{ status: 402, body: { error: { message: "Insufficient Balance" } } }]).agent.turn("Go.", config(), null, "S");
  assert.equal(broke.failure, "deepseek HTTP 402 — Insufficient Balance");
  assert.ok(lean.stopsTheRun(broke.failure), "an empty account would fail every later run the same way");

  // An error body that echoes the key: redacted from the failure, and from everything returned.
  const echoed = await backend([{ status: 401, body: { error: { message: `Authentication Fails, your api key: ${KEY} is invalid` } } }]).agent.turn("Go.", config(), null, "S");
  assert.ok(lean.stopsTheRun(echoed.failure));
  assert.match(echoed.failure ?? "", /\[redacted\]/);
  for (const turn of [broke, echoed]) assert.equal(JSON.stringify(turn).includes(KEY), false, "the key left the adapter");

  // And a whole successful turn carries it nowhere either.
  const fine = await backend([calling({ id: "c", name: "get_taste", args: "{}" }), answer({ content: "ok" })]).agent.turn("Go.", config(), null, "S");
  assert.equal(JSON.stringify(fine).includes(KEY), false);
  assert.throws(() => deepseek.deepseekBackend({ key: "", fetch }), /DEEPSEEK_API_KEY is not set/);
});

test("the turn loop awaits a late backend before it reads the boundary, and settles after the last turn", async () => {
  let logged = 0;
  const order: string[] = [];
  const late = (said: string) =>
    new Promise<{ answer: string; session: string; failure: null }>((done) =>
      setTimeout(() => {
        logged += 2; // the backend's tool calls land in the log only after a delay
        order.push(`answered ${said}`);
        done({ answer: "1. **First Title** — my pick\n2. **Second Title**", session: "s1", failure: null });
      }, 20),
    );
  const turns = await lean.runTurns(
    [{ key: "bloom", text: "I liked it." }, { key: "pick", text: "{title:2}" }],
    { turn: (sent) => late(sent), boundary: () => logged },
  );
  order.push("settled");
  assert.deepEqual(turns.map((one) => one.calls), [[0, 2], [2, 4]], "a boundary was read before its turn finished");
  assert.equal(turns[1]!.sent, "Second Title");
  assert.deepEqual(order, ["answered I liked it.", "answered Second Title", "settled"]);

  // A failed turn stops the rest, and an unresolvable pick is never sent.
  let calls = 0;
  const stopped = await lean.runTurns(
    [{ key: "a", text: "x" }, { key: "b", text: "{title:3}" }, { key: "c", text: "y" }],
    { turn: async () => ((calls += 1), { answer: "no list here", session: "s", failure: null }), boundary: () => 0 },
  );
  assert.equal(calls, 1);
  assert.deepEqual(stopped.map((one) => [one.key, one.failure]), [["a", null], ["b", "no unambiguous title 3 to pick"]]);
});

test("the catalog check waits out a stale catalog, retries an unreadable one, and names both when it never matches", async () => {
  const fast = { timeoutMs: 400, intervalMs: 1 };
  const seen = ["stale", "stale", "expected"];
  assert.equal(await revision.waitForCatalog({ expected: "expected", read: async () => seen.shift()!, ...fast }), "expected");

  let reads = 0;
  const flaky = async () => {
    reads += 1;
    if (reads === 1) throw new Error("ECONNREFUSED");
    return "expected";
  };
  assert.equal(await revision.waitForCatalog({ expected: "expected", read: flaky, ...fast }), "expected");

  await assert.rejects(
    revision.waitForCatalog({ expected: "expected", read: async () => "baseline", timeoutMs: 30, intervalMs: 1 }),
    /never served the expected tool catalog: expected expected, last served baseline/,
  );
});

test("the catalog deadline holds for every read: a hanging read is abandoned, and a late match is refused", async () => {
  const started = Date.now();
  await assert.rejects(
    revision.waitForCatalog({ expected: "expected", read: () => new Promise<string>(() => {}), timeoutMs: 40, intervalMs: 1 }),
    /expected expected, last served no answer before the deadline/,
  );
  assert.ok(Date.now() - started < 2000, "a read that never answers held the wait past its deadline");

  // A matching catalog that arrives after the deadline is not evidence of what was served in time.
  let now = 0;
  await assert.rejects(
    revision.waitForCatalog({
      expected: "expected",
      read: async () => ((now = 500), "expected"),
      timeoutMs: 100,
      intervalMs: 1,
      clock: () => now,
    }),
    /last served expected, after the deadline/,
  );
});

test("a run's turns start only once its server serves the expected catalog — otherwise none does", async () => {
  type Checked = {
    checkedTurns: (
      requests: { key: string; text: string }[],
      options: { served?: () => Promise<string>; expected: string | null; turn: (sent: string, resume: string | null) => Promise<unknown>; boundary: () => number },
    ) => Promise<{ digest: string | null; turns: { failure: string | null; called: boolean; sent: string | null }[] }>;
  };
  const { checkedTurns } = await load<Checked>("lean.mjs");
  const requests = [{ key: "bloom-clever", text: "I liked it." }];
  let called = 0;
  const turn = async () => ((called += 1), { answer: "ok", session: "s", failure: null });

  const unreadable = await checkedTurns(requests, { served: async () => { throw new Error("ECONNREFUSED"); }, expected: "abc", turn, boundary: () => 0 });
  assert.deepEqual(unreadable.turns.map((one) => [one.called, one.sent]), [[false, null]]);
  assert.equal(unreadable.turns[0]!.failure, "the server served catalog unreadable (ECONNREFUSED), not the expected abc");

  const stale = await checkedTurns(requests, { served: async () => "old", expected: "abc", turn, boundary: () => 0 });
  assert.equal(stale.turns[0]!.failure, "the server served catalog old, not the expected abc");
  assert.equal(called, 0, "a model was called against the wrong instructions");

  const right = await checkedTurns(requests, { served: async () => "abc", expected: "abc", turn, boundary: () => 0 });
  assert.equal(right.digest, "abc");
  assert.equal(called, 1);

  // No check at all for a plain Claude run: no digest, and the turns run as before.
  assert.equal((await checkedTurns(requests, { expected: null, turn, boundary: () => 0 })).digest, null);
  assert.equal(called, 2);
});

test("the expected catalog is the one the server.ts on disk registers, read in a fresh process", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const tools = (
    tonightMcpServer({ user: { id: "google:catalog" }, reference: "catalog" } as never) as unknown as {
      _registeredTools: Record<string, { description?: string }>;
    }
  )._registeredTools;
  const inProcess = revision.catalogDigest(Object.entries(tools).map(([name, tool]) => ({ name, description: tool.description })));
  assert.equal(revision.expectedCatalog(join(here, "mcp", "server.ts")), inProcess);
  // Order does not matter; a description does.
  assert.equal(revision.catalogDigest([{ name: "b", description: "2" }, { name: "a", description: "1" }]), revision.catalogDigest([{ name: "a", description: "1" }, { name: "b", description: "2" }]));
  assert.notEqual(revision.catalogDigest([{ name: "a", description: "1" }]), revision.catalogDigest([{ name: "a", description: "1 changed" }]));
});

test("--against swaps a commit's instruction files in only from a clean tree, and puts them back however it ends", () => {
  const repo = mkdtempSync(join(tmpdir(), "tonight-against-"));
  const git = revision.gitIn(repo);
  const write = (text: string) => {
    for (const file of revision.INSTRUCTION_FILES) {
      mkdirSync(join(repo, dirname(file)), { recursive: true });
      writeFileSync(join(repo, file), `${text} ${file}\n`);
    }
  };
  const read = (file: string) => readFileSync(join(repo, file), "utf8");
  git(["init", "-q"]);
  const commit = (message: string) => git(["-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-q", "-am", message]);
  write("baseline");
  git(["add", "."]);
  commit("baseline");
  const baseline = git(["rev-parse", "HEAD"]).trim();
  write("current");
  commit("current");

  // Each handler the swap installs, by event, so they can be fired as the process would.
  const installed = () => {
    const handlers: Record<string, () => void> = {};
    const exits: number[] = [];
    return { handlers, exits, on: (event: string, handler: () => void) => void (handlers[event] = handler), exit: (code: number) => void exits.push(code) };
  };

  // Swapped in, then put back on exit — and a second restore changes nothing.
  const one = installed();
  const swap = revision.swapInstructions({ target: baseline.slice(0, 7), git, on: one.on, exit: one.exit });
  assert.equal(swap.against, baseline, "the target was not frozen to its full sha");
  for (const file of revision.INSTRUCTION_FILES) assert.equal(read(file), `baseline ${file}\n`);
  assert.equal(git(["diff", "--cached", "--name-only"]).trim(), "", "the swap touched the index");
  one.handlers.exit!();
  one.handlers.exit!();
  for (const file of revision.INSTRUCTION_FILES) assert.equal(read(file), `current ${file}\n`);
  assert.equal(git(["status", "--porcelain"]).trim(), "");

  // On a signal: put back, then exit with the signal's code.
  const two = installed();
  revision.swapInstructions({ target: baseline, git, on: two.on, exit: two.exit });
  two.handlers.SIGINT!();
  assert.deepEqual(two.exits, [130]);
  assert.equal(read(revision.INSTRUCTION_FILES[2]!), `current ${revision.INSTRUCTION_FILES[2]}\n`);

  // A thrown error ends the process through `exit`, which puts them back as well.
  const three = installed();
  revision.swapInstructions({ target: baseline, git, on: three.on, exit: three.exit });
  assert.throws(() => {
    try {
      throw new Error("a run failed");
    } finally {
      three.handlers.exit!();
    }
  }, /a run failed/);
  assert.equal(git(["status", "--porcelain"]).trim(), "");

  // A dirty tree is refused before anything is touched.
  writeFileSync(join(repo, revision.INSTRUCTION_FILES[0]!), "an edit nobody committed\n");
  assert.throws(() => revision.swapInstructions({ target: baseline, git, on: () => {}, exit: () => {} }), /needs a clean tracked tree/);
  assert.equal(read(revision.INSTRUCTION_FILES[0]!), "an edit nobody committed\n");
  rmSync(repo, { recursive: true, force: true });
});

test("the runner keeps Claude as it was, and runs DeepSeek and --against only when asked", () => {
  const runner = readFileSync(new URL("m5/run.mjs", EVALUATION), "utf8");
  // Claude unless asked: the CLI, its host and its default model, as before.
  assert.match(runner, /const BACKEND = option\("backend", "claude"\);/);
  assert.match(runner, /const MODEL = option\("model", DEEPSEEK \? DEEPSEEK_MODEL : "claude-sonnet-5"\);/);
  assert.match(runner, /const HOST = agentHost\(option\("host", "bare"\)\);/);
  assert.match(runner, /return AGENT === null \? claudeTurn\(said, config, resume\) : AGENT\.turn\(said, config, resume, systemPrompt\(\)\);/);
  assert.match(runner, /const CLI = DEEPSEEK \? "none \(DeepSeek API\)" : execFileSync\("claude", \["--version"\]/);
  // DeepSeek: no CLI host — its own line, isolation and results directory — a key from
  // the environment, and a committed harness.
  assert.match(runner, /if \(args\.includes\("--host"\)\) throw new Error/);
  assert.match(runner, /Object\.assign\(HOST, \{\s*line: `DeepSeek API/);
  assert.match(runner, /suffix: `-deepseek-\$\{MODEL\}`,/);
  assert.match(runner, /!process\.env\.DEEPSEEK_API_KEY\) throw new Error/);
  assert.match(runner, /"status", "--porcelain", "--untracked-files=no", "--", "skills\/tonight-recommend\/evaluation"/);
  // --against: swapped before anything reads the instructions, and guarded against the target.
  assert.ok(
    runner.indexOf("const SWAP = AGAINST === null ? null : swapInstructions(") < runner.indexOf("const VERSION = version();"),
    "the instructions are read before the swap",
  );
  assert.match(runner, /const against = SWAP\?\.against \?\? "HEAD";/);
  assert.match(runner, /execFileSync\("git", \["diff", "--quiet", against, "--", file\]/);
  // The catalog: proven before the first run is seeded, and recorded on every run.
  const check = runner.indexOf("await waitForCatalog({ expected: EXPECTED_CATALOG");
  assert.ok(check > runner.indexOf("if (DRY) process.exit(0);"), "a dry run waits for a server");
  assert.ok(check < runner.lastIndexOf("for (const { scenario, index } of work)"), "a run is seeded before the catalog is proven");
  assert.match(runner, /EXPECTED_CATALOG = expectedCatalog\(join\(ROOT, "web", "lib", "mcp", "server\.ts"\)\);/);
  assert.match(runner, /`harness: \$\{HARNESS\}`, `tools_digest: \$\{result\.toolsDigest\} \(expected \$\{EXPECTED_CATALOG\}\)`/);
  // Usage: every API request, in a file of its own, and the totals in the header.
  assert.match(runner, /usageFile = `usage\/\$\{name\}\.jsonl`;/);
  assert.match(runner, /`usage: \$\{usageLine\(result\.turns\)\}`/);
});

test("the tool schemas DeepSeek is given are Tonight's, without the JSON Schema dialect line", () => {
  const mapped = deepseek.functionTools([{ name: "t", description: "d", inputSchema: { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object", properties: { a: { type: "string" } } } }]);
  assert.deepEqual(mapped, [{ type: "function", function: { name: "t", description: "d", parameters: { type: "object", properties: { a: { type: "string" } } } } }]);
});
