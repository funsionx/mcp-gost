import {
  DocumentGenerationService,
  generateDocumentRequestSchema,
} from "../services/document-generation.service.js";

export async function handleDocumentApi(
  req: Request,
  generationService: DocumentGenerationService
): Promise<Response | null> {
  const url = new URL(req.url);

  if (url.pathname !== "/api/documents/generate") {
    return null;
  }

  if (req.method !== "POST") {
    return Response.json(
      { error: "Method not allowed. Use POST." },
      { status: 405 }
    );
  }

  try {
    const body = await req.json();
    const input = generateDocumentRequestSchema.parse(body);
    const result = await generationService.generate(input);

    return Response.json(result, { status: result.compile.success ? 200 : 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 400 });
  }
}
