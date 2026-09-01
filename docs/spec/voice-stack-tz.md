# ТЗ: гибкий голосовой стек Scorix (VAD / ASR / LLM / TTS)

**ID:** VOICE-001  
**Версия:** 1.0  
**Дата:** 2026-08-28  
**Статус:** черновик для реализации  
**Аудитория:** бэкенд, FE, DevOps, продукт

---

## 1. Контекст и цель

Scorix — исходящие голосовые кампании B2B. Пользователь настраивает сценарий, подключает телефонию (SIP / Mango), загружает контакты и запускает обзвон.

**Проблема:** не выбран и не формализован стек распознавания речи (ASR), синтеза (TTS), диалоговой модели (LLM) и детекции речи (VAD).

**Цель:** дать пользователю **простой выбор из 3 переключателей** в кабинете, а на бэкенде — **гибкий роутинг** между self-hosted сервисами (GPU-сервер) и облачными провайдерами, с fallback и единым пайплайном звонка.

**Принцип:** VAD и self-hosted ASR/LLM **всегда подняты** на GPU-сервере; выбор пользователя определяет, **какой провайдер используется в runtime**, а не наличие инфраструктуры.

---

## 2. Область работ

### 2.1 В scope

| Компонент | Описание |
|-----------|----------|
| **UI** | Блок «Голос робота» на странице «Интеграции» |
| **Public API** | CRUD настроек голоса компании, health-check, preview TTS |
| **Voice Router** | Оркестрация пайплайна звонка по конфигу |
| **Коннекторы** | Абстракции ASR / LLM / TTS / VAD + реализации |
| **GPU-сервер** | Docker-стек: VAD + faster-whisper + vLLM |
| **Gates** | Проверка готовности голосовых настроек перед запуском кампании |
| **Fallback** | Автопереключение foreign → local при сбое провайдера |
| **Observability** | Логи маршрутизации, latency, коды ошибок (без PII в логах) |

### 2.2 Out of scope (v1)

- Выбор конкретной модели / голоса пользователем (фиксируется в конфиге платформы).
- Realtime speech-to-speech (OpenAI Realtime API) — отдельная итерация.
- Мультиязычные кампании (только русский в v1).
- Биллинг по провайдерам (достаточно общего тарифа за минуту).
- On-prem GPU у клиента.

---

## 3. Пользовательский сценарий

### 3.1 Где настраивается

**Страница:** `#/cabinet/integrations` — секция «Голос робота» **под** блоком телефонии.

Настройки **на уровне компании** (аккаунта), не кампании. При старте кампании конфиг **снимается снимок** (snapshot) — изменение настроек не влияет на уже запущенные кампании.

### 3.2 Три переключателя

| # | Поле UI | Значения | Текст для пользователя |
|---|---------|----------|------------------------|
| 1 | LLM | `foreign` / `local` | «Модель диалога: Иностранный / Наш сервер» |
| 2 | ASR | `foreign` / `local` | «Распознавание речи: Иностранный / Наш сервер» |
| 3 | TTS | `foreign` / `ru` | «Озвучка: Иностранный / Россия» |

**VAD** пользователю не показывается.

### 3.3 Подсказки в UI (hint-тексты)

| Выбор | Hint |
|-------|------|
| LLM → Иностранный | «Лучше справляется со сложными диалогами. Данные обрабатываются за рубежом.» |
| LLM → Наш сервер | «Данные остаются на инфраструктуре Scorix.» |
| ASR → Иностранный | «Быстрее распознаёт речь на шумной линии. Данные за рубежом.» |
| ASR → Наш сервер | «Распознавание на нашем сервере.» |
| TTS → Россия | «Естественная русская озвучка.» |
| TTS → Иностранный | «Альтернативная озвучка. Может звучать менее привычно для русского уха.» |

### 3.4 Действия пользователя

1. Открыть «Интеграции» → «Голос робота».
2. Выбрать три переключателя.
3. Нажать **«Сохранить»**.
4. Опционально: **«Прослушать голос»** — TTS-превью фразы «Здравствуйте! Это Scorix.» текущим выбранным TTS.
5. При первом сохранении или смене TTS — автоматический health-check (без отдельной кнопки «Проверить»).

### 3.5 Ограничения

- Менять настройки может пользователь с доступом к кабинету; во время **активного обзвона** — можно менять, но на текущий обзвон не влияет (snapshot).
- Заблокированный аккаунт (`company_locked`) — только просмотр, сохранение запрещено.
- Stub-режим FE (без API) — настройки в `localStorage`, без реального preview.

---

## 4. Дефолты

| Поле | Значение по умолчанию | Обоснование |
|------|----------------------|-------------|
| `llm` | `foreign` | Лучшее качество диалога из коробки |
| `asr` | `local` | Экономия + данные на нашей стороне |
| `tts` | `ru` | Естественный русский для исходящих |
| `fallback_enabled` | `true` (скрыто) | Авто-fallback foreign → local |

---

## 5. Матрица провайдеров (v1)

Пользователь **не видит** имена провайдеров. Маппинг — конфиг платформы (env / admin settings).

| Компонент | Ключ UI | Провайдер v1 | Endpoint / ресурс |
|-----------|---------|--------------|-------------------|
| VAD | — (always) | Silero VAD v5 | CPU, внутри voice-gateway |
| ASR | `local` | faster-whisper | `large-v3`, int8, GPU |
| ASR | `foreign` | Deepgram | `nova-2`, streaming |
| LLM | `local` | vLLM | `Qwen2.5-7B-Instruct-AWQ` |
| LLM | `foreign` | OpenAI | `gpt-4o-mini` |
| TTS | `ru` | Yandex SpeechKit | голос `alena` (или admin default) |
| TTS | `foreign` | OpenAI TTS | `tts-1`, voice `nova` |

### 5.1 GPU-сервер (scorix-llm-lab)

**Железо (текущее):** RTX 3090 24 GB, 32 GB RAM, 50 GB disk.

| Сервис | Порт | VRAM | Always on |
|--------|------|------|-----------|
| voice-gateway (VAD + orchestration) | 8080 | 0 | да |
| faster-whisper-server | 8001 | ~4 GB | да |
| vLLM (OpenAI-compatible) | 8000 | ~6 GB | да |
| **Итого** | | ~10 GB | |

---

## 6. Архитектура

### 6.1 Компоненты

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  FE Cabinet │────▶│  Scorix API    │────▶│  Voice Router       │
│  Integrations│     │  /voice-settings │     │  (per call session) │
└─────────────┘     └──────────────────┘     └──────────┬──────────┘
                                                         │
                    ┌────────────────────────────────────┼────────────────────────┐
                    │                                    │                        │
                    ▼                                    ▼                        ▼
           ┌────────────────┐              ┌─────────────────────┐    ┌──────────────────┐
           │ GPU Server     │              │ Cloud Foreign       │    │ Cloud RU         │
           │ VAD            │              │ Deepgram (ASR)      │    │ Yandex (TTS)     │
           │ whisper (ASR)  │              │ OpenAI LLM + TTS    │    │                  │
           │ vLLM (LLM)     │              │                     │    │                  │
           └────────────────┘              └─────────────────────┘    └──────────────────┘
                    ▲
                    │ RTP / audio
           ┌────────┴────────┐
           │ Telephony       │
           │ SIP / Mango     │
           └─────────────────┘
```

### 6.2 Пайплайн одного turn'а диалога

```
1. Аудио с телефонии → voice-gateway
2. VAD (local, always) → определение начала/конца реплики абонента
3. ASR (local | foreign по voice.asr) → текст реплики
4. LLM (local | foreign по voice.llm) → текст ответа робота
   - system prompt: сценарий кампании + tone + правила
   - history: последние N реплик (рекомендуется N=10)
5. TTS (ru | foreign по voice.tts) → аудио
6. Аудио → телефония → абонент
```

### 6.3 Latency budget (target)

| Этап | Target p95 |
|------|------------|
| VAD end-of-utterance | ≤ 300 ms после паузы |
| ASR (streaming) | ≤ 500 ms до финального текста |
| LLM (first token) | ≤ 800 ms |
| TTS (first chunk) | ≤ 400 ms |
| **End-to-end (реплика → ответ)** | **≤ 2500 ms p95** |

При превышении — логировать `voice_latency_exceeded`, не прерывать звонок.

---

## 7. Public API

Base: существующий `SCORIX_API_BASE`, авторизация `Bearer` session token.

### 7.1 GET `/api/cabinet/voice-settings`

**Response 200:**

```json
{
  "llm": "foreign",
  "asr": "local",
  "tts": "ru",
  "status": "ok",
  "last_check_at": "2026-08-28T06:00:00Z",
  "preview_available": true
}
```

| Поле | Тип | Описание |
|------|-----|----------|
| `llm` | `"foreign"` \| `"local"` | Выбор LLM |
| `asr` | `"foreign"` \| `"local"` | Выбор ASR |
| `tts` | `"foreign"` \| `"ru"` | Выбор TTS |
| `status` | `"ok"` \| `"degraded"` \| `"error"` \| `"unknown"` | Результат последней проверки |
| `last_check_at` | ISO8601 \| null | Время последнего health-check |
| `preview_available` | boolean | Можно ли проиграть TTS preview |

**status semantics:**

| status | Значение |
|--------|----------|
| `ok` | Все выбранные провайдеры доступны |
| `degraded` | Foreign недоступен, но local fallback работает |
| `error` | Критический компонент недоступен (в т.ч. local) |
| `unknown` | Ещё не проверялось |

### 7.2 PUT `/api/cabinet/voice-settings`

**Request:**

```json
{
  "llm": "local",
  "asr": "local",
  "tts": "ru"
}
```

**Response 200:** тело как GET + обновлённые `status`, `last_check_at`.

**Ошибки:**

| code | HTTP | Когда |
|------|------|-------|
| `validation` | 400 | Невалидное значение enum |
| `voice_check_failed` | 422 | Health-check не прошёл после сохранения |
| `read_only` | 403 | Аккаунт заблокирован |
| `forbidden` | 403 | Нет доступа |

### 7.3 POST `/api/cabinet/voice-settings/preview`

Генерирует короткий TTS-sample текущим выбранным TTS.

**Request (optional):**

```json
{
  "text": "Здравствуйте! Это Scorix."
}
```

Default text если не передан: `"Здравствуйте! Это Scorix."`

**Response 200:**

```json
{
  "audio_url": "https://.../preview/abc123.wav",
  "expires_at": "2026-08-28T07:00:00Z",
  "tts": "ru"
}
```

Или `Content-Type: audio/wav` stream — **решение за бэкендом**; FE должен поддерживать оба (предпочтительно URL).

**Ошибки:** `voice_preview_failed`, `provider_down`.

### 7.4 Gates: расширение `/api/cabinet/campaigns/:id/gates`

Добавить проверку голосовых настроек:

```json
{
  "ok": false,
  "errors": [
    { "code": "voice_not_configured" },
    { "code": "voice_check_failed" }
  ]
}
```

| code | UI-текст (FE) |
|------|---------------|
| `voice_not_configured` | «Настройте голос робота в интеграциях» |
| `voice_check_failed` | «Голос робота недоступен. Проверьте настройки в интеграциях» |
| `voice_degraded` | warning, не блокирует запуск: «Часть сервисов работает в резервном режиме» |

### 7.5 Snapshot при старте кампании

При `POST /api/cabinet/campaigns/:id/start` бэкенд сохраняет в кампанию:

```json
{
  "voice_snapshot": {
    "llm": "foreign",
    "asr": "local",
    "tts": "ru",
    "captured_at": "2026-08-28T06:00:00Z"
  }
}
```

Поле **не отдаётся** в public API кабинета (внутреннее / admin only).

---

## 8. Voice Router (бэкенд)

### 8.1 Интерфейсы коннекторов

```typescript
/** Детекция речи — always local */
interface VadConnector {
  process(chunk: AudioChunk): VadEvent;
  // VadEvent: { type: "speech_start" | "speech_end" | "silence", timestamp_ms }
}

interface AsrConnector {
  readonly mode: "local" | "foreign";
  transcribeStream(audio: AsyncIterable<AudioChunk>): AsyncIterable<AsrResult>;
  // AsrResult: { text: string, is_final: boolean, confidence?: number }
  healthCheck(): Promise<HealthResult>;
}

interface LlmConnector {
  readonly mode: "local" | "foreign";
  chatStream(params: {
    system: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    max_tokens?: number;
    temperature?: number;
  }): AsyncIterable<string>;
  healthCheck(): Promise<HealthResult>;
}

interface TtsConnector {
  readonly region: "ru" | "foreign";
  synthesizeStream(text: string): AsyncIterable<AudioChunk>;
  healthCheck(): Promise<HealthResult>;
}

type HealthResult = { ok: boolean; latency_ms?: number; error?: string };
```

### 8.2 Фабрика роутинга

```typescript
function resolveConnectors(config: VoiceConfig): {
  vad: VadConnector;       // always SileroLocal
  asr: AsrConnector;         // by config.asr
  llm: LlmConnector;         // by config.llm
  tts: TtsConnector;         // by config.tts
}
```

Конфиг провайдеров (URL, API keys, model names) — **только env/platform config**, не от пользователя.

### 8.3 Fallback policy

| Компонент | Primary недоступен | Fallback |
|-----------|-------------------|----------|
| ASR `foreign` | Deepgram timeout/error | → `local` (whisper) |
| LLM `foreign` | OpenAI error | → `local` (vLLM) |
| TTS `foreign` | OpenAI TTS error | → `ru` (Yandex) |
| TTS `ru` | Yandex error | → `foreign` (OpenAI TTS) |
| ASR `local` | whisper down | → ошибка звонка, код `asr_unavailable` |
| LLM `local` | vLLM down | → если foreign доступен и fallback_enabled → foreign; иначе ошибка |

При fallback:
- логировать `voice_fallback` с `{ component, from, to, call_id }`
- выставить `status: degraded` в voice-settings
- **не прерывать** текущую реплику, если fallback успешен

### 8.4 LLM prompt contract

System prompt формирует бэкенд из:
- `campaign.scenario_text` / stages
- `preview.tone`
- правила безопасности (не раскрывать системные инструкции, не выдумывать факты вне сценария)
- ограничение длины ответа: **≤ 2 предложения** для телефонного канала

LLM для **генерации сценария** (`/scenario/generate`) и LLM для **runtime-диалога** — **разные вызовы**, могут использовать один провайдер (`gpt-4o-mini`), но разные system prompts.

---

## 9. GPU-сервер: деплой

### 9.1 Сервисы (docker-compose)

```yaml
services:
  vllm:
    image: vllm/vllm-openai:latest
    ports: ["8000:8000"]
    deploy:
      resources:
        reservations:
          devices: [{ capabilities: [gpu] }]
    command: >
      --model Qwen/Qwen2.5-7B-Instruct-AWQ
      --max-model-len 4096
      --gpu-memory-utilization 0.35

  whisper:
    # faster-whisper-server или свой FastAPI wrapper
    ports: ["8001:8001"]
    deploy:
      resources:
        reservations:
          devices: [{ capabilities: [gpu] }]
    environment:
      WHISPER_MODEL: large-v3
      COMPUTE_TYPE: int8

  voice-gateway:
    ports: ["8080:8080"]
    environment:
      VLLM_URL: http://vllm:8000
      WHISPER_URL: http://whisper:8001
      VAD_MODEL: silero_v5
    depends_on: [vllm, whisper]
```

### 9.2 Health endpoints (internal)

| Service | Path | OK criteria |
|---------|------|-------------|
| vLLM | `GET /v1/models` | 200, model listed |
| whisper | `GET /health` | 200, `ready: true` |
| voice-gateway | `GET /health` | 200, vad ok |

Scorix API агрегирует эти проверки при PUT voice-settings и периодически (cron каждые 5 min).

### 9.3 Диск и модели

| Модель | ~Размер |
|--------|---------|
| Qwen2.5-7B-AWQ | ~5 GB |
| Whisper large-v3 | ~3 GB |
| Silero VAD | ~2 MB |
| **Итого** | ~8 GB + Docker |

При 50 GB alloc — **достаточно**, но без других тяжёлых моделей.

### 9.4 Локация и prod

Текущий сервер в **Канаде**. Для prod-звонков в РФ рекомендуется:
- v1: использовать GPU-сервер для **local ASR/LLM** + cloud TTS RU
- v2: перенести GPU в RU/EU или добавить второй регион

---

## 10. FE-реализация

### 10.1 State

```javascript
voice: {
  llm: "foreign",      // "foreign" | "local"
  asr: "local",
  tts: "ru",           // "ru" | "foreign"
  status: "unknown",   // "ok" | "degraded" | "error" | "unknown"
  lastError: null,
  previewUrl: null,
  loaded: false,
  saving: false,
}
```

Persist: `scx_voice_settings` в localStorage (stub).

### 10.2 UI-компонент

Секция `#sec-voice` на странице integrations, **ниже** `#sec-telephony`:

- 3 radio-group (не dropdown — только 2 варианта каждый)
- Hint под каждой группой
- Badge статуса: «Готово» / «Резервный режим» / «Недоступно»
- Кнопки: «Сохранить», «Прослушать голос»
- `<audio>` для preview

### 10.3 Ready strip / gates

В workspace кампании, полоса готовности:
- новый пункт: «Голос робота» → ссылка на integrations
- `voice_not_configured` / `voice_check_failed` → блокирует запуск

### 10.4 ERROR_MESSAGES (добавить в api.js)

```javascript
voice_not_configured: "Настройте голос робота в интеграциях",
voice_check_failed: "Голос робота недоступен. Проверьте настройки в интеграциях",
voice_preview_failed: "Не удалось воспроизвести голос. Попробуйте позже",
voice_degraded: "Часть голосовых сервисов работает в резервном режиме",
```

### 10.5 Stub-режим

При `!hasApi()`:
- сохранение в localStorage
- preview: Web Speech API или статичный placeholder + hint «Доступно с API»
- status всегда `ok`

---

## 11. Безопасность и compliance

| Требование | Реализация |
|------------|------------|
| API keys провайдеров | Только server-side env, не в FE |
| Аудио абонентов | Не логировать raw audio; transcript — только в карточке контакта |
| 152-ФЗ hint | UI явно предупреждает при выборе «Иностранный» для LLM/ASR |
| Preview audio URL | Signed URL, TTL ≤ 1 час |
| Rate limit preview | ≤ 10 req/min per company |

---

## 12. Observability

### 12.1 Метрики (per call)

- `voice_asr_latency_ms`
- `voice_llm_first_token_ms`
- `voice_tts_first_chunk_ms`
- `voice_fallback_total{component, from, to}`
- `voice_turn_total{result=ok|error}`

### 12.2 Логи (structured)

```json
{
  "event": "voice_turn",
  "call_id": "...",
  "campaign_id": "...",
  "voice": { "llm": "foreign", "asr": "local", "tts": "ru" },
  "fallback_used": false,
  "latency_ms": 1800
}
```

**Без:** phone, transcript text, audio URLs с PII.

---

## 13. Этапы реализации

### Фаза 0 — Infra (DevOps)

- [ ] docker-compose на scorix-llm-lab
- [ ] Health endpoints + мониторинг GPU
- [ ] Secrets: OPENAI_API_KEY, DEEPGRAM_API_KEY, YANDEX_API_KEY

### Фаза 1 — Backend core

- [ ] Интерфейсы коннекторов + фабрика
- [ ] Реализации: Silero, Whisper local, vLLM, Deepgram, OpenAI LLM, Yandex TTS, OpenAI TTS
- [ ] Voice Router в call session
- [ ] Fallback policy

### Фаза 2 — Public API

- [ ] GET/PUT `/api/cabinet/voice-settings`
- [ ] POST preview
- [ ] Gates extension
- [ ] voice_snapshot on campaign start

### Фаза 3 — FE

- [ ] Секция «Голос робота» в integrations
- [ ] API integration + error codes
- [ ] Ready strip + gate errors
- [ ] Stub mode

### Фаза 4 — QA & tuning

- [ ] Latency benchmarks (10 test calls)
- [ ] Fallback scenarios (kill foreign provider)
- [ ] Load test: 5 parallel calls on single GPU

---

## 14. Критерии приёмки

### 14.1 UI

- [ ] Пользователь видит 3 переключателя на странице «Интеграции»
- [ ] Сохранение работает через API; в stub — localStorage
- [ ] «Прослушать голос» воспроизводит sample через выбранный TTS
- [ ] Статус «Недоступно» блокирует запуск кампании
- [ ] Hint-тексты про «данные за рубежом» показываются для foreign LLM/ASR

### 14.2 Backend

- [ ] При `llm=local` runtime использует vLLM; при `foreign` — OpenAI
- [ ] При `asr=local` — whisper; при `foreign` — Deepgram
- [ ] При `tts=ru` — Yandex; при `foreign` — OpenAI TTS
- [ ] VAD всегда local (Silero)
- [ ] Fallback foreign→local при ошибке OpenAI/Deepgram
- [ ] Snapshot фиксируется при start кампании

### 14.3 Performance

- [ ] End-to-end p95 ≤ 2500 ms на test call (foreign LLM + local ASR + ru TTS)
- [ ] GPU VRAM ≤ 20 GB при одновременном ASR + LLM

### 14.4 Regression

- [ ] Существующая телефония (SIP/Mango) не затронута
- [ ] Генерация сценария (`/scenario/generate`) работает независимо

---

## 15. Риски

| Риск | Митигация |
|------|-----------|
| Канада → RU latency | Cloud foreign ASR/LLM; GPU для local; v2 — регион RU |
| 50 GB disk | Только 7B + whisper large, без 70B |
| Single GPU overload | Queue calls; limit parallel local LLM; foreign LLM offload |
| Yandex API недоступен | Fallback TTS foreign |
| Качество Qwen vs GPT-4o-mini | Default LLM = foreign; local для compliance |

---

## 16. Открытые вопросы (решить до фазы 1)

| # | Вопрос | Предложение |
|---|--------|-------------|
| 1 | Preview: URL или stream? | Signed URL (проще для FE) |
| 2 | Admin override дефолтов per company? | v2; v1 — единые дефолты |
| 3 | Показывать ли `degraded` в UI как warning? | Да, badge «Резервный режим», не блокировать |
| 4 | Лимит parallel calls на GPU? | 3 для v1 |
| 5 | Хранить transcript где? | Существующее поле `contact.last_transcript` |

---

## 17. Связанные артефакты

| Артефакт | Путь / место |
|----------|--------------|
| FE integrations (телефония) | `src/app.js` → `sectionTelephony()` |
| API client | `src/api.js` |
| Gates | `GET /api/cabinet/campaigns/:id/gates` |
| Handoff для FE (после утверждения) | `docs/handoff/fe/VOICE-001.md` |
| Бэклог задач | `docs/spec/voice-stack-backlog.md` |
| Docker stack | TBD: `infra/voice-lab/docker-compose.yml` |

---

## 18. Глоссарий

| Термин | Определение |
|--------|-------------|
| **Turn** | Один цикл «абонент сказал → робот ответил» |
| **Foreign** | Облачный провайдер за пределами инфраструктуры Scorix (US/EU) |
| **Local** | Self-hosted на GPU-сервере Scorix |
| **RU (TTS)** | Российский облачный TTS (Yandex SpeechKit) |
| **Snapshot** | Зафиксированный voice-config на момент старта кампании |
| **Gate** | Условие готовности перед запуском обзвона |
