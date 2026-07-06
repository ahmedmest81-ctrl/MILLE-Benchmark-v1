import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { generateBlueprintAsync } from "./blueprint-engine.mjs";
import { analyzeDataset } from "./dataset-profiler.mjs";
import { generateAiRefinement } from "./openai-blueprint-generator.mjs";
import { buildProjectZip, exportFilename } from "./project-export.mjs";
import { handleMcpJsonRpc, tools as mcpTools } from "./mcp-server.mjs";

const port = Number.parseInt(process.env.PORT || "4173", 10);
const host = process.env.HOST || "127.0.0.1";
const root = dirname(fileURLToPath(import.meta.url));
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".md": "text/markdown; charset=utf-8"
};

function resolvePath(url) {
  const requested = decodeURIComponent(new URL(url, `http://${host}:${port}`).pathname);
  const clean = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const target = join(root, clean === "/" ? "index.html" : clean);
  return existsSync(target) && statSync(target).isDirectory() ? join(target, "index.html") : target;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10_000_000) {
        reject(new Error("Request body is too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    request.on("error", reject);
  });
}

async function handleBlueprintApi(request, response) {
  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Use POST /api/blueprint." }));
    return;
  }

  try {
    const payload = await readJsonBody(request);
    const blueprint = await generateBlueprintAsync(payload);
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(blueprint));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message || "Could not generate blueprint." }));
  }
}

async function handleDatasetApi(request, response) {
  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Use POST /api/analyze-dataset." }));
    return;
  }

  try {
    const payload = await readJsonBody(request);
    const profile = analyzeDataset({
      csvText: payload.csv_text,
      filename: payload.filename,
      idea: payload.idea
    });
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(profile));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message || "Could not analyze dataset." }));
  }
}

async function handleExportApi(request, response) {
  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Use POST /api/export-project." }));
    return;
  }

  try {
    const payload = await readJsonBody(request);
    const blueprint = await generateBlueprintAsync(payload);
    const blockingGates = [
      ...(blueprint.consequences?.blocking || []),
      ...(blueprint.component_consequences?.blocking || [])
    ];
    if (blockingGates.length) {
      response.writeHead(409, { "content-type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          error: `Resolve ${blockingGates.length} blocking gate(s) before exporting starter code.`,
          blocking_gates: blockingGates.map((gate) => ({
            id: gate.id,
            message: gate.message
          }))
        })
      );
      return;
    }
    const zip = buildProjectZip(blueprint, {
      datasetCsv: payload.dataset_csv,
      datasetFilename: payload.dataset_filename
    });
    response.writeHead(200, {
      "content-disposition": `attachment; filename="${exportFilename(blueprint)}"`,
      "content-length": zip.length,
      "content-type": "application/zip"
    });
    response.end(zip);
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message || "Could not export project." }));
  }
}

async function handleAiBlueprintApi(request, response) {
  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Use POST /api/ai-blueprint." }));
    return;
  }

  try {
    const payload = await readJsonBody(request);
    const blueprint = await generateBlueprintAsync(payload);
    const ai = await generateAiRefinement(blueprint);
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ blueprint, ai }));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message || "Could not generate AI refinement." }));
  }
}

async function handleMcpApi(request, response) {
  if (request.method === "GET") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        name: "mille-modelblueprint",
        transport: "http-json-rpc",
        tools: mcpTools.map((tool) => ({ name: tool.name, description: tool.description }))
      })
    );
    return;
  }

  if (request.method !== "POST") {
    response.writeHead(405, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: "Use POST /mcp." }));
    return;
  }

  try {
    const message = await readJsonBody(request);
    const result = await handleMcpJsonRpc(message);
    if (!result) {
      response.writeHead(202, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ accepted: true }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(result));
  } catch (error) {
    response.writeHead(400, { "content-type": "application/json; charset=utf-8" });
    response.end(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: error.message || "Invalid MCP request." }
      })
    );
  }
}

createServer(async (request, response) => {
  if ((request.url || "").startsWith("/mcp")) {
    await handleMcpApi(request, response);
    return;
  }

  if ((request.url || "").startsWith("/api/blueprint")) {
    await handleBlueprintApi(request, response);
    return;
  }

  if ((request.url || "").startsWith("/api/analyze-dataset")) {
    await handleDatasetApi(request, response);
    return;
  }

  if ((request.url || "").startsWith("/api/export-project")) {
    await handleExportApi(request, response);
    return;
  }

  if ((request.url || "").startsWith("/api/ai-blueprint")) {
    await handleAiBlueprintApi(request, response);
    return;
  }

  const filePath = resolvePath(request.url || "/");
  if (!existsSync(filePath)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, { "content-type": types[extname(filePath)] || "application/octet-stream" });
  createReadStream(filePath).pipe(response);
}).listen(port, host, () => {
  console.log(`ModelBlueprint running at http://${host}:${port}`);
});
