// Spoke's desktop shell delegates generic daemon proxying and structured host
// errors to tauri-plugin-jolt. Spoke-owned namespace policy remains in the
// webview's Jolt SDK / ACL module before calls cross this host seam.

#[cfg(target_os = "linux")]
mod desktop_integration;

use tauri_plugin_dialog::DialogExt;

/// How this Spoke was installed, so the updater is only offered for the
/// bundle types whose update payload we publish (the AppImage on Linux).
#[tauri::command]
fn spoke_install_kind() -> String {
    use tauri::utils::config::BundleType;
    use tauri::utils::platform::bundle_type;
    match bundle_type() {
        Some(BundleType::AppImage) => "appimage",
        Some(BundleType::Deb) => "deb",
        Some(BundleType::Rpm) => "rpm",
        Some(BundleType::Msi) | Some(BundleType::Nsis) => "windows",
        Some(BundleType::App) => "macos",
        _ => "unknown",
    }
    .to_string()
}

// Offers, once, to add the AppImage to the applications menu. The dialog is
// modal, so it runs off the main thread after the window is up.
#[cfg(target_os = "linux")]
fn offer_appimage_menu_entry(app: tauri::AppHandle) {
    use desktop_integration as integration;
    let Some(context) = integration::appimage_context() else {
        return;
    };
    let Some(data_home) = integration::data_home() else {
        return;
    };
    let paths = integration::integration_paths(&data_home);
    if integration::integration_state(&paths) != integration::IntegrationState::Offer {
        return;
    }
    std::thread::spawn(move || {
        use tauri_plugin_dialog::{MessageDialogButtons, MessageDialogKind};
        let add = app
            .dialog()
            .message(
                "Add Spoke to your applications menu? This writes a menu entry and icon for this AppImage into your home directory, so the panel and app menu show it with the right icon.",
            )
            .title("Spoke")
            .kind(MessageDialogKind::Info)
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Add to menu".to_string(),
                "Not now".to_string(),
            ))
            .blocking_show();
        let result = if add {
            integration::install(&context, &paths)
        } else {
            integration::decline(&paths)
        };
        if let Err(error) = result {
            eprintln!("Spoke menu entry: {error}");
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            #[cfg(target_os = "linux")]
            offer_appimage_menu_entry(app.handle().clone());
            #[cfg(not(target_os = "linux"))]
            let _ = app;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![spoke_install_kind])
        .run(tauri::generate_context!())
        .expect("failed to run Spoke");
}
