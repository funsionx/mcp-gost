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
  return `#let ${name} = (${items})`;
}

function renderBibliography(doc: GostDocument): string {
  const items = doc.bibliography
    .map(
      (b) => `(
    id: "${esc(b.id)}",
    kind: "${b.kind}",
    raw: "${esc(b.raw)}"
  )`
    )
    .join(",\n");
  return `#let bibliography = (${items})`;
}

export async function renderTypst(
  templatePath: string,
  document: GostDocument
): Promise<string> {
  const template = await readFile(templatePath, "utf8");
  const sections = renderSections("sections", document.sections);
  const appendices = renderSections("appendices", document.appendices);
  const bibliography = renderBibliography(document);

  return template
    .replace("__DOCUMENT_JSON__", JSON.stringify(document, null, 2))
    .replace("__TITLE__", esc(document.titlePage.title))
    .replace("__UNIVERSITY__", esc(document.titlePage.university))
    .replace("__FACULTY__", esc(document.titlePage.faculty ?? ""))
    .replace("__DEPARTMENT__", esc(document.titlePage.department ?? ""))
    .replace("__SUBTITLE__", esc(document.titlePage.subtitle ?? ""))
    .replace("__AUTHOR__", esc(document.titlePage.author))
    .replace("__GROUP__", esc(document.titlePage.group ?? ""))
    .replace("__SUPERVISOR__", esc(document.titlePage.supervisor))
    .replace("__CITY__", esc(document.titlePage.city))
    .replace("__YEAR__", String(document.titlePage.year))
    .replace("__ABSTRACT__", esc(document.abstract ?? ""))
    .replace("__INTRODUCTION__", esc(document.introduction ?? ""))
    .replace("__CONCLUSION__", esc(document.conclusion ?? ""))
    .replace("__SECTIONS__", sections)
    .replace("__APPENDICES__", appendices)
    .replace("__BIBLIOGRAPHY__", bibliography);
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
