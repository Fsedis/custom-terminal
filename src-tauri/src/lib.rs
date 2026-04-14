mod browser;
mod claude_sessions;
mod pty;

use browser::BrowserRegistry;
use pty::PtyRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(PtyRegistry::default())
        .manage(BrowserRegistry::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            claude_sessions::list_claude_projects,
            browser::browser_create,
            browser::browser_navigate,
            browser::browser_resize,
            browser::browser_eval,
            browser::browser_close,
            browser::browser_take_pick,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
