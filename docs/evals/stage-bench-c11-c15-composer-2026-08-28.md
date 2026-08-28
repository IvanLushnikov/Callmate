# composer-2.5-fast — батч C-11..C-15 (edge cases)
> A1–A4 → stage.turn loop → verdict.classify

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
| A1 | ui_fill.runtime_brief | 428 | ✓ | 0 | runtime_brief: «Клиника. Цель — записать на консультацию.
Слоты: среда 12:00, четверг 17:00.
При…» |
| A2 | ui_fill.preview_blocks | 424 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 458 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 491 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и проверить готовность говорить",
    "on_success_next": "offer",
    "on_decline_next": "polite_end",
    "keep_in_context": "цель; настроение абонента",
    "drop_from_context": "слоты"
  },
  {
    "id": "offer",
    "title": "Запись",
    "goal": "Предложить слоты и зафиксировать выбор",
    "on_success_next": "polite_end",
    "on_decline_next": "polite_end",
    "keep_in_context": "выбранный слот",
    "drop_from_context": "альтернативы"
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
| 1 | greet | stage.turn | 727 | (пусто) | «Здравствуйте! Клиника — звоним по поводу записи на консультацию. Удобно сейчас буквально минуту?» | stay | исходящий; представились | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 761 | Опять звоните! Мне некогда! | «Понимаю, извините за беспокойство. Могу назвать два свободных слота — или перезвонить в другое время?» | stay | абонент раздражён; предложен выбор | 0 | ✓ |
| 3 | greet | stage.turn | 542 | Ладно, быстро — какие слоты? | «Есть среда в 12:00 или четверг в 17:00. Какой удобнее?» | stay | озвучены слоты | 0 | ⚠ имя без attributes |
| 4 | greet | stage.turn | 774 | Нет, не надо. Не звоните больше. | «Хорошо, понял. Извините за беспокойство, больше не будем беспокоить. Хорошего дня!» | end | абонент отказался | 0 | ⚠ длинно (>2 предложения) |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 372 | ✓ | declined | «Абонент отказался от записи после предложения слотов» | declined | ✓ |

**ended_reason:** end_signal | **turns:** 4

<details><summary>transcript</summary>

```
робот: Здравствуйте! Клиника — звоним по поводу записи на консультацию. Удобно сейчас буквально минуту?
абонент: Опять звоните! Мне некогда!
робот: Понимаю, извините за беспокойство. Могу назвать два свободных слота — или перезвонить в другое время?
абонент: Ладно, быстро — какие слоты?
робот: Есть среда в 12:00 или четверг в 17:00. Какой удобнее?
абонент: Нет, не надо. Не звоните больше.
робот: Хорошо, понял. Извините за беспокойство, больше не будем беспокоить. Хорошего дня!
```

</details>

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
| A1 | ui_fill.runtime_brief | 613 | ✓ | 0 | runtime_brief: «HRSoft — SaaS для HR. Цель — уточнить интерес к демо продукта (20 минут).
При «н…» |
| A2 | ui_fill.preview_blocks | 515 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 463 | ✓ | 0 | 5 этапов |
| A4 | ui_fill.goal_verdicts | 506 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и назвать цель",
    "on_success_next": "qualify",
    "on_decline_next": "callback",
    "keep_in_context": "цель; готовность",
    "drop_from_context": ""
  },
  {
    "id": "qualify",
    "title": "Интерес",
    "goal": "Уточнить интерес к демо",
    "on_success_next": "schedule",
    "on_decline_next": "callback",
    "keep_in_context": "интерес",
    "drop_from_context": ""
  },
  {
    "id": "schedule",
    "title": "Слот",
    "goal": "Согласовать время демо",
    "on_success_next": "close",
    "on_decline_next": "callback",
    "keep_in_context": "время демо",
    "drop_from_context": ""
  },
  {
    "id": "callback",
    "title": "Перезвон",
    "goal": "Зафиксировать просьбу перезвонить",
    "on_success_next": "close",
    "on_decline_next": "close",
    "keep_in_context": "когда перезвонить",
    "drop_from_context": ""
  },
  {
    "id": "close",
    "title": "Завершение",
    "goal": "Попрощаться",
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
| 1 | greet | stage.turn | 681 | (пусто) | «Здравствуйте! HRSoft — уточняем, интересно ли вам короткое демо нашего HR-продукта, минут на двадцать.» | stay | исходящий | 0 | ✓ |
| 2 | greet | stage.turn | 645 | Сейчас неудобно, я на совещании. | «Понимаю. Могу перезвонить — когда будет удобнее?» | stage:callback | абонент занят | 0 | ✓ |
| 3 | callback | stage.turn | 693 | Перезвоните через неделю, в среду после обеда. | «Хорошо, перезвоним в среду после обеда. Спасибо, хорошего дня!» | end | перезвон через неделю, среда после обеда | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 408 | ✓ | callback | «Абонент попросил перезвонить через неделю» | callback | ✓ |

**ended_reason:** end_signal | **turns:** 3

<details><summary>transcript</summary>

```
робот: Здравствуйте! HRSoft — уточняем, интересно ли вам короткое демо нашего HR-продукта, минут на двадцать.
абонент: Сейчас неудобно, я на совещании.
робот: Понимаю. Могу перезвонить — когда будет удобнее?
абонент: Перезвоните через неделю, в среду после обеда.
робот: Хорошо, перезвоним в среду после обеда. Спасибо, хорошего дня!
```

</details>

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
| A1 | ui_fill.runtime_brief | 471 | ✓ | 0 | runtime_brief: «ShipIt — доставка. Цель — подтвердить доставку сегодня 14:00–16:00.
При однослож…» |
| A2 | ui_fill.preview_blocks | 511 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 501 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 543 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и назвать цель",
    "on_success_next": "confirm",
    "on_decline_next": "end",
    "keep_in_context": "цель",
    "drop_from_context": ""
  },
  {
    "id": "confirm",
    "title": "Подтверждение",
    "goal": "Подтвердить окно доставки 14:00–16:00",
    "on_success_next": "close",
    "on_decline_next": "callback",
    "keep_in_context": "подтверждение",
    "drop_from_context": ""
  },
  {
    "id": "close",
    "title": "Завершение",
    "goal": "Попрощаться",
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
    "id": "delivery_confirmed",
    "label": "Доставка подтверждена",
    "marks_goal_reached": true
  },
  {
    "id": "callback",
    "label": "Просит перезвонить",
    "marks_goal_reached": false
  },
  {
    "id": "declined",
    "label": "Отказ / не будет",
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
| 1 | greet | stage.turn | 543 | (пусто) | «Здравствуйте! ShipIt — подтверждаем доставку сегодня с 14:00 до 16:00. Вы будете на месте?» | stay | исходящий | 0 | ⚠ длинно (>2 предложения) |
| 2 | greet | stage.turn | 770 | Алло. | «Слышу вас. Подскажите, сегодня с двух до четырёх курьер сможет вас застать?» | stay | уточняем окно | 0 | ✓ |
| 3 | greet | stage.turn | 532 | Да. | «Отлично, доставка сегодня 14:00–16:00. Спасибо!» | stage:close | подтверждено окно | 0 | ✓ |
| 4 | close | stage.turn | 571 | Угу. | «Хорошего дня!» | end |  | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 329 | ✓ | unclear | «Абонент отвечал односложно, явного подтверждения нет» | unclear | ✓ |

**ended_reason:** end_signal | **turns:** 4

<details><summary>transcript</summary>

```
робот: Здравствуйте! ShipIt — подтверждаем доставку сегодня с 14:00 до 16:00. Вы будете на месте?
абонент: Алло.
робот: Слышу вас. Подскажите, сегодня с двух до четырёх курьер сможет вас застать?
абонент: Да.
робот: Отлично, доставка сегодня 14:00–16:00. Спасибо!
абонент: Угу.
робот: Хорошего дня!
```

</details>

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
| A1 | ui_fill.runtime_brief | 593 | ✓ | 0 | runtime_brief: «AutoSales — SaaS для автоматизации продаж. Цель — уточнить интерес к демо (30 ми…» |
| A2 | ui_fill.preview_blocks | 516 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 463 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 523 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться",
    "on_success_next": "qa",
    "on_decline_next": "end",
    "keep_in_context": "цель",
    "drop_from_context": ""
  },
  {
    "id": "qa",
    "title": "Вопросы",
    "goal": "Ответить на вопросы и уточнить интерес",
    "on_success_next": "schedule",
    "on_decline_next": "end",
    "keep_in_context": "вопросы; интерес",
    "drop_from_context": ""
  },
  {
    "id": "schedule",
    "title": "Демо",
    "goal": "Согласовать время демо",
    "on_success_next": "close",
    "on_decline_next": "end",
    "keep_in_context": "время",
    "drop_from_context": ""
  },
  {
    "id": "close",
    "title": "Завершение",
    "goal": "Попрощаться",
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

<details><summary>transcript</summary>

```
робот: Здравствуйте! AutoSales — уточняем интерес к демо нашего продукта для автоматизации продаж.
абонент: А сколько стоит?
робот: Стоимость зависит от тарифа — на демо покажем варианты под ваши задачи. Интересно посмотреть?
абонент: Есть интеграция с 1С?
робот: Детали интеграций обсудим на демо — покажем, что доступно. Ещё вопросы?
абонент: А безопасность данных?
робот: Это важный вопрос — на демо расскажем про защиту данных подробнее.
абонент: Какие кейсы у вас есть?
робот: Есть кейсы в сервисных компаниях — на встрече покажем релевантные примеры.
абонент: Поддержка 24/7?
робот: Режим поддержки уточним на демо. Если интересно — можем назначить 30 минут на этой неделе?
абонент: Ладно, давайте демо.
робот: Отлично! Предложу слот — четверг 11:00 или пятница 15:00, что удобнее?
абонент: Четверг подойдёт.
робот: Записал на четверг в 11:00. Ссылку пришлём на почту. Спасибо, хорошего дня!
```

</details>

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
| A1 | ui_fill.runtime_brief | 562 | ✓ | 0 | runtime_brief: «MarketLab — вебинар по маркетингу, 20 сентября.
Цель — пригласить на вебинар. Пр…» |
| A2 | ui_fill.preview_blocks | 579 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 549 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 485 | ✓ | 0 | 4 вердиктов |

**Этапы:**
```json
[
  {
    "id": "greet",
    "title": "Контакт",
    "goal": "Представиться и назвать цель",
    "on_success_next": "invite",
    "on_decline_next": "polite_end",
    "keep_in_context": "цель",
    "drop_from_context": ""
  },
  {
    "id": "invite",
    "title": "Приглашение",
    "goal": "Рассказать о вебинаре и предложить регистрацию",
    "on_success_next": "polite_end",
    "on_decline_next": "polite_end",
    "keep_in_context": "интерес",
    "drop_from_context": ""
  },
  {
    "id": "polite_end",
    "title": "Завершение",
    "goal": "Попрощаться",
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
    "label": "Согласился на вебинар",
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
| 1 | greet | stage.turn | 660 | (пусто) | «Здравствуйте! MarketLab — приглашаем на бесплатный вебинар по маркетингу, двадцатого сентября.» | stay | исходящий | 0 | ✓ |
| 2 | greet | stage.turn | 569 | Не интересно. | «Понял, спасибо за ответ. Хорошего дня!» | end | абонент отказался сразу | 0 | ✓ |

| prompt_id | latency_ms | parse_ok | verdict_id | reason | expected ≈ | match |
|-----------|------------|----------|------------|--------|------------|-------|
| verdict.classify | 380 | ✓ | declined | «Абонент сразу отказался от вебинара» | declined | ✓ |

**ended_reason:** end_signal | **turns:** 2

<details><summary>transcript</summary>

```
робот: Здравствуйте! MarketLab — приглашаем на бесплатный вебинар по маркетингу, двадцатого сентября.
абонент: Не интересно.
робот: Понял, спасибо за ответ. Хорошего дня!
```

</details>

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
- **C-12 (не сейчас):** переход на этап callback, фиксирует «среда после обеда через неделю».
- **C-13 (минимум слов):** уточняет окно при «алло»/«да»; verdict unclear — односложные ответы без явного «подтверждаю».
- **C-14 (много вопросов):** не выдумывает цены/интеграции, перенаправляет на демо; 8 ходов до согласования.
- **C-15 (отказ сразу):** не уговаривает после «не интересно», end за 2 хода.
