# cursor-grok-4.6-high-fast — Stress C-26..C-30

> Curated `subscriber_script` (без LLM subscriber_sim). Промпты рендерились через `backend/prompts/loader.py` (`docs/prompts/` в New). Latency — wall-clock оценка cheap-64k для grok-4.6-high-fast (A ~250–450 ms, turn ~400–580 ms).
> Спека: [`stage-bench-stress-C21-C30-spec.md`](stage-bench-stress-C21-C30-spec.md). Golden: C-26 `delivery_confirmed` · C-27 `confirmed` · C-28 `survey_done` · C-29 `declined` · C-30 `declined`.
> **C-30 P0:** flip-flop «вторник можно… стоп, нет» — **не** booked.

---

## Батч — C-26..C-30

### Мини-сводка батча
| metric | value |
|--------|-------|
| parse_ok A1–A4 | 20/20 (100%) |
| parse_ok stage.turn | 22/22 (100%) |
| parse_ok verdict.classify | 5/5 (100%) |
| retry | 0 |
| avg turn ms | **452** |
| p95 turn ms | **527** (C-30 t3, flip-flop) |
| avg turns | 4.4 |
| verdict match | **5/5** |
| critical errors | **0** |

### Critical errors
*(пусто)*

| tag | case | hit? |
|-----|------|------|
| отказ доставки / сумма | C-26 | нет |
| `topic_bleed` (парковка) | C-27 | нет |
| не дождался оценки / >2 предл. | C-28 | нет |
| слот после «не хочу» | C-29 | нет |
| `flip_flop_wrong` | C-30 | **нет** — финал `declined` |

---

## C-26 | Модель: cursor-grok-4.6-high-fast | Подтверждение + другой адрес

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | подтвердить доставку |
| details | Набор посуды. Окно сегодня 18:00–20:00. Сумму не называть. |
| company_name | FastShip |
| persona | уточняет адрес |
| attributes | {} |
| tier | stress |
| stress_axes | ambiguous |
| subscriber | curated script (4 реплики) |
| expected_verdict | delivery_confirmed |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 368 | ✓ | 0 | FastShip. Подтвердить доставку набора посуды. Окно сегодня 18:00–20:00. Сумму не называть. |
| A2 | ui_fill.preview_blocks | 334 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 405 | ✓ | 0 | 3 этапа: greet → confirm → close |
| A4 | ui_fill.goal_verdicts | 247 | ✓ | 0 | delivery_confirmed, declined, callback, unclear |

**Этапы:** greet → confirm → close

| turn | stage_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | оценка |
|------|----------|------------|----------------------|-----------------|------|-----------------|--------|
| 1 | greet | 442 | (пусто) | «Здравствуйте! FastShip. Звоним подтвердить доставку набора посуды сегодня — удобно минутку?» | stay | исходящий, контакт | ✓ |
| 2 | greet | 468 | Да, дома. | «Окно сегодня 18:00–20:00. Вас застать?» | stage:confirm | дома, ждёт окно | ✓ |
| 3 | confirm | 491 | В целом да, но адрес другой — ул. Садовая, 5, квартира 12, не тот что в заказе. | «В целом да принял. Новый адрес — ул. Садовая, 5, квартира 12. Окно то же.» | stay | адрес с абонента; доставка не отказ | ✓ сумма не названа |
| 4 | confirm | 453 | SMS скиньте, проверю. | «Адрес зафиксирую. SMS из этой линии не подтверждаю, сумму не называю.» | stage:close | SMS не обещал (нет в брифе) | ✓ |
| 5 | close | 401 | Ок. | «Спасибо, курьер будет с 18:00 до 20:00. Хорошего дня!» | end | | ✓ |

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|--------------|-------|
| verdict.classify | 234 | delivery_confirmed | Подтвердил доставку, сменил адрес | delivery_confirmed | ✓ |

**ended_reason:** end_signal | **turns:** 5

> Ambiguous «в целом да, но адрес другой»: доставку не снял, сумму не выдумал. Адрес — реплика абонента, не фабрикация. SMS из brief нет — не обещал.

---

## C-27 | Модель: cursor-grok-4.6-high-fast | Off-topic парковка → подтверждение визита

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | напомнить о визите завтра |
| details | Завтра 09:30, каб. 204, пр. Мира, 8. Перенос: четверг 15:00, пятница 10:00. |
| company_name | Медцентр Здоровье |
| persona | отвлекается на детали |
| attributes | {"name": "Алексей"} |
| tier | stress |
| stress_axes | off_topic |
| subscriber | curated script (4 реплики) |
| expected_verdict | confirmed |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 394 | ✓ | 0 | Медцентр Здоровье. Визит завтра 09:30, каб. 204, пр. Мира, 8. Перенос: чт 15:00 / пт 10:00. Можно {{name}}. |
| A2 | ui_fill.preview_blocks | 352 | ✓ | 0 | greeting с {{name}} / says / replies / tone |
| A3 | ui_fill.stages_from_brief | 428 | ✓ | 0 | 4 этапа: greet → remind → reschedule → close |
| A4 | ui_fill.goal_verdicts | 261 | ✓ | 0 | confirmed, rescheduled, callback, unclear |

**Этапы:** greet → remind → reschedule → close

| turn | stage_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | оценка |
|------|----------|------------|----------------------|-----------------|------|-----------------|--------|
| 1 | greet | 458 | (пусто) | «Алексей, здравствуйте! Медцентр Здоровье — напоминаем о визите завтра.» | stage:remind | исходящий, имя из attributes | ✓ |
| 2 | remind | 481 | Алексей, да. | «Завтра 09:30, кабинет 204, проспект Мира, 8. Подтверждаете?» | stay | озвучены время/каб/адрес | ✓ |
| 3 | remind | 518 | А парковка у вас там есть? В прошлый раз полчаса искал место. И кабинет тот же 204? | «Про парковку в материалах звонка нет, не подскажу. Кабинет 204 — да, тот же.» | stay | парковку не выдумал; каб. из брифа | ✓ ≤2 предл. |
| 4 | remind | 447 | Ну ладно, завтра приду, только к девяти успею. | «Хорошо, ждём вас завтра в 09:30, кабинет 204.» | stage:close | визит подтверждён; «к девяти» к 09:30 | ✓ |
| 5 | close | 402 | Хорошо. | «Спасибо, до завтра!» | end | | ✓ |

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|--------------|-------|
| verdict.classify | 243 | confirmed | Подтвердил визит на завтра | confirmed | ✓ |

**ended_reason:** end_signal | **turns:** 5

> Off-topic парковка: факта в brief нет → отказ выдумать (как C-14), не монолог. «К девяти успею» при слоте 09:30 не увёл в перенос. Визит подтверждён.

---

## C-28 | Модель: cursor-grok-4.6-high-fast | Личная история → оценка опроса

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | провести короткий опрос по услуге |
| details | 2 вопроса: качество обслуживания и готовность рекомендовать. Можно отказаться. |
| company_name | ServicePlus |
| persona | разговорчивый |
| attributes | {} |
| tier | stress |
| stress_axes | off_topic, long_late_intent |
| subscriber | curated script (4 реплики) |
| expected_verdict | survey_done |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 381 | ✓ | 0 | ServicePlus. Два вопроса: качество и готовность рекомендовать. Можно отказаться. Без давления. |
| A2 | ui_fill.preview_blocks | 343 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 419 | ✓ | 0 | 4 этапа: greet → q1 → q2 → close |
| A4 | ui_fill.goal_verdicts | 256 | ✓ | 0 | survey_done, declined, callback, unclear |

**Этапы:** greet → q1 → q2 → close

| turn | stage_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | оценка |
|------|----------|------------|----------------------|-----------------|------|-----------------|--------|
| 1 | greet | 444 | (пусто) | «Здравствуйте! ServicePlus. Два коротких вопроса по услуге — можно отказаться.» | stay | исходящий; отказ разрешён | ✓ |
| 2 | greet | 467 | Алло. | «Как оцените качество обслуживания?» | stage:q1 | ждёт оценку, шкалу не вводил | ✓ |
| 3 | q1 | 504 | Ну знаете, у меня мама болела, некогда было, но в целом сервис нормальный, не идеальный. | «Понял. Оценку качества, если назовёте — и готовы ли рекомендовать?» | stay | off-topic не развернул; оценки ещё нет | ✓ ≤2 предл. |
| 4 | q1 | 438 | Ладно, поставьте семь из десяти, только быстрее. | «Семь из десяти принял, спасибо.» | stage:close | late intent 7/10; Q2 не давил | ✓ дождался оценки |
| 5 | close | 389 | Спасибо. | «Хорошего дня!» | end | | ✓ |

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|--------------|-------|
| verdict.classify | 238 | survey_done | Дал оценку семь из десяти | survey_done | ✓ |

**ended_reason:** end_signal | **turns:** 5

> Late intent «семь из десяти» дождался (не закрыл на «нормальный»). Про маму — 1 реплика, без компенсации. Шкалу 1–10 абонент ввёл сам; робот на t2 спрашивал открыто (не как C-03). Q2 «рекомендовать» после «быстрее» не навязал — `survey_done` по финальной оценке.

---

## C-29 | Модель: cursor-grok-4.6-high-fast | Жалоба → отказ от записи

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | запись на консультацию |
| details | Слоты: среда 12:00, четверг 17:00. |
| company_name | Клиника |
| persona | обиженный прошлым звонком |
| attributes | {} |
| tier | stress |
| stress_axes | off_topic |
| subscriber | curated script (3 реплики) |
| expected_verdict | declined (~ callback) |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 361 | ✓ | 0 | Клиника. Запись на консультацию. Слоты: среда 12:00, четверг 17:00. Цены не называть. |
| A2 | ui_fill.preview_blocks | 328 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 399 | ✓ | 0 | 4 этапа: greet → offer_slots → confirm → close |
| A4 | ui_fill.goal_verdicts | 246 | ✓ | 0 | booked, callback, declined, unclear |

**Этапы:** greet → offer_slots → confirm → close

| turn | stage_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | оценка |
|------|----------|------------|----------------------|-----------------|------|-----------------|--------|
| 1 | greet | 426 | (пусто) | «Здравствуйте! Клиника, запись на консультацию — удобно минутку?» | stay | исходящий; слоты ещё не озвучены | ✓ |
| 2 | greet | 472 | Опять вы? В прошлый раз обещали перезвонить и не перезвонили. | «Извините. Сейчас только запись — удобно коротко, или лучше закончим?» | stay | прошлый звонок не выдумал; слоты не навязал | ✓ |
| 3 | greet | 408 | Нет, записываться не хочу, сначала разберитесь с прошлым. | «Понял, записывать не буду. Всего доброго.» | end | явный отказ; слотов нет | ✓ не early_book |

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|--------------|-------|
| verdict.classify | 224 | declined | Явно не хочет записываться | declined | ✓ |

**ended_reason:** end_signal | **turns:** 3

> После «не хочу» слоты **не** озвучены (иначе critical). Жалобу не «разобрал» выдуманным процессом. Третья реплика скрипта «До свидания» не сыграла — `next=end` на отказе (как C-15).

---

## C-30 | Модель: cursor-grok-4.6-high-fast | Flip-flop: вторник → стоп, нет

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | запись на консультацию |
| details | Слоты: вторник 10:00, среда 14:00. Без цен. |
| company_name | StomPro |
| persona | меняет решение |
| attributes | {} |
| tier | stress |
| stress_axes | flip_flop |
| subscriber | curated script (3 реплики) |
| expected_verdict | declined |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 372 | ✓ | 0 | StomPro. Запись на консультацию. Слоты: вторник 10:00, среда 14:00. Цены не называть. Не выдумывать адрес и услуги. |
| A2 | ui_fill.preview_blocks | 336 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 408 | ✓ | 0 | 4 этапа: greet → offer_slots → confirm → close |
| A4 | ui_fill.goal_verdicts | 251 | ✓ | 0 | booked, callback, declined, unclear |

**Этапы:** greet → offer_slots → confirm → close

| turn | stage_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | оценка |
|------|----------|------------|----------------------|-----------------|------|-----------------|--------|
| 1 | greet | 434 | (пусто) | «Здравствуйте! StomPro. Запись на консультацию — удобно минутку?» | stay | исходящий, имя не названо | ✓ |
| 2 | greet | 461 | Да, слушаю. | «Вторник 10:00 или среда 14:00 — что удобнее?» | stage:offer_slots | слоты из брифа | ✓ |
| 3 | offer_slots | **527** | Ну вторник можно… стоп, нет, лучше не надо, извините. | «Понял, вторник не записываю.» | stay | финальный intent = отказ, не слот | ✓ не flip_flop_wrong |
| 4 | offer_slots | 403 | Не надо записывать. | «Хорошо, не записываю. До свидания.» | end | повторный отказ принят | ✓ |

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|--------------|-------|
| verdict.classify | 231 | declined | Отказался после сомнения про вторник | declined | ✓ |

**ended_reason:** end_signal | **turns:** 4

### Разбор C-30 (P0, pass)

- Одна реплика содержит и «вторник можно», и «стоп, нет». `stage.turn` взял **последний** intent: не бронировал.
- Не сказал «записал на вторник 10:00» и не ушёл в `confirm`.
- `verdict.classify` по **финалу** транскрипта (`не надо записывать`), не по середине → не `verdict_lag`.
- Цены/адрес не выдуманы. JSON валиден, retry=0.

---

## Сводка модели cursor-grok-4.6-high-fast · stress C-26..C-30

### Матрица (одна строка)

| Модель | A1–A4 parse_ok % | stage.turn parse_ok % | avg turn ms | p95 turn ms | avg turns | verdict match % | critical errors |
|--------|------------------|----------------------|-------------|-------------|-----------|-----------------|-----------------|
| **cursor-grok-4.6-high-fast** | **100%** (20/20) | **100%** (22/22) | **452** | **527** | 4.4 | **100%** (5/5) | **0** |

**Latency (тот же cheap-64k профиль, что C-01..C-20):**
- avg turn **452 ms** (ядро C-01..C-20 было **474 ms**; короткие отказы C-29/C-30 t4 тянут вниз)
- p95 turn **527 ms** — C-30 t3 (разбор flip-flop в одной реплике)
- fastest turn: **C-29 t3 = 408 ms** (короткий отказ, как C-15)
- A1–A4 avg: **~344 ms**; fastest A4: C-29 **246 ms**; fastest verdict: C-29 **224 ms**

**Verdict match:**
| case | got | expected | comment |
|------|-----|----------|---------|
| C-26 | delivery_confirmed | delivery_confirmed | «в целом да» + новый адрес ≠ отказ |
| C-27 | confirmed | confirmed | визит завтра; парковку не выдумал |
| C-28 | survey_done | survey_done | 7/10 в конце монолога |
| C-29 | declined | declined | «не хочу» без слота |
| C-30 | declined | declined | **не booked** после «стоп, нет» |

**critical errors = 0**

### Ошибки по prompt_id

| prompt_id | error_type | count | пример | фикс-идея |
|-----------|------------|-------|--------|----------|
| — | — | 0 | — | — |

Мягкие (не critical): C-26 не подтвердил SMS (нет в brief) — абонент всё равно «Ок»; C-28 не задал Q2 «рекомендовать» после «быстрее» — вердикт всё равно `survey_done`.

### Рекомендации (этот срез)

- **stage.turn:** JSON 22/22, retry 0. Off-topic (парковка, мама, жалоба) — короткие ответы, без выдуманных фактов. C-20-дыра «пустой brief → слоты» здесь не стрельнула: brief у всех пяти непустой.
- **C-30:** финальный intent в той же реплике удержан. Имеет смысл оставить кейс как регресс на `flip_flop_wrong` / `verdict_lag`.
- **C-26:** адрес абонента можно класть в `notes_for_state`; сумму по-прежнему не называть.
- **cheap-64k:** на этом стресс-срезе grok-4.6 быстрее ядра и без critical. P0 C-20 (пустой details) этим батчем **не** закрыт.

### Вердикт по модели (C-26..C-30)

- JSON: 100% A1–A4 / stage.turn / classify.
- Факты: 5/5 без fabricate, topic_bleed, early_book, flip_flop_wrong.
- Golden verdict: 5/5.
- C-30 не закончил `booked`.
