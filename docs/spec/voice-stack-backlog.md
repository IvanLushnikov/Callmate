# Бэклог: VOICE-001 — гибкий голосовой стек

**Источник:** [voice-stack-tz.md](./voice-stack-tz.md)  
**Версия:** 1.0  
**Дата:** 2026-08-28

---

## Легенда

| Поле | Значение |
|------|----------|
| **ID** | Уникальный ключ задачи (`VOICE-{AREA}-{NNN}`) |
| **Area** | `PRD` продукт · `INF` infra · `BE` backend · `FE` frontend · `QA` qa |
| **P** | Приоритет: P0 блокер · P1 must · P2 should |
| **Dep** | Зависимости (ID задач) |
| **DoD** | Definition of Done — минимум для закрытия |

**Порядок волнами:** PRD → INF → BE (core) → BE (API) → FE → QA

---

## Wave 0 — Продукт (блокеры)

### VOICE-PRD-001 · Закрыть открытые вопросы ТЗ §16

| | |
|---|---|
| **P** | P0 |
| **Dep** | — |
| **Owner** | Product |

**Scope:** утвердить решения:

1. Preview TTS → **signed URL** (TTL 1h)
2. Admin override дефолтов → **v2, не v1**
3. `degraded` в UI → **warning, не блокирует запуск**
4. Parallel calls на GPU → **3**
5. Transcript → **`contact.last_transcript`**

**DoD:** решения зафиксированы в `voice-stack-tz.md` §16 (статус «утверждено»), команда уведомлена.

---

## Wave 1 — Infra (GPU-сервер)

### VOICE-INF-001 · Репозиторий и docker-compose для scorix-llm-lab

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-PRD-001 |
| **Owner** | DevOps |

**Scope:**
- Каталог `infra/voice-lab/` в репе штаба (или отдельный infra-repo)
- `docker-compose.yml`: сервices `vllm`, `whisper`, `voice-gateway`
- `.env.example` с переменными (без секретов)
- README: как поднять / остановить / проверить

**DoD:** `docker compose up -d` на RTX 3090 поднимает 3 контейнера; README воспроизводим.

---

### VOICE-INF-002 · Деплой vLLM (Qwen2.5-7B-Instruct-AWQ)

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-INF-001 |
| **Owner** | DevOps |

**Scope:**
- Образ `vllm/vllm-openai:latest`
- Параметры: `--max-model-len 4096`, `--gpu-memory-utilization 0.35`
- Автозагрузка модели при первом старте
- Порт `8000`

**DoD:** `GET :8000/v1/models` → 200, модель в списке; тестовый chat completion отвечает на русском.

---

### VOICE-INF-003 · Деплой faster-whisper (large-v3, int8)

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-INF-001 |
| **Owner** | DevOps |

**Scope:**
- ASR-сервис на порту `8001`
- Модель `large-v3`, compute type `int8`
- Endpoint streaming transcription (HTTP/WebSocket — зафиксировать в README)
- `GET /health` → `{ "ready": true }`

**DoD:** загрузка 5-сек WAV с русской речью → текст в ответе; VRAM ~4 GB.

---

### VOICE-INF-004 · Skeleton voice-gateway (VAD placeholder)

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-INF-001 |
| **Owner** | Backend / DevOps |

**Scope:**
- HTTP-сервис порт `8080`
- `GET /health` → `{ "vad": "ok", "whisper_url": "...", "vllm_url": "..." }`
- Env: `VLLM_URL`, `WHISPER_URL`, `VAD_MODEL=silero_v5`
- Пока без полного turn-pipeline — только health + stub

**DoD:** health OK; voice-gateway видит vLLM и whisper по internal network.

---

### VOICE-INF-005 · Secrets и env на GPU-сервере

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-INF-001 |
| **Owner** | DevOps |

**Scope:**
- Секреты **не в git**: `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `YANDEX_API_KEY` (для smoke-тестов с API-сервера)
- Документ: где хранятся, кто имеет доступ
- Scorix API env: `VOICE_LAB_VLLM_URL`, `VOICE_LAB_WHISPER_URL`, `VOICE_LAB_GATEWAY_URL`

**DoD:** API-сервер может достучаться до GPU endpoints; ключи провайдеров в Render/env штаба.

---

### VOICE-INF-006 · Мониторинг GPU и health-alerts

| | |
|---|---|
| **P** | P1 |
| **Dep** | VOICE-INF-002, VOICE-INF-003, VOICE-INF-004 |
| **Owner** | DevOps |

**Scope:**
- Cron или uptime-check каждые 5 min: vLLM, whisper, voice-gateway
- Алерт при: контейнер down, VRAM > 22 GB, disk > 80%
- Лог ротация docker

**DoD:** падение whisper → алерт в Telegram/Slack (или аналог) за ≤ 10 min.

---

## Wave 2 — Backend core (коннекторы + router)

### VOICE-BE-001 · Схема БД: voice_settings

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-PRD-001 |
| **Owner** | Backend |

**Scope:**
- Таблица / документ `company_voice_settings`:
  - `company_id` (PK/FK)
  - `llm`: enum `foreign` | `local`
  - `asr`: enum `foreign` | `local`
  - `tts`: enum `ru` | `foreign`
  - `status`: enum `ok` | `degraded` | `error` | `unknown`
  - `last_check_at`: timestamp nullable
  - `fallback_enabled`: bool default true
  - `created_at`, `updated_at`
- Миграция
- Дефолты при создании компании: `llm=foreign`, `asr=local`, `tts=ru`, `status=unknown`

**DoD:** миграция применена; новая компания получает дефолты.

---

### VOICE-BE-002 · Интерфейсы коннекторов + типы

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-001 |
| **Owner** | Backend |

**Scope:** пакет `voice/connectors/`:
- `VadConnector`, `AsrConnector`, `LlmConnector`, `TtsConnector`
- Типы: `AudioChunk`, `VadEvent`, `AsrResult`, `HealthResult`, `VoiceConfig`
- Unit-тесты на типы/контракты (mock)

**DoD:** интерфейсы соответствуют ТЗ §8.1; CI green.

---

### VOICE-BE-003 · Silero VAD connector

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-002 |
| **Owner** | Backend |

**Scope:**
- `SileroVadConnector implements VadConnector`
- CPU inference
- Events: `speech_start`, `speech_end`, `silence`
- Tunable: pause threshold ~300 ms (config)

**DoD:** unit-тест на synthetic audio; `speech_end` срабатывает после паузы.

---

### VOICE-BE-004 · ASR local: faster-whisper connector

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-002, VOICE-INF-003 |
| **Owner** | Backend |

**Scope:**
- `WhisperLocalConnector` → HTTP/stream к whisper service
- `transcribeStream()`, `healthCheck()`
- `mode = "local"`

**DoD:** streaming ASR на тестовом аудио; healthCheck возвращает latency.

---

### VOICE-BE-005 · ASR foreign: Deepgram connector

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-002, VOICE-INF-005 |
| **Owner** | Backend |

**Scope:**
- `DeepgramAsrConnector`, model `nova-2`, ru language
- Streaming WS/HTTP
- Timeout 5s → fail для fallback

**DoD:** healthCheck ok с валидным ключом; транскрипция русского sample.

---

### VOICE-BE-006 · LLM local: vLLM connector

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-002, VOICE-INF-002 |
| **Owner** | Backend |

**Scope:**
- OpenAI-compatible client → vLLM
- `chatStream()`, `healthCheck()`
- `mode = "local"`

**DoD:** streaming tokens на русском; health через `/v1/models`.

---

### VOICE-BE-007 · LLM foreign: OpenAI gpt-4o-mini connector

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-002, VOICE-INF-005 |
| **Owner** | Backend |

**Scope:**
- `OpenAiLlmConnector`, model `gpt-4o-mini`
- Streaming chat completions

**DoD:** chatStream работает; healthCheck ok.

---

### VOICE-BE-008 · TTS ru: Yandex SpeechKit connector

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-002, VOICE-INF-005 |
| **Owner** | Backend |

**Scope:**
- `YandexTtsConnector`, voice `alena` (config override)
- `synthesizeStream()`, `healthCheck()`
- `region = "ru"`

**DoD:** синтез фразы «Здравствуйте! Это Scorix.» → audio chunks.

---

### VOICE-BE-009 · TTS foreign: OpenAI TTS connector

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-002, VOICE-INF-005 |
| **Owner** | Backend |

**Scope:**
- `OpenAiTtsConnector`, model `tts-1`, voice `nova`
- `region = "foreign"`

**DoD:** synthesizeStream ok; healthCheck ok.

---

### VOICE-BE-010 · Connector factory (resolveConnectors)

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-003 … VOICE-BE-009 |
| **Owner** | Backend |

**Scope:**
- `resolveConnectors(config: VoiceConfig)` → `{ vad, asr, llm, tts }`
- VAD always Silero
- ASR/LLM/TTS по config
- Provider URLs/keys из env, не из user input

**DoD:** unit-тесты на все 8 комбинаций (2×2×2); vad всегда local.

---

### VOICE-BE-011 · Health-check aggregator

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-010 |
| **Owner** | Backend |

**Scope:**
- `checkVoiceHealth(config)` → `{ status, details, last_check_at }`
- Проверяет **только выбранные** провайдеры + local fallback availability
- Логика status: ok / degraded / error / unknown (ТЗ §7.1)

**DoD:** table-driven тесты на все status combinations.

---

### VOICE-BE-012 · Fallback policy engine

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-010 |
| **Owner** | Backend |

**Scope:**
- `withFallback(component, primary, fallback)` wrapper
- Матрица ТЗ §8.3
- Log `voice_fallback` event
- Update company status → `degraded` при успешном fallback

**DoD:** тест: Deepgram down → auto switch to whisper; OpenAI LLM down → vLLM.

---

### VOICE-BE-013 · LLM runtime prompt builder

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-007, VOICE-BE-006 |
| **Owner** | Backend |

**Scope:**
- `buildRuntimeSystemPrompt(campaign, preview)` из:
  - scenario_text / stages
  - tone
  - safety rules
  - max 2 sentences per reply
- Отдельно от prompt генерации сценария (`/scenario/generate`)

**DoD:** snapshot-тест prompt output; не смешивается с generate-scenario prompt.

---

### VOICE-BE-014 · Voice Router: turn pipeline

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-010, VOICE-BE-012, VOICE-BE-013 |
| **Owner** | Backend |

**Scope:**
- `VoiceRouter.processTurn(session, audioIn)` → audioOut
- Pipeline: VAD → ASR → LLM → TTS
- History: last 10 messages
- Latency tracking per stage
- Log `voice_turn` (без PII)

**DoD:** integration test end-to-end на mock audio; latency fields в логе.

---

### VOICE-BE-015 · Интеграция Voice Router в call session

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-014 |
| **Owner** | Backend |

**Scope:**
- Подключить router к существующему telephony call loop (SIP/Mango)
- Audio codec conversion если нужно (8kHz telephony)
- Transcript → `contact.last_transcript`
- Ошибки звонка: `asr_unavailable`, `llm_unavailable`

**DoD:** тестовый звонок проходит 1 turn «привет → ответ робота»; transcript сохранён.

---

### VOICE-BE-016 · voice_snapshot при start кампании

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-001, VOICE-BE-015 |
| **Owner** | Backend |

**Scope:**
- `POST /campaigns/:id/start` → сохранить `voice_snapshot` на кампании
- Runtime звонков кампании использует snapshot, не live settings
- Поле не в public cabinet API

**DoD:** смена voice-settings после start не меняет провайдеров running campaign.

---

### VOICE-BE-017 · Cron: periodic voice health (5 min)

| | |
|---|---|
| **P** | P1 |
| **Dep** | VOICE-BE-011 |
| **Owner** | Backend |

**Scope:**
- Job каждые 5 min для компаний с `status != unknown`
- Обновляет `status`, `last_check_at`
- Не блокирует звонки

**DoD:** после kill whisper status → `error` или `degraded` в БД ≤ 5 min.

---

## Wave 3 — Public API

### VOICE-BE-018 · GET /api/cabinet/voice-settings

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-001, VOICE-BE-011 |
| **Owner** | Backend |

**Scope:** контракт ТЗ §7.1, auth Bearer, company scope.

**DoD:** contract test; 401 без session; 200 с дефолтами для новой компании.

---

### VOICE-BE-019 · PUT /api/cabinet/voice-settings

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-018, VOICE-BE-011 |
| **Owner** | Backend |

**Scope:**
- Validation enum
- Auto health-check после save
- Errors: `validation`, `voice_check_failed`, `read_only`, `forbidden`

**DoD:** contract tests; blocked company → 403 `read_only`.

---

### VOICE-BE-020 · POST /api/cabinet/voice-settings/preview

| | |
|---|---|
| **P** | P1 |
| **Dep** | VOICE-BE-019, VOICE-BE-008, VOICE-BE-009 |
| **Owner** | Backend |

**Scope:**
- Default text: «Здравствуйте! Это Scorix.»
- Response: signed URL, TTL 1h
- Rate limit: 10 req/min per company
- Errors: `voice_preview_failed`, `provider_down`

**DoD:** URL воспроизводится; 11-й запрос за минуту → 429.

---

### VOICE-BE-021 · Gates: voice checks в /campaigns/:id/gates

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-011, VOICE-BE-018 |
| **Owner** | Backend |

**Scope:**
- `voice_not_configured` — если status=unknown и never saved
- `voice_check_failed` — status=error
- `voice_degraded` — warning в response, **ok=true** (не блокирует)

**DoD:** gate tests для каждого status; degraded не блокирует start.

---

## Wave 4 — Frontend

### VOICE-FE-001 · Handoff-пакет docs/handoff/fe/VOICE-001.md

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-PRD-001, VOICE-BE-018 |
| **Owner** | FE / Product |

**Scope:** сокращённый handoff для FE: API контракт, UI copy, wireframe, error codes, stub rules.

**DoD:** файл в репо; FE может начать без вопросов к бэку по контракту.

---

### VOICE-FE-002 · State и persist (voice settings)

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-FE-001 |
| **Owner** | FE |

**Scope:**
- `state.voice` по ТЗ §10.1
- `loadJson("scx_voice_settings")` / save
- `voiceLoaded` flag в ui

**DoD:** refresh страницы сохраняет stub-state.

---

### VOICE-FE-003 · Секция «Голос робота» (#sec-voice)

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-FE-002 |
| **Owner** | FE |

**Scope:**
- Под `#sec-telephony` на integrations
- 3 radio-group: LLM, ASR, TTS
- Hint-тексты по ТЗ §3.3
- Badge: «Готово» / «Резервный режим» / «Недоступно»
- Кнопки «Сохранить», «Прослушать голос»
- `<audio>` element

**DoD:** визуально соответствует design system (Syne/Manrope, cobalt); a11y labels на radio.

---

### VOICE-FE-004 · API: load / save voice-settings

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-FE-002, VOICE-BE-018, VOICE-BE-019 |
| **Owner** | FE |

**Scope:**
- Load on integrations tab (как telephony)
- PUT on save
- Error handling через `errorMessage()`

**DoD:** save/load против staging API; flash success/error.

---

### VOICE-FE-005 · Preview TTS playback

| | |
|---|---|
| **P** | P1 |
| **Dep** | VOICE-FE-003, VOICE-BE-020 |
| **Owner** | FE |

**Scope:**
- POST preview → play audio_url
- Loading state на кнопке
- Error `voice_preview_failed`

**DoD:** «Прослушать голос» проигрывает sample для ru и foreign TTS.

---

### VOICE-FE-006 · ERROR_MESSAGES в api.js

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-FE-001 |
| **Owner** | FE |

**Scope:** добавить коды ТЗ §10.4:
- `voice_not_configured`
- `voice_check_failed`
- `voice_preview_failed`
- `voice_degraded`

**DoD:** коды маппятся на русский текст; нет raw server messages.

---

### VOICE-FE-007 · Ready strip: пункт «Голос робота»

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-FE-004, VOICE-BE-021 |
| **Owner** | FE |

**Scope:**
- Новый item в полосе готовности workspace
- Link → `#/cabinet/integrations`
- OK / warn / fail по voice status

**DoD:** при status=error полоса показывает проблему; click ведёт в integrations.

---

### VOICE-FE-008 · Gates: блокировка запуска кампании

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-FE-006, VOICE-FE-007, VOICE-BE-021 |
| **Owner** | FE |

**Scope:**
- `launchBlockReasons()` учитывает gate errors
- `voice_not_configured`, `voice_check_failed` → блок
- `voice_degraded` → banner warn, **не блок**

**DoD:** start disabled при voice error; degraded — start enabled + banner.

---

### VOICE-FE-009 · Stub-режим (без API)

| | |
|---|---|
| **P** | P1 |
| **Dep** | VOICE-FE-003, VOICE-FE-002 |
| **Owner** | FE |

**Scope:**
- localStorage save/load
- status always `ok`
- preview: hint «Доступно с API» (без fake audio)

**DoD:** GitHub Pages demo работает без API; настройки не теряются.

---

### VOICE-FE-010 · Стили секции voice

| | |
|---|---|
| **P** | P1 |
| **Dep** | VOICE-FE-003 |
| **Owner** | FE |

**Scope:** CSS в `styles.css` — radio groups, badge, audio player, consistent с telephony panel.

**DoD:** light theme ok; не ломает integrations layout.

---

## Wave 5 — Observability

### VOICE-BE-022 · Метрики voice pipeline

| | |
|---|---|
| **P** | P1 |
| **Dep** | VOICE-BE-014 |
| **Owner** | Backend |

**Scope:** метрики ТЗ §12.1:
- `voice_asr_latency_ms`
- `voice_llm_first_token_ms`
- `voice_tts_first_chunk_ms`
- `voice_fallback_total{component,from,to}`
- `voice_turn_total{result}`

**DoD:** метрики видны в dashboard/Prometheus; тестовый звонок генерирует points.

---

### VOICE-BE-023 · Structured logs (без PII)

| | |
|---|---|
| **P** | P1 |
| **Dep** | VOICE-BE-014, VOICE-BE-012 |
| **Owner** | Backend |

**Scope:**
- `voice_turn`, `voice_fallback`, `voice_latency_exceeded`
- Запрет: phone, transcript, raw audio

**DoD:** log review checklist passed; grep по phone в voice logs → 0.

---

## Wave 6 — QA

### VOICE-QA-001 · Test plan

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-FE-001 |
| **Owner** | QA |

**Scope:** документ с кейсами по §14 ТЗ (UI, backend, perf, regression).

**DoD:** test plan approved; linked to backlog IDs.

---

### VOICE-QA-002 · UI acceptance (§14.1)

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-FE-003 … VOICE-FE-008 |
| **Owner** | QA |

**DoD:** все чекбоксы §14.1 пройдены.

---

### VOICE-QA-003 · Backend routing acceptance (§14.2)

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-015, VOICE-BE-016 |
| **Owner** | QA |

**DoD:** 8 комбинаций config проверены на test call; snapshot verified.

---

### VOICE-QA-004 · Latency benchmark (10 test calls)

| | |
|---|---|
| **P** | P1 |
| **Dep** | VOICE-BE-015, VOICE-BE-022 |
| **Owner** | QA / Backend |

**Scope:** default config: foreign LLM + local ASR + ru TTS; p95 ≤ 2500 ms.

**DoD:** отчёт с p50/p95; если fail — ticket на tuning.

---

### VOICE-QA-005 · Fallback scenarios

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-012 |
| **Owner** | QA |

**Scope:**
- Kill Deepgram → whisper fallback, status degraded
- Kill OpenAI LLM → vLLM fallback
- Kill Yandex TTS → OpenAI TTS fallback
- Kill whisper (local ASR selected) → call error

**DoD:** все 4 сценария documented pass/fail.

---

### VOICE-QA-006 · Load test: 5 parallel calls on single GPU

| | |
|---|---|
| **P** | P1 |
| **Dep** | VOICE-BE-015, VOICE-INF-006 |
| **Owner** | QA / DevOps |

**Scope:** 5 одновременных звонков, local ASR + local LLM; VRAM ≤ 20 GB.

**DoD:** отчёт; нет OOM; calls complete or graceful degrade.

---

### VOICE-QA-007 · Regression: telephony + scenario generate

| | |
|---|---|
| **P** | P0 |
| **Dep** | VOICE-BE-015 |
| **Owner** | QA |

**DoD:** §14.4 — SIP/Mango unchanged; `/scenario/generate` works.

---

## Сводка по волнам

| Wave | Задач | P0 | Ключевой outcome |
|------|-------|-----|------------------|
| 0 PRD | 1 | 1 | Решения утверждены |
| 1 INF | 6 | 5 | GPU-стек поднят |
| 2 BE core | 17 | 15 | Router + коннекторы работают |
| 3 BE API | 4 | 3 | Public API + gates |
| 4 FE | 10 | 7 | UI в кабинете |
| 5 Obs | 2 | 0 | Метрики и логи |
| 6 QA | 7 | 5 | Acceptance пройден |
| **Итого** | **47** | **36** | |

---

## Critical path (минимум до первого звонка)

```
VOICE-PRD-001
  → VOICE-INF-001..005
  → VOICE-BE-001..015
  → VOICE-BE-016
  → VOICE-QA-003 (smoke)
```

FE и preview можно параллелить после VOICE-BE-018.

---

## Параллелизация

| Поток A (Infra+BE) | Поток B (FE) | Поток C (QA prep) |
|--------------------|--------------|-------------------|
| INF-001..006 | FE-001 (после PRD) | QA-001 test plan |
| BE-001..015 | FE-002..003 (mock) | |
| BE-018..021 | FE-004..010 (после API staging) | QA-002..007 |

---

## GitHub Issues — шаблон

При создании issue из задачи:

```markdown
## [VOICE-BE-014] Voice Router: turn pipeline

**Epic:** VOICE-001  
**Priority:** P0  
**Depends on:** VOICE-BE-010, VOICE-BE-012, VOICE-BE-013

### Scope
(скопировать из бэклога)

### Definition of Done
(скопировать DoD)

### Spec
docs/spec/voice-stack-tz.md §6.2, §8
```

**Labels:** `voice-001`, `{area}`, `{priority}`

---

## Связь с ТЗ

| ТЗ раздел | Задачи |
|-----------|--------|
| §3 UI | FE-003, FE-007, FE-010 |
| §5 Провайдеры | BE-003..009, INF-002..003 |
| §6 Архитектура | BE-014, BE-015 |
| §7 API | BE-018..021 |
| §8 Router | BE-010..014, BE-012 |
| §9 GPU | INF-001..006 |
| §10 FE | FE-002..009 |
| §11 Security | BE-020, BE-023, INF-005 |
| §12 Observability | BE-022, BE-023 |
| §14 Acceptance | QA-002..007 |
