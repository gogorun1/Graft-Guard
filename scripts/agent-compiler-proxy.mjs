import http from "node:http";

const port = Number(process.env.PORT ?? 8787);
const apiKey = process.env.MINIMAX_API_KEY ?? "";
const apiUrl = process.env.MINIMAX_API_URL ?? "";
const model = process.env.MINIMAX_MODEL ?? "MiniMax-M1";

const server = http.createServer(async (request, response) => {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST" || request.url !== "/compile-tool-group") {
    sendJson(response, 404, { error: "Not found" });
    return;
  }

  if (!apiKey || !apiUrl) {
    sendJson(response, 503, {
      error: "MINIMAX_API_KEY and MINIMAX_API_URL must be configured on the proxy.",
    });
    return;
  }

  try {
    const body = await readJson(request);
    const compilerResponse = await callCompiler(body);
    sendJson(response, 200, compilerResponse);
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Graft Guard agent compiler proxy listening on http://127.0.0.1:${port}`);
});

async function callCompiler(body) {
  const prompt = [
    "You are the Graft Guard Agent Compiler.",
    "Return only strict JSON for a compiled tool group.",
    "The output must include name, description, tools, workflowPlan, and riskNotes.",
    "Use export risk for tools that expose bank or account data.",
    "",
    "User prompt:",
    body.prompt,
    "",
    "Page summary:",
    JSON.stringify(body.pageSummary, null, 2),
  ].join("\n");

  const upstream = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: body.model ?? model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    }),
  });

  if (!upstream.ok) {
    throw new Error(`MiniMax API failed: ${upstream.status}`);
  }

  const payload = await upstream.json();
  const text = extractText(payload);
  return parseJsonResponse(text);
}

function extractText(payload) {
  const candidates = [
    payload?.choices?.[0]?.message?.content,
    payload?.choices?.[0]?.text,
    payload?.reply,
    payload?.output,
    payload?.text,
  ];

  const text = candidates.find((item) => typeof item === "string" && item.trim().length > 0);
  if (!text) {
    throw new Error("MiniMax response did not include text content.");
  }
  return text;
}

function parseJsonResponse(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  return JSON.parse(raw);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      data += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}
