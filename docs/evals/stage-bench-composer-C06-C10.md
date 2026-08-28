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
| A1 | ui_fill.runtime_brief | 487 | ✓ | 0 | runtime_brief: «Компания TicketFlow, SaaS для учёта заявок в сервисных компаниях.
Цель — уточнит…» |
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
| A1 | ui_fill.runtime_brief | 487 | ✓ | 0 | runtime_brief: «['Компания SalesCRM, CRM-подписка. Цель — напомнить о продлении подписки.\nПодпи…» |
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
| A1 | ui_fill.runtime_brief | 487 | ✓ | 0 | runtime_brief: «['Компания FinSchool. Цель — пригласить на вебинар «Налоги для ИП».\nДата: 12 се…» |
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
| A1 | ui_fill.runtime_brief | 487 | ✓ | 0 | runtime_brief: «['Компания ServicePlus. Цель — короткий опрос по услуге, 2 вопроса:\n1) качество…» |
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
| stage.turn parse_ok | 18/18 (100%) |
| avg turn ms | 641 |
| p95 turn ms | 719 |
| verdict match | 5/5 (100%) |
| critical errors | 0 |

