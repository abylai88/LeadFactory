# GitHub, лицензии и выбор компонентов

Проверка первичных страниц репозиториев и LICENSE: 08.10.2026. Лицензия кода не предоставляет дополнительных прав на собираемые данные.

| Репозиторий | Лицензия / коммерческое использование | Решение |
|---|---|---|
| [scrapy/parsel](https://github.com/scrapy/parsel) | [BSD-3-Clause](https://github.com/scrapy/parsel/blob/master/LICENSE): коммерческое использование разрешено при сохранении notices и без endorsement | Используется parsel 1.10.0 для HTML/CSS/XPath extraction; библиотека из экосистемы Scrapy |
| [encode/httpx](https://github.com/encode/httpx) | [BSD-3-Clause](https://github.com/encode/httpx/blob/master/LICENSE.md): коммерческое использование разрешено при соблюдении notices | Используется httpx 0.28.1 для OpenStreetMap providers |
| [leinelissen/embedded-postgres](https://github.com/leinelissen/embedded-postgres) | MIT для обёртки, upstream binaries имеют отдельные notices; PostgreSQL License для PostgreSQL | Используется 18.4.0-beta.17, запускает настоящий PostgreSQL 18.4; MIT проверена в установленном LICENSE.md |
| [Dukotah/leadgen](https://github.com/Dukotah/leadgen) | [MIT](https://github.com/Dukotah/leadgen/blob/main/LICENSE), коммерческое использование разрешено с сохранением notices | Подходящий специализированный no-key discovery проект. Рассмотрен как альтернатива/будущий источник провайдеров; код не копировался, второй CLI/GUI не подключён |
| [professai/leadforge](https://github.com/professai/leadforge) | [MIT](https://github.com/professai/leadforge/blob/main/LICENSE), коммерческое использование разрешено с сохранением notices | Полный discovery/enrichment/outreach pipeline. Не подключён: в MVP нужна существующая CRM и отсутствие внешних ключей/рассылок |
| [scrapy/scrapy](https://github.com/scrapy/scrapy) | [BSD-3-Clause](https://github.com/scrapy/scrapy/blob/master/LICENSE), коммерческое использование разрешено | Пригоден для массового crawling; используем его самостоятельную библиотеку Parsel, без Twisted engine |
| [microsoft/playwright](https://github.com/microsoft/playwright) | [Apache-2.0](https://github.com/microsoft/playwright/blob/main/LICENSE), допускает коммерческое использование; сохранить LICENSE/NOTICE | Возможный следующий шаг для JS-сайтов. Browser binaries в MVP не обязательны |
| [unclecode/crawl4ai](https://github.com/unclecode/crawl4ai) | Apache-2.0 по LICENSE; README отдельно содержит требования attribution | Рассмотрен для сложного crawling. Не подключён: браузерный runtime и LLM-функции не нужны для текущего bounded HTML extraction. При внедрении повторно проверить конкретный release и attribution |

Использование готовых библиотек выбрано вместо копирования целой второй платформы: сохраняется работающая связка NestJS/Prisma и одна база данных. Бизнес-адаптер и правила поиска написаны под исходную модель LeadFactory. Утверждения об интеграции целых leadgen/leadforge/Scrapy/Crawl4AI здесь нет.

Локальные копии лицензий подключённых extraction-компонентов находятся в `docs/licenses`. Полные транзитивные лицензии остаются в установленных пакетах. У проекта нет автоматически назначенной публичной лицензии: исходный backend был UNLICENSED, права владельца проекта сохранены.

## Данные и публичные сервисы

- [OpenStreetMap copyright/ODbL](https://www.openstreetmap.org/copyright): допускается коммерческое использование данных при соблюдении атрибуции и применимых условий ODbL; распространение производной базы имеет отдельные требования. UI содержит атрибуцию, записи — ссылки на OSM.
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/): идентифицирующий User-Agent, небольшая ручная нагрузка, caching и максимум один запрос в секунду. Реализован интервал 1,1 с, последовательные запросы, кэш результатов на 24 часа в памяти. Нет autocomplete и массового фонового экспорта.
- [Overpass public instances](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html): общественные ресурсы с ограничениями; доступность не гарантирована. Endpoint заменяем переменной окружения.
- При расширении до публичного сервиса необходимо использовать собственные/разрешённые инстансы и повторно проверить политики поставщиков. Коммерческая лицензия библиотеки сама по себе не даёт права обходить ограничения сайтов.
