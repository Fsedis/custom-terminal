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

#[derive(Serialize)]
pub struct SessionEvent {
    pub uuid: String,
    pub parent_uuid: Option<String>,
    pub role: String,
    pub timestamp: Option<String>,
    pub preview: String,
    pub tool_name: Option<String>,
    pub is_sidechain: bool,
}

#[tauri::command]
pub fn read_claude_session_events(file: String) -> Result<Vec<SessionEvent>, String> {
    let path = PathBuf::from(&file);
    let f = fs::File::open(&path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(f);
    let mut out = Vec::new();
    for line in reader.lines().flatten() {
        let v: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let typ = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
        if typ != "user" && typ != "assistant" {
            continue;
        }
        let uuid = v
            .get("uuid")
            .and_then(|u| u.as_str())
            .unwrap_or("")
            .to_string();
        if uuid.is_empty() {
            continue;
        }
        let parent_uuid = v
            .get("parentUuid")
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());
        let timestamp = v
            .get("timestamp")
            .and_then(|t| t.as_str())
            .map(|s| s.to_string());
        let is_sidechain = v
            .get("isSidechain")
            .and_then(|s| s.as_bool())
            .unwrap_or(false);

        let mut preview = String::new();
        let mut tool_name: Option<String> = None;
        if let Some(content) = v.get("message").and_then(|m| m.get("content")) {
            if let Some(s) = content.as_str() {
                preview = s.chars().take(240).collect();
            } else if let Some(arr) = content.as_array() {
                for item in arr {
                    let itype = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    if itype == "text" {
                        if let Some(t) = item.get("text").and_then(|t| t.as_str()) {
                            if preview.is_empty() {
                                preview = t.chars().take(240).collect();
                            }
                        }
                    } else if itype == "tool_use" {
                        if tool_name.is_none() {
                            tool_name = item
                                .get("name")
                                .and_then(|n| n.as_str())
                                .map(|s| s.to_string());
                        }
                    } else if itype == "tool_result" {
                        if preview.is_empty() {
                            if let Some(c) = item.get("content") {
                                if let Some(s) = c.as_str() {
                                    preview = format!("→ {}", s.chars().take(220).collect::<String>());
                                } else if let Some(arr2) = c.as_array() {
                                    for sub in arr2 {
                                        if let Some(t) = sub.get("text").and_then(|t| t.as_str()) {
                                            preview = format!("→ {}", t.chars().take(220).collect::<String>());
                                            break;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        out.push(SessionEvent {
            uuid,
            parent_uuid,
            role: typ.to_string(),
            timestamp,
            preview,
            tool_name,
            is_sidechain,
        });
    }
    Ok(out)
}

#[tauri::command]
pub fn resolve_session_file(cwd: String, session_id: String) -> Result<String, String> {
    let dir = claude_projects_dir().ok_or("no home dir")?;
    let encoded = cwd.replace('/', "-");
    let candidate = dir.join(&encoded).join(format!("{}.jsonl", session_id));
    if candidate.exists() {
        return Ok(candidate.to_string_lossy().to_string());
    }
    if let Ok(rd) = fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path().join(format!("{}.jsonl", session_id));
            if p.exists() {
                return Ok(p.to_string_lossy().to_string());
            }
        }
    }
    Err(format!("session file not found for {}", session_id))
}

#[derive(Serialize)]
pub struct ForkResult {
    pub session_id: String,
    pub file: String,
}

#[tauri::command]
pub fn fork_claude_session(file: String, upto_uuid: String) -> Result<ForkResult, String> {
    let src = PathBuf::from(&file);
    let parent_dir = src.parent().ok_or("no parent dir")?.to_path_buf();
    let new_id = uuid_v4_like();
    let dst = parent_dir.join(format!("{}.jsonl", new_id));

    let f = fs::File::open(&src).map_err(|e| e.to_string())?;
    let reader = BufReader::new(f);
    let mut out_lines: Vec<String> = Vec::new();
    let mut found = false;
    let mut original_id: Option<String> = None;

    for line in reader.lines().flatten() {
        let mut v: serde_json::Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        if original_id.is_none() {
            if let Some(s) = v.get("sessionId").and_then(|x| x.as_str()) {
                original_id = Some(s.to_string());
            }
        }
        if let Some(obj) = v.as_object_mut() {
            if obj.contains_key("sessionId") {
                obj.insert(
                    "sessionId".to_string(),
                    serde_json::Value::String(new_id.clone()),
                );
            }
        }
        let uuid_here = v
            .get("uuid")
            .and_then(|u| u.as_str())
            .map(|s| s.to_string());
        out_lines.push(v.to_string());
        if let Some(u) = uuid_here {
            if u == upto_uuid {
                found = true;
                break;
            }
        }
    }

    if !found {
        return Err(format!("uuid {} not found in session", upto_uuid));
    }

    let body = out_lines.join("\n") + "\n";
    fs::write(&dst, body).map_err(|e| e.to_string())?;

    Ok(ForkResult {
        session_id: new_id,
        file: dst.to_string_lossy().to_string(),
    })
}

fn uuid_v4_like() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let a = (nanos as u64) ^ 0x9E37_79B9_7F4A_7C15;
    let b = a.wrapping_mul(0xBF58_476D_1CE4_E5B9);
    let c = b ^ (b >> 27);
    let d = c.wrapping_mul(0x94D0_49BB_1331_11EB);
    let e = d ^ (d >> 31);
    let hex = format!("{:016x}{:016x}", a ^ d, c ^ e);
    format!(
        "{}-{}-4{}-{}{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[13..16],
        {
            let v = u8::from_str_radix(&hex[16..18], 16).unwrap_or(0);
            format!("{:02x}", (v & 0x3f) | 0x80)
        },
        &hex[18..20],
        &hex[20..32],
    )
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
