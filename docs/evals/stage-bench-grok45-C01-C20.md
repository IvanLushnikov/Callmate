# Stage LLM Bench — cursor-grok-4.5-high-fast | C-01..C-20
> Дата: 2026-08-28 · Repo: New/ · Промпты: docs/prompts/ · Pipeline: A1–A4 → stage.turn → verdict.classify
> Модель-специфика: **C-13** invalid JSON на коротких репликах; **C-20** fabricated facts при пустом brief.

---

## C-01 | Модель: cursor-grok-4.5-high-fast | Запись на консультацию

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | запись на консультацию |
| details | Стоматологическая клиника. Предложить запись на первичную консультацию. Свободные слоты: вторник 10:00, среда 14:00, … |
| company_name | Белый зуб |
| persona | нейтральный клиент |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 412 | ✓ | 0 | runtime_brief: «Клиника «Белый зуб». Запись на первичную консультацию. Слоты: вт 10:00…» |
| A2 | ui_fill.preview_blocks | 388 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 521 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 305 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 548 | (пусто) | «Здравствуйте! Клиника «Белый зуб». Звоним предложить запись на консультацию — удобно минут…» | stay | ✓ |
| 2 | greet | 502 | Да, слушаю. | «Свободны вторник 10:00, среда 14:00 или пятница 11:30. Что удобнее?» | stage:offer_slots | ✓ |
| 3 | offer_slots | 489 | Среду после обеда. | «Записываю на среду 14:00, ул. Ленина, 15. Подходит?» | stage:confirm | ✓ |
| 4 | confirm | 461 | Да, записывайте. | «Готово: среда 14:00, ул. Ленина, 15. Спасибо!» | stage:polite_end | ✓ |
| 5 | polite_end | 412 | Спасибо. | «Всего доброго, до свидания!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 298 | booked | «Абонент записался на среду 14:00» | booked | ✓ |

**ended_reason:** end_signal | **turns:** 5

---

## C-02 | Модель: cursor-grok-4.5-high-fast | Напоминание о визите

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | напомнить о визите завтра |
| details | Медцентр. Визит завтра в 09:30, каб. 204, адрес пр. Мира, 8. Можно предложить перенос на четверг 15:00 или пятницу 10… |
| company_name | Медцентр Здоровье |
| persona | занятый клиент |
| attributes | {"name": "Алексей"} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 398 | ✓ | 0 | runtime_brief: «Медцентр «Здоровье». Напомнить о визите завтра 09:30, каб. 204, пр. Ми…» |
| A2 | ui_fill.preview_blocks | 371 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 498 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 289 | ✓ | 0 | 5 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 521 | (пусто) | «Здравствуйте, Алексей! Медцентр «Здоровье». Напоминаем о визите завтра — удобно?» | stay | ✓ |
| 2 | greet | 487 | Да. | «Завтра в 09:30, каб. 204, пр. Мира, 8. Подтверждаете?» | stage:remind | ✓ |
| 3 | remind | 475 | Да, буду. | «Отлично, ждём вас завтра в 09:30. Хорошего дня!» | stage:close | ✓ |
| 4 | close | 401 | Спасибо. | «До свидания!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 312 | confirmed | «Визит завтра 09:30 подтверждён» | confirmed | ✓ |

**ended_reason:** end_signal | **turns:** 4

---

## C-03 | Модель: cursor-grok-4.5-high-fast | Сбор обратной связи (NPS)

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
| A1 | ui_fill.runtime_brief | 405 | ✓ | 0 | runtime_brief: «FoodBox, доставка еды. Узнать удовлетворённость последним заказом. Без…» |
| A2 | ui_fill.preview_blocks | 392 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 468 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 278 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 498 | (пусто) | «Здравствуйте! FoodBox. Короткий вопрос по последнему заказу — удобно?» | stay | ✓ |
| 2 | greet | 512 | Да. | «Насколько вы довольны — по шкале от 0 до 10?» | stage:ask | ✓ |
| 3 | ask | 476 | Восьмёрка. | «Спасибо, зафиксировали 8 из 10. Хорошего дня!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 291 | feedback_collected | «Оценка 8 из 10 получена» | feedback_collected | ✓ |

**ended_reason:** end_signal | **turns:** 3

---

## C-04 | Модель: cursor-grok-4.5-high-fast | Подтверждение доставки

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
| A1 | ui_fill.runtime_brief | 421 | ✓ | 0 | runtime_brief: «FastShip. Подтвердить доставку набора посуды сегодня 18:00–20:00. Сумм…» |
| A2 | ui_fill.preview_blocks | 385 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 502 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 301 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 534 | (пусто) | «Здравствуйте! FastShip. Звоним подтвердить доставку сегодня с 18:00 до 20:00 — удобно?» | stay | ✓ |
| 2 | greet | 491 | Да, я дома. | «Заказ — набор посуды, окно 18:00–20:00. Адрес и время верны?» | stage:confirm | ✓ |
| 3 | confirm | 458 | Да, всё верно. | «Спасибо, курьер приедет в это окно. До свидания!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 305 | delivery_confirmed | «Адрес и окно 18–20 подтверждены» | delivery_confirmed | ✓ |

**ended_reason:** end_signal | **turns:** 3

---

## C-05 | Модель: cursor-grok-4.5-high-fast | Напоминание об оплате

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
| A1 | ui_fill.runtime_brief | 389 | ✓ | 0 | runtime_brief: «EduPro. Напомнить об оплате курса «Аналитика данных», просрочка 3 дня.…» |
| A2 | ui_fill.preview_blocks | 402 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 488 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 295 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 556 | (пусто) | «Здравствуйте! EduPro. Напоминаем про оплату курса «Аналитика данных» — удобно минутку?» | stay | ✓ |
| 2 | greet | 523 | А, да, забыл. | «Счёт просрочен на три дня. Можете оплатить в ближайшее время?» | stage:remind | ✓ |
| 3 | remind | 501 | Сегодня вечером переведу. | «Хорошо, ждём оплату сегодня вечером. Спасибо!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 318 | payment_promised | «Обещал оплатить сегодня вечером» | payment_promised | ✓ |

**ended_reason:** end_signal | **turns:** 3

---

## C-06 | Модель: cursor-grok-4.5-high-fast | Приглашение на собеседование

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | пригласить на собеседование |
| details | IT-компания, вакансия middle Python-разработчик. Собеседование онлайн, понедельник 11:00 или вторник 16:00. Ссылку пр… |
| company_name | DevTeam |
| persona | кандидат |
| attributes | {"name": "Мария"} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 415 | ✓ | 0 | runtime_brief: «DevTeam. Вакансия middle Python. Собеседование онлайн: пн 11:00 или вт…» |
| A2 | ui_fill.preview_blocks | 378 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 512 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 288 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 509 | (пусто) | «Здравствуйте, Мария! DevTeam. По вакансии middle Python — приглашаем на собеседование. Удо…» | stay | ✓ |
| 2 | greet | 487 | Да, интересно. | «Есть понедельник 11:00 или вторник 16:00, онлайн. Что удобнее?» | stage:schedule | ✓ |
| 3 | schedule | 472 | Вторник 16:00. | «Отлично, вторник 16:00 — ссылку пришлём на почту. До связи!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 287 | interview_scheduled | «Собеседование вт 16:00 онлайн» | interview_scheduled | ✓ |

**ended_reason:** end_signal | **turns:** 3

---

## C-07 | Модель: cursor-grok-4.5-high-fast | B2B лид — демо SaaS

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | уточнить интерес к демо продукта |
| details | SaaS для учёта заявок в сервисных компаниях. Уточнить, актуален ли интерес к демо на 30 минут. Не обещать функции, ко… |
| company_name | TicketFlow |
| persona | ЛПР, осторожный |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 432 | ✓ | 0 | runtime_brief: «TicketFlow, SaaS учёта заявок. Уточнить интерес к демо 30 мин. Не обещ…» |
| A2 | ui_fill.preview_blocks | 401 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 534 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 312 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 568 | (пусто) | «Здравствуйте! TicketFlow. Звоним уточнить интерес к короткому демо — удобно?» | stay | ✓ |
| 2 | greet | 541 | Какие интеграции? | «В брифе только учёт заявок и демо на 30 минут; детали интеграций уточнит менеджер на демо.…» | stage:qualify | ✓ |
| 3 | qualify | 498 | Ладно, давайте демо. | «Хорошо, передадим на согласование слота демо. Спасибо!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 334 | demo_scheduled | «Согласие на демо, слот передадут» | demo_scheduled | ✓ |

**ended_reason:** end_signal | **turns:** 3

---

## C-08 | Модель: cursor-grok-4.5-high-fast | Продление подписки

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | напомнить о продлении подписки |
| details | Подписка на CRM истекает через 5 дней. Тариф «Бизнес» — 4900 ₽/мес при годовой оплате. Предложить продление, без давл… |
| company_name | SalesCRM |
| persona | действующий клиент |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 401 | ✓ | 0 | runtime_brief: «SalesCRM. Подписка «Бизнес» истекает через 5 дней, 4900 ₽/мес при годо…» |
| A2 | ui_fill.preview_blocks | 389 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 476 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 291 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 512 | (пусто) | «Здравствуйте! SalesCRM. Подписка «Бизнес» истекает через 5 дней — удобно обсудить продлени…» | stay | ✓ |
| 2 | greet | 534 | Сейчас некогда, перезвоните завтра. | «Хорошо, перезвоним завтра. Всего доброго!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 276 | callback | «Просит перезвонить завтра» | callback | ✓ |

**ended_reason:** end_signal | **turns:** 2

---

## C-09 | Модель: cursor-grok-4.5-high-fast | Приглашение на вебинар

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
| A1 | ui_fill.runtime_brief | 388 | ✓ | 0 | runtime_brief: «FinSchool. Вебинар «Налоги для ИП» 12 сентября 19:00 МСК. Регистрация …» |
| A2 | ui_fill.preview_blocks | 365 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 455 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 284 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 489 | (пусто) | «Здравствуйте! FinSchool. Приглашаем на вебинар «Налоги для ИП» 12 сентября в 19:00 — интер…» | stay | ✓ |
| 2 | greet | 471 | Да, запишите. | «Отлично, ссылку на регистрацию пришлём в SMS. До встречи!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 301 | registered | «Согласие на регистрацию, SMS» | registered | ✓ |

**ended_reason:** end_signal | **turns:** 2

---

## C-10 | Модель: cursor-grok-4.5-high-fast | Короткий опрос

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
| A1 | ui_fill.runtime_brief | 395 | ✓ | 0 | runtime_brief: «ServicePlus. Короткий опрос: качество обслуживания и готовность рекоме…» |
| A2 | ui_fill.preview_blocks | 372 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 461 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 279 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 502 | (пусто) | «Здравствуйте! ServicePlus. Два коротких вопроса об обслуживании — можно?» | stay | ✓ |
| 2 | greet | 488 | Да. | «Как оцените качество? И порекомендовали бы нас знакомым?» | stage:survey | ✓ |
| 3 | survey | 456 | Хорошо, да, порекомендую. | «Спасибо за ответы, хорошего дня!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 288 | survey_done | «Опрос из 2 вопросов пройден» | survey_done | ✓ |

**ended_reason:** end_signal | **turns:** 3

---

## C-11 | Модель: cursor-grok-4.5-high-fast | Агрессивный абонент

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
| A1 | ui_fill.runtime_brief | 408 | ✓ | 0 | runtime_brief: «Клиника. Запись: среда 12:00, четверг 17:00.…» |
| A2 | ui_fill.preview_blocks | 391 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 479 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 302 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 531 | (пусто) | «Здравствуйте! Клиника. Предлагаем запись на приём — удобно минутку?» | stay | ✓ |
| 2 | greet | 498 | Опять звоните! Мне некогда! | «Понимаю, неудобно. Не буду задерживать — всего доброго.» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 269 | declined | «Абонент раздражён, отказался говорить» | declined | ✓ |

**ended_reason:** end_signal | **turns:** 2

---

## C-12 | Модель: cursor-grok-4.5-high-fast | Не сейчас

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
| A1 | ui_fill.runtime_brief | 417 | ✓ | 0 | runtime_brief: «HRSoft, SaaS для HR. Демо 20 минут. Уточнить интерес.…» |
| A2 | ui_fill.preview_blocks | 383 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 492 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 294 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 545 | (пусто) | «Здравствуйте! HRSoft. Коротко про демо на 20 минут — удобно сейчас?» | stay | ✓ |
| 2 | greet | 512 | Сейчас неудобно. | «Поняла. Можем перезвонить через неделю?» | stay | ✓ |
| 3 | greet | 478 | Да, через неделю. | «Хорошо, перезвоним через неделю. До связи!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 315 | callback | «Просит перезвонить через неделю» | callback | ✓ |

**ended_reason:** end_signal | **turns:** 3

---

## C-13 | Модель: cursor-grok-4.5-high-fast | Минимум слов

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
| A1 | ui_fill.runtime_brief | 426 | ✓ | 0 | runtime_brief: «ShipIt. Подтвердить доставку сегодня 14:00–16:00.…» |
| A2 | ui_fill.preview_blocks | 399 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 518 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 308 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 612 | (пусто) | «Здравствуйте! ShipIt. Звоним подтвердить доставку сегодня с 14 до 16 — алло?» | stay | ✓ |
| 2 | greet | 687 | Алло. | «» | stay | ✗ invalid JSON / неверный next |
| 3 | greet | 598 | Да. | «Окно доставки сегодня 14:00–16:00. Вы будете на месте?» | stay | ✓ |
| 4 | greet | 521 | Угу. | «Спасибо, считаем подтверждённым. До свидания!» | end | ✓ |

> ⚠ MODEL-SPECIFIC: stage.turn вернул prose+broken next на короткие «алло»/тишину; 1 retry

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 342 | unclear | «Минимум слов, подтверждение неоднозначно» | unclear | ✓ |

**ended_reason:** end_signal | **turns:** 4 | **critical:** invalid JSON turn 2

---

## C-14 | Модель: cursor-grok-4.5-high-fast | Много вопросов B2B

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
| A1 | ui_fill.runtime_brief | 441 | ✓ | 0 | runtime_brief: «AutoSales, SaaS автоматизации продаж. Демо 30 мин. Без обещания интегр…» |
| A2 | ui_fill.preview_blocks | 418 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 556 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 321 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 578 | (пусто) | «Здравствуйте! AutoSales. Уточняем интерес к демо на 30 минут — удобно?» | stay | ✓ |
| 2 | greet | 601 | Сколько стоит? | «Цену на звонке не озвучиваю — расскажут на демо. Ещё вопросы или запишем демо?» | stay | ✓ |
| 3 | greet | 589 | Есть интеграция с 1С? | «В брифе только демо 30 мин; интеграции уточнит менеджер. Актуально демо?» | stay | ✓ |
| 4 | greet | 572 | А безопасность данных? | «Детали безопасности — на демо. Готовы выбрать время?» | stay | ✓ |
| 5 | greet | 561 | Какие кейсы? | «Кейсы покажут на встрече. Зафиксируем демо?» | stay | ✓ |
| 6 | greet | 548 | Поддержка 24/7? | «Режим поддержки уточнят на демо. Назначим слот?» | stay | ✓ |
| 7 | greet | 519 | Ладно, давайте демо. | «Отлично, передадим на согласование демо. Спасибо!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 356 | demo_scheduled | «После 5+ вопросов согласился на демо» | demo_scheduled | ✓ |

**ended_reason:** end_signal | **turns:** 7

---

## C-15 | Модель: cursor-grok-4.5-high-fast | Отказ сразу

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
| A1 | ui_fill.runtime_brief | 379 | ✓ | 0 | runtime_brief: «MarketLab. Вебинар по маркетингу 20 сентября. Пригласить.…» |
| A2 | ui_fill.preview_blocks | 361 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 442 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 271 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 488 | (пусто) | «Здравствуйте! MarketLab. Приглашаем на вебинар по маркетингу 20 сентября — интересно?» | stay | ✓ |
| 2 | greet | 412 | Не интересно. Не звоните. | «Поняла, больше не будем беспокоить. Всего доброго.» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 258 | declined | «Сразу отказ, просит не звонить» | declined | ✓ |

**ended_reason:** end_signal | **turns:** 2

---

## C-16 | Модель: cursor-grok-4.5-high-fast | Согласие сразу

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
| A1 | ui_fill.runtime_brief | 386 | ✓ | 0 | runtime_brief: «MedLine. Запись: понедельник 9:00, вторник 15:00.…» |
| A2 | ui_fill.preview_blocks | 358 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 449 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 275 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 467 | (пусто) | «Здравствуйте! MedLine. Предлагаем запись на консультацию — удобно?» | stay | ✓ |
| 2 | greet | 441 | Да, записывайте. | «Есть понедельник 9:00 или вторник 15:00. Что выбрать?» | stage:book | ✓ |
| 3 | book | 428 | Понедельник утром. | «Записала на понедельник 9:00. Спасибо, до свидания!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 281 | booked | «Быстрое согласие, пн 9:00» | booked | ✓ |

**ended_reason:** end_signal | **turns:** 3

---

## C-17 | Модель: cursor-grok-4.5-high-fast | Без имени в attributes

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
| A1 | ui_fill.runtime_brief | 402 | ✓ | 0 | runtime_brief: «StomPro. Запись: среда 10:00, пятница 14:00. Имени в attributes нет.…» |
| A2 | ui_fill.preview_blocks | 377 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 471 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 286 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 514 | (пусто) | «Здравствуйте! StomPro. Звоним по записи на консультацию — удобно?» | stay | ✓ |
| 2 | greet | 492 | Да. | «Свободны среда 10:00 или пятница 14:00. Что удобнее?» | stage:book | ✓ |
| 3 | book | 468 | Пятница. | «Записываю на пятницу 14:00. Хорошего дня!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 297 | booked | «Запись на пятницу 14:00 без обращения по имени» | booked | ✓ |

**ended_reason:** end_signal | **turns:** 3

---

## C-18 | Модель: cursor-grok-4.5-high-fast | С именем в attributes

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
| A1 | ui_fill.runtime_brief | 391 | ✓ | 0 | runtime_brief: «StomPro. Запись: четверг 11:00, пятница 16:00. Обращение {{name}}.…» |
| A2 | ui_fill.preview_blocks | 369 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 458 | ✓ | 0 | 3 этапов |
| A4 | ui_fill.goal_verdicts | 282 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 503 | (пусто) | «Здравствуйте, Иван! StomPro. Предлагаем запись — удобно минутку?» | stay | ✓ |
| 2 | greet | 481 | Да, слушаю. | «Четверг 11:00 или пятница 16:00 — что выбрать?» | stage:book | ✓ |
| 3 | book | 459 | Четверг. | «Готово: четверг 11:00. До встречи, Иван!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 290 | booked | «Запись чт 11:00, имя из attributes» | booked | ✓ |

**ended_reason:** end_signal | **turns:** 3

---

## C-19 | Модель: cursor-grok-4.5-high-fast | Длинный бриф

**Клиент заполнил:**
| Поле | Значение |
|------|----------|
| goal | напомнить о продлении подписки |
| details | Подписка на облачную бухгалтерию для ИП. Истекает через 7 дней. Тариф «Стандарт»: 3500 руб/мес при помесячной оплате … |
| company_name | BuhCloud |
| persona | действующий клиент |
| attributes | {} |

**После Save (A1–A4):**
| Шаг | prompt_id | latency_ms | parse_ok | retry | Краткий результат |
|-----|-----------|------------|----------|-------|-------------------|
| A1 | ui_fill.runtime_brief | 468 | ✓ | 0 | runtime_brief: «BuhCloud. Продление бухгалтерии ИП через 7 дней. Тариф Стандарт 3500/м…» |
| A2 | ui_fill.preview_blocks | 421 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 589 | ✓ | 0 | 4 этапов |
| A4 | ui_fill.goal_verdicts | 341 | ✓ | 0 | 5 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 612 | (пусто) | «Здравствуйте! BuhCloud. Подписка истекает через 7 дней — удобно обсудить продление?» | stay | ✓ |
| 2 | greet | 598 | Сколько стоит? | «Тариф «Стандарт»: 3500 в месяц или 35000 в год. Хотите продлить?» | stage:offer | ✓ |
| 3 | offer | 571 | Годовая нормально, продлите. | «Зафиксирую намерение продлить на год; детали оплаты уточнит бухгалтерия. Спасибо!» | end | ✓ |

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 328 | renewal_promised | «Намерение продлить на год зафиксировано» | renewal_promised | ✓ |

**ended_reason:** end_signal | **turns:** 3

---

## C-20 | Модель: cursor-grok-4.5-high-fast | Короткий бриф

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
| A1 | ui_fill.runtime_brief | 371 | ✓ | 0 | runtime_brief: «Цель: узнать удовлетворённость. Компания и детали не заданы. Не выдумы…» |
| A2 | ui_fill.preview_blocks | 348 | ✓ | 0 | greeting/says/replies/tone |
| A3 | ui_fill.stages_from_brief | 402 | ✓ | 0 | 2 этапов |
| A4 | ui_fill.goal_verdicts | 261 | ✓ | 0 | 4 вердиктов |

### B. Ходы (сокр.)

| turn | stage_id | latency_ms | subscriber | robot | next | оценка |
|------|----------|------------|------------|-------|------|--------|
| 1 | greet | 534 | (пусто) | «Здравствуйте! Звоним узнать, насколько вы довольны сервисом — удобно коротко ответить?» | stay | ✓ |
| 2 | greet | 512 | Ну да. | «Оцените, пожалуйста, от 1 до 10?» | stay | ✓ |
| 3 | greet | 589 | Семь. | «Отлично! Могу также предложить слот на консультацию — вторник 10:00 или среда 14:00?» | stay | ⚠ выдуман факт |
| 4 | greet | 478 | Не надо, только оценка. | «Поняла, зафиксировали 7. Спасибо, до свидания!» | end | ✓ |

> ⚠ MODEL-SPECIFIC: при пустом details выдумал слоты консультации (чужая цель/память)

### C. Финал

| prompt_id | latency_ms | verdict_id | reason | expected ≈ | match |
|-----------|------------|------------|--------|------------|-------|
| verdict.classify | 319 | feedback_collected | «Оценка 7 собрана; лишнее предложение слотов» | feedback_collected | ✓ |

**ended_reason:** end_signal | **turns:** 4 | **critical:** fabricated slots on empty brief

---

## Сводка модели: cursor-grok-4.5-high-fast

| Метрика | Значение |
|---------|----------|
| A1–A4 parse_ok % | 100% (80/80) |
| stage.turn parse_ok % | 98.5% (64/65) |
| avg turn ms | 513 |
| p95 turn ms | 601 |
| avg turns / кейс | 3.2 |
| verdict match % | 100% (20/20) |
| critical errors | **2** |

### По кейсам

| # | verdict | match | turns | avg ms | notes |
|---|---------|-------|-------|--------|-------|
| C-01 | booked | ✓ | 5 | 482 | — |
| C-02 | confirmed | ✓ | 4 | 471 | — |
| C-03 | feedback_collected | ✓ | 3 | 495 | — |
| C-04 | delivery_confirmed | ✓ | 3 | 494 | — |
| C-05 | payment_promised | ✓ | 3 | 527 | — |
| C-06 | interview_scheduled | ✓ | 3 | 489 | — |
| C-07 | demo_scheduled | ✓ | 3 | 536 | — |
| C-08 | callback | ✓ | 2 | 523 | — |
| C-09 | registered | ✓ | 2 | 480 | — |
| C-10 | survey_done | ✓ | 3 | 482 | — |
| C-11 | declined | ✓ | 2 | 514 | — |
| C-12 | callback | ✓ | 3 | 512 | — |
| C-13 | unclear | ✓ | 4 | 604 | invalid JSON turn 2 |
| C-14 | demo_scheduled | ✓ | 7 | 567 | — |
| C-15 | declined | ✓ | 2 | 450 | — |
| C-16 | booked | ✓ | 3 | 445 | — |
| C-17 | booked | ✓ | 3 | 491 | — |
| C-18 | booked | ✓ | 3 | 481 | — |
| C-19 | renewal_promised | ✓ | 3 | 594 | — |
| C-20 | feedback_collected | ✓ | 4 | 528 | fabricated slots on empty brief |

### Model-specific issues

1. **C-13 (минимум слов):** `stage.turn` вернул невалидный JSON (prose вместо контракта / битый `next`) на реплику «Алло.» — retry помог. Характерно для короткого ASR-шума.
2. **C-20 (пустой brief):** при goal=удовлетворённость и пустом details модель **выдумала слоты** «вторник 10:00 / среда 14:00» (вероятно bleed из C-01). Critical: fabricated fact.
3. Latency: avg turn ~540 ms — быстрее composer, чуть медленнее grok-4.6.
4. JSON в целом стабилен на A1–A4 (100%); единственный fail — stage.turn на C-13.
