#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::Mutex,
};
use tauri::{Manager, State};

const STORY_LIMIT: u64 = 256 * 1024;
const SAVE_LIMIT: u64 = 8 * 1024 * 1024;
const MAP_LIMIT: usize = 2 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Recent {
    id: String,
    name: String,
    path: PathBuf,
    save_path: Option<PathBuf>,
}

#[derive(Default, Serialize, Deserialize)]
struct Library {
    recent: Vec<Recent>,
}

struct Storage {
    directory: PathBuf,
    library: Mutex<Library>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Story {
    id: String,
    name: String,
    data: Vec<u8>,
    map: Option<serde_json::Value>,
    has_save: bool,
}

fn read_bounded(path: &Path, limit: u64) -> Result<Vec<u8>, String> {
    let file = fs::File::open(path).map_err(|e| format!("Cannot open file: {e}"))?;
    let mut data = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut data)
        .map_err(|e| format!("Cannot read file: {e}"))?;
    if data.len() as u64 > limit {
        return Err(format!("File exceeds the {} KiB limit.", limit / 1024));
    }
    Ok(data)
}

// The old file remains recoverable if replacement fails or the process exits mid-write.
fn atomic_write(path: &Path, data: &[u8]) -> Result<(), String> {
    let temporary = path.with_extension("pending");
    let backup = path.with_extension("backup");
    let mut file =
        fs::File::create(&temporary).map_err(|e| format!("Cannot create storage: {e}"))?;
    file.write_all(data)
        .and_then(|_| file.sync_all())
        .map_err(|e| format!("Cannot write storage: {e}"))?;
    drop(file);
    if path.exists() {
        if backup.exists() {
            fs::remove_file(&backup).map_err(|e| format!("Cannot replace storage backup: {e}"))?;
        }
        fs::rename(path, &backup).map_err(|e| format!("Cannot back up storage: {e}"))?;
    }
    fs::rename(&temporary, path).map_err(|e| format!("Cannot commit storage: {e}"))?;
    Ok(())
}

fn read_storage(path: &Path) -> Result<Option<Vec<u8>>, String> {
    let source = if path.exists() {
        path.to_owned()
    } else if path.with_extension("backup").exists() {
        path.with_extension("backup")
    } else {
        return Ok(None);
    };
    read_bounded(&source, MAP_LIMIT as u64).map(Some)
}

fn save_library(storage: &Storage, library: &Library) -> Result<(), String> {
    let data = serde_json::to_vec(library).map_err(|e| format!("Cannot encode library: {e}"))?;
    atomic_write(&storage.directory.join("library.json"), &data)
}

fn identity(data: &[u8]) -> String {
    format!("{:x}", Sha256::digest(data))
}

fn map_path(storage: &Storage, id: &str) -> Result<PathBuf, String> {
    if id.len() != 64 || !id.bytes().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid story identity.".into());
    }
    Ok(storage.directory.join(format!("{id}.json")))
}

fn load_story(path: PathBuf, storage: &Storage, expected: Option<&str>) -> Result<Story, String> {
    let data = read_bounded(&path, STORY_LIMIT)?;
    if !matches!(data.first(), Some(1 | 2 | 3 | 5)) || data.len() < 64 {
        return Err("Choose a raw Z-machine V1, V2, V3 or V5 story.".into());
    }
    let id = identity(&data);
    if expected.is_some_and(|value| value != id) {
        return Err(
            "This recent story's contents changed. Use Load story to open it again.".into(),
        );
    }
    let name = path
        .file_name()
        .ok_or("Story filename is missing.")?
        .to_string_lossy()
        .into_owned();
    let map = read_storage(&map_path(storage, &id)?)?
        .map(|bytes| {
            serde_json::from_slice(&bytes).map_err(|e| format!("Stored map is damaged: {e}"))
        })
        .transpose()?;
    let mut library = storage
        .library
        .lock()
        .map_err(|e| format!("Library lock failed: {e}"))?;
    let save_path = library
        .recent
        .iter()
        .find(|item| item.id == id)
        .and_then(|item| item.save_path.clone());
    library.recent.retain(|item| item.id != id);
    library.recent.insert(
        0,
        Recent {
            id: id.clone(),
            name: name.clone(),
            path,
            save_path: save_path.clone(),
        },
    );
    library.recent.truncate(10);
    save_library(storage, &library)?;
    Ok(Story {
        id,
        name,
        data,
        map,
        has_save: save_path.is_some(),
    })
}

#[tauri::command]
async fn pick_story(storage: State<'_, Storage>) -> Result<Option<Story>, String> {
    let selected = rfd::AsyncFileDialog::new()
        .add_filter("Z-machine story", &["z1", "z2", "z3", "z5"])
        .pick_file()
        .await;
    selected
        .map(|file| load_story(file.path().to_owned(), &storage, None))
        .transpose()
}

#[tauri::command]
fn recent_stories(storage: State<'_, Storage>) -> Result<Vec<Recent>, String> {
    Ok(storage
        .library
        .lock()
        .map_err(|e| format!("Library lock failed: {e}"))?
        .recent
        .clone())
}

#[tauri::command]
fn open_recent(id: String, storage: State<'_, Storage>) -> Result<Story, String> {
    let path = storage
        .library
        .lock()
        .map_err(|e| format!("Library lock failed: {e}"))?
        .recent
        .iter()
        .find(|item| item.id == id)
        .ok_or("Recent story is unavailable.")?
        .path
        .clone();
    load_story(path, &storage, Some(&id))
}

#[tauri::command]
fn persist_map(
    id: String,
    map: serde_json::Value,
    storage: State<'_, Storage>,
) -> Result<(), String> {
    let library = storage
        .library
        .lock()
        .map_err(|e| format!("Library lock failed: {e}"))?;
    if !library.recent.iter().any(|item| item.id == id) {
        return Err("Story is not in the local library.".into());
    }
    let bytes = serde_json::to_vec(&map).map_err(|e| format!("Cannot encode map: {e}"))?;
    if bytes.len() > MAP_LIMIT {
        return Err("Map exceeds the 2 MiB storage limit.".into());
    }
    atomic_write(&map_path(&storage, &id)?, &bytes)
}

#[tauri::command]
async fn save_game(id: String, data: Vec<u8>, storage: State<'_, Storage>) -> Result<bool, String> {
    if data.is_empty() || data.len() as u64 > SAVE_LIMIT {
        return Err("Invalid save size.".into());
    }
    let name = storage
        .library
        .lock()
        .map_err(|e| format!("Library lock failed: {e}"))?
        .recent
        .iter()
        .find(|item| item.id == id)
        .ok_or("Story is unavailable.")?
        .name
        .clone();
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_file_name(format!("{name}.qzl"))
        .add_filter("Quetzal save", &["qzl"])
        .save_file()
        .await
    else {
        return Ok(false);
    };
    fs::write(file.path(), data).map_err(|e| format!("Cannot write save file: {e}"))?;
    let mut library = storage
        .library
        .lock()
        .map_err(|e| format!("Library lock failed: {e}"))?;
    let item = library
        .recent
        .iter_mut()
        .find(|item| item.id == id)
        .ok_or("Story is no longer in the library.")?;
    item.save_path = Some(file.path().to_owned());
    save_library(&storage, &library)?;
    Ok(true)
}

#[tauri::command]
async fn restore_game(
    id: String,
    latest: bool,
    storage: State<'_, Storage>,
) -> Result<Option<Vec<u8>>, String> {
    let path = if latest {
        Some(
            storage
                .library
                .lock()
                .map_err(|e| format!("Library lock failed: {e}"))?
                .recent
                .iter()
                .find(|item| item.id == id)
                .and_then(|item| item.save_path.clone())
                .ok_or("No last save is recorded for this story.")?,
        )
    } else {
        rfd::AsyncFileDialog::new()
            .add_filter("Quetzal save", &["qzl", "sav"])
            .pick_file()
            .await
            .map(|file| file.path().to_owned())
    };
    path.map(|path| read_bounded(&path, SAVE_LIMIT)).transpose()
}

#[tauri::command]
async fn export_transcript(text: String) -> Result<bool, String> {
    if text.len() > 32 * 1024 * 1024 {
        return Err("Transcript exceeds the 32 MiB export limit.".into());
    }
    let Some(file) = rfd::AsyncFileDialog::new()
        .set_file_name("webfrotz-transcript.txt")
        .add_filter("Text", &["txt"])
        .save_file()
        .await
    else {
        return Ok(false);
    };
    fs::write(file.path(), text).map_err(|e| format!("Cannot export transcript: {e}"))?;
    Ok(true)
}

#[tauri::command]
fn forget_library(storage: State<'_, Storage>) -> Result<(), String> {
    let mut library = storage
        .library
        .lock()
        .map_err(|e| format!("Library lock failed: {e}"))?;
    for entry in
        fs::read_dir(&storage.directory).map_err(|e| format!("Cannot read local storage: {e}"))?
    {
        let path = entry
            .map_err(|e| format!("Cannot read storage entry: {e}"))?
            .path();
        if matches!(
            path.extension().and_then(|s| s.to_str()),
            Some("json" | "backup" | "pending")
        ) {
            fs::remove_file(path).map_err(|e| format!("Cannot remove local storage: {e}"))?;
        }
    }
    library.recent.clear();
    save_library(&storage, &library)
}

fn main() {
    let result = tauri::Builder::default()
        .setup(|app| {
            let directory = app.path().app_local_data_dir()?;
            fs::create_dir_all(&directory)?;
            let library = read_storage(&directory.join("library.json"))
                .and_then(|data| {
                    data.map(|bytes| {
                        serde_json::from_slice(&bytes)
                            .map_err(|e| format!("Local library is damaged: {e}"))
                    })
                    .transpose()
                })
                .map_err(std::io::Error::other)?
                .unwrap_or_default();
            app.manage(Storage {
                directory,
                library: Mutex::new(library),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pick_story,
            recent_stories,
            open_recent,
            persist_map,
            save_game,
            restore_game,
            export_transcript,
            forget_library
        ])
        .run(tauri::generate_context!());
    if let Err(error) = result {
        rfd::MessageDialog::new()
            .set_title("WebFrotz could not start")
            .set_description(format!("{error}\n\nNo story or save files were changed. See the README's desktop recovery instructions."))
            .set_level(rfd::MessageLevel::Error)
            .show();
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn storage() -> Storage {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory =
            std::env::temp_dir().join(format!("webfrotz-storage-{}-{unique}", std::process::id()));
        fs::create_dir(&directory).unwrap();
        Storage {
            directory,
            library: Mutex::new(Library::default()),
        }
    }

    #[test]
    fn bounded_files_identity_and_path_validation() {
        let storage = storage();
        let path = storage.directory.join("input.z3");
        fs::write(&path, [3u8; 64]).unwrap();
        assert_eq!(read_bounded(&path, 64).unwrap().len(), 64);
        assert!(read_bounded(&path, 63).is_err());
        assert_eq!(identity(b"same"), identity(b"same"));
        assert_ne!(identity(b"same"), identity(b"other"));
        assert!(map_path(&storage, "../../outside").is_err());
        assert!(map_path(&storage, &identity(b"same")).is_ok());
        fs::remove_dir_all(storage.directory).unwrap();
    }

    #[test]
    fn storage_replacement_and_interrupted_write_recovery() {
        let storage = storage();
        let path = storage.directory.join("map.json");
        assert!(read_storage(&path).unwrap().is_none());
        atomic_write(&path, b"first").unwrap();
        atomic_write(&path, b"second").unwrap();
        assert_eq!(read_storage(&path).unwrap().unwrap(), b"second");
        fs::remove_file(&path).unwrap();
        assert_eq!(read_storage(&path).unwrap().unwrap(), b"first");
        fs::remove_dir_all(storage.directory).unwrap();
    }

    #[test]
    fn recent_identity_is_content_based_and_missing_files_report_errors() {
        let storage = storage();
        let path = storage.directory.join("input.z3");
        fs::write(&path, [3u8; 64]).unwrap();
        let story = load_story(path.clone(), &storage, None).unwrap();
        let again = load_story(path.clone(), &storage, Some(&story.id)).unwrap();
        assert_eq!(story.id, again.id);
        assert_eq!(storage.library.lock().unwrap().recent.len(), 1);
        fs::write(&path, [2u8; 64]).unwrap();
        assert!(load_story(path.clone(), &storage, Some(&story.id)).is_err());
        fs::remove_file(&path).unwrap();
        assert!(load_story(path, &storage, None).is_err());
        fs::remove_dir_all(storage.directory).unwrap();
    }
}
