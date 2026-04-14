# custom-terminal

Модульный GUI-терминал для AI-ассистированной разработки. Tauri + React + xterm.js + portable-pty.

## Фичи
- Полноценный терминал с вкладками (portable-pty)
- Sidebar с проектами из `~/.claude/projects/` и списком Claude-сессий
- Открытие сессии Claude Code одним кликом (`claude --resume <id>` в cwd сессии)

## Стек
- Tauri v2 (Rust backend, нативный WebView)
- React 19 + TypeScript + Vite
- xterm.js для эмуляции терминала
- Zustand для состояния
- portable-pty для pty-процессов

## Разработка
```bash
npm install
npm run tauri dev
```

## Сборка
```bash
npm run tauri build
```
