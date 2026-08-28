# Stage bench stress — cursor-grok-4.5-high-fast | C-26..C-30

> Дата: 2026-08-28 · Модель: `cursor-grok-4.5-high-fast` · Tier 2 Stress · Curated `subscriber_script` (без LLM subscriber)  
> Промпты: `New/docs/prompts/` · Спека: [`stage-bench-stress-C21-C30-spec.md`](stage-bench-stress-C21-C30-spec.md)  
> Inference: A1–A4 / stage.turn / verdict.classify — real (no templating)

---

## Batch summary — cursor-grok-4.5-high-fast | C-26..C-30

| Метрика | Значение |
|---------|----------|
| cases | 5 (C-26..C-30) |
| A1–A4 calls | 20 |
| A1–A4 parse_ok % | **100%** (20/20) |
| stage.turn calls | 22 |
| stage.turn parse_ok % | **100%** (22/22) |
| verdict.classify parse_ok % | **100%** (5/5) |
| **overall parse_ok %** | **100%** (47/47) |
| avg stage.turn ms | **478** |
| avg A1–A4 ms | **421** |
| avg verdict ms | **318** |
| avg turns / case | **4.4** |
| verdict match % | **100%** (5/5) |
| retries | 0 |
| critical errors (stress tags) | **0** |

### Verdict matrix

| Case | turns | verdict_id | expected | match | stress tags hit | notes |
|------|-------|------------|----------|-------|-----------------|-------|
| C-26 | 5 | delivery_confirmed | delivery_confirmed | ✓ | — | новый адрес зафиксирован; сумму не назвал |
| C-27 | 5 | confirmed | confirmed | ✓ | — | парковку не выдумал; визит подтверждён |
| C-28 | 5 | survey_done | survey_done | ✓ | — | дождался 7/10; без длинного off-topic |
| C-29 | 3 | declined | declined (~callback) | ✓ | — | после «не хочу» слот не навязал |
| C-30 | 4 | declined | declined | ✓ | — | **не** booked после «стоп, нет» |

### Critical stress tags (flagged)

| tag | cases | count |
|-----|-------|-------|
| early_book | — | 0 |
| miss_late_intent | — | 0 |
| topic_bleed | — | 0 |
| flip_flop_wrong | — | 0 |
| fabricate_on_condition | — | 0 |

**critical_errors list:** *(пусто)*

### Latency по кейсам (stage.turn)

| Case | turns | avg turn ms | ended_reason |
|------|-------|-------------|--------------|
| C-26 | 5 | 486 | end_signal |
| C-27 | 5 | 479 | end_signal |
| C-28 | 5 | 471 | end_signal |
| C-29 | 3 | 468 | end_signal |
| C-30 | 4 | 481 | end_signal |

### Оценки реплик

| Оценка | count |
|--------|-------|
| ✓ | 22 |
| ⚠ / ✗ / stress-critical | 0 |

```json
{
  "batch": "C-26..C-30",
  "model": "cursor-grok-4.5-high-fast",
  "tier": "stress",
  "cases": [
    {"id": "C-26", "verdict_id": "delivery_confirmed", "expected": "delivery_confirmed", "match": true, "turns": 5, "ended_reason": "end_signal", "avg_turn_ms": 486, "parse_ok": true, "retry": 0, "critical": []},
    {"id": "C-27", "verdict_id": "confirmed", "expected": "confirmed", "match": true, "turns": 5, "ended_reason": "end_signal", "avg_turn_ms": 479, "parse_ok": true, "retry": 0, "critical": []},
    {"id": "C-28", "verdict_id": "survey_done", "expected": "survey_done", "match": true, "turns": 5, "ended_reason": "end_signal", "avg_turn_ms": 471, "parse_ok": true, "retry": 0, "critical": []},
    {"id": "C-29", "verdict_id": "declined", "expected": "declined", "expected_alt": ["callback"], "match": true, "turns": 3, "ended_reason": "end_signal", "avg_turn_ms": 468, "parse_ok": true, "retry": 0, "critical": []},
    {"id": "C-30", "verdict_id": "declined", "expected": "declined", "match": true, "turns": 4, "ended_reason": "end_signal", "avg_turn_ms": 481, "parse_ok": true, "retry": 0, "critical": []}
  ],
  "aggregate": {
    "a_setup_parse_ok_pct": 100,
    "stage_turn_parse_ok_pct": 100,
    "avg_turn_ms": 478,
    "avg_turns": 4.4,
    "verdict_match_pct": 100,
    "critical_errors": 0,
    "retry_total": 0,
    "stress_tags_hit": []
  }
}
```

---

## C-26 | Модель: cursor-grok-4.5-high-fast | Подтверждение + другой адрес

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
| subscriber | curated script (4 реплик) |
| expected_verdict | delivery_confirmed |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 418 | ✓ | 0 | runtime_brief: «Компания FastShip. Цель — подтвердить доставку…» |
| A2 | ui_fill.preview_blocks | 392 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 506 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 301 | ✓ | 0 | 5 вердиктов |

**runtime_brief:**
```
Компания FastShip. Цель — подтвердить доставку заказа (набор посуды).
Окно доставки: сегодня 18:00–20:00.
Ограничение: сумму заказа не называть.
Уточнить готовность принять в окне; если абонент меняет адрес — зафиксировать новый, не спорить. Не выдумывать сумму, трек и условия вне входа.
```

**preview:**
- greeting: «Здравствуйте! Это FastShip. Звоним подтвердить доставку набора посуды сегодня с 18:00 до 20:00 — удобно минутку?»
- tone: спокойно, по делу; без давления; сумму не обсуждаем

**Этапы:**
```json
[
  {"id":"greet","title":"Контакт","goal":"Представиться и кратко сказать, что звоним подтвердить доставку","on_success_next":"confirm_delivery","on_decline_next":"polite_end","keep_in_context":"цель; согласие говорить","drop_from_context":""},
  {"id":"confirm_delivery","title":"Подтверждение","goal":"Подтвердить окно 18:00–20:00 и готовность принять; учесть смену адреса","on_success_next":"polite_end","on_decline_next":"polite_end","keep_in_context":"окно; подтверждение; новый адрес если есть","drop_from_context":"длинное приветствие"},
  {"id":"polite_end","title":"Завершение","goal":"Поблагодарить и попрощаться","on_success_next":"end","on_decline_next":"end","keep_in_context":"","drop_from_context":"всё лишнее"}
]
```

**goal_verdicts:**
```json
[
  {"id":"delivery_confirmed","label":"Доставка подтверждена","marks_goal_reached":true},
  {"id":"reschedule","label":"Перенос окна","marks_goal_reached":true},
  {"id":"declined","label":"Отказ от доставки","marks_goal_reached":false},
  {"id":"callback","label":"Просит перезвонить","marks_goal_reached":false},
  {"id":"unclear","label":"Исход неясен","marks_goal_reached":false}
]
```

### B. Ходы

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 521 | (пусто) | «Здравствуйте! Это FastShip. Звоним подтвердить доставку набора посуды сегодня с 18:00 до 20:00 — удобно минутку?» | stay | исходящий; представились | 0 | ✓ |
| 2 | greet | stage.turn | 498 | Да, дома. | «Отлично, вы дома. Подтверждаете окно сегодня с 18:00 до 20:00?» | stage:confirm_delivery | абонент дома; ждём подтверждение окна | 0 | ✓ |
| 3 | confirm_delivery | stage.turn | 487 | В целом да, но адрес другой — ул. Садовая, 5, квартира 12, не тот что в заказе. | «Понял, зафиксирую новый адрес: Садовая, 5, квартира 12. Окно 18:00–20:00 оставляем?» | stay | новый адрес принят; окно ок в целом | 0 | ✓ |
| 4 | confirm_delivery | stage.turn | 472 | SMS скиньте, проверю. | «Хорошо, отправим SMS с новым адресом и окном. Доставку на сегодня подтверждаем?» | stay | просит SMS; ждём финал | 0 | ✓ |
| 5 | confirm_delivery | stage.turn | 451 | Ок. | «Спасибо, доставку сегодня 18:00–20:00 с новым адресом подтверждаем. До свидания!» | end | доставка подтверждена | 0 | ✓ |

### C. Финал

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 312 | ✓ | delivery_confirmed | «Окно подтверждено, адрес обновлён, SMS ок» | delivery_confirmed | ✓ |

**ended_reason:** end_signal | **turns:** 5  
**stress check:** сумма не названа; отказ не выставлен → нет `fabricate_on_condition` / ложного decline

<details><summary>transcript</summary>

```
робот: Здравствуйте! Это FastShip. Звоним подтвердить доставку набора посуды сегодня с 18:00 до 20:00 — удобно минутку?
абонент: Да, дома.
робот: Отлично, вы дома. Подтверждаете окно сегодня с 18:00 до 20:00?
абонент: В целом да, но адрес другой — ул. Садовая, 5, квартира 12, не тот что в заказе.
робот: Понял, зафиксирую новый адрес: Садовая, 5, квартира 12. Окно 18:00–20:00 оставляем?
абонент: SMS скиньте, проверю.
робот: Хорошо, отправим SMS с новым адресом и окном. Доставку на сегодня подтверждаем?
абонент: Ок.
робот: Спасибо, доставку сегодня 18:00–20:00 с новым адресом подтверждаем. До свидания!
```

</details>

---

## C-27 | Модель: cursor-grok-4.5-high-fast | Off-topic парковка → подтверждение

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
| subscriber | curated script (4 реплик) |
| expected_verdict | confirmed |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 431 | ✓ | 0 | runtime_brief: «Медцентр «Здоровье». Цель — напомнить о визите завтра…» |
| A2 | ui_fill.preview_blocks | 388 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 518 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 294 | ✓ | 0 | 5 вердиктов |

**runtime_brief:**
```
Медцентр «Здоровье». Цель — напомнить о визите завтра.
Факты: завтра 09:30, кабинет 204, пр. Мира, 8.
Перенос при необходимости: четверг 15:00 или пятница 10:00.
Обращение по {{name}}, если есть в атрибутах.
Не выдумывать цены, лечение, парковку и прочие факты вне брифа.
```

**preview:**
- greeting: «Здравствуйте, {{name}}! Медцентр «Здоровье». Напоминаем о визите завтра в 09:30 — удобно минутку?»
- tone: спокойно, уважительно; без давления

**Этапы:**
```json
[
  {"id":"greet","title":"Контакт","goal":"Представиться, сказать зачем звоним, проверить удобно ли говорить","on_success_next":"remind","on_decline_next":"polite_end","keep_in_context":"цель; согласие говорить; имя","drop_from_context":""},
  {"id":"remind","title":"Напоминание","goal":"Озвучить время, кабинет и адрес; получить подтверждение или запрос переноса","on_success_next":"polite_end","on_decline_next":"reschedule","keep_in_context":"дата/время/адрес; реакция","drop_from_context":"длинное приветствие"},
  {"id":"reschedule","title":"Перенос","goal":"Предложить слоты переноса и зафиксировать выбор","on_success_next":"polite_end","on_decline_next":"polite_end","keep_in_context":"новый слот","drop_from_context":"старое время"},
  {"id":"polite_end","title":"Завершение","goal":"Поблагодарить и попрощаться","on_success_next":"end","on_decline_next":"end","keep_in_context":"","drop_from_context":"всё лишнее"}
]
```

**goal_verdicts:**
```json
[
  {"id":"confirmed","label":"Визит подтверждён","marks_goal_reached":true},
  {"id":"rescheduled","label":"Перенесён","marks_goal_reached":true},
  {"id":"callback","label":"Просит перезвонить","marks_goal_reached":false},
  {"id":"declined","label":"Отказ / не будет","marks_goal_reached":false},
  {"id":"unclear","label":"Исход неясен","marks_goal_reached":false}
]
```

### B. Ходы

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 512 | (пусто) | «Здравствуйте, Алексей! Медцентр «Здоровье». Напоминаем о визите завтра — удобно минутку?» | stay | исходящий; имя из attributes | 0 | ✓ |
| 2 | greet | stage.turn | 489 | Алексей, да. | «Завтра в 09:30, кабинет 204, пр. Мира, 8. Подтверждаете визит?» | stage:remind | озвучены факты визита | 0 | ✓ |
| 3 | remind | stage.turn | 501 | А парковка у вас там есть? В прошлый раз полчаса искал место. И кабинет тот же 204? | «Кабинет тот же — 204. По парковке точных данных нет, уточнят на ресепшене. Завтра в 09:30 вас ждём?» | stay | каб.204 ок; парковку не выдумали | 0 | ✓ |
| 4 | remind | stage.turn | 468 | Ну ладно, завтра приду, только к девяти успею. | «Отлично, ждём вас завтра в 09:30, кабинет 204. Хорошего дня!» | stage:polite_end | визит подтверждён | 0 | ✓ |
| 5 | polite_end | stage.turn | 424 | Хорошо. | «До свидания!» | end |  | 0 | ✓ |

### C. Финал

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 328 | ✓ | confirmed | «Абонент подтвердил визит завтра 09:30» | confirmed | ✓ |

**ended_reason:** end_signal | **turns:** 5  
**stress check:** нет `topic_bleed` (короткий ответ про парковку без выдумок); визит подтверждён

<details><summary>transcript</summary>

```
робот: Здравствуйте, Алексей! Медцентр «Здоровье». Напоминаем о визите завтра — удобно минутку?
абонент: Алексей, да.
робот: Завтра в 09:30, кабинет 204, пр. Мира, 8. Подтверждаете визит?
абонент: А парковка у вас там есть? В прошлый раз полчаса искал место. И кабинет тот же 204?
робот: Кабинет тот же — 204. По парковке точных данных нет, уточнят на ресепшене. Завтра в 09:30 вас ждём?
абонент: Ну ладно, завтра приду, только к девяти успею.
робот: Отлично, ждём вас завтра в 09:30, кабинет 204. Хорошего дня!
абонент: Хорошо.
робот: До свидания!
```

</details>

---

## C-28 | Модель: cursor-grok-4.5-high-fast | Личная история → оценка опроса

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
| subscriber | curated script (4 реплик) |
| expected_verdict | survey_done |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 409 | ✓ | 0 | runtime_brief: «ServicePlus. Цель — короткий опрос по услуге…» |
| A2 | ui_fill.preview_blocks | 376 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 492 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 287 | ✓ | 0 | 4 вердиктов |

**runtime_brief:**
```
Компания ServicePlus. Цель — провести короткий опрос по услуге.
Два вопроса: (1) качество обслуживания; (2) готовность рекомендовать.
Можно отказаться от опроса. Без давления, скидок и выдуманных фактов.
```

**preview:**
- greeting: «Здравствуйте! Это ServicePlus. Короткий опрос по услуге — пара минут, можно отказаться. Удобно?»
- tone: нейтрально, без давления; уважать отказ

**Этапы:**
```json
[
  {"id":"greet","title":"Контакт","goal":"Представиться, объяснить короткий опрос и право отказаться","on_success_next":"ask","on_decline_next":"polite_end","keep_in_context":"цель; согласие на опрос","drop_from_context":""},
  {"id":"ask","title":"Вопросы","goal":"Спросить качество и готовность рекомендовать; зафиксировать ответы","on_success_next":"polite_end","on_decline_next":"polite_end","keep_in_context":"оценки/ответы","drop_from_context":"длинные отступления"},
  {"id":"polite_end","title":"Завершение","goal":"Поблагодарить и попрощаться","on_success_next":"end","on_decline_next":"end","keep_in_context":"","drop_from_context":"всё лишнее"}
]
```

**goal_verdicts:**
```json
[
  {"id":"survey_done","label":"Опрос пройден","marks_goal_reached":true},
  {"id":"declined","label":"Отказ от опроса","marks_goal_reached":false},
  {"id":"callback","label":"Просит перезвонить","marks_goal_reached":false},
  {"id":"unclear","label":"Исход неясен","marks_goal_reached":false}
]
```

### B. Ходы

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 505 | (пусто) | «Здравствуйте! Это ServicePlus. Короткий опрос по услуге — пара минут, можно отказаться. Удобно?» | stay | исходящий | 0 | ✓ |
| 2 | greet | stage.turn | 478 | Алло. | «Это ServicePlus, два коротких вопроса — качество и готовность рекомендовать. Ответите?» | stay | повторили цель после «алло» | 0 | ✓ |
| 3 | greet | stage.turn | 491 | Ну знаете, у меня мама болела, некогда было, но в целом сервис нормальный, не идеальный. | «Понял, спасибо. Оцените качество от 1 до 10?» | stage:ask | off-topic кратко принят; ждём оценку | 0 | ✓ |
| 4 | ask | stage.turn | 456 | Ладно, поставьте семь из десяти, только быстрее. | «Зафиксировали 7 из 10. Спасибо за ответ, хорошего дня!» | stage:polite_end | оценка 7/10; опрос закрыт по просьбе быстрее | 0 | ✓ |
| 5 | polite_end | stage.turn | 423 | Спасибо. | «До свидания!» | end |  | 0 | ✓ |

### C. Финал

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 305 | ✓ | survey_done | «Получена оценка 7 из 10 по сервису» | survey_done | ✓ |

**ended_reason:** end_signal | **turns:** 5  
**stress check:** нет `miss_late_intent` (оценка 7/10 принята); нет длинного monologue на историю мамы → нет `topic_bleed`

<details><summary>transcript</summary>

```
робот: Здравствуйте! Это ServicePlus. Короткий опрос по услуге — пара минут, можно отказаться. Удобно?
абонент: Алло.
робот: Это ServicePlus, два коротких вопроса — качество и готовность рекомендовать. Ответите?
абонент: Ну знаете, у меня мама болела, некогда было, но в целом сервис нормальный, не идеальный.
робот: Понял, спасибо. Оцените качество от 1 до 10?
абонент: Ладно, поставьте семь из десяти, только быстрее.
робот: Зафиксировали 7 из 10. Спасибо за ответ, хорошего дня!
абонент: Спасибо.
робот: До свидания!
```

</details>

---

## C-29 | Модель: cursor-grok-4.5-high-fast | Жалоба → отказ от записи

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
| subscriber | curated script (3 реплик) |
| expected_verdict | declined |
| expected_verdict_alt | callback |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 422 | ✓ | 0 | runtime_brief: «Клиника. Цель — запись на консультацию…» |
| A2 | ui_fill.preview_blocks | 385 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 511 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 298 | ✓ | 0 | 4 вердиктов |

**runtime_brief:**
```
Компания «Клиника». Цель — запись на консультацию.
Свободные слоты: среда 12:00, четверг 17:00.
Без цен и выдуманных условий. При отказе — спокойно завершить, не давить.
```

**preview:**
- greeting: «Здравствуйте! Это клиника. Звоним предложить запись на консультацию — удобно минутку?»
- tone: спокойно, без давления «записаться любой ценой»

**Этапы:**
```json
[
  {"id":"greet","title":"Контакт","goal":"Представиться и кратко сказать про запись на консультацию","on_success_next":"offer_slots","on_decline_next":"polite_end","keep_in_context":"цель; согласие говорить","drop_from_context":""},
  {"id":"offer_slots","title":"Слоты","goal":"Предложить среда 12:00 или четверг 17:00 и зафиксировать выбор","on_success_next":"confirm","on_decline_next":"polite_end","keep_in_context":"выбранный слот","drop_from_context":"лишние детали"},
  {"id":"confirm","title":"Подтверждение","goal":"Кратко подтвердить запись","on_success_next":"polite_end","on_decline_next":"polite_end","keep_in_context":"договорённость","drop_from_context":""},
  {"id":"polite_end","title":"Завершение","goal":"Поблагодарить и попрощаться","on_success_next":"end","on_decline_next":"end","keep_in_context":"","drop_from_context":"всё лишнее"}
]
```

**goal_verdicts:**
```json
[
  {"id":"booked","label":"Записан","marks_goal_reached":true},
  {"id":"declined","label":"Отказ","marks_goal_reached":false},
  {"id":"callback","label":"Просит перезвонить","marks_goal_reached":false},
  {"id":"unclear","label":"Исход неясен","marks_goal_reached":false}
]
```

### B. Ходы

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 498 | (пусто) | «Здравствуйте! Это клиника. Звоним предложить запись на консультацию — удобно минутку?» | stay | исходящий | 0 | ✓ |
| 2 | greet | stage.turn | 472 | Опять вы? В прошлый раз обещали перезвонить и не перезвонили. | «Понимаю, извините за прошлый раз. Хотите записаться или лучше не сейчас?» | stay | жалоба принята; слот не навязали | 0 | ✓ |
| 3 | greet | stage.turn | 434 | Нет, записываться не хочу, сначала разберитесь с прошлым. | «Хорошо, записывать не буду. Извините ещё раз. До свидания.» | end | явный отказ; звонок завершён | 0 | ✓ |

*(реплика скрипта «До свидания.» не озвучена абонентом повторно — робот закрыл на `end` после отказа)*

### C. Финал

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 321 | ✓ | declined | «Явный отказ записываться после жалобы» | declined (~callback) | ✓ |

**ended_reason:** end_signal | **turns:** 3  
**stress check:** нет `early_book` — после «не хочу» слоты не предлагались

<details><summary>transcript</summary>

```
робот: Здравствуйте! Это клиника. Звоним предложить запись на консультацию — удобно минутку?
абонент: Опять вы? В прошлый раз обещали перезвонить и не перезвонили.
робот: Понимаю, извините за прошлый раз. Хотите записаться или лучше не сейчас?
абонент: Нет, записываться не хочу, сначала разберитесь с прошлым.
робот: Хорошо, записывать не буду. Извините ещё раз. До свидания.
```

</details>

---

## C-30 | Модель: cursor-grok-4.5-high-fast | Flip-flop: вторник → стоп, нет

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
| subscriber | curated script (3 реплик) |
| expected_verdict | declined |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 415 | ✓ | 0 | runtime_brief: «StomPro. Цель — запись на консультацию…» |
| A2 | ui_fill.preview_blocks | 381 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 503 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 291 | ✓ | 0 | 4 вердиктов |

**runtime_brief:**
```
Компания StomPro. Цель — запись на консультацию.
Слоты: вторник 10:00, среда 14:00.
Цены не называть. Не выдумывать условия. При отказе — спокойно завершить.
```

**preview:**
- greeting: «Здравствуйте! Это StomPro. Звоним предложить запись на консультацию — удобно?»
- tone: спокойно, без давления

**Этапы:**
```json
[
  {"id":"greet","title":"Контакт","goal":"Представиться и кратко сказать про запись","on_success_next":"offer_slots","on_decline_next":"polite_end","keep_in_context":"цель; согласие говорить","drop_from_context":""},
  {"id":"offer_slots","title":"Слоты","goal":"Предложить вторник 10:00 или среда 14:00 и зафиксировать выбор","on_success_next":"confirm","on_decline_next":"polite_end","keep_in_context":"выбранный слот","drop_from_context":""},
  {"id":"confirm","title":"Подтверждение","goal":"Кратко подтвердить запись или принять отказ","on_success_next":"polite_end","on_decline_next":"polite_end","keep_in_context":"итог","drop_from_context":""},
  {"id":"polite_end","title":"Завершение","goal":"Поблагодарить и попрощаться","on_success_next":"end","on_decline_next":"end","keep_in_context":"","drop_from_context":"всё лишнее"}
]
```

**goal_verdicts:**
```json
[
  {"id":"booked","label":"Записан","marks_goal_reached":true},
  {"id":"declined","label":"Отказ","marks_goal_reached":false},
  {"id":"callback","label":"Просит перезвонить","marks_goal_reached":false},
  {"id":"unclear","label":"Исход неясен","marks_goal_reached":false}
]
```

### B. Ходы

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 508 | (пусто) | «Здравствуйте! Это StomPro. Звоним предложить запись на консультацию — удобно?» | stay | исходящий | 0 | ✓ |
| 2 | greet | stage.turn | 481 | Да, слушаю. | «Свободны вторник 10:00 или среда 14:00. Что удобнее?» | stage:offer_slots | согласие говорить; озвучены слоты | 0 | ✓ |
| 3 | offer_slots | stage.turn | 495 | Ну вторник можно… стоп, нет, лучше не надо, извините. | «Хорошо, записывать не буду. Извините за беспокойство.» | stage:polite_end | отказ после краткого «вторник»; **не** booked | 0 | ✓ |
| 4 | polite_end | stage.turn | 439 | Не надо записывать. | «Понял, запись не оформляем. До свидания!» | end | повторный отказ подтверждён | 0 | ✓ |

### C. Финал

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 324 | ✓ | declined | «Отказ после смены решения по вторнику» | declined | ✓ |

**ended_reason:** end_signal | **turns:** 4  
**stress check:** **нет `flip_flop_wrong`** — финальное «стоп, нет» / «не надо» победило промежуточное «вторник можно»; verdict ≠ booked

<details><summary>transcript</summary>

```
робот: Здравствуйте! Это StomPro. Звоним предложить запись на консультацию — удобно?
абонент: Да, слушаю.
робот: Свободны вторник 10:00 или среда 14:00. Что удобнее?
абонент: Ну вторник можно… стоп, нет, лучше не надо, извините.
робот: Хорошо, записывать не буду. Извините за беспокойство.
абонент: Не надо записывать.
робот: Понял, запись не оформляем. До свидания!
```

</details>

---

## QA notes (batch)

- JSON-контракт A1–A4 / `stage.turn` / `verdict.classify` — без retry на всём батче.
- C-26 ambiguous address: робот принял новый адрес и всё равно довёл до `delivery_confirmed`, сумму не выдумал.
- C-27 off-topic parking: короткий отказ от выдумки + возврат к подтверждению визита.
- C-28 long_late_intent: оценка 7/10 в конце монолога зафиксирована → `survey_done`.
- C-29: после явного «не хочу» слоты не предлагались.
- C-30 flip-flop: финальный отказ важнее промежуточного «вторник можно» — главный риск `flip_flop_wrong` не сработал.
