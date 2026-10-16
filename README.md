# EvalBench

Лаборатория для prompt engineering: сравнение A/B, наборы тестов, автоматические проверки, регрессии, слепая ручная оценка и экспорт результатов.

- [Веб-приложение](https://evalbench-prompt-lab.dot-punks-gp-9267.chatgpt.site)
- [Код, документация и запуск](evalbench/README.md)
- [Инструкции для Claude Code и других агентов](evalbench/AGENTS.md)
- [Архитектура и форматы данных](evalbench/ARCHITECTURE.md)

```sh
cd evalbench
npm start
```

Node.js 22+, установка зависимостей не требуется. Откройте http://127.0.0.1:3000.

Исходники находятся в `evalbench/`. Приложение доступно на отдельном хостинге. Для GitHub Pages подготовлен workflow; первоначальное включение Pages выполняет администратор репозитория в Settings → Pages → Source: GitHub Actions. Не считайте Pages опубликованным до успешного deploy.
