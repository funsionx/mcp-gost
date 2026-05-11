import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getOpenRouterConfig, getS3Config, loadEnv } from "./config/env.js";
import { GostAgentService } from "./agent/gost-agent.service.js";
import { handleDocumentApi } from "./http/document-api.js";
import { registerMcpCapabilities } from "./mcp/register-tools.js";
import { DocumentGenerationService } from "./services/document-generation.service.js";
import { ProjectService } from "./services/project.service.js";
import { S3Service } from "./services/s3.service.js";
import { TypstService } from "./services/typst.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const env = loadEnv();
const s3Service = new S3Service(getS3Config(env));
const templatePath = path.join(rootDir, "templates", "gost-report.typ");
const projectService = new ProjectService(s3Service);
const typstService = new TypstService(templatePath);

function createDocumentGenerationService(): DocumentGenerationService {
  const agentService = env.OPENROUTER_API_KEY
    ? new GostAgentService(getOpenRouterConfig(env))
    : null;
  return new DocumentGenerationService(
    agentService,
    projectService,
    typstService
  );
}

function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "mcp-typst-gost", version: "0.1.0" },
    {
      debouncedNotificationMethods: [
        "notifications/tools/list_changed",
        "notifications/resources/list_changed",
        "notifications/prompts/list_changed",
      ],
    }
  );

  registerMcpCapabilities(server, { projectService, typstService });
  return server;
}

async function checkTypst(): Promise<{ ok: boolean; version?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn("typst", ["--version"]);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      resolve({ ok: false, error: error.message });
    });

    child.on("close", (code) => {
      resolve(
        code === 0
          ? { ok: true, version: stdout.trim() }
          : { ok: false, error: stderr.trim() || `typst exited with ${code}` }
      );
    });
  });
}

Bun.serve({
  port: env.PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      const typst = await checkTypst();
      return Response.json(
        {
          ok: typst.ok,
          service: "mcp-typst-gost",
          typst,
          storage: "s3",
        },
        { status: typst.ok ? 200 : 503 }
      );
    }

    if (url.pathname === "/api/documents/generate") {
      try {
        const apiResponse = await handleDocumentApi(
          req,
          createDocumentGenerationService()
        );
        if (apiResponse) {
          return apiResponse;
        }
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 400 }
        );
      }
    }

    if (url.pathname !== "/mcp") {
      return new Response("Not Found", { status: 404 });
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    const mcp = createMcpServer();

    req.signal.addEventListener("abort", () => {
      void transport.close();
      void mcp.close();
    });

    try {
      await mcp.connect(transport);
      return await transport.handleRequest(req);
    } catch (error) {
      console.error("Error handling MCP request", error);
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        },
        { status: 500 }
      );
    }
  },
});

console.log(`mcp-typst-gost listening on http://localhost:${env.PORT}/mcp`);
