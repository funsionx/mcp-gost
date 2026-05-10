import type { GostDocument } from "./schemas.js";

export type Diagnostic = {
  level: "error" | "warning" | "info";
  field: string;
  message: string;
};

export function lintDocument(doc: GostDocument): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  if (!doc.titlePage.supervisor.trim()) {
    diagnostics.push({
      level: "error",
      field: "titlePage.supervisor",
      message: "Не указан научный руководитель.",
    });
  }

  if (!doc.titlePage.title.trim()) {
    diagnostics.push({
      level: "error",
      field: "titlePage.title",
      message: "Не указана тема работы.",
    });
  }

  if (!doc.titlePage.author.trim()) {
    diagnostics.push({
      level: "error",
      field: "titlePage.author",
      message: "Не указан автор.",
    });
  }

  if (doc.sections.length === 0) {
    diagnostics.push({
      level: "error",
      field: "sections",
      message: "Отсутствуют основные разделы.",
    });
  } else if (doc.sections.length < 2) {
    diagnostics.push({
      level: "warning",
      field: "sections",
      message: "Для учебной работы обычно нужно больше одного основного раздела.",
    });
  }

  // Введение и заключение хардкодятся в шаблоне, валидируем поля introduction/conclusion
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

  if (doc.titlePage.year < 2000 || doc.titlePage.year > 2100) {
    diagnostics.push({
      level: "info",
      field: "titlePage.year",
      message: "Проверь год на титульном листе.",
    });
  }

  return diagnostics;
}
