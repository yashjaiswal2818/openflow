#[tauri::command]
fn get_engine_status() -> serde_json::Value {
    serde_json::json!({
        "status": "online",
        "engine": "OpenFlow",
        "version": "1.0.0"
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_engine_status])
        .run(tauri::generate_context!())
        .expect("error while running openflow application");
}
