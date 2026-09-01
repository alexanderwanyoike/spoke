// Spoke's desktop shell delegates generic daemon proxying and structured host
// errors to tauri-plugin-jolt. Spoke-owned namespace policy remains in the
// webview's Jolt SDK / ACL module before calls cross this host seam.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_jolt::init())
        .setup(|app| {
            // Linux window managers take the taskbar icon from the window
            // itself; Tauri does not publish _NET_WM_ICON there, so a bare
            // AppImage shows a generic icon without this (jolt#208).
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                if let Some(icon) = app.default_window_icon().cloned() {
                    for window in app.webview_windows().values() {
                        let _ = window.set_icon(icon.clone());
                    }
                }
            }
            #[cfg(not(target_os = "linux"))]
            let _ = app;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to run Spoke");
}
