import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import test from "node:test";

const nodePath = process.execPath;

function startServer() {
  const child = spawn(nodePath, ["mcp-server.mjs"], {
    cwd: new URL("..", import.meta.url),
    stdio: ["pipe", "pipe", "pipe"]
  });
  const pending = new Map();
  let buffer = "";

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line.trim()) {
        const message = JSON.parse(line);
        const resolver = pending.get(message.id);
        if (resolver) {
          pending.delete(message.id);
          resolver(message);
        }
      }
      newline = buffer.indexOf("\n");
    }
  });

  let id = 0;
  function request(method, params = {}) {
    id += 1;
    const currentId = id;
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: currentId, method, params })}\n`);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(currentId);
        reject(new Error(`Timed out waiting for ${method}`));
      }, 5000);
      pending.set(currentId, (message) => {
        clearTimeout(timeout);
        resolve(message);
      });
    });
  }

  return {
    child,
    request,
    close() {
      child.kill();
    }
  };
}

test("MILLE MCP server initializes and lists expected tools", async () => {
  const server = startServer();
  try {
    const initialized = await server.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0.0.0" }
    });
    assert.equal(initialized.result.serverInfo.name, "mille-modelblueprint");

    const listed = await server.request("tools/list");
    const names = listed.result.tools.map((tool) => tool.name);
    assert.deepEqual(
      names,
      [
        "mille_generate_blueprint",
        "mille_profile_dataset",
        "mille_search_knowledge",
        "mille_validate_contract",
        "mille_score_blueprint",
        "mille_export_project"
      ]
    );
  } finally {
    server.close();
  }
});

test("MILLE MCP server calls blueprint and dataset tools", async () => {
  const server = startServer();
  try {
    await server.request("initialize");

    const profileResponse = await server.request("tools/call", {
      name: "mille_profile_dataset",
      arguments: {
        csv_text: "transaction_id,amount,is_fraud\nt1,10,0\nt2,20,1",
        filename: "fraud.csv",
        idea: "Detect fraud."
      }
    });
    assert.equal(profileResponse.result.structuredContent.contract.ok, true);
    assert.equal(profileResponse.result.structuredContent.profile.inferred.target, "is_fraud");

    const blueprintResponse = await server.request("tools/call", {
      name: "mille_generate_blueprint",
      arguments: {
        idea: "Build a fraud scoring model from amount and is_fraud.",
        task: "classification",
        audience: "technical",
        dataset_profile: profileResponse.result.structuredContent.profile
      }
    });
    assert.equal(blueprintResponse.result.structuredContent.contract.ok, true);
    assert.equal(blueprintResponse.result.structuredContent.blueprint.task_type, "classification");
  } finally {
    server.close();
  }
});
