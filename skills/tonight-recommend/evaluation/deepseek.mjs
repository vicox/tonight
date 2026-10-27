/**
 * DeepSeek as the agent behind an M5/M6 run, instead of `claude -p`
 * (docs/work/vibe-hypotheses §12).
 *
 * The smallest loop that stands in for a host: the model is given the same system
 * prompt a Claude run is given and Tonight's tools and nothing else, and every tool
 * call goes through the evaluation proxy — so the proxy log, the transcript, the turn
 * boundaries and the snapshots are produced exactly as for a Claude run. It reads the
 * per-run MCP config file the CLI reads, and nothing else about the run.
 *
 * Plain `fetch`, no SDK. What it sends, every request, and why:
 *
 * - `thinking: enabled`, `reasoning_effort: high`, `max_tokens: 32768` — explicit
 *   rather than the provider's defaults, so a recording says what it ran with;
 * - the whole conversation, each assistant message exactly as the API returned it —
 *   with tools present, DeepSeek requires every `reasoning_content` sent back, in
 *   later turns too, and answers 400 otherwise.
 *
 * A turn succeeds only on `finish_reason: "stop"`. A tool result is the tool's text;
 * one the server marked `isError` is prefixed `Error: ` — this adapter's convention,
 * not verified to be what the CLI shows Claude. The key is never logged, recorded or
 * put in a failure: everything that leaves here is redacted first.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

export const DEEPSEEK_BASE = "https://api.deepseek.com";
export const DEEPSEEK_MODEL = "deepseek-v4-pro";
export const MAX_REQUESTS_PER_TURN = 40;
export const MAX_TOKENS = 32768;
export const REASONING_EFFORT = "high";
export const REQUEST_TIMEOUT_MS = 300_000;

/** The MCP protocol version the seeder speaks; the server is stateless and takes it per request. */
const PROTOCOL_VERSION = "2026-07-28";

/** What a recording says the adapter ran with — no key, nothing secret. */
export const settingsLine = (base = DEEPSEEK_BASE) =>
  `${base}/chat/completions; thinking enabled, reasoning_effort ${REASONING_EFFORT}, max_tokens ${MAX_TOKENS}, ` +
  `timeout ${REQUEST_TIMEOUT_MS / 1000}s, at most ${MAX_REQUESTS_PER_TURN} API requests a turn`;

/**
 * One JSON-RPC call to a Tonight MCP endpoint, the way the seeder makes it: stateless,
 * answered as SSE or as JSON. Throws when there is no JSON-RPC answer to read.
 */
export async function mcp(fetchImpl, url, headers, method, params = {}) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
      "mcp-method": method,
      ...(method === "tools/call" ? { "mcp-name": params.name } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params: {
        ...params,
        _meta: {
          "io.modelcontextprotocol/protocolVersion": PROTOCOL_VERSION,
          "io.modelcontextprotocol/clientInfo": { name: "tonight-deepseek-evaluation", version: "1.0.0" },
          "io.modelcontextprotocol/clientCapabilities": {},
        },
      },
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = await response.text();
  const line = body.split("\n").find((one) => one.startsWith("data: "));
  try {
    return JSON.parse(line ? line.slice(6) : body);
  } catch {
    throw new Error(`HTTP ${response.status}, no JSON-RPC answer`);
  }
}

/** Tonight's tools as OpenAI-style function tools: the MCP input schema is the parameters. */
export function functionTools(tools) {
  return tools.map(({ name, description, inputSchema }) => {
    const { $schema: _dropped, ...parameters } = inputSchema ?? { type: "object", properties: {} };
    return { type: "function", function: { name, description: description ?? "", parameters } };
  });
}

/** What the model is told a tool answered: its text, marked when the server marked it an error. */
export function toolText(answer) {
  if (answer.error) return `Error: ${answer.error.message ?? JSON.stringify(answer.error)}`;
  const text = (answer.result?.content ?? [])
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
  const said = text || JSON.stringify(answer.result?.structuredContent ?? {});
  return answer.result?.isError ? `Error: ${said}` : said;
}

/** The proxy and the bearer a run's agent uses, read from the MCP config the CLI would read. */
function target(configFile) {
  const server = JSON.parse(readFileSync(configFile, "utf8")).mcpServers?.tonight;
  if (!server?.url) throw new Error("the run's MCP config names no tonight server");
  return { url: server.url, headers: server.headers ?? {} };
}

/** One API request's accounting: what it cost, when, and how it ended. Never the key. */
function usageOf(body, started, ms) {
  const usage = body?.usage ?? {};
  return {
    at: started.toISOString(),
    ms,
    model: body?.model ?? null,
    finish_reason: body?.choices?.[0]?.finish_reason ?? null,
    prompt_cache_hit_tokens: usage.prompt_cache_hit_tokens ?? 0,
    prompt_cache_miss_tokens: usage.prompt_cache_miss_tokens ?? 0,
    completion_tokens: usage.completion_tokens ?? 0,
    reasoning_tokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
  };
}

/**
 * A DeepSeek backend for one invocation of the runner. Conversations live in memory,
 * under a session id of its own, so a follow-up turn resumes as `claude --resume` does.
 */
export function deepseekBackend({
  key,
  model = DEEPSEEK_MODEL,
  base = DEEPSEEK_BASE,
  fetch: fetchImpl = fetch,
  now = () => new Date(),
  maxRequests = MAX_REQUESTS_PER_TURN,
}) {
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set");
  const redact = (text) => String(text).split(key).join("[redacted]");
  const sessions = new Map();

  return {
    /**
     * One user turn: their message, then the model and the tools until the model
     * answers. Returns what the runner records, with every API request's usage —
     * a failed turn's included.
     */
    async turn(said, configFile, resume, system) {
      const requests = [];
      let session = resume;
      let lastModel = null;
      let fingerprint = null;
      const end = (fields) => ({
        answer: "",
        session,
        model: lastModel,
        fingerprint,
        requests,
        ...fields,
        failure: fields.failure ? redact(fields.failure).slice(0, 500) : null,
      });

      let conversation;
      if (resume === null) {
        session = randomUUID();
        conversation = [{ role: "system", content: system }];
        sessions.set(session, conversation);
      } else {
        conversation = sessions.get(resume);
        if (!conversation) return end({ session: "unknown", failure: `did not resume: no conversation ${resume}` });
      }

      let mcpTarget;
      let tools;
      try {
        mcpTarget = target(configFile);
        const listed = await mcp(fetchImpl, mcpTarget.url, mcpTarget.headers, "tools/list");
        if (listed.error) throw new Error(listed.error.message ?? JSON.stringify(listed.error));
        tools = functionTools(listed.result.tools);
      } catch (error) {
        return end({ failure: `mcp tools/list: ${error.message}` });
      }

      conversation.push({ role: "user", content: said });
      for (let request = 1; ; request += 1) {
        if (request > maxRequests) return end({ failure: "error_max_turns" });

        const started = now();
        let response;
        let text;
        try {
          response = await fetchImpl(`${base}/chat/completions`, {
            method: "POST",
            headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
            body: JSON.stringify({
              model,
              messages: conversation,
              tools,
              thinking: { type: "enabled" },
              reasoning_effort: REASONING_EFFORT,
              max_tokens: MAX_TOKENS,
            }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          text = await response.text();
        } catch (error) {
          const why = error?.name === "TimeoutError" ? `timed out after ${REQUEST_TIMEOUT_MS / 1000}s` : error?.message;
          return end({ failure: `deepseek request failed: ${why}` });
        }
        const ms = now().getTime() - started.getTime();

        let body = null;
        try {
          body = JSON.parse(text);
        } catch {
          // not JSON: an HTTP error page, or a truncated answer — said below
        }
        if (!response.ok) {
          return end({ failure: `deepseek HTTP ${response.status} — ${body?.error?.message ?? text.slice(0, 300)}` });
        }
        if (body === null) return end({ failure: "deepseek answered something that is not JSON" });

        requests.push(usageOf(body, started, ms));
        lastModel = body.model ?? lastModel;
        fingerprint = body.system_fingerprint ?? fingerprint;

        const choice = body.choices?.[0];
        const message = choice?.message;
        if (!message) return end({ failure: "deepseek answered no message" });
        // Whole, as the API returned it: `reasoning_content` has to go back with it.
        conversation.push(message);

        if (choice.finish_reason === "tool_calls" && message.tool_calls?.length) {
          for (const call of message.tool_calls) {
            let args;
            try {
              args = JSON.parse(call.function?.arguments || "{}");
            } catch {
              args = null;
            }
            let content;
            if (args === null || typeof args !== "object" || Array.isArray(args)) {
              content = "Error: arguments are not valid JSON";
            } else {
              try {
                content = toolText(
                  await mcp(fetchImpl, mcpTarget.url, mcpTarget.headers, "tools/call", {
                    name: call.function.name,
                    arguments: args,
                  }),
                );
              } catch (error) {
                return end({ failure: `mcp tools/call ${call.function?.name}: ${error.message}` });
              }
            }
            conversation.push({ role: "tool", tool_call_id: call.id, content });
          }
          continue;
        }

        if (choice.finish_reason === "stop" && !message.tool_calls?.length) {
          return end({ answer: message.content ?? "" });
        }
        return end({ failure: `deepseek finish_reason ${choice.finish_reason ?? "missing"}` });
      }
    },
  };
}
