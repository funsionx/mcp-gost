# mcp-typst-gost

MCP-сервер на TypeScript для генерации учебных и научных работ через Typst и шаблон ГОСТ 7.32-2017.

## Что внутри

- `lint_gost` — структурная проверка JSON-модели.
- `new_project` — создание `document.json` и `main.typ` сразу в Yandex Object Storage.
- `render_typst` — генерация Typst-исходника и сохранение проекта в S3 без компиляции.
- `compile_pdf` — сборка `main.pdf` через `typst compile` во временной директории и загрузка PDF в S3.
- `publish_pdf` — возврат публичного URL для `main.pdf` из Yandex Object Storage.
- `export_package` — список S3-артефактов проекта.
- `project://{projectId}/{fileName}` — чтение текстовых файлов проекта из S3.
- `gost://document-schema`, `gost://typst-guide`, `gost://modern-g7-32-guide` — контекст для AI-агента.
- `draft_gost_report` — prompt для подготовки и публикации GOST PDF.
- `POST /api/documents/generate` — собственный HTTP API: вызывает OpenRouter-агента, генерирует JSON-модель, собирает PDF и сохраняет артефакты в S3.

## Установка

```bash
bun install
```

Нужен установленный Typst CLI:

```bash
typst --version
```

## Переменные окружения

Скопируй `.env.example` в `.env` и заполни значения:

```bash
PORT=3000
S3_BUCKET=your-bucket-name
S3_REGION=ru-central1
S3_ENDPOINT=https://storage.yandexcloud.net
S3_KEY=your-access-key
S3_SECRET=your-secret-key
S3_PUBLIC_BASE_URL=https://storage.yandexcloud.net/your-bucket-name
S3_PREFIX=mcp-gost-documents
OPENROUTER_API_KEY=sk-or-your-key
OPENROUTER_MODEL=openrouter/auto
```

`S3_PUBLIC_BASE_URL` должен вести на публично читаемый бакет или публичный префикс.
Проекты не создаются в локальном `workspace`: `main.typ`, `document.json` и `main.pdf` хранятся в S3. Локальная файловая система используется только как временная директория процесса `typst compile`.

## Запуск

```bash
bun run dev
```

Сервер:

```text
http://localhost:3000/mcp
```

Healthcheck:

```text
http://localhost:3000/health
```

## Docker

```bash
docker compose up --build
```

Docker-образ устанавливает Bun-зависимости и Typst CLI, затем запускает MCP HTTP server.

## Собственный HTTP API

Endpoint:

```text
POST /api/documents/generate
```

Тело запроса:

```json
{
  "projectId": "demo-1",
  "prompt": "Сделай отчёт по практике про MCP-сервис",
  "sourceText": "Опциональный исходный текст работы"
}
```

Если `document` уже готов, его можно передать напрямую в том же формате, что использует MCP `new_project`; тогда OpenRouter не вызывается, а сервис сразу сгенерирует Typst и PDF.

Ответ содержит `document`, diagnostics, S3-ключи `main.typ` / `document.json` / `main.pdf` и публичный URL PDF.

## Как агент должен работать

1. Прочитать `gost://document-schema`, `gost://typst-guide` и `gost://modern-g7-32-guide`.
2. Создать JSON-модель документа.
3. Вызвать `lint_gost`.
4. Вызвать `new_project` или `render_typst`.
5. Вызвать `compile_pdf`, который загрузит `main.pdf` в S3.
6. Вызвать `publish_pdf`, чтобы получить публичную ссылку на PDF.
7. При необходимости вызвать `export_package` для списка S3-артефактов.

## Замечания

- Шаблон использует `@preview/modern-g7-32:0.2.0`.
- `compile_pdf` предполагает, что команда `typst` доступна в `PATH`.
- `project://...` читает только текстовые файлы; PDF лучше забирать через `publish_pdf` или `export_package`.
- S3-конфигурация обязательна для работы сервиса, потому что локальный `workspace` не используется.
- `OPENROUTER_API_KEY` нужен только для `POST /api/documents/generate` без готового `document`.
- Текущий этап поддерживает только PDF. DOCX будет отдельным шагом, чтобы не добавлять Pandoc/LibreOffice в базовый пайплайн.
- `documentType`, `standard` и `language` валидируются, но пока не переключают разные шаблоны.
