import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir, readdir, readFile } from "node:fs/promises";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { documentSchema } from "./schemas.js";
import { compileTypst, renderTypst, writeProjectFiles } from "./typst.js";
import { lintDocument } from "./validators.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const workspaceDir = path.join(rootDir, "workspace");
const templatePath = path.join(rootDir, "templates", "gost-report.typ");

await mkdir(workspaceDir, { recursive: true });

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

  server.registerTool(
    "new_project",
    {
      title: "Create GOST Project",
      description:
        "Create a new academic project manifest for a GOST-compatible Typst document.",
      inputSchema: {
        projectId: z.string().regex(/^[a-z0-9\-]+$/),
        document: documentSchema,
      },
      outputSchema: {
        projectId: z.string(),
        projectDir: z.string(),
        diagnostics: z.array(
          z.object({
            level: z.string(),
            field: z.string(),
            message: z.string(),
          })
        ),
      },
    },
    async ({ projectId, document }) => {
      const parsed = documentSchema.parse(document);
      const diagnostics = lintDocument(parsed);
      const typContent = await renderTypst(templatePath, parsed);
      const { projectDir } = await writeProjectFiles(
        workspaceDir,
        projectId,
        typContent,
        parsed
      );
      const output = { projectId, projectDir, diagnostics };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    "lint_gost",
    {
      title: "Lint GOST Document",
      description:
        "Run structural validation against the project manifest without compiling PDF.",
      inputSchema: { document: documentSchema },
      outputSchema: {
        valid: z.boolean(),
        diagnostics: z.array(
          z.object({
            level: z.string(),
            field: z.string(),
            message: z.string(),
          })
        ),
      },
    },
    async ({ document }) => {
      const parsed = documentSchema.parse(document);
      const diagnostics = lintDocument(parsed);
      const output = {
        valid: !diagnostics.some((d) => d.level === "error"),
        diagnostics,
      };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    "render_typst",
    {
      title: "Render Typst Source",
      description:
        "Generate Typst source from the canonical JSON document model.",
      inputSchema: {
        projectId: z.string().regex(/^[a-z0-9\-]+$/),
        document: documentSchema,
      },
      outputSchema: {
        projectId: z.string(),
        typPath: z.string(),
        preview: z.string(),
      },
    },
    async ({ projectId, document }) => {
      const parsed = documentSchema.parse(document);
      const typContent = await renderTypst(templatePath, parsed);
      const { typPath } = await writeProjectFiles(
        workspaceDir,
        projectId,
        typContent,
        parsed
      );
      const output = { projectId, typPath, preview: typContent.slice(0, 1500) };
      return {
        content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    }
  );

  server.registerTool(
    "compile_pdf",
    {
      title: "Compile Typst PDF",
      description:
        "Compile the generated Typst project to PDF using the typst CLI installed on the host.",
      inputSchema: {
        projectId: z.string().regex(/^[a-z0-9\-]+$/),
      },
      outputSchema: {
        success: z.boolean(),
        command: z.string(),
        pdfPath: z.string().nullable(),
        stdout: z.string(),
        stderr: z.string(),
      },
    },
    async ({ projectId }) => {
      const projectDir = path.join(workspaceDir, projectId);
      const result = await compileTypst(projectDir);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: !result.success,
      };
    }
  );

  server.registerTool(
    "export_package",
    {
      title: "Export Project Package",
      description:
        "List generated artifacts for the project so the client can fetch them.",
      inputSchema: { projectId: z.string().regex(/^[a-z0-9\-]+$/) },
      outputSchema: {
        projectId: z.string(),
        files: z.array(z.object({ name: z.string(), uri: z.string() })),
      },
    },
    async ({ projectId }) => {
      const projectDir = path.join(workspaceDir, projectId);
      const entries = await readdir(projectDir, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => ({
          name: entry.name,
          uri: `file://${path.join(projectDir, entry.name)}`,
        }));
      const output = { projectId, files };
      return {
        content: [
          { type: "text", text: JSON.stringify(output, null, 2) },
          ...files.map((file) => ({
            type: "resource_link" as const,
            uri: file.uri,
            name: file.name,
            mimeType: file.name.endsWith(".pdf")
              ? "application/pdf"
              : "text/plain",
            description: `Generated artifact ${file.name}`,
          })),
        ],
        structuredContent: output,
      };
    }
  );

  server.registerResource(
    "project-file",
    new ResourceTemplate("project://{projectId}/{fileName}", {
      list: undefined,
    }),
    {
      title: "Project File",
      description:
        "Read generated project files from the Typst GOST workspace.",
    },
    async (uri, { projectId, fileName }) => {
      const pid = Array.isArray(projectId) ? projectId[0] : projectId;
      const fname = Array.isArray(fileName) ? fileName[0] : fileName;
      const filePath = path.join(workspaceDir, pid, fname);
      const text = await readFile(filePath, "utf8");
      return {
        contents: [{ uri: uri.href, text }],
      };
    }
  );

  server.registerPrompt(
    "draft_gost_report",
    {
      title: "Draft GOST Report",
      description:
        "Prompt template instructing an agent to prepare a valid document payload for the MCP tools.",
      argsSchema: {
        topic: z.string(),
        institution: z.string(),
        studentName: z.string(),
      },
    },
    ({ topic, institution, studentName }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Подготовь JSON-модель учебной работы по теме "${topic}" для вуза "${institution}". Автор: ${studentName}. Сначала заполни titlePage, introduction, sections, conclusion и bibliography, затем вызови new_project, после этого compile_pdf.`,
          },
        },
      ],
    })
  );

  return server;
}

const port = parseInt(process.env.PORT || "3000", 10);

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
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

console.log(`mcp-typst-gost listening on http://localhost:${port}/mcp`);
