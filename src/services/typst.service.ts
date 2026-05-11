import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { GostDocument } from "../schemas.js";

export type CompileResult = {
  success: boolean;
  command: string;
  stdout: string;
  stderr: string;
  pdf: Buffer | null;
};

export type CompilePublicResult = Omit<CompileResult, "pdf"> & {
  pdfKey: string | null;
  pdfUrl: string | null;
  pdfSize: number | null;
};

function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\\n");
}

function renderSections(
  name: string,
  sections: GostDocument["sections"]
): string {
  if (sections.length === 0) {
    return `#let ${name} = ()`;
  }

  const items = sections
    .map(
      (section) => `(
    id: "${esc(section.id)}",
    title: "${esc(section.title)}",
    content: "${esc(section.content)}",
    level: ${section.level}
  )`
    )
    .join(",\n");

  return `#let ${name} = (${items},)`;
}

function renderRefs(doc: GostDocument): string {
  if (doc.bibliography.length === 0) {
    return `#let refs = ()`;
  }

  const items = doc.bibliography
    .map(
      (item) => `(
    id: "${esc(item.id)}",
    kind: "${item.kind}",
    raw: "${esc(item.raw)}"
  )`
    )
    .join(",\n");

  return `#let refs = (${items},)`;
}

export class TypstService {
  constructor(private readonly templatePath: string) {}

  async render(document: GostDocument): Promise<string> {
    const template = await readFile(this.templatePath, "utf8");
    const sections = renderSections("sections", document.sections);
    const appendices = renderSections("appendices", document.appendices);
    const refs = renderRefs(document);

    return template
      .replaceAll("__TITLE__", esc(document.titlePage.title))
      .replaceAll("__UNIVERSITY__", esc(document.titlePage.university))
      .replaceAll("__FACULTY__", esc(document.titlePage.faculty ?? ""))
      .replaceAll("__DEPARTMENT__", esc(document.titlePage.department ?? ""))
      .replaceAll("__SUBTITLE__", esc(document.titlePage.subtitle ?? ""))
      .replaceAll("__AUTHOR__", esc(document.titlePage.author))
      .replaceAll("__GROUP__", esc(document.titlePage.group ?? ""))
      .replaceAll("__SUPERVISOR__", esc(document.titlePage.supervisor))
      .replaceAll("__CITY__", esc(document.titlePage.city))
      .replaceAll("__YEAR__", String(document.titlePage.year))
      .replaceAll("__ABSTRACT__", esc(document.abstract ?? ""))
      .replaceAll("__INTRODUCTION__", esc(document.introduction ?? ""))
      .replaceAll("__CONCLUSION__", esc(document.conclusion ?? ""))
      .replaceAll("__SECTIONS__", sections)
      .replaceAll("__APPENDICES__", appendices)
      .replaceAll("__REFS__", refs);
  }

  async compileSource(source: string): Promise<CompileResult> {
    const projectDir = await mkdtemp(path.join(os.tmpdir(), "mcp-gost-"));
    const inputPath = path.join(projectDir, "main.typ");
    const outputPath = path.join(projectDir, "main.pdf");
    const command = "typst compile main.typ main.pdf";

    try {
      await writeFile(inputPath, source, "utf8");

      return await new Promise((resolve) => {
        const child = spawn("typst", ["compile", "main.typ", "main.pdf"], {
          cwd: projectDir,
        });
        let stdout = "";
        let stderr = "";

        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });

        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });

        child.on("error", (error) => {
          resolve({
            success: false,
            command,
            stdout,
            stderr: `${stderr}\n${error.message}`.trim(),
            pdf: null,
          });
        });

        child.on("close", async (code) => {
          const success = code === 0;
          resolve({
            success,
            command,
            stdout,
            stderr,
            pdf: success ? await readFile(outputPath) : null,
          });
        });
      });
    } finally {
      await rm(projectDir, { recursive: true, force: true });
    }
  }
}
