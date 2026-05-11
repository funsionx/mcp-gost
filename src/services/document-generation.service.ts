import { z } from "zod";
import { GostAgentService } from "../agent/gost-agent.service.js";
import { documentSchema, type GostDocument } from "../schemas.js";
import { lintDocument } from "../validators.js";
import { ProjectService } from "./project.service.js";
import { TypstService } from "./typst.service.js";

export const generateDocumentRequestSchema = z.object({
  projectId: z.string().regex(/^[a-z0-9\-]+$/).optional(),
  prompt: z.string().min(1),
  sourceText: z.string().optional(),
  document: documentSchema.optional(),
});

export type GenerateDocumentRequest = z.infer<
  typeof generateDocumentRequestSchema
>;

export type GenerateDocumentResult = {
  projectId: string;
  document: GostDocument;
  notes: string[];
  diagnostics: ReturnType<typeof lintDocument>;
  artifacts: {
    typ: { key: string; url: string; size: number };
    json: { key: string; url: string; size: number };
    pdf: { key: string; url: string; size: number } | null;
  };
  compile: {
    success: boolean;
    command: string;
    stdout: string;
    stderr: string;
  };
};

export class DocumentGenerationService {
  constructor(
    private readonly agentService: GostAgentService | null,
    private readonly projectService: ProjectService,
    private readonly typstService: TypstService
  ) {}

  async generate(input: GenerateDocumentRequest): Promise<GenerateDocumentResult> {
    const projectId = input.projectId ?? `doc-${Date.now()}`;
    const agentDraft = input.document
      ? { document: documentSchema.parse(input.document), notes: [] }
      : await this.draftWithAgent(input);

    const diagnostics = lintDocument(agentDraft.document);
    const typContent = await this.typstService.render(agentDraft.document);
    const stored = await this.projectService.writeProjectFiles(
      projectId,
      typContent,
      agentDraft.document
    );
    const compiled = await this.typstService.compileSource(typContent);
    const pdf = compiled.pdf
      ? await this.projectService.saveCompiledPdf(projectId, compiled.pdf)
      : null;

    return {
      projectId,
      document: agentDraft.document,
      notes: agentDraft.notes,
      diagnostics,
      artifacts: {
        typ: {
          key: stored.typ.key,
          url: stored.typ.url,
          size: stored.typ.size,
        },
        json: {
          key: stored.json.key,
          url: stored.json.url,
          size: stored.json.size,
        },
        pdf: pdf
          ? {
              key: pdf.key,
              url: pdf.url,
              size: pdf.size,
            }
          : null,
      },
      compile: {
        success: compiled.success && pdf !== null,
        command: compiled.command,
        stdout: compiled.stdout,
        stderr: compiled.stderr,
      },
    };
  }

  private async draftWithAgent(
    input: GenerateDocumentRequest
  ): Promise<{ document: GostDocument; notes: string[] }> {
    if (!this.agentService) {
      throw new Error(
        "OPENROUTER_API_KEY is required when request.document is not provided."
      );
    }

    return this.agentService.draftDocument({
      prompt: input.prompt,
      sourceText: input.sourceText,
    });
  }
}
