# Результаты проверки — 08.10.2026

## Автоматические проверки

| Проверка | Результат |
|---|---|
| Python pytest | 15 passed |
| NestJS unit Jest | 1 passed |
| PostgreSQL integration Jest | 11 passed, 2 suites |
| Prisma generate | Клиент 7.10.0 успешно сгенерирован |
| Prisma migrate deploy | Применены первоначальная и новая additive-миграции |
| Prisma migrate status | Database schema is up to date |
| NestJS production build | Успешно |
| Next.js 16.4 production build / TypeScript | Успешно, static route / |
| npm audit backend после overrides | 0 vulnerabilities |
| npm install root/frontend | 0 vulnerabilities |

Проверки выполнялись на Windows x64, Node.js 24.21.0, Python 3.12.14 и настоящем PostgreSQL 18.4. Docker отсутствует и не тестировался.

Покрытие: создание и редактирование сущностей, обязательные поля и URL, whitelist, ограничения пагинации, workspace scoping, dedup email, статусы, idempotent import, сохранение ручных правок, отказ внешнего источника, rollback всей транзакции, каскадное удаление, OSM mapping/cache, отсутствие генерации контактов, robots.txt и SSRF/private/mixed DNS.

В PostgreSQL integration внешний provider подменяется явными тестовыми fixtures; эти записи очищаются по ID созданных тестами пространств. Это не доказательство доступности внешнего источника. Для него выполнены отдельные живые проверки ниже.

## Живые проверки

1. Через NestJS POST /api/workspaces/:w/search отправлен `{niche:"software",city:"Berlin, Germany",limit:10}`. Python обратился к Nominatim и Overpass. Ответ: count=10, location=Berlin, Deutschland, ODbL attribution.
2. GET /companies подтвердил сохранение 10 записей, у каждой — OSM source URL. Примеры: [geoSYS](https://www.openstreetmap.org/node/1478905250), [Das Büro am Draht](https://www.openstreetmap.org/node/1325353373), [OPTIMAL SYSTEMS](https://www.openstreetmap.org/node/972412931).
3. Из OSM получено 8 контактных записей. Это опубликованные email/телефоны, а не проверенные лица или сделки.
4. Для geoSYS и Das Büro am Draht выполнен реальный обход сайтов: обработаны страницы, новых контактов не найдено. Das Büro am Draht получил описание из meta description.
5. Для OPTIMAL SYSTEMS обработаны главная страница и [контактная страница](https://www.optimal-systems.de/unternehmen/kontakt). Извлечены 14 email, сохранены source URL. Эти email относятся к разным офисам группы, не только к Берлину.
6. Повторный поиск вернул count=10; в базе осталось 10 компаний и 22 контакта — дубли не добавлены.
7. В браузере проверены загрузка workspace, таблица компаний, атрибуция, счётчики, ссылки и кнопка enrichment. Внешний вид страницы проверен снимком экрана.

В истории сохранён также первый FAILED запуск, когда sandbox запрещал внешний доступ. После разрешения сетевого доступа поиск завершился успешно. Ошибка не была скрыта или заменена вымышленными данными.

## Замечания

- Полнота и актуальность OSM не гарантируются. Например, радиус поиска Berlin включает некоторые пригороды.
- Источник подтверждает происхождение строки контакта, не текущую принадлежность, доставляемость или согласие на коммуникацию.
- В отрицательном тесте намеренно вызывается Prisma validation error для проверки rollback; итог теста успешный.
- Python TestClient выдаёт одно deprecation warning об httpx; функционального сбоя нет.

## Проверка установки Windows

Полный scripts/setup.ps1 выполнен через Windows PowerShell: установка Python по requirements-lock.txt, npm ci по трём lock-файлам, Prisma generate, сборки NestJS и Next.js. Exit code 0. Все три npm dependency tree — 0 известных уязвимостей на момент установки. pip check: No broken requirements found.

