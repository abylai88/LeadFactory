# API

Base: `http://127.0.0.1:3001/api`. JSON. Приложение локальное, authentication отсутствует.

| Метод | Путь | Назначение |
|---|---|---|
| GET | /health | Проверка NestJS и PostgreSQL |
| GET | /niches | Доступные niche id/label из Python |
| GET, POST | /workspaces | Список / создание `{name}` |
| GET, PATCH, DELETE | /workspaces/:w | Просмотр / переименование `{name}` / удаление пространства и всех его данных |
| GET, POST | /workspaces/:w/companies | Список / создание компании |
| GET, PATCH, DELETE | /workspaces/:w/companies/:id | Просмотр / изменение / удаление компании и её лидов |
| GET | /workspaces/:w/leads | Лиды с компанией |
| POST | /workspaces/:w/companies/:id/leads | Создать лид для компании |
| PATCH, DELETE | /workspaces/:w/leads/:id | Изменить / удалить лид |
| POST | /workspaces/:w/search | `{niche, city, limit: 1..50}`; синхронно, до 150 с |
| GET | /workspaces/:w/searches | Последние 25 поисков |
| POST | /workspaces/:w/companies/:id/enrich | `{}`; контакты, description, pages, warnings |

Списки companies/leads: `?page=1&limit=20&q=...`; leads также `status=NEW|QUALIFIED|CONTACTED|CONVERTED|LOST`. Ответ `{items,total,page,limit}`; maximum limit 100.

Company: обязательное `name`; опциональные `website` (http/https), `industry`, `city`, `country`, `description`. PATCH допускает null для очистки опциональных полей. Нельзя передавать workspaceId/sourceId через ручной company endpoint.

Lead: `firstName`, `lastName`, `email`, `phone`, `jobTitle`, `source` (URL), `status`. Хотя бы имя/фамилия/email/телефон должно быть непустым. Один нормализованный email или phone на компанию. Публичные контакты без имени сохраняются без вымышленных имён и должностей.

HTTP 400: validation; 404: объект не принадлежит этому workspace или не найден; 409: duplicate/busy; 502: недоступен Python/provider. Неуспешный поиск сохраняется в SearchRun. Сбой внутри транзакции откатывает весь импорт. Повторный поиск не перезаписывает правки оператора.

Пример PowerShell:

```powershell
$base = 'http://127.0.0.1:3001/api'
$space = Invoke-RestMethod "$base/workspaces" -Method Post -ContentType 'application/json' -Body '{"name":"Мой проект"}'
$body = @{ niche='accounting'; city='Алматы, Казахстан'; limit=20 } | ConvertTo-Json
Invoke-RestMethod "$base/workspaces/$($space.id)/search" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -TimeoutSec 160
Invoke-RestMethod "$base/workspaces/$($space.id)/companies?limit=20"
```

Python direct API: GET /health, GET /niches, POST /search, POST /enrich `{url}`; Swagger `/docs`. Python не пишет в базу; сохранение и дедупликация принадлежат NestJS.
