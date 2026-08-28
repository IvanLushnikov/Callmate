# Stage bench batch — cursor-grok-4.6-high-fast | C-02..C-05

> Дата: 2026-08-28

Модель: **cursor-grok-4.6-high-fast**. Кейсы из `scripts/stage_llm_bench.py`. Retry не понадобился.

---

## C-02 | Модель: cursor-grok-4.6-high-fast | Напоминание о визите

**Клиент заполнил:**

| Поле | Значение |
|------|----------|
| goal | напомнить о визите завтра |
| details | Медцентр. Визит завтра в 09:30, каб. 204, адрес пр. Мира, 8. Можно предложить перенос на четверг 15:00 или пятницу 10:00. |
| company_name | Медцентр Здоровье |
| persona | занятый клиент (подтверждает визит или просит перенос) |
| attributes | `{"name":"Алексей"}` |

**После Save (A1–A4):**

| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 418 | ✓ | 0 | визит завтра 09:30, каб. 204, пр. Мира 8; перенос чт 15:00 / пт 10:00 |
| A2 | ui_fill.preview_blocks | 361 | ✓ | 0 | greeting с `{{name}}`; says/replies/tone — мягкое напоминание |
| A3 | ui_fill.stages_from_brief | 492 | ✓ | 0 | **4 этапа**: `intro` → `confirm_visit` → `reschedule`/`wrap_up` → `end` |
| A4 | ui_fill.goal_verdicts | 271 | ✓ | 0 | **5 вердиктов**: `confirmed`/`rescheduled` (true), `declined`, `callback`, `unclear` |

**A1 runtime_brief:** цель — напомнить о визите завтра; факты: «Здоровье», 09:30, каб. 204, пр. Мира 8; перенос только из списка; без цен/диагнозов; имя только из attributes.

### B. Таблица ходов

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|--------|
| 1 | intro | stage.turn | 541 | *(пусто)* | «Здравствуйте, Алексей! Это медцентр «Здоровье», звоним напомнить: завтра в девять тридцать, кабинет 204, удобно сейчас?» | stay | | ✓ |
| 2 | intro | stage.turn | 518 | «Алло, да, слушаю — завтра в силе.» | «Отлично. Кабинет 204, проспект Мира, дом восемь. Подтверждаете визит?» | stage:confirm_visit | согласие говорить; визит в силе | ✓ |
| 3 | confirm_visit | stage.turn | 562 | «Да, буду.» | «Спасибо. Ждём завтра в девять тридцать, кабинет 204. Всё верно?» | stage:wrap_up | визит подтверждён | ✓ |
| 4 | wrap_up | stage.turn | 497 | «Да, всё верно.» | «Хорошо, до завтра. Всего доброго!» | end | напоминание доставлено | ✓ |

Перенос не понадобился. Имя из attributes озвучено. В `notes` ФИО нет.

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|--------------|-------|
| verdict.classify | 304 | confirmed | Абонент подтвердил визит на завтра | confirmed | ✓ |

**ended_reason:** end_signal | **turns:** 4

**Transcript:**
```
робот: Здравствуйте, Алексей! Это медцентр «Здоровье», звоним напомнить: завтра в девять тридцать, кабинет 204, удобно сейчас?
абонент: Алло, да, слушаю — завтра в силе.
робот: Отлично. Кабинет 204, проспект Мира, дом восемь. Подтверждаете визит?
абонент: Да, буду.
робот: Спасибо. Ждём завтра в девять тридцать, кабинет 204. Всё верно?
абонент: Да, всё верно.
робот: Хорошо, до завтра. Всего доброго!
```

---

## C-03 | Модель: cursor-grok-4.6-high-fast | Сбор обратной связи (NPS)

**Клиент заполнил:**

| Поле | Значение |
|------|----------|
| goal | узнать удовлетворённость после визита |
| details | Сервис доставки еды. Спросить о последнем заказе. Без давления и без скидок в обмен на оценку. |
| company_name | FoodBox |
| persona | спокойный клиент (в целом доволен, ставит 8 из 10) |
| attributes | `{}` |

**После Save (A1–A4):**

| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 401 | ✓ | 0 | спросить про последний заказ; **без скидок и давления** |
| A2 | ui_fill.preview_blocks | 348 | ✓ | 0 | greeting/says/replies/tone — короткий опрос |
| A3 | ui_fill.stages_from_brief | 474 | ✓ | 0 | **3 этапа**: `intro` → `ask_satisfaction` → `thanks` |
| A4 | ui_fill.goal_verdicts | 258 | ✓ | 0 | **4 вердикта**: `feedback_collected` (true), `declined`, `callback`, `unclear` |

### B. Таблица ходов

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|--------|
| 1 | intro | stage.turn | 528 | *(пусто)* | «Здравствуйте! Это FoodBox. Звоним узнать, как прошёл последний заказ — удобно ответить коротко?» | stay | | ✓ |
| 2 | intro | stage.turn | 505 | «Да, слушаю.» | «Спасибо. Как вам последний заказ — всё было нормально?» | stage:ask_satisfaction | готов ответить | ✓ |
| 3 | ask_satisfaction | stage.turn | 548 | «В целом да, восьмёрку поставлю.» | «Поняла, спасибо за оценку.» | stage:thanks | оценка: 8/10 | ✓ |
| 4 | thanks | stage.turn | 489 | «Пожалуйста.» | «Больше не отвлекаю. Хорошего дня!» | end | ОС собрана | ✓ |

Имя не озвучено (attributes пустые). Скидку не предлагал.

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|--------------|-------|
| verdict.classify | 291 | feedback_collected | Абонент дал оценку последнего заказа | feedback_collected | ✓ |

**ended_reason:** end_signal | **turns:** 4

**Transcript:**
```
робот: Здравствуйте! Это FoodBox. Звоним узнать, как прошёл последний заказ — удобно ответить коротко?
абонент: Да, слушаю.
робот: Спасибо. Как вам последний заказ — всё было нормально?
абонент: В целом да, восьмёрку поставлю.
робот: Поняла, спасибо за оценку.
абонент: Пожалуйста.
робот: Больше не отвлекаю. Хорошего дня!
```

---

## C-04 | Модель: cursor-grok-4.6-high-fast | Подтверждение доставки

**Клиент заполнил:**

| Поле | Значение |
|------|----------|
| goal | подтвердить доставку |
| details | Курьерская служба. Заказ — набор посуды, окно доставки сегодня 18:00–20:00. Сумму заказа не называть. |
| company_name | FastShip |
| persona | дома, ждёт курьера (подтверждает адрес и время) |
| attributes | `{}` |

**После Save (A1–A4):**

| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 409 | ✓ | 0 | набор посуды; окно сегодня 18:00–20:00; **сумму не называть** |
| A2 | ui_fill.preview_blocks | 356 | ✓ | 0 | greeting/says/replies/tone; без выдуманного адреса |
| A3 | ui_fill.stages_from_brief | 481 | ✓ | 0 | **3 этапа**: `intro` → `confirm_window` → `wrap_up` |
| A4 | ui_fill.goal_verdicts | 264 | ✓ | 0 | **4 вердикта**: `delivery_confirmed` (true), `declined`, `callback`, `unclear` |

В details нет слотов переноса — A3 не выдумал альтернативное окно.

### B. Таблица ходов

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|--------|
| 1 | intro | stage.turn | 536 | *(пусто)* | «Здравствуйте! Это FastShip. Звоним подтвердить доставку набора посуды — сегодня с шести до восьми вечера. Удобно сейчас?» | stay | | ✓ |
| 2 | intro | stage.turn | 511 | «Да, я дома, жду.» | «Отлично. Окно сегодня с восемнадцати до двадцати — подтверждаете?» | stage:confirm_window | дома, ждёт | ✓ |
| 3 | confirm_window | stage.turn | 555 | «Да, подтверждаю. Адрес тот же.» | «Спасибо, фиксирую. Курьер будет сегодня с шести до восьми. Хорошего вечера!» | end | окно подтверждено | ✓ |

Сумму не назвал. Адрес не выдумал (абонент сказал «тот же» — робот не подставил улицу).

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|--------------|-------|
| verdict.classify | 312 | delivery_confirmed | Абонент подтвердил окно доставки | delivery_confirmed | ✓ |

**ended_reason:** end_signal | **turns:** 3

**Transcript:**
```
робот: Здравствуйте! Это FastShip. Звоним подтвердить доставку набора посуды — сегодня с шести до восьми вечера. Удобно сейчас?
абонент: Да, я дома, жду.
робот: Отлично. Окно сегодня с восемнадцати до двадцати — подтверждаете?
абонент: Да, подтверждаю. Адрес тот же.
робот: Спасибо, фиксирую. Курьер будет сегодня с шести до восьми. Хорошего вечера!
```

---

## C-05 | Модель: cursor-grok-4.6-high-fast | Напоминание об оплате

**Клиент заполнил:**

| Поле | Значение |
|------|----------|
| goal | напомнить об оплате |
| details | Образовательная платформа. Счёт за курс «Аналитика данных» просрочен на 3 дня. Напомнить мягко, без угроз и блокировок. |
| company_name | EduPro |
| persona | клиент, забыл оплатить (обещает оплатить сегодня вечером) |
| attributes | `{}` |

**После Save (A1–A4):**

| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 394 | ✓ | 0 | курс «Аналитика данных»; счёт не закрыт 3 дня; **без угроз/блокировок/суммы** |
| A2 | ui_fill.preview_blocks | 339 | ✓ | 0 | greeting без дедлайна-угрозы; replies — принять обещание |
| A3 | ui_fill.stages_from_brief | 458 | ✓ | 0 | **3 этапа**: `intro` → `payment_status` → `wrap_up` |
| A4 | ui_fill.goal_verdicts | 247 | ✓ | 0 | **5 вердиктов**: `payment_promised` (true), `already_paid`, `declined`, `callback`, `unclear` |

Суммы во входе нет — A1 явно запретил её выдумывать.

### B. Таблица ходов

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|--------|
| 1 | intro | stage.turn | 522 | *(пусто)* | «Здравствуйте! Это EduPro. Звоним напомнить о счёте за курс «Аналитика данных». Удобно сейчас пару слов?» | stay | | ✓ |
| 2 | intro | stage.turn | 498 | «Ой, да, совсем забыл.» | «Поняла. Счёт за курс пока открыт — напоминаем мягко. Получится оплатить в ближайшее время?» | stage:payment_status | ещё не оплатил | ✓ |
| 3 | payment_status | stage.turn | 541 | «Да, сегодня вечером оплачу.» | «Хорошо, спасибо. Больше не держу.» | stage:wrap_up | обещает оплату вечером | ✓ |
| 4 | wrap_up | stage.turn | 486 | «Угу.» | «Хорошего вечера!» | end | напоминание принято | ✓ |

Без «оплатите сегодня», пеней, блокировок и суммы.

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|--------------|-------|
| verdict.classify | 287 | payment_promised | Абонент обещал оплатить сегодня вечером | payment_promised | ✓ |

**ended_reason:** end_signal | **turns:** 4

**Transcript:**
```
робот: Здравствуйте! Это EduPro. Звоним напомнить о счёте за курс «Аналитика данных». Удобно сейчас пару слов?
абонент: Ой, да, совсем забыл.
робот: Поняла. Счёт за курс пока открыт — напоминаем мягко. Получится оплатить в ближайшее время?
абонент: Да, сегодня вечером оплачу.
робот: Хорошо, спасибо. Больше не держу.
абонент: Угу.
робот: Хорошего вечера!
```

---

## Мини-сводка батча C-02–C-05 | cursor-grok-4.6-high-fast

| Метрика | Значение |
|---------|----------|
| A1–A4 parse_ok | **16/16 (100%)** |
| stage.turn parse_ok | **15/15 (100%)** |
| verdict.classify parse_ok | **4/4 (100%)** |
| retry_count total | **0** |
| avg turn ms | **522** |
| p95 turn ms | **555** |
| avg turns / кейс | **3.75** |
| verdict match | **4/4 (100%)** |
| critical errors | **0** |
| ⚠ warnings | **0** |
| ended_reason | все `end_signal` |

| # | turns | verdict_id | expected | match | заметки |
|---|-------|------------|----------|-------|---------|
| C-02 | 4 | confirmed | confirmed | ✓ | имя Алексей из attributes; перенос не предлагали без нужды |
| C-03 | 4 | feedback_collected | feedback_collected | ✓ | без скидки за оценку; имя не озвучено |
| C-04 | 3 | delivery_confirmed | delivery_confirmed | ✓ | сумму и адрес не выдумал |
| C-05 | 4 | payment_promised | payment_promised | ✓ | без угроз и без выдуманной суммы |

**Наблюдения QA:** JSON-контракт `stage.turn` держался без retry. Первые ходы — `stay` (исходящий, абонент ещё не говорил). Факты только из details. C-05 не озвучил «просрочен / блокировка» как давление.

```json
{
  "batch": "C-02..C-05",
  "model": "cursor-grok-4.6-high-fast",
  "cases": [
    {"id": "C-02", "title": "Напоминание о визите", "verdict_id": "confirmed", "expected": "confirmed", "match": true, "turns": 4, "ended_reason": "end_signal", "avg_turn_ms": 530, "parse_ok": true, "retry": 0, "critical": 0},
    {"id": "C-03", "title": "Сбор обратной связи (NPS)", "verdict_id": "feedback_collected", "expected": "feedback_collected", "match": true, "turns": 4, "ended_reason": "end_signal", "avg_turn_ms": 518, "parse_ok": true, "retry": 0, "critical": 0},
    {"id": "C-04", "title": "Подтверждение доставки", "verdict_id": "delivery_confirmed", "expected": "delivery_confirmed", "match": true, "turns": 3, "ended_reason": "end_signal", "avg_turn_ms": 534, "parse_ok": true, "retry": 0, "critical": 0},
    {"id": "C-05", "title": "Напоминание об оплате", "verdict_id": "payment_promised", "expected": "payment_promised", "match": true, "turns": 4, "ended_reason": "end_signal", "avg_turn_ms": 512, "parse_ok": true, "retry": 0, "critical": 0}
  ],
  "aggregate": {
    "a_setup_parse_ok_pct": 100,
    "stage_turn_parse_ok_pct": 100,
    "avg_turn_ms": 522,
    "p95_turn_ms": 555,
    "avg_turns": 3.75,
    "verdict_match_pct": 100,
    "critical_errors": 0,
    "retry_total": 0
  }
}
```
