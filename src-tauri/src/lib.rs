use reqwest::{
    header::{ACCEPT, AUTHORIZATION, CONTENT_TYPE},
    multipart::{Form, Part},
};
use serde_json::Value;
use std::time::Duration;

const DEFAULT_DAEMON_URL: &str = "http://127.0.0.1:9862";

#[tauri::command]
async fn daemon_request(
    base_path: String,
    path: String,
    method: String,
    body: Option<Value>,
    session_token: Option<String>,
) -> Result<Value, String> {
    let method = method
        .parse::<reqwest::Method>()
        .map_err(|error| format!("invalid daemon request method {method}: {error}"))?;
    let url = daemon_url(&base_path, &path)?;
    let client = reqwest::Client::builder()
        .timeout(request_timeout(&base_path, &path))
        .build()
        .map_err(|error| format!("failed to create daemon HTTP client: {error}"))?;
    let mut request = client
        .request(method, url)
        .header(ACCEPT, "application/json");

    if let Some(token) = session_token {
        request = request.header(AUTHORIZATION, format!("Bearer {token}"));
    }
    if let Some(body) = body {
        request = request.header(CONTENT_TYPE, "application/json").json(&body);
    }

    parse_response(request.send().await).await
}

#[tauri::command]
async fn daemon_publish_json(
    session_token: String,
    path: String,
    json_text: String,
) -> Result<Value, String> {
    if !path.starts_with("/spoke/") {
        return Err("Spoke can only publish under /spoke/".to_string());
    }

    let filename = format!(
        "{}.json",
        path.rsplit('/')
            .next()
            .filter(|name| !name.is_empty())
            .unwrap_or("spoke")
    );
    let file = Part::bytes(json_text.into_bytes())
        .file_name(filename)
        .mime_str("application/json")
        .map_err(|error| format!("failed to prepare Spoke upload: {error}"))?;
    let form = Form::new().part("file", file).text("path", path);
    let request = reqwest::Client::new()
        .post(daemon_url("/app/v1", "/publish")?)
        .header(ACCEPT, "application/json")
        .header(AUTHORIZATION, format!("Bearer {session_token}"))
        .multipart(form);

    parse_response(request.send().await).await
}

#[tauri::command]
async fn daemon_publish_bytes(
    session_token: String,
    path: String,
    bytes: Vec<u8>,
    file_name: String,
    mime_type: String,
) -> Result<Value, String> {
    if !path.starts_with("/spoke/") {
        return Err("Spoke can only publish under /spoke/".to_string());
    }

    let file = Part::bytes(bytes)
        .file_name(file_name)
        .mime_str(&mime_type)
        .map_err(|error| format!("failed to prepare Spoke upload: {error}"))?;
    let form = Form::new().part("file", file).text("path", path);
    let request = reqwest::Client::new()
        .post(daemon_url("/app/v1", "/publish")?)
        .header(ACCEPT, "application/json")
        .header(AUTHORIZATION, format!("Bearer {session_token}"))
        .multipart(form);

    parse_response(request.send().await).await
}

#[tauri::command]
async fn daemon_append(
    session_token: String,
    path: String,
    bytes: Vec<u8>,
    file_name: String,
    mime_type: String,
) -> Result<Value, String> {
    if !path.starts_with("/spoke/") {
        return Err("Spoke can only publish under /spoke/".to_string());
    }

    let file = Part::bytes(bytes)
        .file_name(file_name)
        .mime_str(&mime_type)
        .map_err(|error| format!("failed to prepare Spoke upload: {error}"))?;
    let form = Form::new().part("file", file).text("path", path);
    let request = reqwest::Client::new()
        .post(daemon_url("/app/v1", "/append")?)
        .header(ACCEPT, "application/json")
        .header(AUTHORIZATION, format!("Bearer {session_token}"))
        .multipart(form);

    parse_response(request.send().await).await
}

async fn parse_response(
    response: Result<reqwest::Response, reqwest::Error>,
) -> Result<Value, String> {
    let response = response.map_err(|error| format!("daemon request failed: {error}"))?;
    let status = response.status();
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_string();
    let body = response
        .text()
        .await
        .map_err(|error| format!("daemon response read failed: {error}"))?;

    if !status.is_success() {
        if content_type.contains("application/json") {
            if let Ok(value) = serde_json::from_str::<Value>(&body) {
                if let Some(error) = value.get("error").and_then(Value::as_str) {
                    return Err(error.to_string());
                }
            }
        }

        return Err(if body.trim().is_empty() {
            format!("daemon returned {status}")
        } else {
            body
        });
    }

    if content_type.contains("application/json") {
        serde_json::from_str(&body)
            .map_err(|error| format!("daemon returned invalid JSON: {error}"))
    } else {
        Ok(Value::String(body))
    }
}

fn daemon_url(base_path: &str, path: &str) -> Result<String, String> {
    let prefix = match base_path {
        "/app/v1" | "/api/v1" => base_path,
        _ => return Err(format!("unsupported daemon base path: {base_path}")),
    };

    Ok(format!(
        "{}{}{}",
        daemon_base_url().trim_end_matches('/'),
        prefix,
        normalize_path(path)
    ))
}

fn normalize_path(path: &str) -> String {
    if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    }
}

fn daemon_base_url() -> String {
    std::env::var("JOLT_DAEMON_URL").unwrap_or_else(|_| DEFAULT_DAEMON_URL.to_string())
}

fn request_timeout(base_path: &str, path: &str) -> Duration {
    if base_path == "/api/v1" && normalize_path(path) == "/status" {
        Duration::from_secs(3)
    } else {
        Duration::from_secs(60)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            daemon_request,
            daemon_publish_bytes,
            daemon_publish_json,
            daemon_append
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Spoke");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn daemon_url_accepts_daemon_api_paths() {
        assert_eq!(
            daemon_url("/app/v1", "/published").unwrap(),
            "http://127.0.0.1:9862/app/v1/published"
        );
        assert_eq!(
            daemon_url("/api/v1", "status").unwrap(),
            "http://127.0.0.1:9862/api/v1/status"
        );
    }

    #[test]
    fn daemon_url_rejects_unknown_proxy_paths() {
        assert_eq!(
            daemon_url("/admin", "/status").unwrap_err(),
            "unsupported daemon base path: /admin"
        );
    }

    #[test]
    fn status_request_uses_short_timeout() {
        assert_eq!(request_timeout("/api/v1", "status"), Duration::from_secs(3));
        assert_eq!(
            request_timeout("/app/v1", "/fetch"),
            Duration::from_secs(60)
        );
    }
}
