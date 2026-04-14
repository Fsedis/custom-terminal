use serde::Serialize;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::PathBuf;

#[derive(Serialize)]
pub struct ClaudeSession {
    pub id: String,
    pub file: String,
    pub first_message: Option<String>,
    pub cwd: Option<String>,
    pub mtime: u64,
}

#[derive(Serialize)]
pub struct ClaudeProject {
    pub name: String,
    pub path: String,
    pub sessions: Vec<ClaudeSession>,
}

fn claude_projects_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|h| h.join(".claude").join("projects"))
}

fn read_session_meta(path: &PathBuf) -> (Option<String>, Option<String>) {
    let file = match fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return (None, None),
    };
    let reader = BufReader::new(file);
    let mut first_message: Option<String> = None;
    let mut cwd: Option<String> = None;
    for line in reader.lines().flatten().take(50) {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
            if cwd.is_none() {
                if let Some(c) = v.get("cwd").and_then(|c| c.as_str()) {
                    cwd = Some(c.to_string());
                }
            }
            if first_message.is_none()
                && v.get("type").and_then(|t| t.as_str()) == Some("user")
            {
                if let Some(content) = v.get("message").and_then(|m| m.get("content")) {
                    if let Some(s) = content.as_str() {
                        first_message = Some(s.chars().take(120).collect());
                    } else if let Some(arr) = content.as_array() {
                        for item in arr {
                            if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                first_message = Some(text.chars().take(120).collect());
                                break;
                            }
                        }
                    }
                }
            }
            if cwd.is_some() && first_message.is_some() {
                break;
            }
        }
    }
    (first_message, cwd)
}

#[tauri::command]
pub fn list_claude_projects() -> Result<Vec<ClaudeProject>, String> {
    let dir = claude_projects_dir().ok_or("no home dir")?;
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut out = Vec::new();
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path();
        let mut sessions = Vec::new();
        if let Ok(rd) = fs::read_dir(&path) {
            for f in rd.flatten() {
                let fp = f.path();
                if fp.extension().and_then(|e| e.to_str()) != Some("jsonl") {
                    continue;
                }
                let id = fp
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_string();
                let mtime = f
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let (first_message, cwd) = read_session_meta(&fp);
                sessions.push(ClaudeSession {
                    id,
                    file: fp.to_string_lossy().to_string(),
                    first_message,
                    cwd,
                    mtime,
                });
            }
        }
        sessions.sort_by(|a, b| b.mtime.cmp(&a.mtime));
        out.push(ClaudeProject {
            name: name.clone(),
            path: path.to_string_lossy().to_string(),
            sessions,
        });
    }
    out.sort_by(|a, b| {
        let ma = a.sessions.first().map(|s| s.mtime).unwrap_or(0);
        let mb = b.sessions.first().map(|s| s.mtime).unwrap_or(0);
        mb.cmp(&ma)
    });
    Ok(out)
}
