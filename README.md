# mcp-typst-gost

MCP-сервер на TypeScript для генерации учебных и научных работ через Typst и ГОСТ-шаблон.

## Что внутри

- `new_project` — создает проект и сохраняет `document.json` + `main.typ`
- `lint_gost` — делает структурную валидацию JSON-модели
- `render_typst` — генерирует Typst-исходник
- `compile_pdf` — вызывает `typst compile`
- `export_package` — отдает список артефактов
- `project://{projectId}/{fileName}` — ресурс для чтения файлов проекта
- `draft_gost_report` — prompt для клиента/агента

## Установка

```bash
bun install
```

Нужен установленный Typst CLI в системе:

```bash
typst --version
```

## Запуск

```bash
bun run dev
```

Сервер поднимется на:

```text
http://localhost:3000/mcp
```

## Быстрое подключение

### Cursor / Claude Code / Inspector

Подключай как Streamable HTTP MCP server.

### Inspector

```bash
npx @modelcontextprotocol/inspector
```

URL:

```text
http://localhost:3000/mcp
```

## Как агент должен работать

1. Создать JSON-модель документа.
2. Вызвать `lint_gost`.
3. Вызвать `new_project` или `render_typst`.
4. Вызвать `compile_pdf`.
5. Вызвать `export_package`.

## Замечания

- Сейчас шаблон ориентирован на пакет `@preview/modern-g7-32:0.1.0`.
- Реальный шаблон typst-gost может требовать другие имена параметров; их нужно синхронизировать с API шаблона.
- `compile_pdf` предполагает, что на машине доступна команда `typst`.
- Ресурс `project://...` читает текстовые файлы; PDF лучше забирать как file artifact через клиент.

## Дальше улучшить

- Поддержка нескольких вузовских профилей.
- Генерация списка литературы из CSL/BibTeX.
- Более строгий lint под конкретные методички.
- Dockerfile и healthcheck.
- Поддержка stdio-транспорта наряду с HTTP.
