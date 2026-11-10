//! Scoped bridge for the per-vault XP settings owned by the settings foundation.
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::RwLock;
use tauri::{State, WebviewWindow};

fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" { Ok(()) } else { Err("XP settings belong to the main workspace.".to_owned()) }
}

fn identity(value: &str) -> String {
    #[cfg(target_os = "macos")]
    {
        use objc2_foundation::NSString;
        let normalized = NSString::from_str(value.trim()).precomposedStringWithCanonicalMapping().to_string().to_lowercase();
        NSString::from_str(&normalized).precomposedStringWithCanonicalMapping().to_string()
    }
    #[cfg(not(target_os = "macos"))]
    value.trim().to_lowercase()
}
fn identifier(value: &str) -> bool {
    let mut bytes = value.bytes();
    value.len() <= 80 && bytes.next().is_some_and(|byte| byte.is_ascii_alphanumeric()) && bytes.all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
        && !["constructor", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "toString", "valueOf"].contains(&value)
}
fn date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' || bytes.iter().enumerate().any(|(i, b)| i != 4 && i != 7 && !b.is_ascii_digit()) { return false; }
    let (Ok(year), Ok(month), Ok(day)) = (value[0..4].parse::<u32>(), value[5..7].parse::<u32>(), value[8..10].parse::<u32>()) else { return false; };
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let days = match month { 1 | 3 | 5 | 7 | 8 | 10 | 12 => 31, 4 | 6 | 9 | 11 => 30, 2 if leap => 29, 2 => 28, _ => 0 };
    day > 0 && day <= days
}
fn label(value: &str, area: bool) -> bool {
    !value.trim().is_empty() && value.encode_utf16().count() <= 80 && !value.chars().any(char::is_control) && (!area || !value.contains(['[', ']', ':', ',']))
}
fn tag(value: &str) -> bool {
    !value.is_empty() && value.chars().count() <= 80 && value.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-' || (!c.is_ascii() && !c.is_whitespace() && !c.is_control()))
}
fn color(value: &str) -> bool {
    if value.len() > 100 { return false; }
    if value.len() == 7 && value.starts_with('#') && value[1..].bytes().all(|byte| byte.is_ascii_hexdigit()) { return true; }
    let Some(body) = value.strip_prefix("oklch(").and_then(|v| v.strip_suffix(')')) else { return false; };
    let parts: Vec<_> = body.split(' ').collect();
    parts.len() == 3 && parts.iter().all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit() || byte == b'.') && part.parse::<f64>().is_ok_and(f64::is_finite))
}
fn text<'a>(value: &'a Value, key: &str) -> Option<&'a str> { value.get(key)?.as_str() }
fn number(value: &Value, key: &str, max: u64) -> bool { value.get(key).and_then(Value::as_u64).is_some_and(|number| number <= max) }
fn ratio(value: &Value) -> bool {
    let digits = |value: &str| !value.is_empty() && value.len() <= 80 && value.bytes().all(|byte| byte.is_ascii_digit());
    let Some(numerator) = text(value, "numerator") else { return false; };
    let Some(denominator) = text(value, "denominator") else { return false; };
    digits(numerator.strip_prefix('-').unwrap_or(numerator)) && !denominator.starts_with('0') && digits(denominator)
}
fn invalid() -> String { "The XP settings are invalid. The saved settings and your draft have not been changed.".to_owned() }

/// Validate the native bridge boundary before an imported or edited ruleset can replace history.
fn validate_state(value: &Value) -> Result<(), String> {
    if serde_json::to_vec(value).map_err(|_| invalid())?.len() > 20 * 1024 * 1024 { return Err(invalid()); }
    if value.get("version").and_then(Value::as_u64) != Some(1) { return Err("These XP rules need a different version of Epizen. They have not been replaced.".to_owned()); }
    let id = text(value, "id").filter(|value| identifier(value)).ok_or_else(invalid)?;
    let start = text(value, "startDate").filter(|value| date(value)).ok_or_else(invalid)?;
    let _ = id;
    let categories = value.get("categories").and_then(Value::as_array).filter(|items| items.len() <= 500).ok_or_else(invalid)?;
    let areas = value.get("areas").and_then(Value::as_array).filter(|items| items.len() <= 100).ok_or_else(invalid)?;
    let mut category_ids = HashMap::new(); let mut tags = HashMap::new();
    for category in categories {
        let id = text(category, "id").filter(|value| identifier(value)).ok_or_else(invalid)?;
        let created = text(category, "createdAt").filter(|value| date(value)).ok_or_else(invalid)?;
        if category_ids.insert(id.to_owned(), created.to_owned()).is_some() || !text(category, "name").is_some_and(|value| label(value, false)) || !text(category, "color").is_some_and(color) || category.get("archived").and_then(Value::as_bool).is_none() || !matches!(text(category, "kind"), Some("main" | "recovery")) { return Err(invalid()); }
        let current = text(category, "tag").filter(|value| tag(value)).ok_or_else(invalid)?;
        let aliases = category.get("aliases").and_then(Value::as_array).filter(|values| values.len() <= 100).ok_or_else(invalid)?;
        for alias in std::iter::once(current).chain(aliases.iter().map(|item| item.as_str().unwrap_or(""))) {
            if !tag(alias) { return Err(invalid()); }
            let key = identity(alias);
            if tags.insert(key, id).is_some_and(|previous| previous != id) { return Err(invalid()); }
        }
    }
    let mut area_ids = HashSet::new(); let mut area_names = HashMap::new();
    for area in areas {
        let id = text(area, "id").filter(|value| identifier(value) && *value != "unassigned").ok_or_else(invalid)?;
        if !area_ids.insert(id.to_owned()) || !text(area, "color").is_some_and(color) || area.get("archived").and_then(Value::as_bool).is_none() { return Err(invalid()); }
        let current = text(area, "name").filter(|value| label(value, true)).ok_or_else(invalid)?;
        let aliases = area.get("aliases").and_then(Value::as_array).filter(|values| values.len() <= 100).ok_or_else(invalid)?;
        for alias in std::iter::once(current).chain(aliases.iter().map(|item| item.as_str().unwrap_or(""))) {
            if !label(alias, true) { return Err(invalid()); }
            let key = identity(alias);
            if key == "unassigned" || area_names.insert(key, id).is_some_and(|previous| previous != id) { return Err(invalid()); }
        }
    }
    let policies = value.get("policies").and_then(Value::as_array).filter(|items| !items.is_empty() && items.len() <= 10000).ok_or_else(invalid)?;
    let mut ids = HashSet::new(); let mut previous = "";
    for policy in policies {
        let id = text(policy, "id").filter(|value| identifier(value)).ok_or_else(invalid)?;
        let effective = text(policy, "effectiveFrom").filter(|value| date(value)).ok_or_else(invalid)?;
        if !ids.insert(id) || effective <= previous || effective < start { return Err(invalid()); }
        previous = effective;
        for profile in ["focus", "practice", "training", "leisure"] {
            let rule = policy.get("profiles").and_then(|profiles| profiles.get(profile)).ok_or_else(invalid)?;
            if !number(rule, "rateHundredths", 1_000_000) || !number(rule, "boostHundredths", 100_000_000) || !number(rule, "boostMinutes", 1440) || (rule["boostHundredths"].as_u64().unwrap_or(0) > 0 && rule["boostMinutes"].as_u64() == Some(0)) { return Err(invalid()); }
        }
        let rules = policy.get("categories").and_then(Value::as_object).filter(|rules| rules.len() <= 500).ok_or_else(invalid)?;
        for (id, created) in &category_ids { if created.as_str() <= effective && !rules.contains_key(id) { return Err(invalid()); } }
        for (id, rule) in rules {
            if !category_ids.contains_key(id) || !matches!(text(rule, "profile"), Some("focus" | "practice" | "training" | "leisure")) { return Err(invalid()); }
            let shares = rule.get("shares").and_then(Value::as_array).filter(|shares| !shares.is_empty() && shares.len() <= 101).ok_or_else(invalid)?;
            let mut used = HashSet::new(); let mut total = 0u64;
            for share in shares {
                let area = text(share, "area").filter(|area| *area == "unassigned" || area_ids.contains(*area)).ok_or_else(invalid)?;
                if !used.insert(area) || !number(share, "basisPoints", 10000) { return Err(invalid()); }
                total += share["basisPoints"].as_u64().unwrap_or(0);
            }
            if total != 10000 { return Err(invalid()); }
        }
    }
    if text(&policies[0], "effectiveFrom") != Some(start) { return Err(invalid()); }
    let quests = value.get("questRewards").ok_or_else(invalid)?;
    let presets = quests.get("presets").ok_or_else(invalid)?;
    if !["common", "rare", "epic", "legendary"].into_iter().all(|tier| number(presets, tier, 1_000_000_000)) || !number(quests, "hourlyHundredths", 100_000_000) || value.get("seedCategoryTasks").and_then(Value::as_bool).is_none() { return Err(invalid()); }
    if let Some(legacy) = value.get("legacy") {
        if !text(legacy, "asOf").is_some_and(|as_of| date(as_of) && as_of <= start) || !legacy.get("character").is_some_and(ratio) { return Err(invalid()); }
        let areas = legacy.get("areas").and_then(Value::as_object).filter(|areas| areas.len() <= 101).ok_or_else(invalid)?;
        if !areas.values().all(ratio) { return Err(invalid()); }
    }
    Ok(())
}
fn save_checked(settings: &crate::Settings, root: &str, expected_revision: u64, value: &Value) -> Result<u64, String> {
    validate_state(value)?;
    settings.save_reward_settings(root, expected_revision, value).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn reward_settings(window: WebviewWindow, state: State<'_, RwLock<crate::VaultState>>, settings: State<'_, crate::Settings>, root: String) -> Result<Option<Value>, String> {
    main_only(&window)?;
    let guard = state.read().unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard.vault()?.root() != root { return Err("The vault changed. Your XP settings were not loaded.".to_owned()); }
    settings.reward_settings(&root).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_reward_settings(window: WebviewWindow, state: State<'_, RwLock<crate::VaultState>>, settings: State<'_, crate::Settings>, root: String, expected_revision: u64, value: Value) -> Result<u64, String> {
    main_only(&window)?;
    let guard = state.read().unwrap_or_else(|poisoned| poisoned.into_inner());
    if guard.vault()?.root() != root { return Err("The vault changed. Your XP settings draft is still available in its original vault.".to_owned()); }
    save_checked(&settings, &root, expected_revision, &value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    #[test]
    fn shared_fixture_and_unicode_identity_match_the_frontend_contract() {
        let fixture: Value = serde_json::from_str(include_str!("../../test/fixtures/reward-settings.json")).unwrap();
        assert!(validate_state(&fixture).is_ok());
        #[cfg(target_os = "macos")]
        assert_eq!(identity("Écriture"), identity("e\u{301}criture"));
        let mut duplicate = fixture.clone();
        let mut second = duplicate["categories"][0].clone(); second["id"] = json!("other"); second["tag"] = json!("CODE");
        duplicate["categories"].as_array_mut().unwrap().push(second);
        assert!(validate_state(&duplicate).is_err());
    }
    #[test]
    fn malformed_or_newer_import_does_not_replace_saved_rules_or_block_other_settings() {
        let dir = tempfile::tempdir().unwrap(); let root = dir.path().join("vault"); std::fs::create_dir(&root).unwrap();
        let root = root.canonicalize().unwrap().to_string_lossy().into_owned();
        let settings = crate::Settings::new(dir.path().join("config"));
        let fixture: Value = serde_json::from_str(include_str!("../../test/fixtures/reward-settings.json")).unwrap();
        assert_eq!(save_checked(&settings, &root, 0, &fixture).unwrap(), 1);
        for invalid in [json!({"version":1}), json!({"version":2}), { let mut copy = fixture.clone(); copy["policies"][0]["categories"]["code"]["shares"][0]["basisPoints"] = json!(9999); copy }] {
            assert!(save_checked(&settings, &root, 1, &invalid).is_err());
            assert_eq!(settings.reward_settings(&root).unwrap().unwrap()["state"], fixture);
            settings.update(serde_json::Map::from_iter([("theme".to_owned(), json!("dark"))])).unwrap();
            assert_eq!(settings.load()["theme"], "dark");
        }
    }
}
