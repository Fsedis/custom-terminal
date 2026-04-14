mod claude_sessions;
mod pty;

use pty::PtyRegistry;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(PtyRegistry::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            claude_sessions::list_claude_projects,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
