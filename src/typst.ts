import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import type { GostDocument } from "./schemas.js";

export type CompileResult = {
  success: boolean;
  command: string;
  stdout: string;
  stderr: string;
  pdfPath: string | null;
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
      (s) => `(
    id: "${esc(s.id)}",
    title: "${esc(s.title)}",
    content: "${esc(s.content)}",
    level: ${s.level}
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
      (b) => `(
    id: "${esc(b.id)}",
    kind: "${b.kind}",
    raw: "${esc(b.raw)}"
  )`
    )
    .join(",\n");
  return `#let refs = (${items},)`;
}

export async function renderTypst(
  templatePath: string,
  document: GostDocument
): Promise<string> {
  const template = await readFile(templatePath, "utf8");
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

export async function writeProjectFiles(
  baseDir: string,
  projectId: string,
  typContent: string,
  input: GostDocument
) {
  const projectDir = path.join(baseDir, projectId);
  await mkdir(projectDir, { recursive: true });
  const typPath = path.join(projectDir, "main.typ");
  const jsonPath = path.join(projectDir, "document.json");
  await writeFile(typPath, typContent, "utf8");
  await writeFile(jsonPath, JSON.stringify(input, null, 2), "utf8");
  return { projectDir, typPath, jsonPath };
}

export async function compileTypst(
  projectDir: string,
  entryFile = "main.typ"
): Promise<CompileResult> {
  const inputPath = path.join(projectDir, entryFile);
  const outputPath = path.join(projectDir, "main.pdf");
  const command = `typst compile ${inputPath} ${outputPath}`;

  return new Promise((resolve) => {
    const child = spawn("typst", ["compile", inputPath, outputPath], {
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
        pdfPath: null,
      });
    });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        command,
        stdout,
        stderr,
        pdfPath: code === 0 ? outputPath : null,
      });
    });
  });
}
