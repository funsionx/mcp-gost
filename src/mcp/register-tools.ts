import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { documentSchema } from "../schemas.js";
import { ProjectService } from "../services/project.service.js";
import { TypstService } from "../services/typst.service.js";
import { lintDocument } from "../validators.js";

type RegisterToolsDeps = {
  projectService: ProjectService;
  typstService: TypstService;
};

const diagnosticSchema = z.object({
  level: z.string(),
  field: z.string(),
  message: z.string(),
});

const documentSchemaGuide = `# JSON-модель документа

Сервис принимает один канонический JSON и превращает его в Typst-файл на базе modern-g7-32.

Обязательные поля:
- titlePage.university, titlePage.title, titlePage.author, titlePage.supervisor, titlePage.city, titlePage.year
- sections: минимум один раздел

Ключевые ограничения:
- standard сейчас только GOST_7_32_2017.
- language принимает ru/en, но шаблон пока не меняется в зависимости от языка.
- documentType фиксирует намерение агента, но пока не выбирает разные шаблоны.
- sections.level поддерживает уровни 1, 2 и 3.

Рекомендуемый порядок tools: lint_gost -> new_project или render_typst -> compile_pdf -> publish_pdf.
Все проектные артефакты хранятся в Yandex S3. Локальная файловая система используется только как временная директория процесса typst compile.
`;

const typstGuide = `# Typst для агента

Typst - markup-based typesetting system. В этом проекте агенту не нужно писать весь документ вручную: сервис генерирует main.typ из JSON-модели.

Если агент редактирует Typst напрямую, важно помнить:
- заголовки задаются через =, ==, ===;
- код и текст можно смешивать через #выражения;
- импорт ГОСТ-шаблона находится в templates/gost-report.typ;
- PDF собирается командой typst compile main.typ main.pdf.

Официальная документация: https://typst.app/docs/
`;

const modernG7Guide = `# modern-g7-32 mapping

Текущий шаблон использует @preview/modern-g7-32:0.2.0.

JSON -> gost.with:
- titlePage.university -> ministry
- titlePage.faculty -> organization.full
- titlePage.department -> organization.short
- titlePage.subtitle -> report-type
- titlePage.title -> subject
- titlePage.supervisor -> manager.name
- titlePage.author + titlePage.group -> performers
- titlePage.city -> city

Дополнительные блоки:
- abstract -> gost-abstract
- introduction -> раздел "Введение"
- sections -> основные разделы с уровнями 1-3
- conclusion -> раздел "Заключение"
- bibliography.raw -> элементы списка источников
- appendices -> приложения через appendixes

Полный API typst-gost богаче текущей JSON-модели. Если агенту нужны УДК, этап НИР, грифы или сложные исполнители, модель нужно расширять отдельно.
`;

export function registerMcpCapabilities(
  server: McpServer,
  { projectService, typstService }: RegisterToolsDeps
): void {
  server.registerTool(
    "new_project",
    {
      title: "Create GOST Project",
      description:
        "Create a project from the canonical JSON model, render main.typ, save document.json, and return GOST diagnostics.",
      inputSchema: {
        projectId: z.string().regex(/^[a-z0-9\-]+$/),
        document: documentSchema,
      },
      outputSchema: {
        projectId: z.string(),
        storagePrefix: z.string(),
        files: z.array(
          z.object({
            name: z.string(),
            key: z.string(),
            uri: z.string(),
            contentType: z.string(),
            size: z.number(),
          })
        ),
        diagnostics: z.array(diagnosticSchema),
      },
    },
    async ({ projectId, document }) => {
      const parsed = documentSchema.parse(document);
      const diagnostics = lintDocument(parsed);
      const typContent = await typstService.render(parsed);
      const stored = await projectService.writeProjectFiles(
        projectId,
        typContent,
        parsed
      );
      const output = {
        projectId,
        storagePrefix: stored.storagePrefix,
        files: [stored.typ, stored.json].map((file) => ({
          name: file.name,
          key: file.key,
          uri: file.url,
          contentType: file.contentType,
          size: file.size,
        })),
        diagnostics,
      };

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
        "Validate the JSON document model before rendering. Agents should call it before new_project/render_typst.",
      inputSchema: { document: documentSchema },
      outputSchema: {
        valid: z.boolean(),
        diagnostics: z.array(diagnosticSchema),
      },
    },
    async ({ document }) => {
      const parsed = documentSchema.parse(document);
      const diagnostics = lintDocument(parsed);
      const output = {
        valid: !diagnostics.some((diagnostic) => diagnostic.level === "error"),
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
        "Generate main.typ from the JSON document model without compiling PDF.",
      inputSchema: {
        projectId: z.string().regex(/^[a-z0-9\-]+$/),
        document: documentSchema,
      },
      outputSchema: {
        projectId: z.string(),
        typKey: z.string(),
        typUrl: z.string(),
        jsonKey: z.string(),
        jsonUrl: z.string(),
        preview: z.string(),
      },
    },
    async ({ projectId, document }) => {
      const parsed = documentSchema.parse(document);
      const typContent = await typstService.render(parsed);
      const stored = await projectService.writeProjectFiles(
        projectId,
        typContent,
        parsed
      );
      const output = {
        projectId,
        typKey: stored.typ.key,
        typUrl: stored.typ.url,
        jsonKey: stored.json.key,
        jsonUrl: stored.json.url,
        preview: typContent.slice(0, 1500),
      };

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
        "Download main.typ from Yandex S3, compile it in a temporary directory, upload main.pdf back to S3, and return the public URL.",
      inputSchema: {
        projectId: z.string().regex(/^[a-z0-9\-]+$/),
      },
      outputSchema: {
        success: z.boolean(),
        command: z.string(),
        pdfKey: z.string().nullable(),
        pdfUrl: z.string().nullable(),
        pdfSize: z.number().nullable(),
        stdout: z.string(),
        stderr: z.string(),
      },
    },
    async ({ projectId }) => {
      const source = await projectService.readTypstSource(projectId);
      const compiled = await typstService.compileSource(source);
      const uploaded = compiled.pdf
        ? await projectService.saveCompiledPdf(projectId, compiled.pdf)
        : null;
      const result = {
        success: compiled.success && uploaded !== null,
        command: compiled.command,
        stdout: compiled.stdout,
        stderr: compiled.stderr,
        pdfKey: uploaded?.key ?? null,
        pdfUrl: uploaded?.url ?? null,
        pdfSize: uploaded?.size ?? null,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        structuredContent: result,
        isError: !result.success,
      };
    }
  );

  server.registerTool(
    "publish_pdf",
    {
      title: "Publish PDF To Yandex S3",
      description:
        "Return the public URL for main.pdf stored in Yandex Object Storage. compile_pdf uploads the PDF automatically.",
      inputSchema: {
        projectId: z.string().regex(/^[a-z0-9\-]+$/),
      },
      outputSchema: {
        success: z.boolean(),
        projectId: z.string(),
        key: z.string().nullable(),
        url: z.string().nullable(),
        contentType: z.string().nullable(),
        size: z.number().nullable(),
        error: z.string().nullable(),
      },
    },
    async ({ projectId }) => {
      try {
        const artifact = await projectService.getArtifact(projectId, "main.pdf");
        const output = {
          success: true,
          projectId,
          key: artifact.key,
          url: artifact.uri,
          contentType: artifact.contentType ?? "application/pdf",
          size: artifact.size ?? null,
          error: null,
        };

        return {
          content: [
            { type: "text", text: JSON.stringify(output, null, 2) },
            {
              type: "resource_link",
              uri: artifact.uri,
              name: "main.pdf",
              mimeType: artifact.contentType ?? "application/pdf",
              description: "Published PDF artifact",
            },
          ],
          structuredContent: output,
        };
      } catch (error) {
        const output = {
          success: false,
          projectId,
          key: null,
          url: null,
          contentType: null,
          size: null,
          error: error instanceof Error ? error.message : String(error),
        };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    "export_package",
    {
      title: "Export Project Package",
      description:
        "List generated artifacts stored in Yandex S3 for the project.",
      inputSchema: { projectId: z.string().regex(/^[a-z0-9\-]+$/) },
      outputSchema: {
        projectId: z.string(),
        files: z.array(
          z.object({
            name: z.string(),
            key: z.string(),
            uri: z.string(),
            contentType: z.string().optional(),
            size: z.number().optional(),
          })
        ),
      },
    },
    async ({ projectId }) => {
      const artifacts = await projectService.listArtifacts(projectId);
      const files = artifacts.map((artifact) => ({
        name: artifact.name,
        key: artifact.key,
        uri: artifact.uri,
        contentType: artifact.contentType,
        size: artifact.size,
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
        "Read text artifacts from Yandex S3. PDF files should be fetched via publish_pdf URL.",
    },
    async (uri, { projectId, fileName }) => {
      const pid = Array.isArray(projectId) ? projectId[0] : projectId;
      const fname = Array.isArray(fileName) ? fileName[0] : fileName;
      const text = await projectService.readTextArtifact(pid, fname);

      return {
        contents: [{ uri: uri.href, text }],
      };
    }
  );

  server.registerResource(
    "document-schema",
    "gost://document-schema",
    {
      title: "GOST Document Schema",
      description:
        "Canonical JSON model, required fields, and tool order for GOST document generation.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: documentSchemaGuide }],
    })
  );

  server.registerResource(
    "typst-guide",
    "gost://typst-guide",
    {
      title: "Typst Guide",
      description: "Short Typst primer and project-specific compilation notes.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: typstGuide }],
    })
  );

  server.registerResource(
    "modern-g7-32-guide",
    "gost://modern-g7-32-guide",
    {
      title: "modern-g7-32 Guide",
      description:
        "Mapping between the service JSON model and the modern-g7-32 Typst template.",
      mimeType: "text/markdown",
    },
    async (uri) => ({
      contents: [{ uri: uri.href, text: modernG7Guide }],
    })
  );

  server.registerPrompt(
    "draft_gost_report",
    {
      title: "Draft GOST Report",
      description:
        "Prompt template instructing an agent to prepare and publish a valid GOST PDF payload.",
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
            text: `Подготовь JSON-модель учебной работы по теме "${topic}" для вуза "${institution}". Автор: ${studentName}.

Используй ресурсы gost://document-schema, gost://typst-guide и gost://modern-g7-32-guide. Заполни titlePage, abstract, introduction, sections, conclusion и bibliography. У sections.level допустимы 1, 2 и 3. Сначала вызови lint_gost, затем new_project или render_typst, после этого compile_pdf и publish_pdf. Учитывай, что documentType, standard и language пока не переключают разные шаблоны. Все артефакты проекта сохраняются в Yandex S3.`,
          },
        },
      ],
    })
  );
}
