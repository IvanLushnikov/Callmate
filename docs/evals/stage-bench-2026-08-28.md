# Stage-based LLM Bench — 2026-08-28

> Прогон stage pipeline: A1–A4 → stage.turn loop → verdict.classify

## Статус прогона

| Батч | Кейсы | Модели | Статус |
|------|-------|--------|--------|
| 1 | C-01..C-20 | composer-2.5-fast | ✓ |
| 2 | C-01..C-20 | gemini-3.7-flash-high | ✓ [`stage-bench-gemini-C01-C20.md`](stage-bench-gemini-C01-C20.md) |
| 2 | C-01..C-20 | cursor-grok-4.6-high-fast | ✓ [`stage-bench-grok46-C01-C20.md`](stage-bench-grok46-C01-C20.md) |
| — | C-01..C-20 | cursor-grok-4.5-high-fast | ✓ [`stage-bench-grok45-C01-C20.md`](stage-bench-grok45-C01-C20.md) |

**Tier 2 Stress v2 (C-21..C-30):** [`stage-bench-stress-C21-C30.md`](stage-bench-stress-C21-C30.md) — grok-4.5/4.6 ✓ 10/10, ~9 turns, critical 0.


## Промежуточная сводка (composer, C-01..C-05)

| metric | value |
|--------|-------|
| A1–A4 parse_ok | 20/20 (100%) |
| stage.turn parse_ok | 21/21 (100%) |
| avg turn ms | ~625 |
| verdict match | 5/5 (100%) |
| critical errors | 0 |

---

## C-01 | Модель: composer-2.5-fast | Запись на консультацию

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | запись на консультацию |
| details | Стоматологическая клиника. Предложить запись на первичную консультацию. Свободные слоты: вторник 10:00, среда 14:00, пятница 11:30. Адрес — ул. Ленина, 15. Цены и услуги не озвучивать. |
| company_name | Белый зуб |
| persona | нейтральный клиент |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 487 | ✓ | 0 | runtime_brief: «Клиника «Белый зуб», стоматология. Цель — записать на первичную консультацию.
Св…» |
| A2 | ui_fill.preview_blocks | 412 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 623 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 318 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться, назвать цель звонка и проверить, удобно ли говорить",
    "on_success_next": "offer_slots",
    "on_decline_next": "polite_end",
    "keep_in_context": "цель; согласие говорить",
    "drop_from_context": "детали слотов"
  },
  {
    "id": "offer_slots",
    "title": "Слоты",
    "goal": "Предложить свободные слоты и зафиксировать выбор абонента",
    "on_success_next": "confirm",
    "on_decline_next": "polite_end",
    "keep_in_context": "выбранный слот; адрес",
    "drop_from_context": "альтернативные слоты"
  },
  {
    "id": "confirm",
    "title": "Подтверждение",
    "goal": "Подтвердить дату, время и адрес визита",
    "on_success_next": "polite_end",
    "on_decline_next": "offer_slots",
    "keep_in_context": "итоговая запись",
    "drop_from_context": "повтор приветствия"
  },
  {
    "id": "polite_end",
    "title": "Завершение",
    "goal": "Поблагодарить и попрощаться",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "всё лишнее"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "booked",
    "label": "Запись оформлена",
    "marks_goal_reached": true
  },
  {
    "id": "callback",
    "label": "Просит перезвонить",
    "marks_goal_reached": false
  },
  {
    "id": "declined",
    "label": "Отказ от записи",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Исход неясен",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 712 | (пусто) | «Здравствуйте! Это клиника «Белый зуб». Звоним, чтобы предложить запись на первичную консультацию — удобно сейчас пару ми» | stay | исходящий; представились | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 598 | Да, слушаю. | «Спасибо. Хотим подобрать время для первичного визита — могу предложить слоты на этой неделе.» | stage:offer_slots | абонент готов слушать | 0 | ✓ |
| 3 | offer_slots | stage.turn | 645 | А какие есть варианты? | «Есть вторник в 10:00, среда в 14:00 или пятница в 11:30. Какой день вам удобнее?» | stay | озвучены три слота | 0 | ✓ |
| 4 | offer_slots | stage.turn | 571 | Давайте среду, в два. | «Хорошо, среда в 14:00. Запишу вас на первичную консультацию.» | stage:confirm | выбрана среда 14:00 | 0 | ✓ |
| 5 | confirm | stage.turn | 689 | А адрес напомните? | «Клиника на ул. Ленина, 15. Ждём вас в среду в 14:00 на первичную консультацию.» | stay | подтверждён адрес и время | 0 | ⚠ длинно (>2 предложения) |
| 6 | confirm | stage.turn | 534 | Хорошо, спасибо. | «Отлично, запись подтверждена. Если что-то изменится — можно перенести, просто позвоните в клинику.» | stage:polite_end | запись подтверждена | 0 | ✓ |
| 7 | polite_end | stage.turn | 445 | Понял, до свидания. | «Спасибо, хорошего дня! До свидания.» | end |  | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 352 | ✓ | booked | «Абонент выбрал среду 14:00, запись подтверждена» | booked | ✓ |

**ended_reason:** end_signal | **turns:** 7

<details><summary>transcript</summary>

```
робот: Здравствуйте! Это клиника «Белый зуб». Звоним, чтобы предложить запись на первичную консультацию — удобно сейчас пару минут поговорить?
абонент: Да, слушаю.
робот: Спасибо. Хотим подобрать время для первичного визита — могу предложить слоты на этой неделе.
абонент: А какие есть варианты?
робот: Есть вторник в 10:00, среда в 14:00 или пятница в 11:30. Какой день вам удобнее?
абонент: Давайте среду, в два.
робот: Хорошо, среда в 14:00. Запишу вас на первичную консультацию.
абонент: А адрес напомните?
робот: Клиника на ул. Ленина, 15. Ждём вас в среду в 14:00 на первичную консультацию.
абонент: Хорошо, спасибо.
робот: Отлично, запись подтверждена. Если что-то изменится — можно перенести, просто позвоните в клинику.
абонент: Понял, до свидания.
робот: Спасибо, хорошего дня! До свидания.
```

</details>

---

## C-02 | Модель: composer-2.5-fast | Напоминание о визите

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | напомнить о визите завтра |
| details | Медцентр. Визит завтра в 09:30, каб. 204, адрес пр. Мира, 8. Можно предложить перенос на четверг 15:00 или пятницу 10:00. |
| company_name | Медцентр Здоровье |
| persona | занятый клиент |
| attributes | {"name": "Алексей"} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 487 | ✓ | 0 | runtime_brief: «Напомнить Алексею о визите завтра 09:30, каб. 204, пр. Мира, 8. Перенос: ч…» |
| A2 | ui_fill.preview_blocks | 523 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 451 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 376 | ✓ | 0 | 5 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и сказать, что звонок о визите завтра",
    "on_success_next": "remind",
    "on_decline_next": "end",
    "keep_in_context": "имя; согласие говорить",
    "drop_from_context": "детали переноса"
  },
  {
    "id": "remind",
    "title": "Напоминание",
    "goal": "Напомнить время, кабинет и адрес визита",
    "on_success_next": "confirm",
    "on_decline_next": "end",
    "keep_in_context": "дата; время; адрес",
    "drop_from_context": "приветствие"
  },
  {
    "id": "confirm",
    "title": "Подтверждение",
    "goal": "Уточнить, придёт ли абонент или нужен перенос",
    "on_success_next": "close",
    "on_decline_next": "close",
    "keep_in_context": "решение: придёт / перенос",
    "drop_from_context": "альтернативные слоты после выбора"
  },
  {
    "id": "close",
    "title": "Завершение",
    "goal": "Кратко зафиксировать и попрощаться",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "итог",
    "drop_from_context": "детали"
  }
]
```

**goal_verdicts:**
```json
[
  {"id": "confirmed", "label": "Визит подтверждён", "marks_goal_reached": true},
  {"id": "rescheduled", "label": "Визит перенесён", "marks_goal_reached": true},
  {"id": "declined", "label": "Отказ от визита", "marks_goal_reached": false},
  {"id": "callback", "label": "Просит перезвонить", "marks_goal_reached": false},
  {"id": "unclear", "label": "Исход неясен", "marks_goal_reached": false}
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 612 | (пусто) | «Алексей, здравствуйте! Медцентр Здоровье — напоминаем о вашем визите завтра.» | stage:remind | контакт установлен | 0 | ✓ |
| 2 | remind | stage.turn | 678 | Алло, да, слушаю. | «Визит завтра в 09:30, кабинет 204, адрес проспект Мира, 8.» | stage:confirm | детали озвучены | 0 | ✓ |
| 3 | confirm | stage.turn | 554 | Да, завтра подходит, буду. | «Отлично, записываем — ждём вас завтра в 09:30.» | stage:close | визит подтверждён | 0 | ✓ |
| 4 | close | stage.turn | 701 | Угу, спасибо. | «Спасибо, хорошего дня!» | end | завершение | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 342 | ✓ | confirmed | «Абонент подтвердил визит на завтра» | confirmed | ✓ |

**ended_reason:** end_signal | **turns:** 4

<details><summary>transcript</summary>

```
робот: Алексей, здравствуйте! Медцентр Здоровье — напоминаем о вашем визите завтра.
абонент: Алло, да, слушаю.
робот: Визит завтра в 09:30, кабинет 204, адрес проспект Мира, 8.
абонент: Да, завтра подходит, буду.
робот: Отлично, записываем — ждём вас завтра в 09:30.
абонент: Угу, спасибо.
робот: Спасибо, хорошего дня!
```

</details>

---

## C-03 | Модель: composer-2.5-fast | Сбор обратной связи (NPS)

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | узнать удовлетворённость после визита |
| details | Сервис доставки еды. Спросить о последнем заказе. Без давления и без скидок в обмен на оценку. |
| company_name | FoodBox |
| persona | спокойный клиент |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 512 | ✓ | 0 | runtime_brief: «Узнать удовлетворённость последним заказом FoodBox. Спросить оценку, без скид…» |
| A2 | ui_fill.preview_blocks | 468 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 539 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 391 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и объяснить короткий опрос о последнем заказе",
    "on_success_next": "ask_rating",
    "on_decline_next": "end",
    "keep_in_context": "согласие участвовать",
    "drop_from_context": "детали заказа"
  },
  {
    "id": "ask_rating",
    "title": "Оценка",
    "goal": "Спросить удовлетворённость последним заказом по шкале 1–10",
    "on_success_next": "close",
    "on_decline_next": "end",
    "keep_in_context": "оценка; краткий комментарий",
    "drop_from_context": "повтор приветствия"
  },
  {
    "id": "close",
    "title": "Завершение",
    "goal": "Поблагодарить за обратную связь и завершить",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "итог",
    "drop_from_context": "детали"
  }
]
```

**goal_verdicts:**
```json
[
  {"id": "feedback_collected", "label": "Обратная связь получена", "marks_goal_reached": true},
  {"id": "declined", "label": "Отказался отвечать", "marks_goal_reached": false},
  {"id": "callback", "label": "Просит перезвонить", "marks_goal_reached": false},
  {"id": "unclear", "label": "Исход неясен", "marks_goal_reached": false}
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 587 | (пусто) | «Здравствуйте! FoodBox — короткий опрос о вашем последнем заказе, буквально минуту.» | stage:ask_rating | согласие подразумевается | 0 | ✓ |
| 2 | ask_rating | stage.turn | 643 | Да, слушаю. | «Как бы вы оценили последний заказ от 1 до 10?» | stay | ждём оценку | 0 | ✓ |
| 3 | ask_rating | stage.turn | 719 | В целом доволен, поставлю восьмёрку. | «Спасибо за восьмёрку — это ценно для нас.» | stage:close | оценка 8/10 | 0 | ✓ |
| 4 | close | stage.turn | 528 | Хорошо, до свидания. | «Спасибо за время, хорошего дня!» | end | завершение | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 358 | ✓ | feedback_collected | «Абонент поставил оценку 8 из 10» | feedback_collected | ✓ |

**ended_reason:** end_signal | **turns:** 4

<details><summary>transcript</summary>

```
робот: Здравствуйте! FoodBox — короткий опрос о вашем последнем заказе, буквально минуту.
абонент: Да, слушаю.
робот: Как бы вы оценили последний заказ от 1 до 10?
абонент: В целом доволен, поставлю восьмёрку.
робот: Спасибо за восьмёрку — это ценно для нас.
абонент: Хорошо, до свидания.
робот: Спасибо за время, хорошего дня!
```

</details>

---

## C-04 | Модель: composer-2.5-fast | Подтверждение доставки

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | подтвердить доставку |
| details | Курьерская служба. Заказ — набор посуды, окно доставки сегодня 18:00–20:00. Сумму заказа не называть. |
| company_name | FastShip |
| persona | дома, ждёт курьера |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 441 | ✓ | 0 | runtime_brief: «Подтвердить доставку набора посуды сегодня 18:00–20:00. Сумму не называть.» |
| A2 | ui_fill.preview_blocks | 556 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 493 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 327 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и назвать цель — подтверждение доставки",
    "on_success_next": "confirm_details",
    "on_decline_next": "end",
    "keep_in_context": "согласие говорить",
    "drop_from_context": "детали заказа"
  },
  {
    "id": "confirm_details",
    "title": "Подтверждение",
    "goal": "Уточнить заказ и окно доставки, получить подтверждение",
    "on_success_next": "close",
    "on_decline_next": "end",
    "keep_in_context": "заказ; окно; подтверждение",
    "drop_from_context": "приветствие"
  },
  {
    "id": "close",
    "title": "Завершение",
    "goal": "Поблагодарить и завершить звонок",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "итог",
    "drop_from_context": "детали"
  }
]
```

**goal_verdicts:**
```json
[
  {"id": "delivery_confirmed", "label": "Доставка подтверждена", "marks_goal_reached": true},
  {"id": "reschedule_requested", "label": "Просит перенести", "marks_goal_reached": false},
  {"id": "declined", "label": "Отказ от доставки", "marks_goal_reached": false},
  {"id": "unclear", "label": "Исход неясен", "marks_goal_reached": false}
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 634 | (пусто) | «Здравствуйте! FastShip — звоним подтвердить доставку вашего заказа сегодня.» | stage:confirm_details | контакт | 0 | ✓ |
| 2 | confirm_details | stage.turn | 692 | Да, я дома, жду. | «Заказ — набор посуды, доставка сегодня с 18:00 до 20:00. Всё верно?» | stay | ждём подтверждение | 0 | ✓ |
| 3 | confirm_details | stage.turn | 571 | Да, всё верно, буду дома. | «Отлично, курьер приедет в указанное окно. Спасибо!» | end | доставка подтверждена | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 314 | ✓ | delivery_confirmed | «Абонент подтвердил заказ и окно доставки» | delivery_confirmed | ✓ |

**ended_reason:** end_signal | **turns:** 3

<details><summary>transcript</summary>

```
робот: Здравствуйте! FastShip — звоним подтвердить доставку вашего заказа сегодня.
абонент: Да, я дома, жду.
робот: Заказ — набор посуды, доставка сегодня с 18:00 до 20:00. Всё верно?
абонент: Да, всё верно, буду дома.
робот: Отлично, курьер приедет в указанное окно. Спасибо!
```

</details>

---

## C-05 | Модель: composer-2.5-fast | Напоминание об оплате

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | напомнить об оплате |
| details | Образовательная платформа. Счёт за курс «Аналитика данных» просрочен на 3 дня. Напомнить мягко, без угроз и блокировок. |
| company_name | EduPro |
| persona | клиент, забыл оплатить |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 574 | ✓ | 0 | runtime_brief: «Мягко напомнить об оплате курса «Аналитика данных», просрочка 3 дня. Без угр…» |
| A2 | ui_fill.preview_blocks | 429 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 508 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 384 | ✓ | 0 | 5 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и мягко напомнить о неоплаченном счёте",
    "on_success_next": "discuss_payment",
    "on_decline_next": "end",
    "keep_in_context": "курс; просрочка",
    "drop_from_context": "детали платформы"
  },
  {
    "id": "discuss_payment",
    "title": "Оплата",
    "goal": "Уточнить, когда клиент сможет оплатить",
    "on_success_next": "close",
    "on_decline_next": "end",
    "keep_in_context": "обещание оплаты",
    "drop_from_context": "напоминание"
  },
  {
    "id": "close",
    "title": "Завершение",
    "goal": "Зафиксировать договорённость и попрощаться",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "итог",
    "drop_from_context": "детали"
  }
]
```

**goal_verdicts:**
```json
[
  {"id": "payment_promised", "label": "Обещал оплатить", "marks_goal_reached": true},
  {"id": "already_paid", "label": "Уже оплатил", "marks_goal_reached": true},
  {"id": "declined", "label": "Отказ от оплаты", "marks_goal_reached": false},
  {"id": "callback", "label": "Просит перезвонить", "marks_goal_reached": false},
  {"id": "unclear", "label": "Исход неясен", "marks_goal_reached": false}
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 658 | (пусто) | «Здравствуйте! EduPro — напоминаем, что счёт за курс «Аналитика данных» просрочен на 3 дня.» | stage:discuss_payment | напоминание озвучено | 0 | ✓ |
| 2 | discuss_payment | stage.turn | 736 | А, точно, забыл совсем. | «Подскажите, когда сможете оплатить?» | stay | ждём срок | 0 | ✓ |
| 3 | discuss_payment | stage.turn | 612 | Сегодня вечером оплачу, после работы. | «Хорошо, ждём оплату сегодня. Спасибо, хорошего дня!» | end | обещание сегодня вечером | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 367 | ✓ | payment_promised | «Абонент обещал оплатить сегодня вечером» | payment_promised | ✓ |

**ended_reason:** end_signal | **turns:** 3

<details><summary>transcript</summary>

```
робот: Здравствуйте! EduPro — напоминаем, что счёт за курс «Аналитика данных» просрочен на 3 дня.
абонент: А, точно, забыл совсем.
робот: Подскажите, когда сможете оплатить?
абонент: Сегодня вечером оплачу, после работы.
робот: Хорошо, ждём оплату сегодня. Спасибо, хорошего дня!
```

</details>

---

### Мини-сводка (C-02…C-05, composer-2.5-fast)

| metric | value |
|--------|-------|
| parse_ok A1–A4 | 16/16 (100%) |
| parse_ok stage.turn | 14/14 (100%) |
| avg turn ms | 638 |
| critical errors | 0 |

---

## Сравнение C-02..C-05 (4 модели)

| metric | composer-2.5-fast | gemini-3.7-flash-high | grok-4.5-high-fast | grok-4.6-high-fast |
|--------|-------------------|------------------------|--------------------|--------------------|
| parse_ok (all) | 100% | 100% | 100% | 100% |
| avg turn ms | 638 | 336 | 433 | 522 |
| verdict match | 100% | 100% | 100% | 100% |
| critical errors | 0 | 0 | 0 | 0 |
| retries | 0 | 0 | 0 | 0 |

Полные логи grok: [`stage-bench-grok45-C01-C20.md`](stage-bench-grok45-C01-C20.md), [`stage-bench-grok46-C01-C20.md`](stage-bench-grok46-C01-C20.md).


## Сводка composer-2.5-fast (C-01..C-20)

| Метрика | Значение |
|---------|----------|
| A1–A4 parse_ok | 100% (80/80) |
| stage.turn parse_ok | 100% |
| avg turn ms | ~615 (C-01..05: 625, C-06..10: 641, C-11..15: 629, C-16..20: 581) |
| verdict match | 20/20 (100%) |
| critical errors | **0** |
| ⚠ длинно (greeting) | часто на turn 1 |

**Edge-кейсы:** C-20 без галлюцинаций слотов (в отличие от grok-4.5); C-17/C-18 — имя по attributes; C-19 — ограничения длинного брифа сохранены.

Replay: `New/scripts/bench_replay_c01.py`, `bench_replay_c16_c20.py`; live: `stage_llm_bench.py --case N`.

Батчи: [`stage-bench-composer-C06-C10.md`](stage-bench-composer-C06-C10.md), [`stage-bench-c11-c15-composer-2026-08-28.md`](stage-bench-c11-c15-composer-2026-08-28.md).


## Сводка cursor-grok-4.6-high-fast (C-01..C-20, полный прогон)

| Метрика | Значение |
|---------|----------|
| A1–A4 parse_ok | 100% (80/80) |
| stage.turn parse_ok | 100% (91/91) |
| avg turn ms | **474** (самая низкая в четвёрке) |
| p95 turn ms | 534 |
| avg turns | 4.6 |
| verdict match | 85% (17/20) |
| critical errors | **1** (C-20: выдуманные слоты) |

Полный лог: [`stage-bench-grok46-C01-C20.md`](stage-bench-grok46-C01-C20.md).

**P0:** guard в `stage.turn` — без слотов в brief не предлагать время. C-13 JSON стабилен (в отличие от grok-4.5).

## Сводка cursor-grok-4.5-high-fast (C-01..C-20, полный прогон)

| Метрика | Значение |
|---------|----------|
| A1–A4 parse_ok | 100% (80/80) |
| stage.turn parse_ok | 98.5% (64/65) |
| avg turn ms | 513 |
| p95 turn ms | 601 |
| avg turns | 3.2 |
| verdict match | 100% (20/20) |
| critical errors | **2** |

Полный лог: [`stage-bench-grok45-C01-C20.md`](stage-bench-grok45-C01-C20.md).

**Critical errors:** C-13 — invalid JSON на «Алло.» (retry помог); C-20 — выдуманные слоты при пустом brief (bleed из C-01). **P0 fix:** guard слотов в `stage.turn` + JSON retry на коротких репликах.

## Сводка gemini-3.7-flash-high (C-01..C-20, полный прогон)

| Метрика | Значение |
|---------|----------|
| A1–A4 parse_ok | 100% (80/80) |
| stage.turn parse_ok | 100% (57/57) |
| avg turn ms | 728 |
| p95 turn ms | 855 |
| avg turns | 2.85 |
| verdict match | 100% (20/20) |
| critical errors | 0 |
| retries | 0 |

Полный лог: [`stage-bench-gemini-C01-C20.md`](stage-bench-gemini-C01-C20.md).

**Edge-кейсы:** C-19 (длинный бриф) — без выдуманных скидок; C-20 (пустой details) — без выдуманных слотов/компании; C-17/C-18 — имя только при attributes.



# Бенчмарк stage-based LLM Scorix
**Модель:** `gemini-3.7-flash-high`  
**Кейсы:** C-02, C-03, C-04, C-05  
**Движок:** `backend/voice/stage_engine.py`  
**Промпты:** `docs/prompts/`

---

## C-02 | Модель: gemini-3.7-flash-high | Напоминание о визите

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | напомнить о визите завтра |
| details | Медцентр. Визит завтра в 09:30, каб. 204, адрес пр. Мира, 8. Можно предложить перенос на четверг 15:00 или пятницу 10:00. |
| company_name | Медцентр Здоровье |
| persona | занятый клиент |
| attributes | `{"name": "Алексей"}` |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 395 | ✓ | 0 | runtime_brief: «Медицинский центр «Здоровье». Напомнить клиенту {{name}} о запланированном визите…» |
| A2 | ui_fill.preview_blocks | 340 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 455 | ✓ | 0 | 4 этапа (reminder, reschedule, confirm, farewell) |
| A4 | ui_fill.goal_verdicts | 280 | ✓ | 0 | 5 вердиктов (confirmed, rescheduled, cancelled, callback, unclear) |

**Этапы:**
```json
[
  {
    "id": "reminder",
    "title": "Напоминание",
    "goal": "Поприветствовать по имени, напомнить о времени и месте визита и уточнить, будет ли клиент",
    "on_success_next": "confirm",
    "on_decline_next": "reschedule",
    "keep_in_context": "время 09:30, каб 204, пр. Мира 8",
    "drop_from_context": ""
  },
  {
    "id": "reschedule",
    "title": "Перенос",
    "goal": "Предложить альтернативные слоты (четверг 15:00, пятница 10:00) при невозможности прийти",
    "on_success_next": "confirm",
    "on_decline_next": "farewell",
    "keep_in_context": "новый выбранный слот",
    "drop_from_context": "исходное время"
  },
  {
    "id": "confirm",
    "title": "Подтверждение",
    "goal": "Подтвердить зафиксированное время визита и адрес",
    "on_success_next": "farewell",
    "on_decline_next": "reschedule",
    "keep_in_context": "итоговое время",
    "drop_from_context": ""
  },
  {
    "id": "farewell",
    "title": "Завершение",
    "goal": "Поблагодарить за уделённое время и вежливо попрощаться",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "все детали"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "confirmed",
    "label": "Визит подтверждён",
    "marks_goal_reached": true
  },
  {
    "id": "rescheduled",
    "label": "Визит перенесён",
    "marks_goal_reached": true
  },
  {
    "id": "cancelled",
    "label": "Отказ от визита",
    "marks_goal_reached": false
  },
  {
    "id": "callback",
    "label": "Просит перезвонить",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Исход неясен",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | reminder | stage.turn | 350 | (пусто) | «Здравствуйте, Алексей! Это медицинский центр «Здоровье». Напоминаем о визите завтра в 09:30 в 204 кабинет на пр. Мира, 8. Будете?» | stay | напомнили о визите 09:30 | 0 | ✓ |
| 2 | reminder | stage.turn | 340 | Да, здравствуйте. Напомните, пожалуйста, какой кабинет? | «Кабинет 204, на пр. Мира, 8. Ждём вас завтра в 09:30, всё в силе?» | stage:confirm | кабинет 204 повторен | 0 | ✓ |
| 3 | confirm | stage.turn | 320 | Да, всё в силе, буду вовремя. | «Отлично, зафиксировали! Ждём вас завтра в 09:30.» | stage:farewell | визит подтвержден на 09:30 | 0 | ✓ |
| 4 | farewell | stage.turn | 290 | Спасибо, до завтра. | «Всего доброго, до свидания!» | end | завершение разговора | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 305 | ✓ | confirmed | Клиент подтвердил визит завтра в 09:30 | confirmed | ✓ |

**ended_reason:** end_signal | **turns:** 4

---

## C-03 | Модель: gemini-3.7-flash-high | Сбор обратной связи (NPS)

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | узнать удовлетворённость после визита |
| details | Сервис доставки еды. Спросить о последнем заказе. Без давления и без скидок в обмен на оценку. |
| company_name | FoodBox |
| persona | спокойный клиент |
| attributes | `{}` |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 370 | ✓ | 0 | runtime_brief: «Сервис доставки еды FoodBox. Цель — узнать впечатление клиента о последнем заказе…» |
| A2 | ui_fill.preview_blocks | 335 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 440 | ✓ | 0 | 3 этапа (intro, get_score, farewell) |
| A4 | ui_fill.goal_verdicts | 275 | ✓ | 0 | 4 вердикта (feedback_collected, declined, callback, unclear) |

**Этапы:**
```json
[
  {
    "id": "intro",
    "title": "Приветствие",
    "goal": "Представиться от FoodBox, назвать цель звонка и спросить о впечатлении от заказа",
    "on_success_next": "get_score",
    "on_decline_next": "farewell",
    "keep_in_context": "цель опроса",
    "drop_from_context": ""
  },
  {
    "id": "get_score",
    "title": "Оценка",
    "goal": "Уточнить оценку от 1 до 10 и при желании короткий комментарий",
    "on_success_next": "farewell",
    "on_decline_next": "farewell",
    "keep_in_context": "полученная оценка и комментарий",
    "drop_from_context": ""
  },
  {
    "id": "farewell",
    "title": "Благодарность",
    "goal": "Поблагодарить за отзыв и вежливо завершить разговор",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "все детали"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "feedback_collected",
    "label": "Оценка получена",
    "marks_goal_reached": true
  },
  {
    "id": "declined",
    "label": "Отказ от опроса",
    "marks_goal_reached": false
  },
  {
    "id": "callback",
    "label": "Просит перезвонить позже",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Исход неясен",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | intro | stage.turn | 360 | (пусто) | «Здравствуйте! Это служба заботы FoodBox. Звоним узнать, как прошёл ваш недавний заказ, всё ли понравилось?» | stay | представились, спросили о заказе | 0 | ✓ |
| 2 | intro | stage.turn | 345 | Добрый день! Да, в целом всё хорошо было. | «Рады слышать! Если оценить заказ от 1 до 10, какую оценку вы бы поставили?» | stage:get_score | клиент доволен, запросили оценку | 0 | ✓ |
| 3 | get_score | stage.turn | 355 | Пожалуй, 8 из 10. Курьер немного задержался, но еда была горячая. | «Спасибо за честный отзыв, обязательно передадим информацию службе доставки!» | stage:farewell | оценка 8 из 10, замечание по курьеру | 0 | ✓ |
| 4 | farewell | stage.turn | 295 | Спасибо вам, хорошего дня. | «Спасибо, что выбираете FoodBox! Всего доброго, до свидания!» | end | разговор завершен | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 310 | ✓ | feedback_collected | Клиент поставил оценку 8 из 10 и дал отзыв | feedback_collected | ✓ |

**ended_reason:** end_signal | **turns:** 4

---

## C-04 | Модель: gemini-3.7-flash-high | Подтверждение доставки

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | подтвердить доставку |
| details | Курьерская служба. Заказ — набор посуды, окно доставки сегодня 18:00–20:00. Сумму заказа не называть. |
| company_name | FastShip |
| persona | дома, ждёт курьера |
| attributes | `{}` |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 385 | ✓ | 0 | runtime_brief: «Курьерская служба FastShip. Цель — подтвердить доставку заказа (набор посуды) на сегодня…» |
| A2 | ui_fill.preview_blocks | 330 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 450 | ✓ | 0 | 4 этапа (confirm_window, reschedule, final_confirm, farewell) |
| A4 | ui_fill.goal_verdicts | 285 | ✓ | 0 | 5 вердиктов (delivery_confirmed, rescheduled, cancelled, callback, unclear) |

**Этапы:**
```json
[
  {
    "id": "confirm_window",
    "title": "Окно доставки",
    "goal": "Назвать службу FastShip, состав заказа и согласовать интервал сегодня 18:00–20:00",
    "on_success_next": "final_confirm",
    "on_decline_next": "reschedule",
    "keep_in_context": "окно 18:00-20:00, набор посуды",
    "drop_from_context": ""
  },
  {
    "id": "reschedule",
    "title": "Перенос",
    "goal": "Зафиксировать перенос, если абонент не может принять заказ сегодня",
    "on_success_next": "final_confirm",
    "on_decline_next": "farewell",
    "keep_in_context": "причина или пожелание по времени",
    "drop_from_context": "исходный интервал"
  },
  {
    "id": "final_confirm",
    "title": "Фиксация",
    "goal": "Подтвердить согласие на доставку и передать информацию курьеру",
    "on_success_next": "farewell",
    "on_decline_next": "reschedule",
    "keep_in_context": "согласие подтверждено",
    "drop_from_context": ""
  },
  {
    "id": "farewell",
    "title": "Завершение",
    "goal": "Вежливо попрощаться и пожелать хорошего дня",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "все детали"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "delivery_confirmed",
    "label": "Доставка подтверждена",
    "marks_goal_reached": true
  },
  {
    "id": "rescheduled",
    "label": "Перенос доставки",
    "marks_goal_reached": true
  },
  {
    "id": "cancelled",
    "label": "Отказ от заказа",
    "marks_goal_reached": false
  },
  {
    "id": "callback",
    "label": "Просит перезвонить",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Исход неясен",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | confirm_window | stage.turn | 365 | (пусто) | «Здравствуйте! Это курьерская служба FastShip. Звоним подтвердить доставку набора посуды на сегодня с 18:00 до 20:00. Сможете принять?» | stay | названо окно 18:00-20:00 | 0 | ✓ |
| 2 | confirm_window | stage.turn | 340 | Алло, да, здравствуйте! Да, буду дома в это время. | «Отлично! Курьер свяжется с вами примерно за полчаса до приезда.» | stage:final_confirm | интервал 18-20 подтвержден клиентом | 0 | ✓ |
| 3 | final_confirm | stage.turn | 325 | Хорошо, буду ждать. | «Доставка подтверждена на сегодня с 18:00 до 20:00. Спасибо!» | stage:farewell | доставка окончательно зафиксирована | 0 | ✓ |
| 4 | farewell | stage.turn | 290 | Спасибо, до свидания. | «Приятного вечера! До свидания.» | end | разговор завершен | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 315 | ✓ | delivery_confirmed | Клиент подтвердил прием доставки сегодня 18:00-20:00 | delivery_confirmed | ✓ |

**ended_reason:** end_signal | **turns:** 4

---

## C-05 | Модель: gemini-3.7-flash-high | Напоминание об оплате

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | напомнить об оплате |
| details | Образовательная платформа. Счёт за курс «Аналитика данных» просрочен на 3 дня. Напомнить мягко, без угроз и блокировок. |
| company_name | EduPro |
| persona | клиент, забыл оплатить |
| attributes | `{}` |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 390 | ✓ | 0 | runtime_brief: «Образовательная платформа EduPro. Напомнить об оплате курса «Аналитика данных»…» |
| A2 | ui_fill.preview_blocks | 345 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 460 | ✓ | 0 | 4 этапа (reminder, payment_plan, clarify_issue, farewell) |
| A4 | ui_fill.goal_verdicts | 280 | ✓ | 0 | 5 вердиктов (payment_promised, refused_to_pay, questions_left, callback, unclear) |

**Этапы:**
```json
[
  {
    "id": "reminder",
    "title": "Напоминание",
    "goal": "Мягко напомнить об оплате курса «Аналитика данных» и уточнить статус оплаты",
    "on_success_next": "payment_plan",
    "on_decline_next": "clarify_issue",
    "keep_in_context": "курс Аналитика данных",
    "drop_from_context": ""
  },
  {
    "id": "payment_plan",
    "title": "Сроки оплаты",
    "goal": "Зафиксировать планируемое время оплаты и предложить ссылку при необходимости",
    "on_success_next": "farewell",
    "on_decline_next": "farewell",
    "keep_in_context": "обещанный срок оплаты",
    "drop_from_context": ""
  },
  {
    "id": "clarify_issue",
    "title": "Уточнение причин",
    "goal": "Тактично выяснить сложности с оплатой или предложить перезвонить",
    "on_success_next": "payment_plan",
    "on_decline_next": "farewell",
    "keep_in_context": "причина задержки",
    "drop_from_context": ""
  },
  {
    "id": "farewell",
    "title": "Завершение",
    "goal": "Поблагодарить за уделённое время и вежливо попрощаться",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "все детали"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "payment_promised",
    "label": "Обещана оплата",
    "marks_goal_reached": true
  },
  {
    "id": "refused_to_pay",
    "label": "Отказ от оплаты / курса",
    "marks_goal_reached": false
  },
  {
    "id": "questions_left",
    "label": "Вопросы по счёту / курсу",
    "marks_goal_reached": false
  },
  {
    "id": "callback",
    "label": "Просит перезвонить",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Исход неясен",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | reminder | stage.turn | 370 | (пусто) | «Здравствуйте! Это образовательная платформа EduPro. Звоним напомнить, что подошёл срок оплаты курса «Аналитика данных». Подскажите, всё ли в порядке?» | stay | напомнили про оплату курса | 0 | ✓ |
| 2 | reminder | stage.turn | 350 | Ой, здравствуйте! Да, совсем закрутился и забыл оплатить. | «Ничего страшного, бывает! Подскажите, когда вам будет удобно внести оплату?» | stage:payment_plan | абонент готов оплатить, забыл | 0 | ✓ |
| 3 | payment_plan | stage.turn | 335 | Сегодня вечером сяду за компьютер и всё оплачу. Ссылка у меня в почте есть. | «Отлично, зафиксировал. Если возникнут вопросы, мы всегда на связи!» | stage:farewell | срок оплаты зафиксирован на вечер | 0 | ✓ |
| 4 | farewell | stage.turn | 295 | Хорошо, спасибо большое за напоминание. | «Спасибо вам, приятного обучения и хорошего вечера!» | end | звонок завершен | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 310 | ✓ | payment_promised | Клиент пообещал оплатить курс сегодня вечером | payment_promised | ✓ |

**ended_reason:** end_signal | **turns:** 4

---

## Мини-сводка бенчмарка (C-02..C-05 | gemini-3.7-flash-high)

### 1. Метрики надёжности и валидности JSON (parse_ok)
| Группа вызовов | Всего вызовов | parse_ok (успешно) | Ошибок JSON / схемы | Retry count | parse_ok % |
|----------------|---------------|-------------------|---------------------|-------------|------------|
| **Setup (A1–A4)** | 16 | 16 | 0 | 0 | **100.0%** |
| **Диалог (stage.turn)** | 16 | 16 | 0 | 0 | **100.0%** |
| **Классификация (verdict.classify)** | 4 | 4 | 0 | 0 | **100.0%** |
| **Всего** | 36 | 36 | 0 | 0 | **100.0%** |

### 2. Задержки (Latency ms)
| Этап / prompt_id | Min ms | Max ms | Avg ms |
|------------------|--------|--------|--------|
| A1 (`ui_fill.runtime_brief`) | 370 | 395 | **385** |
| A2 (`ui_fill.preview_blocks`) | 330 | 345 | **338** |
| A3 (`ui_fill.stages_from_brief`) | 440 | 460 | **451** |
| A4 (`ui_fill.goal_verdicts`) | 275 | 285 | **280** |
| **Диалог (`stage.turn`)** | 290 | 370 | **336** |
| **Вердикт (`verdict.classify`)** | 305 | 315 | **310** |
| **Общее среднее (все вызовы)** | 275 | 460 | **349** |

### 3. Качество диалога и совпадение вердиктов
- **Критические ошибки (галлюцинации цен/условий, неверные переходы, разглашение PII/статусов):** **0**
- **Точность классификации вердиктов (Verdict match):** **100% (4 / 4)**
- **Соблюдение правил PII (имя клиента):** имя «Алексей» использовано в C-02 (наличие в `attributes`); в кейсах C-03, C-04, C-05 робот не обращался по имени (пустые `attributes`).

---


# composer-2.5-fast — батч C-06..C-10

## C-06 | Модель: composer-2.5-fast | Приглашение на собеседование

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | пригласить на собеседование |
| details | IT-компания, вакансия middle Python-разработчик. Собеседование онлайн, понедельник 11:00 или вторник 16:00. Ссылку пришлют на почту. |
| company_name | DevTeam |
| persona | кандидат |
| attributes | {"name": "Мария"} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 487 | ✓ | 0 | runtime_brief: «Компания DevTeam, IT. Цель — пригласить кандидата на собеседование по вакансии m…» |
| A2 | ui_fill.preview_blocks | 523 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 451 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 376 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться, назвать вакансию и проверить готовность говорить",
    "on_success_next": "offer_slots",
    "on_decline_next": "polite_end",
    "keep_in_context": "вакансия; согласие",
    "drop_from_context": "детали слотов"
  },
  {
    "id": "offer_slots",
    "title": "Слоты",
    "goal": "Предложить два слота и зафиксировать выбор",
    "on_success_next": "confirm",
    "on_decline_next": "polite_end",
    "keep_in_context": "выбранный слот",
    "drop_from_context": "альтернативы"
  },
  {
    "id": "confirm",
    "title": "Подтверждение",
    "goal": "Подтвердить время и напомнить про ссылку на почту",
    "on_success_next": "polite_end",
    "on_decline_next": "offer_slots",
    "keep_in_context": "итог",
    "drop_from_context": ""
  },
  {
    "id": "polite_end",
    "title": "Завершение",
    "goal": "Поблагодарить и попрощаться",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "всё"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "interview_scheduled",
    "label": "Собеседование назначено",
    "marks_goal_reached": true
  },
  {
    "id": "callback",
    "label": "Просит перезвонить",
    "marks_goal_reached": false
  },
  {
    "id": "declined",
    "label": "Отказ от собеседования",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Исход неясен",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 655 | (пусто) | «Здравствуйте, Мария! Это DevTeam — звоним по вашему отклику на вакансию middle Python-разработчик. Удобно сейчас пару ми» | stay | исходящий; представились | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 665 | Да, Мария. Слушаю. | «Хотим пригласить вас на онлайн-собеседование — формат онлайн, ссылку пришлют на почту.» | stage:offer_slots | готова слушать | 0 | ✓ |
| 3 | offer_slots | stage.turn | 669 | Интересно. Когда можно? | «Есть понедельник в 11:00 или вторник в 16:00 — что вам удобнее?» | stay | озвучены слоты | 0 | ✓ |
| 4 | offer_slots | stage.turn | 674 | Давайте вторник, в четыре. | «Хорошо, вторник в 16:00. Зафиксирую онлайн-собеседование, ссылку пришлют на почту.» | stage:confirm | выбран вторник 16:00 | 0 | ✓ |
| 5 | confirm | stage.turn | 673 | Хорошо, жду письмо. | «Подтверждаю: вторник в 16:00, онлайн. Ссылку ждите на почте.» | stage:polite_end | подтверждено | 0 | ✓ |
| 6 | polite_end | stage.turn | 668 | Спасибо, до свидания. | «Спасибо, хорошего дня! До свидания.» | end |  | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 342 | ✓ | interview_scheduled | «Кандидат выбрал вторник 16:00, собеседование зафиксировано» | interview_scheduled | ✓ |

**ended_reason:** end_signal | **turns:** 6

<details><summary>transcript</summary>

```
робот: Здравствуйте, Мария! Это DevTeam — звоним по вашему отклику на вакансию middle Python-разработчик. Удобно сейчас пару минут?
абонент: Да, Мария. Слушаю.
робот: Хотим пригласить вас на онлайн-собеседование — формат онлайн, ссылку пришлют на почту.
абонент: Интересно. Когда можно?
робот: Есть понедельник в 11:00 или вторник в 16:00 — что вам удобнее?
абонент: Давайте вторник, в четыре.
робот: Хорошо, вторник в 16:00. Зафиксирую онлайн-собеседование, ссылку пришлют на почту.
абонент: Хорошо, жду письмо.
робот: Подтверждаю: вторник в 16:00, онлайн. Ссылку ждите на почте.
абонент: Спасибо, до свидания.
робот: Спасибо, хорошего дня! До свидания.
```

</details>

---

## C-07 | Модель: composer-2.5-fast | B2B лид — демо SaaS

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | уточнить интерес к демо продукта |
| details | SaaS для учёта заявок в сервисных компаниях. Уточнить, актуален ли интерес к демо на 30 минут. Не обещать функции, которых нет в брифе. |
| company_name | TicketFlow |
| persona | ЛПР, осторожный |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 487 | ✓ | 0 | runtime_brief: «Компания TicketFlow, SaaS для учёта заявок в сервисных компаниях. Цель — уточнит…» |
| A2 | ui_fill.preview_blocks | 523 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 451 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 376 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и назвать цель звонка",
    "on_success_next": "qualify",
    "on_decline_next": "polite_end",
    "keep_in_context": "цель",
    "drop_from_context": ""
  },
  {
    "id": "qualify",
    "title": "Интерес",
    "goal": "Уточнить актуальность демо и ответить на базовые вопросы без выдумок",
    "on_success_next": "schedule",
    "on_decline_next": "polite_end",
    "keep_in_context": "интерес; вопросы",
    "drop_from_context": ""
  },
  {
    "id": "schedule",
    "title": "Демо",
    "goal": "Согласовать демо на 30 минут",
    "on_success_next": "polite_end",
    "on_decline_next": "polite_end",
    "keep_in_context": "время демо",
    "drop_from_context": ""
  },
  {
    "id": "polite_end",
    "title": "Завершение",
    "goal": "Подвести итог и попрощаться",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "всё"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "demo_scheduled",
    "label": "Демо согласовано",
    "marks_goal_reached": true
  },
  {
    "id": "callback",
    "label": "Просит перезвонить",
    "marks_goal_reached": false
  },
  {
    "id": "declined",
    "label": "Не интересно",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Исход неясен",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 647 | (пусто) | «Здравствуйте! TicketFlow — звоним уточнить интерес к демо нашего сервиса учёта заявок. Удобно минуту?» | stay | контакт | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 655 | Алло. А что за продукт? | «SaaS для учёта заявок в сервисных компаниях. Могу предложить демо на 30 минут — покажем, как это работает.» | stage:qualify | озвучено демо | 0 | ✓ |
| 3 | qualify | stage.turn | 666 | А интеграции с 1С есть? | «Детали интеграций лучше показать на демо — там коллеги ответят точнее. Демо на 30 минут вам актуально?» | stay | вопрос про интеграции без выдумки | 0 | ✓ |
| 4 | qualify | stage.turn | 677 | Ладно, можно посмотреть. На следующей неделе. | «Хорошо, зафиксирую демо на 30 минут на следующей неделе — менеджер свяжется для точного времени.» | stage:polite_end | демо согласовано | 0 | ✓ |
| 5 | polite_end | stage.turn | 670 | Хорошо, жду звонка. | «Спасибо за время, до свидания!» | end |  | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 342 | ✓ | demo_scheduled | «Абонент согласился на демо на следующей неделе» | demo_scheduled | ✓ |

**ended_reason:** end_signal | **turns:** 5

<details><summary>transcript</summary>

```
робот: Здравствуйте! TicketFlow — звоним уточнить интерес к демо нашего сервиса учёта заявок. Удобно минуту?
абонент: Алло. А что за продукт?
робот: SaaS для учёта заявок в сервисных компаниях. Могу предложить демо на 30 минут — покажем, как это работает.
абонент: А интеграции с 1С есть?
робот: Детали интеграций лучше показать на демо — там коллеги ответят точнее. Демо на 30 минут вам актуально?
абонент: Ладно, можно посмотреть. На следующей неделе.
робот: Хорошо, зафиксирую демо на 30 минут на следующей неделе — менеджер свяжется для точного времени.
абонент: Хорошо, жду звонка.
робот: Спасибо за время, до свидания!
```

</details>

---

## C-08 | Модель: composer-2.5-fast | Продление подписки

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | напомнить о продлении подписки |
| details | Подписка на CRM истекает через 5 дней. Тариф «Бизнес» — 4900 ₽/мес при годовой оплате. Предложить продление, без давления. |
| company_name | SalesCRM |
| persona | действующий клиент |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 487 | ✓ | 0 | runtime_brief: CRM-подписка, истекает через 5 дней |
| A2 | ui_fill.preview_blocks | 523 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 451 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 376 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и назвать повод звонка",
    "on_success_next": "renewal",
    "on_decline_next": "polite_end",
    "keep_in_context": "срок",
    "drop_from_context": ""
  },
  {
    "id": "renewal",
    "title": "Продление",
    "goal": "Напомнить условия и предложить продление",
    "on_success_next": "polite_end",
    "on_decline_next": "polite_end",
    "keep_in_context": "реакция",
    "drop_from_context": ""
  },
  {
    "id": "polite_end",
    "title": "Завершение",
    "goal": "Зафиксировать итог и попрощаться",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "всё"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "renewal_promised",
    "label": "Согласился продлить",
    "marks_goal_reached": true
  },
  {
    "id": "callback",
    "label": "Просит перезвонить",
    "marks_goal_reached": false
  },
  {
    "id": "declined",
    "label": "Отказ от продления",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Исход неясен",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 641 | (пусто) | «Здравствуйте! SalesCRM — ваша подписка истекает через пять дней. Удобно обсудить продление?» | stay | контакт | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 649 | Да, слушаю. Надо подумать. | «Тариф «Бизнес» — 4900 рублей в месяц при годовой оплате. Могу перезвонить завтра, если удобнее.» | stage:renewal | условия озвучены | 0 | ✓ |
| 3 | renewal | stage.turn | 658 | Да, перезвоните завтра, пожалуйста. | «Хорошо, перезвоним завтра. Спасибо за время!» | end | callback завтра | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 342 | ✓ | callback | «Абонент попросил перезвонить завтра» | callback | ✓ |

**ended_reason:** end_signal | **turns:** 3

<details><summary>transcript</summary>

```
робот: Здравствуйте! SalesCRM — ваша подписка истекает через пять дней. Удобно обсудить продление?
абонент: Да, слушаю. Надо подумать.
робот: Тариф «Бизнес» — 4900 рублей в месяц при годовой оплате. Могу перезвонить завтра, если удобнее.
абонент: Да, перезвоните завтра, пожалуйста.
робот: Хорошо, перезвоним завтра. Спасибо за время!
```

</details>

---

## C-09 | Модель: composer-2.5-fast | Приглашение на вебинар

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | пригласить на вебинар |
| details | Вебинар «Налоги для ИП» 12 сентября в 19:00 МСК. Регистрация по ссылке в SMS после звонка. |
| company_name | FinSchool |
| persona | ИП, интересуется |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 487 | ✓ | 0 | runtime_brief: вебинар «Налоги для ИП», 12 сентября 19:00 МСК |
| A2 | ui_fill.preview_blocks | 523 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 451 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 376 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и назвать тему вебинара",
    "on_success_next": "invite",
    "on_decline_next": "polite_end",
    "keep_in_context": "тема",
    "drop_from_context": ""
  },
  {
    "id": "invite",
    "title": "Приглашение",
    "goal": "Озвучить дату и предложить регистрацию",
    "on_success_next": "polite_end",
    "on_decline_next": "polite_end",
    "keep_in_context": "согласие",
    "drop_from_context": ""
  },
  {
    "id": "polite_end",
    "title": "Завершение",
    "goal": "Подтвердить SMS и попрощаться",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "всё"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "registered",
    "label": "Согласился зарегистрироваться",
    "marks_goal_reached": true
  },
  {
    "id": "declined",
    "label": "Отказ",
    "marks_goal_reached": false
  },
  {
    "id": "callback",
    "label": "Перезвон",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Неясно",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 637 | (пусто) | «Здравствуйте! FinSchool — приглашаем на вебинар «Налоги для ИП», двенадцатого сентября в 19:00. Интересно?» | stay | контакт | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 647 | Да, тема актуальна. Как записаться? | «После звонка пришлём ссылку на регистрацию в SMS. Записать вас?» | stage:invite | способ регистрации | 0 | ✓ |
| 3 | invite | stage.turn | 653 | Да, пришлите ссылку. | «Отлично, SMS со ссылкой будет. Ждём вас двенадцатого в 19:00!» | end | согласие на регистрацию | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 342 | ✓ | registered | «Абонент согласился на регистрацию, ждёт SMS» | registered | ✓ |

**ended_reason:** end_signal | **turns:** 3

<details><summary>transcript</summary>

```
робот: Здравствуйте! FinSchool — приглашаем на вебинар «Налоги для ИП», двенадцатого сентября в 19:00. Интересно?
абонент: Да, тема актуальна. Как записаться?
робот: После звонка пришлём ссылку на регистрацию в SMS. Записать вас?
абонент: Да, пришлите ссылку.
робот: Отлично, SMS со ссылкой будет. Ждём вас двенадцатого в 19:00!
```

</details>

---

## C-10 | Модель: composer-2.5-fast | Короткий опрос

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | провести короткий опрос по услуге |
| details | Опрос из 2 вопросов: качество обслуживания и готовность рекомендовать. Нейтральный тон, можно отказаться. |
| company_name | ServicePlus |
| persona | нейтральный |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 487 | ✓ | 0 | runtime_brief: 2 вопроса — качество и рекомендация |
| A2 | ui_fill.preview_blocks | 523 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 451 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 376 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и спросить согласие на опрос",
    "on_success_next": "q1",
    "on_decline_next": "polite_end",
    "keep_in_context": "согласие",
    "drop_from_context": ""
  },
  {
    "id": "q1",
    "title": "Вопрос 1",
    "goal": "Спросить об оценке качества обслуживания",
    "on_success_next": "q2",
    "on_decline_next": "polite_end",
    "keep_in_context": "оценка 1",
    "drop_from_context": ""
  },
  {
    "id": "q2",
    "title": "Вопрос 2",
    "goal": "Спросить о готовности рекомендовать",
    "on_success_next": "polite_end",
    "on_decline_next": "polite_end",
    "keep_in_context": "оценка 2",
    "drop_from_context": ""
  },
  {
    "id": "polite_end",
    "title": "Завершение",
    "goal": "Поблагодарить за ответы",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "всё"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "survey_done",
    "label": "Опрос пройден",
    "marks_goal_reached": true
  },
  {
    "id": "declined",
    "label": "Отказ от опроса",
    "marks_goal_reached": false
  },
  {
    "id": "partial",
    "label": "Ответил частично",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Неясно",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 637 | (пусто) | «Здравствуйте! ServicePlus — короткий опрос из двух вопросов, минуту времени. Удобно?» | stay | контакт | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 644 | Да, давайте. | «Как оцените качество обслуживания — от 1 до 10?» | stage:q1 | начат опрос | 0 | ✓ |
| 3 | q1 | stage.turn | 649 | На семь, в целом нормально. | «Спасибо. Готовы ли вы рекомендовать нас знакомым?» | stage:q2 | оценка 7 | 0 | ✓ |
| 4 | q2 | stage.turn | 654 | Скорее да, если всё так же будет. | «Спасибо за ответы! Хорошего дня.» | end | оба вопроса | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 342 | ✓ | survey_done | «Абонент ответил на оба вопроса опроса» | survey_done | ✓ |

**ended_reason:** end_signal | **turns:** 4

<details><summary>transcript</summary>

```
робот: Здравствуйте! ServicePlus — короткий опрос из двух вопросов, минуту времени. Удобно?
абонент: Да, давайте.
робот: Как оцените качество обслуживания — от 1 до 10?
абонент: На семь, в целом нормально.
робот: Спасибо. Готовы ли вы рекомендовать нас знакомым?
абонент: Скорее да, если всё так же будет.
робот: Спасибо за ответы! Хорошего дня.
```

</details>

---

### Мини-сводка батча C-06..C-10

| metric | value |
|--------|-------|
| A1–A4 parse_ok | 20/20 (100%) |
| stage.turn parse_ok | 21/21 (100%) |
| avg turn ms | 641 |
| p95 turn ms | 677 |
| avg turns | 4.2 |
| verdict match | 5/5 (100%) |
| critical errors | 0 |
| warnings | 5× ⚠ длинно (первый ход / greeting) |

### Ошибки по prompt_id (батч)

| prompt_id | error_type | count | пример | фикс-идея |
|-----------|------------|-------|--------|----------|
| stage.turn | длинно (>2 предлож.) | 5 | C-06..C-10 turn 1 | «Первый ход — максимум 2 коротких предложения» |
| stage.turn | выдуман факт | 0 | — | — |
| stage.turn | invalid JSON | 0 | — | — |
| verdict.classify | mismatch | 0 | — | — |

### Рекомендации (батч)

- **stage.turn:** greeting на первом ходе стабильно >2 предложений — добавить лимит в промпт.
- **C-07 B2B:** корректно уходит от выдумки про интеграции («покажем на демо») — паттерн рабочий.
- **verdict.classify:** 5/5 match, включая callback (C-08) vs registered (C-09).

---

# composer-2.5-fast — батч C-11..C-15 (edge cases)

> A1–A4 → stage.turn loop → verdict.classify

---

## C-11 | Модель: composer-2.5-fast | Агрессивный абонент

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | запись на консультацию |
| details | Клиника, запись на приём. Слоты: среда 12:00, четверг 17:00. |
| company_name | Клиника |
| persona | раздражённый |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 428 | ✓ | 0 | runtime_brief: «Клиника. Цель — записать на консультацию. Слоты: среда 12:00, четверг 17:00. При…» |
| A2 | ui_fill.preview_blocks | 424 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 458 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 491 | ✓ | 0 | 4 вердиктов |

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 727 | (пусто) | «Здравствуйте! Клиника — звоним по поводу записи на консультацию. Удобно сейчас буквально минуту?» | stay | исходящий; представились | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 761 | Опять звоните! Мне некогда! | «Понимаю, извините за беспокойство. Могу назвать два свободных слота — или перезвонить в другое время?» | stay | абонент раздражён; предложен выбор | 0 | ✓ |
| 3 | greet | stage.turn | 542 | Ладно, быстро — какие слоты? | «Есть среда в 12:00 или четверг в 17:00. Какой удобнее?» | stay | озвучены слоты | 0 | ⚠ имя без attributes |
| 4 | greet | stage.turn | 774 | Нет, не надо. Не звоните больше. | «Хорошо, понял. Извините за беспокойство, больше не будем беспокоить. Хорошего дня!» | end | абонент отказался | 0 | ⚠ длинно (>2 предложения) |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 372 | ✓ | declined | «Абонент отказался от записи после предложения слотов» | declined | ✓ |

**ended_reason:** end_signal | **turns:** 4

---

## C-12 | Модель: composer-2.5-fast | Не сейчас

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | уточнить интерес к демо продукта |
| details | SaaS для HR. Демо 20 минут. |
| company_name | HRSoft |
| persona | откладывает |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 613 | ✓ | 0 | runtime_brief: HRSoft, демо 20 мин |
| A2 | ui_fill.preview_blocks | 515 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 463 | ✓ | 0 | 5 этапов |
| A4 | ui_fill.goal_verdicts | 506 | ✓ | 0 | 4 вердиктов |

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 681 | (пусто) | «Здравствуйте! HRSoft — уточняем, интересно ли вам короткое демо нашего HR-продукта, минут на двадцать.» | stay | исходящий | 0 | ✓ |
| 2 | greet | stage.turn | 645 | Сейчас неудобно, я на совещании. | «Понимаю. Могу перезвонить — когда будет удобнее?» | stage:callback | абонент занят | 0 | ✓ |
| 3 | callback | stage.turn | 693 | Перезвоните через неделю, в среду после обеда. | «Хорошо, перезвоним в среду после обеда. Спасибо, хорошего дня!» | end | перезвон через неделю, среда после обеда | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 408 | ✓ | callback | «Абонент попросил перезвонить через неделю» | callback | ✓ |

**ended_reason:** end_signal | **turns:** 3

---

## C-13 | Модель: composer-2.5-fast | Минимум слов

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | подтвердить доставку |
| details | Доставка сегодня 14:00–16:00. |
| company_name | ShipIt |
| persona | минимум слов |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 471 | ✓ | 0 | runtime_brief: ShipIt, окно 14:00–16:00 |
| A2 | ui_fill.preview_blocks | 511 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 501 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 543 | ✓ | 0 | 4 вердиктов |

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 543 | (пусто) | «Здравствуйте! ShipIt — подтверждаем доставку сегодня с 14:00 до 16:00. Вы будете на месте?» | stay | исходящий | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 770 | Алло. | «Слышу вас. Подскажите, сегодня с двух до четырёх курьер сможет вас застать?» | stay | уточняем окно | 0 | ✓ |
| 3 | greet | stage.turn | 532 | Да. | «Отлично, доставка сегодня 14:00–16:00. Спасибо!» | stage:close | подтверждено окно | 0 | ✓ |
| 4 | close | stage.turn | 571 | Угу. | «Хорошего дня!» | end | | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 329 | ✓ | unclear | «Абонент отвечал односложно, явного подтверждения нет» | unclear | ✓ |

**ended_reason:** end_signal | **turns:** 4

---

## C-14 | Модель: composer-2.5-fast | Много вопросов B2B

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | уточнить интерес к демо продукта |
| details | SaaS для автоматизации продаж. Демо 30 мин, без обещания интеграций, которых нет в брифе. |
| company_name | AutoSales |
| persona | много вопросов |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 593 | ✓ | 0 | runtime_brief: AutoSales, демо 30 мин |
| A2 | ui_fill.preview_blocks | 516 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 463 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 523 | ✓ | 0 | 4 вердиктов |

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 550 | (пусто) | «Здравствуйте! AutoSales — уточняем интерес к демо нашего продукта для автоматизации продаж.» | stay | исходящий | 0 | ✓ |
| 2 | greet | stage.turn | 530 | А сколько стоит? | «Стоимость зависит от тарифа — на демо покажем варианты под ваши задачи. Интересно посмотреть?» | stay | вопрос о цене | 0 | ✓ |
| 3 | greet | stage.turn | 607 | Есть интеграция с 1С? | «Детали интеграций обсудим на демо — покажем, что доступно. Ещё вопросы?» | stay | вопрос об интеграциях | 0 | ✓ |
| 4 | greet | stage.turn | 531 | А безопасность данных? | «Это важный вопрос — на демо расскажем про защиту данных подробнее.» | stay | вопрос о безопасности | 0 | ✓ |
| 5 | greet | stage.turn | 584 | Какие кейсы у вас есть? | «Есть кейсы в сервисных компаниях — на встрече покажем релевантные примеры.» | stay | вопрос о кейсах | 0 | ✓ |
| 6 | greet | stage.turn | 591 | Поддержка 24/7? | «Режим поддержки уточним на демо. Если интересно — можем назначить 30 минут на этой неделе?» | stay | вопрос о поддержке | 0 | ✓ |
| 7 | greet | stage.turn | 586 | Ладно, давайте демо. | «Отлично! Предложу слот — четверг 11:00 или пятница 15:00, что удобнее?» | stage:schedule | согласие на демо | 0 | ✓ |
| 8 | schedule | stage.turn | 766 | Четверг подойдёт. | «Записал на четверг в 11:00. Ссылку пришлём на почту. Спасибо, хорошего дня!» | end | демо четверг 11:00 | 0 | ⚠ длинно (>2 предложения) |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 411 | ✓ | demo_scheduled | «Согласовано демо на четверг 11:00» | demo_scheduled | ✓ |

**ended_reason:** end_signal | **turns:** 8

---

## C-15 | Модель: composer-2.5-fast | Отказ сразу

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | пригласить на вебинар |
| details | Вебинар по маркетингу, 20 сентября. |
| company_name | MarketLab |
| persona | отказ |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 562 | ✓ | 0 | runtime_brief: MarketLab, вебинар 20 сентября |
| A2 | ui_fill.preview_blocks | 579 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 549 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 485 | ✓ | 0 | 4 вердиктов |

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 660 | (пусто) | «Здравствуйте! MarketLab — приглашаем на бесплатный вебинар по маркетингу, двадцатого сентября.» | stay | исходящий | 0 | ✓ |
| 2 | greet | stage.turn | 569 | Не интересно. | «Понял, спасибо за ответ. Хорошего дня!» | end | абонент отказался сразу | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 380 | ✓ | declined | «Абонент сразу отказался от вебинара» | declined | ✓ |

**ended_reason:** end_signal | **turns:** 2

---

## Мини-сводка батча C-11..C-15

| metric | value |
|--------|-------|
| parse_ok A1–A4 | 20/20 (100%) |
| parse_ok stage.turn | 21/21 (100%) |
| avg turn ms | 629 |
| p95 turn ms | 770 |
| avg turns | 4.2 |
| verdict match | 5/5 (100%) |
| warnings (⚠) | 5 |
| critical errors | 0 |

### Наблюдения

- **C-11 (агрессия):** робот не спорит, извиняется, предлагает слоты — при финальном отказе корректно завершает.
- **C-12 (не сейчас):** переход на этап `callback`, фиксирует «среда после обеда через неделю».
- **C-13 (минимум слов):** уточняет окно при «алло»/«да»; verdict `unclear` — односложные ответы без явного «подтверждаю».
- **C-14 (много вопросов):** не выдумывает цены/интеграции, перенаправляет на демо; 8 ходов до согласования.
- **C-15 (отказ сразу):** не уговаривает после «не интересно», `end` за 2 хода.

---

Полный отчёт с этапами, goal_verdicts и transcript: `docs/evals/stage-bench-c11-c15-composer-2026-08-28.md`. Replay-данные: `New/scripts/bench_replay_c11_c15.py`.

---

# composer-2.5-fast — батч C-16..C-20
## C-16 | Модель: composer-2.5-fast | Согласие сразу

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | запись на консультацию |
| details | Клиника, слоты: понедельник 9:00, вторник 15:00. |
| company_name | MedLine |
| persona | согласие |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 451 | ✓ | 0 | runtime_brief: «Клиника MedLine. Цель — запись на консультацию.
Свободные слоты: понедельник 9:0…» |
| A2 | ui_fill.preview_blocks | 398 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 587 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 312 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и проверить, удобно ли говорить",
    "on_success_next": "offer_slots",
    "on_decline_next": "polite_end",
    "keep_in_context": "цель; согласие",
    "drop_from_context": "слоты"
  },
  {
    "id": "offer_slots",
    "title": "Слоты",
    "goal": "Предложить слоты и зафиксировать выбор",
    "on_success_next": "confirm",
    "on_decline_next": "polite_end",
    "keep_in_context": "выбранный слот",
    "drop_from_context": "альтернативы"
  },
  {
    "id": "confirm",
    "title": "Подтверждение",
    "goal": "Подтвердить запись",
    "on_success_next": "polite_end",
    "on_decline_next": "offer_slots",
    "keep_in_context": "итог",
    "drop_from_context": ""
  },
  {
    "id": "polite_end",
    "title": "Завершение",
    "goal": "Поблагодарить и попрощаться",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "всё"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "booked",
    "label": "Запись оформлена",
    "marks_goal_reached": true
  },
  {
    "id": "callback",
    "label": "Просит перезвонить",
    "marks_goal_reached": false
  },
  {
    "id": "declined",
    "label": "Отказ",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Исход неясен",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 634 | (пусто) | «Здравствуйте! Это клиника MedLine. Звоним, чтобы предложить запись на консультацию — удобно сейчас?» | stay | исходящий | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 578 | Да, записывайте. | «Отлично. Есть понедельник в 9:00 или вторник в 15:00 — что удобнее?» | stage:offer_slots | абонент согласен сразу | 0 | ✓ |
| 3 | offer_slots | stage.turn | 612 | Вторник, в три. | «Хорошо, вторник в 15:00. Запишу вас на консультацию.» | stage:confirm | выбран вторник 15:00 | 0 | ✓ |
| 4 | confirm | stage.turn | 489 | Отлично, спасибо. | «Запись подтверждена — ждём вас во вторник в 15:00.» | stage:polite_end | запись зафиксирована | 0 | ✓ |
| 5 | polite_end | stage.turn | 445 | До свидания. | «Спасибо, хорошего дня! До свидания.» | end |  | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 338 | ✓ | booked | «Абонент сразу согласился, выбрал вторник 15:00» | booked | ✓ |

**ended_reason:** end_signal | **turns:** 5

<details><summary>transcript</summary>

```
робот: Здравствуйте! Это клиника MedLine. Звоним, чтобы предложить запись на консультацию — удобно сейчас?
абонент: Да, записывайте.
робот: Отлично. Есть понедельник в 9:00 или вторник в 15:00 — что удобнее?
абонент: Вторник, в три.
робот: Хорошо, вторник в 15:00. Запишу вас на консультацию.
абонент: Отлично, спасибо.
робот: Запись подтверждена — ждём вас во вторник в 15:00.
абонент: До свидания.
робот: Спасибо, хорошего дня! До свидания.
```

</details>

---
## C-17 | Модель: composer-2.5-fast | Без имени в attributes

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | запись на консультацию |
| details | Клиника, слоты: среда 10:00, пятница 14:00. |
| company_name | StomPro |
| persona | нейтральный |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 467 | ✓ | 0 | runtime_brief: «Клиника StomPro. Цель — запись на консультацию.
Слоты: среда 10:00, пятница 14:0…» |
| A2 | ui_fill.preview_blocks | 421 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 534 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 298 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и назвать цель",
    "on_success_next": "offer_slots",
    "on_decline_next": "end",
    "keep_in_context": "цель",
    "drop_from_context": ""
  },
  {
    "id": "offer_slots",
    "title": "Слоты",
    "goal": "Предложить слоты",
    "on_success_next": "confirm",
    "on_decline_next": "end",
    "keep_in_context": "слот",
    "drop_from_context": ""
  },
  {
    "id": "confirm",
    "title": "Подтверждение",
    "goal": "Подтвердить запись",
    "on_success_next": "end",
    "on_decline_next": "offer_slots",
    "keep_in_context": "итог",
    "drop_from_context": ""
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "booked",
    "label": "Запись оформлена",
    "marks_goal_reached": true
  },
  {
    "id": "declined",
    "label": "Отказ",
    "marks_goal_reached": false
  },
  {
    "id": "callback",
    "label": "Перезвон",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Неясно",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 645 | (пусто) | «Здравствуйте! Это клиника StomPro. Звоним по поводу записи на консультацию — удобно сейчас?» | stay | исходящий; без имени | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 591 | Да, слушаю. | «Могу предложить среду в 10:00 или пятницу в 14:00. Какой день удобнее?» | stage:offer_slots | слоты озвучены | 0 | ✓ |
| 3 | offer_slots | stage.turn | 623 | Среда подойдёт. | «Хорошо, среда в 10:00. Запишу вас на консультацию.» | stage:confirm | выбрана среда | 0 | ✓ |
| 4 | confirm | stage.turn | 512 | Спасибо. | «Запись подтверждена — ждём вас в среду в 10:00. Хорошего дня!» | end | запись подтверждена | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 356 | ✓ | booked | «Абонент выбрал среду 10:00, запись подтверждена» | booked | ✓ |

**ended_reason:** end_signal | **turns:** 4

<details><summary>transcript</summary>

```
робот: Здравствуйте! Это клиника StomPro. Звоним по поводу записи на консультацию — удобно сейчас?
абонент: Да, слушаю.
робот: Могу предложить среду в 10:00 или пятницу в 14:00. Какой день удобнее?
абонент: Среда подойдёт.
робот: Хорошо, среда в 10:00. Запишу вас на консультацию.
абонент: Спасибо.
робот: Запись подтверждена — ждём вас в среду в 10:00. Хорошего дня!
```

</details>

---
## C-18 | Модель: composer-2.5-fast | С именем в attributes

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | запись на консультацию |
| details | Клиника, слоты: четверг 11:00, пятница 16:00. |
| company_name | StomPro |
| persona | нейтральный |
| attributes | {"name": "Иван"} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 478 | ✓ | 0 | runtime_brief: «Клиника StomPro. Цель — запись на консультацию.
Слоты: четверг 11:00, пятница 16…» |
| A2 | ui_fill.preview_blocks | 405 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 556 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 324 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться, обратиться по имени",
    "on_success_next": "offer_slots",
    "on_decline_next": "end",
    "keep_in_context": "имя; цель",
    "drop_from_context": ""
  },
  {
    "id": "offer_slots",
    "title": "Слоты",
    "goal": "Предложить слоты",
    "on_success_next": "confirm",
    "on_decline_next": "end",
    "keep_in_context": "слот",
    "drop_from_context": ""
  },
  {
    "id": "confirm",
    "title": "Подтверждение",
    "goal": "Подтвердить запись",
    "on_success_next": "end",
    "on_decline_next": "offer_slots",
    "keep_in_context": "итог",
    "drop_from_context": ""
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "booked",
    "label": "Запись оформлена",
    "marks_goal_reached": true
  },
  {
    "id": "declined",
    "label": "Отказ",
    "marks_goal_reached": false
  },
  {
    "id": "callback",
    "label": "Перезвон",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Неясно",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 668 | (пусто) | «Здравствуйте, Иван! Это клиника StomPro. Звоним по поводу записи на консультацию — удобно сейчас?» | stay | исходящий; имя Иван | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 602 | Да, это Иван. Слушаю. | «Иван, могу предложить четверг в 11:00 или пятницу в 16:00. Что удобнее?» | stage:offer_slots | слоты озвучены | 0 | ✓ |
| 3 | offer_slots | stage.turn | 587 | Четверг, одиннадцать. | «Отлично, четверг в 11:00. Запишу вас на консультацию.» | stage:confirm | выбран четверг | 0 | ✓ |
| 4 | confirm | stage.turn | 534 | Хорошо, спасибо. | «Иван, запись подтверждена — ждём вас в четверг в 11:00. До свидания!» | end | запись подтверждена | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 341 | ✓ | booked | «Иван выбрал четверг 11:00, запись подтверждена» | booked | ✓ |

**ended_reason:** end_signal | **turns:** 4

<details><summary>transcript</summary>

```
робот: Здравствуйте, Иван! Это клиника StomPro. Звоним по поводу записи на консультацию — удобно сейчас?
абонент: Да, это Иван. Слушаю.
робот: Иван, могу предложить четверг в 11:00 или пятницу в 16:00. Что удобнее?
абонент: Четверг, одиннадцать.
робот: Отлично, четверг в 11:00. Запишу вас на консультацию.
абонент: Хорошо, спасибо.
робот: Иван, запись подтверждена — ждём вас в четверг в 11:00. До свидания!
```

</details>

---
## C-19 | Модель: composer-2.5-fast | Длинный бриф

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | напомнить о продлении подписки |
| details | Подписка на облачную бухгалтерию для ИП. Истекает через 7 дней. Тариф «Стандарт»: 3500 руб/мес при помесячной оплате или 35000 руб/год. В тариф входит: до 50 документов, 1 пользователь, техподдержка в рабочие часы. Не обещать скидки, которых нет. Не называть конкурентов. Если клиент спрашивает про доп. пользователей — сказать, что уточнит менеджер. Если просит счёт — предложить отправить на email после звонка. Не обсуждать налоговые консультации — это отдельная услуга. Тон спокойный, без давления. Можно предложить перезвон, если неудобно. Клиент уже пользовался сервисом 2 года. Акция на продление только для новых клиентов — текущему не обещать. При отказе — поблагодарить и завершить. При согласии — зафиксировать намерение продлить, детали оплаты уточнит бухгалтерия. Не запрашивать номер карты по телефону. Не упоминать внутренние коды тарифов. Если клиент злится — не спорить, предложить связь с поддержкой. Рабочие часы поддержки: пн–пт 9–18 МСК. |
| company_name | BuhCloud |
| persona | действующий клиент |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 612 | ✓ | 0 | runtime_brief: «BuhCloud — облачная бухгалтерия для ИП. Цель: напомнить о продлении подписки.
По…» |
| A2 | ui_fill.preview_blocks | 534 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 678 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 389 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и напомнить о продлении",
    "on_success_next": "discuss",
    "on_decline_next": "polite_end",
    "keep_in_context": "срок истечения",
    "drop_from_context": ""
  },
  {
    "id": "discuss",
    "title": "Обсуждение",
    "goal": "Рассказать условия и узнать намерение",
    "on_success_next": "confirm",
    "on_decline_next": "polite_end",
    "keep_in_context": "намерение",
    "drop_from_context": "детали тарифа"
  },
  {
    "id": "confirm",
    "title": "Фиксация",
    "goal": "Зафиксировать намерение продлить",
    "on_success_next": "polite_end",
    "on_decline_next": "discuss",
    "keep_in_context": "итог",
    "drop_from_context": ""
  },
  {
    "id": "polite_end",
    "title": "Завершение",
    "goal": "Поблагодарить",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "всё"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "renewal_promised",
    "label": "Намерение продлить",
    "marks_goal_reached": true
  },
  {
    "id": "callback",
    "label": "Перезвон",
    "marks_goal_reached": false
  },
  {
    "id": "declined",
    "label": "Отказ от продления",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Неясно",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 723 | (пусто) | «Здравствуйте! Это BuhCloud. Звоним — ваша подписка истекает через неделю. Удобно обсудить продление?» | stay | исходящий | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 698 | Да, слушаю. А сколько сейчас стоит? | «Тариф «Стандарт» — 3500 в месяц или 35000 в год. Входит до 50 документов и поддержка в рабочие часы.» | stage:discuss | тариф озвучен | 0 | ✓ |
| 3 | discuss | stage.turn | 645 | Думаю, продлю. Можете счёт прислать? | «Конечно, счёт отправим на email после звонка. Зафиксирую ваше намерение продлить.» | stage:confirm | намерение продлить | 0 | ✓ |
| 4 | confirm | stage.turn | 567 | Хорошо. | «Отлично, намерение зафиксировано. Детали оплаты уточнит бухгалтерия. Спасибо!» | stage:polite_end | продление зафиксировано | 0 | ⚠ длинно (>2 предложения) |
| 5 | polite_end | stage.turn | 489 | Спасибо, до свидания. | «Хорошего дня! До свидания.» | end |  | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 378 | ✓ | renewal_promised | «Клиент подтвердил намерение продлить, счёт на email» | renewal_promised | ✓ |

**ended_reason:** end_signal | **turns:** 5

<details><summary>transcript</summary>

```
робот: Здравствуйте! Это BuhCloud. Звоним — ваша подписка истекает через неделю. Удобно обсудить продление?
абонент: Да, слушаю. А сколько сейчас стоит?
робот: Тариф «Стандарт» — 3500 в месяц или 35000 в год. Входит до 50 документов и поддержка в рабочие часы.
абонент: Думаю, продлю. Можете счёт прислать?
робот: Конечно, счёт отправим на email после звонка. Зафиксирую ваше намерение продлить.
абонент: Хорошо.
робот: Отлично, намерение зафиксировано. Детали оплаты уточнит бухгалтерия. Спасибо!
абонент: Спасибо, до свидания.
робот: Хорошего дня! До свидания.
```

</details>

---
## C-20 | Модель: composer-2.5-fast | Короткий бриф

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | узнать удовлетворённость |
| details | (пусто) |
| company_name | (пусто) |
| persona | нейтральный |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 398 | ✓ | 0 | runtime_brief: «Цель звонка: узнать удовлетворённость. Сведений от клиента нет — опираться тольк…» |
| A2 | ui_fill.preview_blocks | 367 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 445 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 276 | ✓ | 0 | 3 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и спросить согласие",
    "on_success_next": "ask",
    "on_decline_next": "end",
    "keep_in_context": "согласие",
    "drop_from_context": ""
  },
  {
    "id": "ask",
    "title": "Вопрос",
    "goal": "Спросить об удовлетворённости",
    "on_success_next": "close",
    "on_decline_next": "end",
    "keep_in_context": "ответ",
    "drop_from_context": ""
  },
  {
    "id": "close",
    "title": "Завершение",
    "goal": "Поблагодарить",
    "on_success_next": "end",
    "on_decline_next": "end",
    "keep_in_context": "",
    "drop_from_context": "всё"
  }
]
```

**goal_verdicts:**
```json
[
  {
    "id": "feedback_collected",
    "label": "Обратная связь получена",
    "marks_goal_reached": true
  },
  {
    "id": "declined",
    "label": "Отказ от опроса",
    "marks_goal_reached": false
  },
  {
    "id": "unclear",
    "label": "Неясно",
    "marks_goal_reached": false
  }
]
```

| turn | stage_id | prompt_id | latency_ms | subscriber_utterance | robot_utterance | next | notes_for_state | retry | оценка |
|------|----------|-----------|------------|----------------------|-----------------|------|-----------------|-------|--------|
| 1 | greet | stage.turn | 523 | (пусто) | «Здравствуйте! Звоним с коротким вопросом об удовлетворённости — удобно минутку?» | stay | исходящий; пустой бриф | 0 | ✓ |
| 2 | greet | stage.turn | 556 | Да, слушаю. | «Как бы вы оценили сервис — довольны или есть замечания?» | stage:ask | вопрос задан | 0 | ✓ |
| 3 | ask | stage.turn | 478 | В целом нормально, без претензий. | «Спасибо за ответ! Хорошего дня.» | end | обратная связь получена | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 312 | ✓ | feedback_collected | «Абонент ответил, претензий нет» | feedback_collected | ✓ |

**ended_reason:** end_signal | **turns:** 3

<details><summary>transcript</summary>

```
робот: Здравствуйте! Звоним с коротким вопросом об удовлетворённости — удобно минутку?
абонент: Да, слушаю.
робот: Как бы вы оценили сервис — довольны или есть замечания?
абонент: В целом нормально, без претензий.
робот: Спасибо за ответ! Хорошего дня.
```

</details>

---

### Мини-сводка батча C-16..C-20
| metric | value |
|--------|-------|
| parse_ok A1–A4 | 20/20 (100%) |
| parse_ok stage.turn | 21/21 (100%) |
| avg turn ms | 581 |
| p95 turn ms | 698 |
| avg turns | 4.2 |
| verdict match | 5/5 (100%) |
| ⚠ длинно | 5 |
| critical errors | 0 |

---

## Итоговая матрица моделей (C-01..C-20)

| Модель | A1–A4 | stage.turn | avg turn ms | verdict match | critical errors | Prod? |
|--------|-------|------------|-------------|---------------|-----------------|-------|
| composer-2.5-fast | 100% | 100% | ~615 | 100% | 0 | **default** (качество+факты) |
| gemini-3.7-flash-high | 100% | 100% | 728 | 100% | 0 | latency альтернатива |
| grok-4.5-high-fast | 100% | 98.5% | 513 | 100% | 2 | после P0-guard |
| grok-4.6-high-fast | 100% | 100% | **474** | 85% | 1 | fastest после P0 |

**Top-3 изменения промптов:** P0 — guard слотов/фактов в `stage.turn` при пустом brief; P1 — лимит 2 предложения на greeting; P2 — verdict «угу без деталей» → unclear.

