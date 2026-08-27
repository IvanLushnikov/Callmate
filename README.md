# Callmate

Публичный интерфейс кабинета Callmate.

Это только морда. Серверная логика и внутренняя документация живут в закрытой репе продукта.

## Демо (GitHub Pages)

https://ivanlushnikov.github.io/Callmate/

Вход без API (stub):

| Логин | Пароль | Куда |
|---|---|---|
| любой непустой | любой непустой | личный кабинет |
| `locked` | любой | кабинет с баннером «доступ ограничен» |
| `admin` | `admin` | админка |

## Локальный запуск

Статический каркас (без сборщика):

```bash
cd /Users/ivanlusnikov/Callmate
python3 -m http.server 5173
```

Откройте `http://127.0.0.1:5173/`. Базовый URL API — `window.CALLMATE_API_BASE` или `.env` (см. `.env.example`).
