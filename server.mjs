import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".csv": "text/csv; charset=utf-8"
};

function json(res, status, value) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function ollamaRequest(endpoint, options = {}) {
  const response = await fetch(`http://127.0.0.1:11434${endpoint}`, {
    signal: AbortSignal.timeout(30000),
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) }
  });
  if (!response.ok) throw new Error(`Ollama returned ${response.status}`);
  return response.json();
}

async function handleApi(req, res, url) {
  if (url.pathname === "/api/health") {
    try {
      const data = await ollamaRequest("/api/tags");
      return json(res, 200, {
        ok: true,
        ollama: true,
        models: (data.models || []).map((model) => model.name)
      });
    } catch {
      return json(res, 200, { ok: true, ollama: false, models: [] });
    }
  }

  if (url.pathname === "/api/chat" && req.method === "POST") {
    try {
      const body = await readBody(req);
      const result = await ollamaRequest("/api/chat", {
        method: "POST",
        body: JSON.stringify({
          model: body.model || "qwen3:4b",
          stream: false,
          options: { temperature: 0.35, num_predict: 100 },
          messages: body.messages || []
        })
      });
      return json(res, 200, { message: result.message?.content || "" });
    } catch (error) {
      return json(res, 503, { error: error.message });
    }
  }

  return json(res, 404, { error: "Not found" });
}

async function serveStatic(res, url) {
  let requestPath = decodeURIComponent(url.pathname);
  if (requestPath === "/") requestPath = "/index.html";
  const filePath = path.resolve(publicDir, `.${requestPath}`);
  if (!filePath.startsWith(publicDir)) return json(res, 403, { error: "Forbidden" });

  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("Not a file");
    const content = await readFile(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(content);
  } catch {
    json(res, 404, { error: "Not found" });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(res, url);
  } catch (error) {
    json(res, 500, { error: error.message });
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Local AI Call Studio is running at http://127.0.0.1:${port}`);
});
