use std::collections::HashMap;

use parking_lot::Mutex;
use tauri::{
    AppHandle, Emitter, EventTarget, LogicalPosition, LogicalSize, Manager, Webview,
    WebviewBuilder, WebviewUrl, Wry,
};
use url::Url;

const INIT_SCRIPT: &str = r#"
window.__ct_post = function(obj) {
    try {
        var s = 'https://ct-picker.invalid/?p=' + encodeURIComponent(JSON.stringify(obj));
        window.location.assign(s);
    } catch (e) { console.error('ct_post failed', e); }
};
"#;

pub struct BrowserRegistry {
    webviews: Mutex<HashMap<String, Webview<Wry>>>,
    last_pick: Mutex<Option<String>>,
}

impl Default for BrowserRegistry {
    fn default() -> Self {
        Self {
            webviews: Mutex::new(HashMap::new()),
            last_pick: Mutex::new(None),
        }
    }
}

fn parse_url(s: &str) -> Result<Url, String> {
    let s = s.trim();
    let full = if s.starts_with("http://") || s.starts_with("https://") {
        s.to_string()
    } else {
        format!("http://{}", s)
    };
    full.parse::<Url>().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn browser_create(
    app: AppHandle,
    registry: tauri::State<'_, BrowserRegistry>,
    label: String,
    url: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    if registry.webviews.lock().contains_key(&label) {
        return Ok(());
    }
    let window = app.get_window("main").ok_or("no main window")?;
    let parsed = parse_url(&url)?;
    let app_clone = app.clone();
    let wv = window
        .add_child(
            WebviewBuilder::new(&label, WebviewUrl::External(parsed))
                .initialization_script(INIT_SCRIPT)
                .on_navigation(move |u| {
                    let s = u.as_str();
                    if let Some(rest) = s.strip_prefix("https://ct-picker.invalid/?p=") {
                        let decoded =
                            urlencoding::decode(rest).unwrap_or_default().to_string();
                        println!("[pick] delivering {} chars", decoded.len());
                        let labels: Vec<String> = app_clone.webviews().keys().cloned().collect();
                        println!("[pick] webview labels: {:?}", labels);
                        let script = format!(
                            "window.__ctPicked && window.__ctPicked({})",
                            decoded
                        );
                        for (lbl, wv) in app_clone.webviews() {
                            if lbl == "browser-main" { continue; }
                            match wv.eval(&script) {
                                Ok(_) => println!("[pick] injected to {}", lbl),
                                Err(e) => println!("[pick] inject {} err {}", lbl, e),
                            }
                        }
                        return false;
                    }
                    true
                }),
            LogicalPosition::new(x, y),
            LogicalSize::new(w.max(1.0), h.max(1.0)),
        )
        .map_err(|e: tauri::Error| e.to_string())?;
    registry.webviews.lock().insert(label, wv);
    Ok(())
}

#[tauri::command]
pub async fn browser_navigate(
    registry: tauri::State<'_, BrowserRegistry>,
    label: String,
    url: String,
) -> Result<(), String> {
    let parsed = parse_url(&url)?;
    let webviews = registry.webviews.lock();
    let wv = webviews.get(&label).ok_or(format!("no webview {}", label))?;
    wv.navigate(parsed).map_err(|e: tauri::Error| e.to_string())
}

#[tauri::command]
pub async fn browser_resize(
    registry: tauri::State<'_, BrowserRegistry>,
    label: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
) -> Result<(), String> {
    let webviews = registry.webviews.lock();
    let wv = webviews.get(&label).ok_or(format!("no webview {}", label))?;
    wv.set_position(LogicalPosition::new(x, y))
        .map_err(|e: tauri::Error| e.to_string())?;
    wv.set_size(LogicalSize::new(w.max(1.0), h.max(1.0)))
        .map_err(|e: tauri::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn browser_eval(
    registry: tauri::State<'_, BrowserRegistry>,
    label: String,
    script: String,
) -> Result<(), String> {
    let webviews = registry.webviews.lock();
    let wv = webviews.get(&label).ok_or(format!("no webview {}", label))?;
    wv.eval(&script).map_err(|e: tauri::Error| e.to_string())
}

#[tauri::command]
pub async fn browser_close(
    registry: tauri::State<'_, BrowserRegistry>,
    label: String,
) -> Result<(), String> {
    let wv = registry.webviews.lock().remove(&label);
    if let Some(wv) = wv {
        wv.close().map_err(|e: tauri::Error| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn browser_take_pick(
    registry: tauri::State<'_, BrowserRegistry>,
) -> Result<Option<String>, String> {
    Ok(registry.last_pick.lock().take())
}
