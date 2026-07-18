// ponytail: Tauri 2 shell. Registers the SQL plugin (sqlite backend) so the JS-side
// history layer can open `sqlite:calc.db`. No custom commands needed - the webview
// talks to the plugin directly via @tauri-apps/plugin-sql.
use tauri_plugin_sql::{Migration, MigrationKind};

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create history table",
        sql: "CREATE TABLE IF NOT EXISTS history (
            id TEXT PRIMARY KEY,
            expression TEXT NOT NULL,
            result TEXT NOT NULL,
            ts INTEGER NOT NULL
        );",
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:calc.db", migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
