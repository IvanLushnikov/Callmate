# Scorix

Публичный интерфейс кабинета Scorix.

Это только морда. Серверная логика и внутренняя документация живут в закрытой репе продукта.

## Демо (GitHub Pages)

https://ivanlushnikov.github.io/Scorix/

Вход без API (stub):

| Логин | Пароль | Куда |
|---|---|---|
| любой непустой | любой непустой | личный кабинет |
| `locked` | любой | кабинет с баннером «доступ ограничен» |
| `admin` | `admin` | админка |

## Локальный запуск

Статический каркас (без сборщика):

```bash
cd /Users/ivanlusnikov/Scorix
python3 scripts/dev-server.py 8765
```

Откройте `http://127.0.0.1:8765/`. Dev-сервер проксирует `/api/*` на `scorix-api.onrender.com` — иначе с localhost вход блокирует CORS.

Обычный `python3 -m http.server` — только для stub-режима без API (уберите `SCORIX_API_BASE` в `index.html`).
