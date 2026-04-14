use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;

use parking_lot::Mutex;
use portable_pty::{CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};

pub struct PtyProc {
    writer: Box<dyn Write + Send>,
    master: Box<dyn MasterPty + Send>,
    _child: Box<dyn portable_pty::Child + Send + Sync>,
}

#[derive(Default)]
pub struct PtyRegistry {
    procs: Mutex<HashMap<String, Arc<Mutex<PtyProc>>>>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct SpawnOpts {
    pub shell: Option<String>,
    pub cwd: Option<String>,
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    pub args: Option<Vec<String>>,
    pub env: Option<HashMap<String, String>>,
}

#[derive(Serialize, Clone)]
struct DataEvent {
    id: String,
    data: String,
}

#[derive(Serialize, Clone)]
struct ExitEvent {
    id: String,
}

#[tauri::command]
pub fn pty_spawn(
    app: AppHandle,
    state: State<'_, PtyRegistry>,
    opts: SpawnOpts,
) -> Result<String, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows: opts.rows.unwrap_or(30),
            cols: opts.cols.unwrap_or(100),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    let shell = opts.shell.unwrap_or_else(|| {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".into())
    });

    let mut cmd = CommandBuilder::new(&shell);
    if let Some(args) = &opts.args {
        for a in args {
            cmd.arg(a);
        }
    }
    if let Some(cwd) = &opts.cwd {
        cmd.cwd(cwd);
    }
    cmd.env("TERM", "xterm-256color");
    if let Some(env) = &opts.env {
        for (k, v) in env {
            cmd.env(k, v);
        }
    }

    let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let id = uuid::Uuid::new_v4().to_string();

    let proc = Arc::new(Mutex::new(PtyProc {
        writer,
        master: pair.master,
        _child: child,
    }));

    state.procs.lock().insert(id.clone(), proc.clone());

    let id_for_thread = id.clone();
    let app_for_thread = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_for_thread.emit(
                        "pty://data",
                        DataEvent {
                            id: id_for_thread.clone(),
                            data,
                        },
                    );
                }
                Err(_) => break,
            }
        }
        let _ = app_for_thread.emit(
            "pty://exit",
            ExitEvent {
                id: id_for_thread.clone(),
            },
        );
        if let Some(reg) = app_for_thread.try_state::<PtyRegistry>() {
            reg.procs.lock().remove(&id_for_thread);
        }
    });

    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: State<'_, PtyRegistry>, id: String, data: String) -> Result<(), String> {
    let procs = state.procs.lock();
    if let Some(proc) = procs.get(&id) {
        let mut p = proc.lock();
        p.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        p.writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("pty {} not found", id))
    }
}

#[tauri::command]
pub fn pty_resize(
    state: State<'_, PtyRegistry>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let procs = state.procs.lock();
    if let Some(proc) = procs.get(&id) {
        let p = proc.lock();
        p.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
        Ok(())
    } else {
        Err(format!("pty {} not found", id))
    }
}

#[tauri::command]
pub fn pty_kill(state: State<'_, PtyRegistry>, id: String) -> Result<(), String> {
    let mut procs = state.procs.lock();
    procs.remove(&id);
    Ok(())
}
