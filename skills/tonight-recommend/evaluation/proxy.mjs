/**
 * An evaluation-only proxy in front of Tonight's MCP endpoint.
 *
 *   node evaluation/proxy.mjs --log runs/logs/03-state-rich__plain__01.jsonl
 *   node evaluation/proxy.mjs --log <file> --fail get_taste
 *
 * Two jobs, and nothing in production depends on either.
 *
 * ## It records what the host actually did
 *
 * A recorded answer cannot say whether `get_taste` was called or what came back,
 * and a transcript written by the agent could say anything. This writes one line
 * of JSON per JSON-RPC call it forwards — method, tool name, arguments, the
 * answer, how long it took — so a reviewer scoring the rubric later reads
 * machine-written evidence rather than the agent's account of itself.
 *
 * **It sees Tonight and nothing else.** This is a proxy in front of one MCP
 * endpoint. A host-native web search, a film database, anything the host runs
 * itself, never passes through here — so this log is evidence about Tonight and
 * is not evidence that no other tool was used. Whether a claim about the world
 * had a tool behind it is answered by the host's own traces, captured separately;
 * the runbook's step 5 is how, and the three states it defines are what stop an
 * absence of evidence being read as evidence of absence.
 *
 * ## It can make one tool call fail, without touching production
 *
 * `--fail get_taste` is how AC6 is produced. Everything else is forwarded to the
 * real server untouched: `initialize` succeeds, `tools/list` returns all eleven,
 * `get_server_info` answers. The connection is real and the host has working
 * tools — and then the one call fails.
 *
 * That distinction is the finding this exists for. A connector that cannot
 * authenticate tests a host with no Tonight at all, which is a different scenario
 * and not the one strategy §10.1.1 is about.
 *
 * The refusal is returned in the shape the server's own `attempt()` produces for
 * a refusal — `isError` with the reason as text — because that is MCP's way of
 * saying "this tool failed" and the way a model is guaranteed to be told. The
 * *message* is written here rather than provoked from the store, which is the one
 * thing about this that is simulated; the runbook says so.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { dirname } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};

const ORIGIN = option("origin", process.env.TONIGHT_ORIGIN ?? "http://localhost:3000");
const PORT = Number(option("port", "3999"));
const LOG = option("log", null);
const FAILING = new Set(args.flatMap((arg, at) => (args[at - 1] === "--fail" ? [arg] : [])));

/** What a failed `get_taste` says. See the note above about what is simulated. */
const REFUSAL = "Tonight could not read your taste model: the store did not answer.";

if (LOG) mkdirSync(dirname(LOG), { recursive: true });

function record(entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  if (LOG) appendFileSync(LOG, `${line}\n`);
  else console.log(line);
}

createServer(async (incoming, outgoing) => {
  // Who is answering on this port. A runner that merely finds *something*
  // listening can hand an agent to a proxy left over from the previous run, and
  // that run's calls then land in the previous run's log with nothing to say so.
  if (incoming.url === "/__evaluation") {
    outgoing.writeHead(200, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ pid: process.pid, log: LOG, failing: [...FAILING] }));
    return;
  }

  const chunks = [];
  for await (const chunk of incoming) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");

  let call = null;
  try {
    call = body ? JSON.parse(body) : null;
  } catch {
    // Not JSON-RPC — a discovery GET, or something else. Forwarded either way.
  }

  const tool = call?.method === "tools/call" ? call.params?.name : null;
  const started = Date.now();

  if (tool && FAILING.has(tool)) {
    // The shape a refusal really has, taken from the server rather than guessed:
    // `resultType` is required by this protocol revision, and without it a client
    // rejects the answer as malformed — which would make the agent report a
    // schema problem instead of the tool failure this is meant to produce.
    const answer = {
      jsonrpc: "2.0",
      id: call.id,
      result: {
        content: [{ type: "text", text: REFUSAL }],
        isError: true,
        resultType: "complete",
        _meta: { "io.modelcontextprotocol/serverInfo": { name: "Tonight", version: "0.1.0" } },
      },
    };
    record({ method: call.method, tool, arguments: call.params?.arguments ?? {}, failed: true, result: answer.result });
    outgoing.writeHead(200, { "content-type": "application/json" });
    outgoing.end(JSON.stringify(answer));
    return;
  }

  const headers = Object.fromEntries(
    Object.entries(incoming.headers).filter(([name]) => name !== "host" && name !== "content-length"),
  );

  let response;
  try {
    response = await fetch(`${ORIGIN}${incoming.url}`, {
      method: incoming.method,
      headers,
      body: incoming.method === "GET" || incoming.method === "HEAD" ? undefined : body,
    });
  } catch (error) {
    record({ method: call?.method ?? incoming.method, tool, unreachable: String(error) });
    outgoing.writeHead(502, { "content-type": "application/json" });
    outgoing.end(JSON.stringify({ error: "the evaluation proxy could not reach Tonight" }));
    return;
  }

  const answer = await response.text();
  // Tool calls carry their result, and so does discovery: what the host was
  // offered is provenance an artifact has to be able to state.
  const discovery = call?.method === "tools/list";
  record({
    method: call?.method ?? incoming.method,
    ...(tool ? { tool, arguments: call.params?.arguments ?? {} } : {}),
    status: response.status,
    ms: Date.now() - started,
    ...(tool ? { result: parse(answer) } : {}),
    ...(discovery ? { discovered: parse(answer)?.tools?.length } : {}),
  });

  outgoing.writeHead(response.status, {
    "content-type": response.headers.get("content-type") ?? "application/json",
  });
  outgoing.end(answer);
}).listen(PORT, () => {
  console.error(
    `Evaluation proxy on http://localhost:${PORT} → ${ORIGIN}` +
      `${FAILING.size ? `, failing: ${[...FAILING].join(", ")}` : ""}` +
      `${LOG ? `, logging to ${LOG}` : ""}`,
  );
});

/** The server answers tool calls as SSE; the log wants the JSON inside it. */
function parse(text) {
  const line = text.split("\n").find((one) => one.startsWith("data: "));
  try {
    return JSON.parse(line ? line.slice(6) : text).result ?? JSON.parse(line ? line.slice(6) : text);
  } catch {
    return text.slice(0, 2000);
  }
}
