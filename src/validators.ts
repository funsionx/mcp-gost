import type { GostDocument } from "./schemas.js";

export type Diagnostic = {
  level: "error" | "warning" | "info";
  field: string;
  message: string;
};

const requiredSectionKeywords = ["введение", "заключение"];

export function lintDocument(doc: GostDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!doc.titlePage.supervisor.trim()) {
    diagnostics.push({
      level: "error",
      field: "titlePage.supervisor",
      message: "Не указан научный руководитель.",
    });
  }

  if (doc.sections.length < 2) {
    diagnostics.push({
      level: "warning",
      field: "sections",
      message:
        "Для учебной работы обычно нужно больше одного основного раздела.",
    });
  }

  const titles = doc.sections.map((s) => s.title.toLowerCase());
  for (const keyword of requiredSectionKeywords) {
    const hasKeyword = titles.some((t) => t.includes(keyword));
    if (!hasKeyword && keyword !== "заключение") {
      diagnostics.push({
        level: "warning",
        field: "sections",
        message: `Среди разделов не найден блок, похожий на «${keyword}».`,
      });
    }
  }

  if (!doc.introduction?.trim()) {
    diagnostics.push({
      level: "warning",
      field: "introduction",
      message: "Пустое введение.",
    });
  }

  if (!doc.conclusion?.trim()) {
    diagnostics.push({
      level: "warning",
      field: "conclusion",
      message: "Пустое заключение.",
    });
  }

  if (doc.bibliography.length === 0) {
    diagnostics.push({
      level: "warning",
      field: "bibliography",
      message: "Список литературы пуст.",
    });
  }

  if (doc.titlePage.year < 2020) {
    diagnostics.push({
      level: "info",
      field: "titlePage.year",
      message: "Проверь год на титульном листе.",
    });
  }

  return diagnostics;
}
