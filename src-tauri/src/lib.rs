
mod process_scan;
mod scheduler;

use chrono::{Days, Local, LocalResult, NaiveTime, TimeZone};
use process_scan::ProcessScanner;
use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex, MutexGuard},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, RunEvent,
};
use tauri_plugin_notification::NotificationExt;

const HISTORY_LIMIT: usize = 250;
const STATE_FILE_NAME: &str = "scheduler-state.json";
const FINAL_WARNING_DEFAULT_SEC: u64 = 60;
const FINAL_WARNING_MIN_SEC: u64 = 15;
const FINAL_WARNING_MAX_SEC: u64 = 300;
const FINAL_WARNING_RANGE_ERROR: &str =
    "최종 경고 시간은 15초에서 300초 사이로 설정해 주세요.";
#[cfg(target_os = "windows")]
const WINDOWS_ABORTABLE_SHUTDOWN_SEC: u64 = 30;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
enum ScheduleMode {
    Countdown,
    SpecificTime,
    ProcessExit,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
enum ScheduleStatus {
    Armed,
    FinalWarning,
    ShuttingDown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProcessSelector {
    pid: Option<u32>,
    name: Option<String>,
    executable: Option<String>,
    cmdline_contains: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScheduleRequest {
    mode: ScheduleMode,
    duration_sec: Option<u64>,
    target_local_time: Option<String>,
    process_selector: Option<ProcessSelector>,
    pre_alerts: Option<Vec<u64>>,
    process_stable_sec: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ActiveSchedule {
    id: String,
    mode: ScheduleMode,
    summary: String,
    armed_at_ms: i64,
    trigger_at_ms: Option<i64>,
    target_local_time: Option<String>,
    target_tz_offset_minutes: Option<i32>,
    pre_alerts: Vec<u64>,
    fired_alerts: Vec<u64>,
    process_selector: Option<ProcessSelector>,
    #[serde(default)]
    process_tree_pids: Vec<u32>,
    process_stable_sec: u64,
    process_missing_since_ms: Option<i64>,
    #[serde(default)]
    snooze_until_ms: Option<i64>,
    #[serde(default)]
    process_match_degraded_logged: bool,
    status: ScheduleStatus,
    final_warning_started_at_ms: Option<i64>,
    final_warning_duration_sec: u64,
    #[serde(default)]
    shutdown_at_ms: Option<i64>,
    #[serde(default)]
    shutdown_initiated_at_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExecutionEvent {
    schedule_id: Option<String>,
    event_type: String,
    timestamp_ms: i64,
    result: String,
    reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    default_pre_alerts: Vec<u64>,
    final_warning_sec: u64,
    simulate_only: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            default_pre_alerts: vec![600, 300, 60],
            final_warning_sec: FINAL_WARNING_DEFAULT_SEC,
            simulate_only: cfg!(debug_assertions),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SettingsUpdate {
    default_pre_alerts: Option<Vec<u64>>,
    final_warning_sec: Option<u64>,
    simulate_only: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SchedulerSnapshot {
    active: Option<ActiveSchedule>,
    settings: AppSettings,
    history: Vec<ExecutionEvent>,
    now_ms: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProcessInfo {
    pid: u32,
    name: String,
    executable: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ProcessMatchSource {
    PidTree,
    TrackedPids,
    Advanced,
    NameFallback,
    None,
}

#[derive(Debug, Clone)]
struct ProcessMatchResult {
    running: bool,
    matched_pids: Vec<u32>,
    source: ProcessMatchSource,
    degraded_to_name: bool,
}

fn process_match_source_label(source: ProcessMatchSource) -> &'static str {
    match source {
        ProcessMatchSource::PidTree => "pidTree",
        ProcessMatchSource::TrackedPids => "trackedPids",
        ProcessMatchSource::Advanced => "advanced",
        ProcessMatchSource::NameFallback => "nameFallback",
        ProcessMatchSource::None => "none",
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedState {
    version: u8,
    settings: AppSettings,
    history: Vec<ExecutionEvent>,
    active: Option<ActiveSchedule>,
    id_seq: u64,
    #[serde(default)]
    last_schedule_request: Option<ScheduleRequest>,
}

impl Default for PersistedState {
    fn default() -> Self {
        Self {
            version: 1,
            settings: AppSettings::default(),
            history: Vec::new(),
            active: None,
            id_seq: 0,
            last_schedule_request: None,
        }
    }
}

#[derive(Debug, Clone)]
struct SchedulerStore {
    settings: AppSettings,
    history: Vec<ExecutionEvent>,
    active: Option<ActiveSchedule>,
    id_seq: u64,
    last_schedule_request: Option<ScheduleRequest>,
}

#[derive(Debug, Default)]
struct RuntimeState {
    allow_exit_once: bool,
}

#[derive(Debug, Clone)]
struct ShutdownDispatchReport {
    command_line: String,
    abort_hint: Option<String>,
    dry_run: bool,
}

impl ShutdownDispatchReport {
    fn log_line(&self) -> String {
        let prefix = if self.dry_run {
            "DRY_RUN_SHUTDOWN_COMMAND"
        } else {
            "SHUTDOWN_COMMAND_SENT"
        };

        match &self.abort_hint {
            Some(abort) => format!("{prefix}: {} (abort: {abort})", self.command_line),
            None => format!("{prefix}: {}", self.command_line),
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct QuitGuardPayload {
    source: String,
    status: ScheduleStatus,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
enum QuitGuardAction {
    CancelAndQuit,
    KeepBackground,
    Return,
}

impl Default for SchedulerStore {
    fn default() -> Self {
        Self::from_persisted(PersistedState::default())
    }
}

impl SchedulerStore {
    fn from_persisted(persisted: PersistedState) -> Self {
        let settings = AppSettings {
            default_pre_alerts: normalize_alerts(&persisted.settings.default_pre_alerts),
            final_warning_sec: normalize_final_warning_sec(persisted.settings.final_warning_sec),
            simulate_only: persisted.settings.simulate_only,
        };
        Self {
            settings: settings.clone(),
            history: persisted.history,
            active: persisted
                .active
                .map(|active| sanitize_active_from_persist(active, settings.final_warning_sec)),
            id_seq: persisted.id_seq,
            last_schedule_request: persisted.last_schedule_request,
        }
    }

    fn to_persisted(&self) -> PersistedState {
        PersistedState {
            version: 1,
            settings: self.settings.clone(),
            history: self.history.clone(),
            active: self
                .active
                .as_ref()
                .cloned()
                .map(sanitize_active_for_persist),
            id_seq: self.id_seq,
            last_schedule_request: self.last_schedule_request.clone(),
        }
    }
}

struct AppState {
    state_path: PathBuf,
    store: Mutex<SchedulerStore>,
    runtime: Mutex<RuntimeState>,
    scanner: Arc<Mutex<ProcessScanner>>,
}

struct LoadStoreOutcome {
    store: SchedulerStore,
    needs_persist: bool,
    startup_notice: Option<String>,
}

impl AppState {
    fn snapshot(&self) -> SchedulerSnapshot {
        let store = lock_store(&self.store);
        SchedulerSnapshot {
            active: store.active.clone(),
            settings: store.settings.clone(),
            history: store.history.clone(),
            now_ms: now_ms(),
        }
    }

    fn persist_locked(&self, store: &SchedulerStore) -> Result<(), String> {
        persist_store(&self.state_path, store)
    }
}

fn lock_store(store: &Mutex<SchedulerStore>) -> MutexGuard<'_, SchedulerStore> {
    match store.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            let mut recovered = poisoned.into_inner();
            push_event(
                &mut recovered,
                None,
                "mutex_poison_recovered",
                "error",
                Some(
                    "scheduler state mutex poisoned; recovered with inner state to keep app running"
                        .to_string(),
                ),
            );
            recovered
        }
    }
}

fn lock_runtime(runtime: &Mutex<RuntimeState>) -> MutexGuard<'_, RuntimeState> {
    match runtime.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn lock_scanner(scanner: &Arc<Mutex<ProcessScanner>>) -> MutexGuard<'_, ProcessScanner> {
    match scanner.lock() {
        Ok(guard) => guard,
        Err(poisoned) => poisoned.into_inner(),
    }
}

fn now_ms() -> i64 {
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_else(|_| Duration::from_secs(0));
    duration.as_millis() as i64
}

fn format_local_timestamp_ms(timestamp_ms: i64) -> String {
    Local
        .timestamp_millis_opt(timestamp_ms)
        .single()
        .map(|value| value.format("%Y-%m-%d %H:%M:%S").to_string())
        .unwrap_or_else(|| timestamp_ms.to_string())
}

fn normalize_final_warning_sec(value: u64) -> u64 {
    if (FINAL_WARNING_MIN_SEC..=FINAL_WARNING_MAX_SEC).contains(&value) {
        value
    } else {
        FINAL_WARNING_DEFAULT_SEC
    }
}

fn validate_final_warning_sec(value: u64) -> Result<u64, String> {
    if (FINAL_WARNING_MIN_SEC..=FINAL_WARNING_MAX_SEC).contains(&value) {
        Ok(value)
    } else {
        Err(FINAL_WARNING_RANGE_ERROR.to_string())
    }
}

fn compute_shutdown_at_ms(active: &ActiveSchedule) -> Option<i64> {
    match active.status {
        ScheduleStatus::Armed => match active.mode {
            ScheduleMode::Countdown | ScheduleMode::SpecificTime => active
                .trigger_at_ms
                .and_then(|trigger| trigger.checked_add((active.final_warning_duration_sec as i64) * 1000)),
            ScheduleMode::ProcessExit => None,
        },
        ScheduleStatus::FinalWarning | ScheduleStatus::ShuttingDown => active
            .final_warning_started_at_ms
            .and_then(|started| started.checked_add((active.final_warning_duration_sec as i64) * 1000)),
    }
}

fn sync_shutdown_at_ms(active: &mut ActiveSchedule) -> bool {
    let computed = compute_shutdown_at_ms(active);
    if active.shutdown_at_ms != computed {
        active.shutdown_at_ms = computed;
        true
    } else {
        false
    }
}

fn sanitize_active_for_persist(mut active: ActiveSchedule) -> ActiveSchedule {
    active.final_warning_duration_sec = normalize_final_warning_sec(active.final_warning_duration_sec);
    if matches!(active.status, ScheduleStatus::ShuttingDown) {
        active.status = ScheduleStatus::FinalWarning;
    }
    let _ = sync_shutdown_at_ms(&mut active);
    active
}

fn sanitize_active_from_persist(
    mut active: ActiveSchedule,
    fallback_final_warning_sec: u64,
) -> ActiveSchedule {
    if matches!(active.status, ScheduleStatus::ShuttingDown) {
        active.status = ScheduleStatus::FinalWarning;
        active.shutdown_initiated_at_ms = None;
    }
    let was_invalid = !(FINAL_WARNING_MIN_SEC..=FINAL_WARNING_MAX_SEC)
        .contains(&active.final_warning_duration_sec);
    active.final_warning_duration_sec = if was_invalid {
        normalize_final_warning_sec(fallback_final_warning_sec)
    } else {
        active.final_warning_duration_sec
    };
    let _ = sync_shutdown_at_ms(&mut active);
    active
}

fn pre_alert_notification_body(threshold_sec: u64) -> String {
    if threshold_sec % 60 == 0 {
        let minutes = threshold_sec / 60;
        format!(
            "자동 종료까지 {minutes}분 남았습니다. 지금 취소하거나 미룰 수 있습니다. (앱/트레이)"
        )
    } else {
        format!(
            "자동 종료까지 {threshold_sec}초 남았습니다. 지금 취소하거나 미룰 수 있습니다. (앱/트레이)"
        )
    }
}

fn final_warning_notification_body(final_warning_sec: u64) -> String {
    format!(
        "종료 {final_warning_sec}초 전입니다. 지금 취소하지 않으면 종료가 진행됩니다. 앱/트레이에서 취소 또는 미루기가 가능합니다."
    )
}

fn process_exit_final_warning_notification_body(final_warning_sec: u64) -> String {
    format!(
        "프로세스 종료가 감지되어 최종 경고가 시작되었습니다. 종료 {final_warning_sec}초 전입니다. 앱/트레이에서 취소 또는 미루기가 가능합니다."
    )
}

fn is_shutdown_execution_started(schedule: &ActiveSchedule) -> bool {
    matches!(schedule.status, ScheduleStatus::ShuttingDown)
        || schedule.shutdown_initiated_at_ms.is_some()
}

fn try_mark_shutdown_initiated(schedule: &mut ActiveSchedule, now: i64) -> bool {
    if is_shutdown_execution_started(schedule) {
        return false;
    }

    if !matches!(schedule.status, ScheduleStatus::FinalWarning) {
        return false;
    }

    let Some(started_at_ms) = schedule.final_warning_started_at_ms else {
        return false;
    };

    let elapsed_ms = now - started_at_ms;
    if elapsed_ms < (schedule.final_warning_duration_sec as i64) * 1000 {
        return false;
    }

    schedule.status = ScheduleStatus::ShuttingDown;
    schedule.shutdown_initiated_at_ms = Some(now);
    true
}

fn normalize_alerts(alerts: &[u64]) -> Vec<u64> {
    let mut values = alerts
        .iter()
        .copied()
        .filter(|seconds| *seconds > 0 && *seconds <= 24 * 60 * 60)
        .collect::<Vec<u64>>();

    values.sort_unstable();
    values.dedup();
    values.reverse();

    if values.is_empty() {
        vec![600, 300, 60]
    } else {
        values
    }
}

fn state_companion_path(path: &Path, suffix: &str) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(STATE_FILE_NAME);
    path.with_file_name(format!("{file_name}{suffix}"))
}

fn backup_state_path(path: &Path) -> PathBuf {
    state_companion_path(path, ".bak")
}

fn next_corrupt_state_path(path: &Path) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(STATE_FILE_NAME);
    let base = format!("{file_name}.corrupt-{}", now_ms());
    let mut candidate = path.with_file_name(base.clone());
    let mut suffix = 1;
    while candidate.exists() {
        candidate = path.with_file_name(format!("{base}-{suffix}"));
        suffix += 1;
    }
    candidate
}

fn load_store(path: &Path) -> Result<LoadStoreOutcome, String> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(LoadStoreOutcome {
                store: SchedulerStore::default(),
                needs_persist: false,
                startup_notice: None,
            });
        }
        Err(error) => {
            return Err(format!("failed to read state file: {error}"));
        }
    };

    match serde_json::from_str::<PersistedState>(&content) {
        Ok(from_disk) => Ok(LoadStoreOutcome {
            store: SchedulerStore::from_persisted(from_disk),
            needs_persist: false,
            startup_notice: None,
        }),
        Err(parse_error) => {
            let corrupt_path = next_corrupt_state_path(path);
            fs::rename(path, &corrupt_path).map_err(|error| {
                format!(
                    "failed to quarantine corrupted state file to {}: {error}",
                    corrupt_path.display()
                )
            })?;

            let backup_path = backup_state_path(path);
            let mut reason = format!(
                "failed to parse state file: {parse_error}; quarantined at {}",
                corrupt_path.display()
            );
            let mut store = SchedulerStore::default();
            let mut recovered_from_backup = false;

            if backup_path.exists() {
                match fs::read_to_string(&backup_path) {
                    Ok(backup_content) => match serde_json::from_str::<PersistedState>(&backup_content)
                    {
                        Ok(backup_state) => {
                            store = SchedulerStore::from_persisted(backup_state);
                            recovered_from_backup = true;
                        }
                        Err(error) => {
                            reason.push_str(&format!(
                                "; backup parse failed ({}): {error}",
                                backup_path.display()
                            ));
                        }
                    },
                    Err(error) => {
                        reason.push_str(&format!(
                            "; backup read failed ({}): {error}",
                            backup_path.display()
                        ));
                    }
                }
            } else {
                reason.push_str("; backup not found");
            }

            push_event(
                &mut store,
                None,
                "state_parse_failed",
                "error",
                Some(reason),
            );

            if recovered_from_backup {
                push_event(
                    &mut store,
                    None,
                    "state_restored_from_backup",
                    "ok",
                    Some(format!("restored state from {}", backup_path.display())),
                );
            }

            let startup_notice = if recovered_from_backup {
                Some(
                    "상태 파일 손상을 감지해 마지막 정상 백업(.bak)으로 복구했습니다. 현재 스케줄을 확인해 주세요."
                        .to_string(),
                )
            } else {
                Some(
                    "상태 파일 손상을 감지해 기본 상태로 복구했습니다. 기존 스케줄은 안전을 위해 복원되지 않았습니다."
                        .to_string(),
                )
            };

            Ok(LoadStoreOutcome {
                store,
                needs_persist: true,
                startup_notice,
            })
        }
    }
}

fn persist_store(path: &Path, store: &SchedulerStore) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create state directory: {error}"))?;
    }

    let serialized = serde_json::to_string_pretty(&store.to_persisted())
        .map_err(|error| format!("failed to serialize state: {error}"))?;
    let temp_path = state_companion_path(path, ".tmp");
    let backup_path = backup_state_path(path);

    fs::write(&temp_path, serialized)
        .map_err(|error| format!("failed to write temp state file: {error}"))?;
    if let Ok(file) = fs::OpenOptions::new().write(true).open(&temp_path) {
        let _ = file.sync_all();
    }

    let had_existing_state = path.exists();
    if had_existing_state {
        if backup_path.exists() {
            fs::remove_file(&backup_path)
                .map_err(|error| format!("failed to remove previous backup file: {error}"))?;
        }
        fs::rename(path, &backup_path)
            .map_err(|error| format!("failed to move state file to backup: {error}"))?;
    }

    if let Err(error) = fs::rename(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        if had_existing_state && !path.exists() && backup_path.exists() {
            let _ = fs::rename(&backup_path, path);
        }
        return Err(format!("failed to replace state file atomically: {error}"));
    }

    Ok(())
}

fn push_event(
    store: &mut SchedulerStore,
    schedule_id: Option<String>,
    event_type: &str,
    result: &str,
    reason: Option<String>,
) {
    store.history.push(ExecutionEvent {
        schedule_id,
        event_type: event_type.to_string(),
        timestamp_ms: now_ms(),
        result: result.to_string(),
        reason,
    });

    if store.history.len() > HISTORY_LIMIT {
        let overflow = store.history.len() - HISTORY_LIMIT;
        store.history.drain(0..overflow);
    }
}

fn enforce_no_resume_in_mvp(store: &mut SchedulerStore) -> bool {
    let Some(active) = store.active.take() else {
        return false;
    };

    push_event(
        store,
        Some(active.id),
        "resume_not_supported",
        "ok",
        Some(
            "MVP 정책(NO_RESUME_IN_MVP)에 따라 앱 시작 시 이전 활성 스케줄 자동 복구를 지원하지 않아 해제되었습니다."
                .to_string(),
        ),
    );

    true
}

fn compute_next_local_target_ms(target_local_time: &str) -> Result<i64, String> {
    let parsed = NaiveTime::parse_from_str(target_local_time, "%H:%M")
        .map_err(|_| "target time must match HH:MM format".to_string())?;

    let now = Local::now();
    let today = now.date_naive();

    let mut candidate = today.and_time(parsed);
    let mut target = match Local.from_local_datetime(&candidate) {
        LocalResult::Single(value) => value,
        LocalResult::Ambiguous(earliest, _) => earliest,
        LocalResult::None => return Err("unable to resolve local target time".to_string()),
    };

    if target <= now {
        let tomorrow = today
            .checked_add_days(Days::new(1))
            .ok_or("failed to compute tomorrow date".to_string())?;
        candidate = tomorrow.and_time(parsed);
        target = match Local.from_local_datetime(&candidate) {
            LocalResult::Single(value) => value,
            LocalResult::Ambiguous(earliest, _) => earliest,
            LocalResult::None => return Err("unable to resolve next local target time".to_string()),
        };
    }

    Ok(target.timestamp_millis())
}

fn build_active_schedule(
    store: &mut SchedulerStore,
    request: ScheduleRequest,
) -> Result<ActiveSchedule, String> {
    let now = now_ms();
    let mode = request.mode;
    let pre_alerts = normalize_alerts(
        &request
            .pre_alerts
            .unwrap_or_else(|| store.settings.default_pre_alerts.clone()),
    );
    let process_stable_sec = request.process_stable_sec.unwrap_or(10).clamp(5, 600);

    let (
        trigger_at_ms,
        target_local_time,
        target_tz_offset_minutes,
        summary,
        process_selector,
    ) = match mode {
        ScheduleMode::Countdown => {
            let duration = request
                .duration_sec
                .ok_or("durationSec is required for countdown mode".to_string())?;
            if duration == 0 {
                return Err("durationSec must be greater than zero".to_string());
            }
            let trigger = now
                .checked_add((duration as i64) * 1000)
                .ok_or("duration is too large".to_string())?;
            (
                Some(trigger),
                None,
                None,
                format!("Countdown {}m {}s", duration / 60, duration % 60),
                None,
            )
        }
        ScheduleMode::SpecificTime => {
            let target = request
                .target_local_time
                .ok_or("targetLocalTime is required for specificTime mode".to_string())?;
            let trigger = compute_next_local_target_ms(&target)?;
            (
                Some(trigger),
                Some(target.clone()),
                Some(Local::now().offset().local_minus_utc() / 60),
                format!("Shutdown at local time {target}"),
                None,
            )
        }
        ScheduleMode::ProcessExit => {
            let selector = normalize_and_validate_process_selector(request.process_selector.as_ref())
                .map_err(|error| {
                    if error == "process selector is missing" {
                        "processSelector is required for processExit mode".to_string()
                    } else {
                        error
                    }
                })?;

            let descriptor = selector
                .name
                .clone()
                .or_else(|| selector.pid.map(|pid| format!("PID {pid}")))
                .ok_or("process selector is empty".to_string())?;
            (
                None,
                None,
                None,
                format!("Shutdown when {descriptor} exits (stable {process_stable_sec}s)"),
                Some(selector),
            )
        }
    };

    store.id_seq += 1;
    let id = format!("sch-{}-{}", now, store.id_seq);

    let mut next = ActiveSchedule {
        id,
        mode,
        summary,
        armed_at_ms: now,
        trigger_at_ms,
        target_local_time,
        target_tz_offset_minutes,
        pre_alerts,
        fired_alerts: Vec::new(),
        process_selector,
        process_tree_pids: Vec::new(),
        process_stable_sec,
        process_missing_since_ms: None,
        snooze_until_ms: None,
        process_match_degraded_logged: false,
        status: ScheduleStatus::Armed,
        final_warning_started_at_ms: None,
        final_warning_duration_sec: normalize_final_warning_sec(store.settings.final_warning_sec),
        shutdown_at_ms: None,
        shutdown_initiated_at_ms: None,
    };
    let _ = sync_shutdown_at_ms(&mut next);
    Ok(next)
}

fn resolve_state_path(app: &AppHandle) -> PathBuf {
    let mut dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    dir.push(STATE_FILE_NAME);
    dir
}

fn send_desktop_notification(app: &AppHandle, title: &str, body: &str) {
    let _ = app.notification().builder().title(title).body(body).show();
}

fn normalize_selector_text(value: Option<&String>) -> Option<String> {
    value
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(|item| item.to_string())
}

fn no_fail_open_process_exit_reason(error: &str) -> String {
    format!("NO_FAIL_OPEN_PROCESS_EXIT: process-exit selector invalid ({error}); cancelled for safety")
}

fn reset_process_exit_on_selector_failure(active: &mut ActiveSchedule) {
    active.process_missing_since_ms = None;
    active.process_tree_pids.clear();
    active.final_warning_started_at_ms = None;
    active.shutdown_initiated_at_ms = None;
}

fn apply_process_exit_fail_safe_cancel(
    store: &mut SchedulerStore,
    schedule_id: &str,
    reason: String,
) {
    push_event(
        store,
        Some(schedule_id.to_string()),
        "failed",
        "error",
        Some(reason),
    );
    if store
        .active
        .as_ref()
        .map(|active| active.id.as_str())
        == Some(schedule_id)
    {
        store.active = None;
    }
}

fn normalize_and_validate_process_selector(
    selector: Option<&ProcessSelector>,
) -> Result<ProcessSelector, String> {
    let Some(selector) = selector else {
        return Err("process selector is missing".to_string());
    };

    let mut normalized = selector.clone();
    normalized.name = normalize_selector_text(normalized.name.as_ref());
    normalized.executable = normalize_selector_text(normalized.executable.as_ref());
    normalized.cmdline_contains = normalize_selector_text(normalized.cmdline_contains.as_ref());

    if normalized.pid.is_none() && normalized.name.is_none() {
        return Err("process selector is empty".to_string());
    }

    let shell_like = normalized
        .name
        .as_deref()
        .map(is_shell_like_process_name)
        .unwrap_or(false);
    let has_advanced = normalized.executable.is_some() || normalized.cmdline_contains.is_some();
    if shell_like && !has_advanced {
        return Err(
            "shell 계열 프로세스는 오탐 방지를 위해 executable 또는 cmdlineContains가 필요합니다."
                .to_string(),
        );
    }

    Ok(normalized)
}

fn normalize_selector_path(value: Option<&String>) -> Option<String> {
    normalize_selector_text(value).map(|path| path.replace('\\', "/").to_lowercase())
}

fn is_shell_like_process_name(name: &str) -> bool {
    let normalized = name.to_lowercase();
    normalized.contains("powershell")
        || normalized.contains("pwsh")
        || normalized == "bash"
        || normalized.ends_with("/bash")
        || normalized == "zsh"
        || normalized.ends_with("/zsh")
        || normalized == "sh"
        || normalized.ends_with("/sh")
}

fn run_shutdown_command(settings: &AppSettings) -> Result<ShutdownDispatchReport, String> {
    let force_simulate = std::env::var("AUTOSD_FORCE_SIMULATE_ONLY")
        .map(|value| {
            let normalized = value.trim().to_ascii_lowercase();
            !matches!(normalized.as_str(), "" | "0" | "false" | "off")
        })
        .unwrap_or(false)
        || std::env::var("CI")
            .map(|value| value.trim().eq_ignore_ascii_case("true"))
            .unwrap_or(false);

    #[cfg(target_os = "windows")]
    let dispatch = ShutdownDispatchReport {
        command_line: format!("shutdown /s /t {WINDOWS_ABORTABLE_SHUTDOWN_SEC}"),
        abort_hint: Some("shutdown /a".to_string()),
        dry_run: settings.simulate_only || force_simulate,
    };

    #[cfg(target_os = "macos")]
    let dispatch = ShutdownDispatchReport {
        command_line: "osascript -e \"tell application \\\"System Events\\\" to shut down\""
            .to_string(),
        abort_hint: None,
        dry_run: settings.simulate_only || force_simulate,
    };

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let dispatch = ShutdownDispatchReport {
        command_line: "shutdown command unsupported on this OS".to_string(),
        abort_hint: None,
        dry_run: settings.simulate_only || force_simulate,
    };

    if dispatch.dry_run {
        return Ok(dispatch);
    }

    #[cfg(target_os = "windows")]
    {
        let timeout_arg = WINDOWS_ABORTABLE_SHUTDOWN_SEC.to_string();
        let status = Command::new("shutdown")
            .args(["/s", "/t", timeout_arg.as_str()])
            .status()
            .map_err(|error| format!("failed to run windows shutdown command: {error}"))?;
        if status.success() {
            return Ok(dispatch);
        }
        return Err(format!("windows shutdown failed with status: {status}"));
    }

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("osascript")
            .args(["-e", "tell application \"System Events\" to shut down"])
            .status()
            .map_err(|error| format!("failed to run macOS shutdown command: {error}"))?;
        if status.success() {
            return Ok(dispatch);
        }
        return Err(format!("macOS shutdown failed with status: {status}"));
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        Err("unsupported OS for shutdown in this MVP".to_string())
    }
}

fn cancel_active_schedule_internal(
    app: &AppHandle,
    reason: &str,
    emit_notification: bool,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut store = lock_store(&state.store);
    let Some(active) = store.active.as_ref() else {
        return Ok(());
    };

    if is_shutdown_execution_started(active) {
        return Err("shutdown has already started; cannot cancel".to_string());
    }

    let schedule_id = active.id.clone();

    store.active = None;
    push_event(
        &mut store,
        Some(schedule_id),
        "cancelled",
        "ok",
        Some(reason.to_string()),
    );
    state.persist_locked(&store)?;

    if emit_notification {
        send_desktop_notification(app, "Auto Shutdown Scheduler", reason);
    }

    Ok(())
}

fn postpone_schedule_internal(app: &AppHandle, minutes: u64, reason: &str) -> Result<(), String> {
    if minutes == 0 || minutes > 24 * 60 {
        return Err("minutes must be within 1..=1440".to_string());
    }

    let state = app.state::<AppState>();
    let mut store = lock_store(&state.store);
    let Some(active) = store.active.as_mut() else {
        return Err("no active schedule to postpone".to_string());
    };

    if is_shutdown_execution_started(active) {
        return Err("shutdown has already started; cannot postpone".to_string());
    }

    let schedule_id = active.id.clone();
    let now = now_ms();
    let postpone_sec = minutes * 60;

    if matches!(active.mode, ScheduleMode::ProcessExit) {
        active.status = ScheduleStatus::Armed;
        active.final_warning_started_at_ms = None;
        active.process_missing_since_ms = None;
        active.snooze_until_ms = Some(now + (postpone_sec as i64) * 1000);
        active.shutdown_initiated_at_ms = None;
    } else {
        active.mode = ScheduleMode::Countdown;
        active.summary = format!("Snoozed for {minutes} minutes");
        active.trigger_at_ms = Some(now + (postpone_sec as i64) * 1000);
        active.target_local_time = None;
        active.target_tz_offset_minutes = None;
        active.status = ScheduleStatus::Armed;
        active.final_warning_started_at_ms = None;
        active.fired_alerts.clear();
        active.process_missing_since_ms = None;
        active.process_selector = None;
        active.process_tree_pids.clear();
        active.snooze_until_ms = None;
        active.process_match_degraded_logged = false;
        active.shutdown_initiated_at_ms = None;
    }
    let _ = sync_shutdown_at_ms(active);

    push_event(
        &mut store,
        Some(schedule_id),
        "postponed",
        "ok",
        Some(reason.to_string()),
    );
    state.persist_locked(&store)?;

    send_desktop_notification(
        app,
        "Auto Shutdown Scheduler",
        &format!("Schedule postponed by {minutes} minutes."),
    );

    Ok(())
}

fn execute_active_shutdown(app: &AppHandle, schedule_id: String) {
    let state = app.state::<AppState>();
    let settings = {
        let mut store = lock_store(&state.store);
        let now = now_ms();

        let Some(active) = store.active.as_mut() else {
            return;
        };

        if active.id != schedule_id {
            return;
        }

        if !try_mark_shutdown_initiated(active, now) {
            return;
        }
        let _ = sync_shutdown_at_ms(active);

        push_event(
            &mut store,
            Some(schedule_id.clone()),
            "shutdown_initiated",
            "ok",
            Some("final warning elapsed; shutdown command starting".to_string()),
        );
        let settings = store.settings.clone();
        if let Err(error) = state.persist_locked(&store) {
            send_desktop_notification(
                app,
                "Auto Shutdown Scheduler",
                &format!("Warning: failed to persist shutdown initiation state: {error}"),
            );
        }
        settings
    };

    let result = run_shutdown_command(&settings);

    let mut store = lock_store(&state.store);
    match result {
        Ok(dispatch) => {
            let event_reason = Some(dispatch.log_line());
            push_event(
                &mut store,
                Some(schedule_id.clone()),
                "executed",
                "ok",
                event_reason,
            );
            if store
                .active
                .as_ref()
                .map(|active| active.id.as_str())
                == Some(schedule_id.as_str())
            {
                store.active = None;
            }
            let _ = state.persist_locked(&store);
            if dispatch.dry_run {
                send_desktop_notification(
                    app,
                    "Auto Shutdown Scheduler",
                    &format!(
                        "Dry run complete. {}",
                        dispatch.log_line()
                    ),
                );
            }
        }
        Err(error) => {
            push_event(
                &mut store,
                Some(schedule_id.clone()),
                "failed",
                "error",
                Some(error.clone()),
            );
            if store
                .active
                .as_ref()
                .map(|active| active.id.as_str())
                == Some(schedule_id.as_str())
            {
                store.active = None;
            }
            let _ = state.persist_locked(&store);
            send_desktop_notification(app, "Auto Shutdown Scheduler", &error);
        }
    }
}

fn tick_scheduler(app: &AppHandle) {
    struct PendingNotification {
        title: String,
        body: String,
    }

    enum ProcessScanState {
        NotRequested,
        Invalid {
            schedule_id: String,
            status: ScheduleStatus,
            reason: String,
        },
        Ready {
            schedule_id: String,
            status: ScheduleStatus,
            result: ProcessMatchResult,
        },
    }

    let mut notifications = Vec::<PendingNotification>::new();
    let mut should_execute = None::<String>;
    let state = app.state::<AppState>();
    let scan_state = {
        let store = lock_store(&state.store);
        let Some(active) = store.active.as_ref() else {
            return;
        };

        if !matches!(active.mode, ScheduleMode::ProcessExit)
            || !matches!(active.status, ScheduleStatus::Armed | ScheduleStatus::FinalWarning)
        {
            ProcessScanState::NotRequested
        } else {
            match normalize_and_validate_process_selector(active.process_selector.as_ref()) {
                Ok(selector) => {
                    let schedule_id = active.id.clone();
                    let status = active.status.clone();
                    let tracked_pids = active.process_tree_pids.clone();

                    drop(store);
                    let result = {
                        let mut scanner = lock_scanner(&state.scanner);
                        scanner.is_process_running(&selector, &tracked_pids)
                    };

                    ProcessScanState::Ready {
                        schedule_id,
                        status,
                        result,
                    }
                }
                Err(error) => ProcessScanState::Invalid {
                    schedule_id: active.id.clone(),
                    status: active.status.clone(),
                    reason: no_fail_open_process_exit_reason(&error),
                },
            }
        }
    };

    {
        let mut store = lock_store(&state.store);
        let Some(active) = store.active.as_mut() else {
            return;
        };

        let mut changed = false;
        let mut pending_events = Vec::<(String, Option<String>)>::new();
        let now = now_ms();
        let schedule_id = active.id.clone();
        let mut fail_safe_cancel_reason = None::<String>;

        match active.status {
            ScheduleStatus::Armed => match active.mode {
                ScheduleMode::Countdown | ScheduleMode::SpecificTime => {
                    if matches!(active.mode, ScheduleMode::SpecificTime) {
                        if let (Some(target_label), Some(saved_offset)) = (
                            active.target_local_time.clone(),
                            active.target_tz_offset_minutes,
                        ) {
                            let current_offset = Local::now().offset().local_minus_utc() / 60;
                            if current_offset != saved_offset {
                                if let Ok(recomputed_ms) = compute_next_local_target_ms(&target_label)
                                {
                                    active.trigger_at_ms = Some(recomputed_ms);
                                    active.target_tz_offset_minutes = Some(current_offset);
                                    changed = true;
                                    pending_events.push((
                                        "timezone_realigned".to_string(),
                                        Some("specific-time schedule was realigned after timezone change".to_string()),
                                    ));
                                }
                            }
                        }
                    }

                    if let Some(trigger_at_ms) = active.trigger_at_ms {
                        let remaining_sec = if trigger_at_ms > now {
                            ((trigger_at_ms - now) / 1000) as u64
                        } else {
                            0
                        };

                        for threshold_sec in active.pre_alerts.clone() {
                            if remaining_sec > 0
                                && remaining_sec <= threshold_sec
                                && !active.fired_alerts.contains(&threshold_sec)
                            {
                                active.fired_alerts.push(threshold_sec);
                                changed = true;
                                pending_events.push((
                                    "alerted".to_string(),
                                    Some(format!("pre-alert fired at {threshold_sec}s")),
                                ));
                                notifications.push(PendingNotification {
                                    title: "Auto Shutdown Scheduler".to_string(),
                                    body: pre_alert_notification_body(threshold_sec),
                                });
                            }
                        }

                        if remaining_sec == 0 {
                            active.status = ScheduleStatus::FinalWarning;
                            active.final_warning_started_at_ms = Some(now);
                            active.shutdown_initiated_at_ms = None;
                            changed = true;
                            pending_events.push((
                                "final_warning".to_string(),
                                Some("entered shutdown waiting mode (final warning stage)".to_string()),
                            ));
                            notifications.push(PendingNotification {
                                title: "Auto Shutdown Scheduler".to_string(),
                                body: final_warning_notification_body(
                                    active.final_warning_duration_sec,
                                ),
                            });
                        }
                    }
                }
                ScheduleMode::ProcessExit => {
                    if let Some(snooze_until_ms) = active.snooze_until_ms {
                        if now >= snooze_until_ms {
                            active.snooze_until_ms = None;
                            changed = true;
                        }
                    }
                    match &scan_state {
                        ProcessScanState::Ready {
                            schedule_id: scanned_id,
                            status,
                            result,
                        } if scanned_id == &schedule_id && status == &active.status => {
                            let match_result = result.clone();
                            active.process_tree_pids = match_result.matched_pids.clone();

                            if match_result.degraded_to_name && !active.process_match_degraded_logged
                            {
                                active.process_match_degraded_logged = true;
                                changed = true;
                                pending_events.push((
                                    "process_match_degraded".to_string(),
                                    Some(
                                        "advanced process matching unavailable; fell back to name matching"
                                            .to_string(),
                                    ),
                                ));
                            }

                            if match_result.running {
                                if active.process_missing_since_ms.is_some() {
                                    active.process_missing_since_ms = None;
                                    changed = true;
                                }
                            } else {
                                if active.process_missing_since_ms.is_none() {
                                    active.process_missing_since_ms = Some(now);
                                    changed = true;
                                }

                                let missing_for =
                                    now - active.process_missing_since_ms.unwrap_or(now);
                                if missing_for >= (active.process_stable_sec as i64) * 1000 {
                                    let snoozed = active
                                        .snooze_until_ms
                                        .map(|snooze_until_ms| now < snooze_until_ms)
                                        .unwrap_or(false);

                                    if !snoozed {
                                        active.status = ScheduleStatus::FinalWarning;
                                        active.final_warning_started_at_ms = Some(now);
                                        active.process_missing_since_ms = None;
                                        active.shutdown_initiated_at_ms = None;
                                        changed = true;
                                        pending_events.push((
                                            "final_warning".to_string(),
                                            Some("target process exited; entered shutdown waiting mode".to_string()),
                                        ));
                                        notifications.push(PendingNotification {
                                            title: "Auto Shutdown Scheduler".to_string(),
                                            body: process_exit_final_warning_notification_body(
                                                active.final_warning_duration_sec,
                                            ),
                                        });
                                    }
                                }
                            }
                        }
                        ProcessScanState::Invalid {
                            schedule_id: scanned_id,
                            status,
                            reason,
                        } if scanned_id == &schedule_id && status == &active.status => {
                            if fail_safe_cancel_reason.is_none() {
                                fail_safe_cancel_reason = Some(reason.clone());
                            }
                            reset_process_exit_on_selector_failure(active);
                            changed = true;
                        }
                        ProcessScanState::Ready { .. } | ProcessScanState::Invalid { .. } => {}
                        ProcessScanState::NotRequested => {}
                    }
                }
            },
            ScheduleStatus::FinalWarning => {
                let mut reverted = false;
                if matches!(active.mode, ScheduleMode::ProcessExit) {
                    match &scan_state {
                        ProcessScanState::Ready {
                            schedule_id: scanned_id,
                            status,
                            result,
                        } if scanned_id == &schedule_id && status == &active.status => {
                            let match_result = result.clone();
                            active.process_tree_pids = match_result.matched_pids.clone();

                            if match_result.degraded_to_name && !active.process_match_degraded_logged {
                                active.process_match_degraded_logged = true;
                                changed = true;
                                pending_events.push((
                                    "process_match_degraded".to_string(),
                                    Some(
                                        "advanced process matching unavailable; fell back to name matching"
                                            .to_string(),
                                    ),
                                ));
                            }

                            if match_result.running {
                                active.status = ScheduleStatus::Armed;
                                active.final_warning_started_at_ms = None;
                                active.process_missing_since_ms = None;
                                active.shutdown_initiated_at_ms = None;
                                changed = true;
                                reverted = true;
                                pending_events.push((
                                    "final_warning_reverted".to_string(),
                                    Some(format!(
                                        "target process detected again ({})",
                                        process_match_source_label(match_result.source)
                                    )),
                                ));
                                notifications.push(PendingNotification {
                                    title: "Auto Shutdown Scheduler".to_string(),
                                    body: "감시 대상이 다시 실행되어 종료를 보류했습니다.".to_string(),
                                });
                            }
                        }
                        ProcessScanState::Invalid {
                            schedule_id: scanned_id,
                            status,
                            reason,
                        } if scanned_id == &schedule_id && status == &active.status => {
                            if fail_safe_cancel_reason.is_none() {
                                fail_safe_cancel_reason = Some(reason.clone());
                            }
                            reset_process_exit_on_selector_failure(active);
                            changed = true;
                            reverted = true;
                        }
                        ProcessScanState::Ready { .. } | ProcessScanState::Invalid { .. } => {
                            reverted = true;
                        }
                        ProcessScanState::NotRequested => {}
                    }
                }

                if !reverted {
                    if let Some(started_at_ms) = active.final_warning_started_at_ms {
                        let elapsed = now - started_at_ms;
                        if elapsed >= (active.final_warning_duration_sec as i64) * 1000 {
                            should_execute = Some(schedule_id.clone());
                        }
                    } else {
                        active.final_warning_started_at_ms = Some(now);
                        changed = true;
                    }
                }
            }
            ScheduleStatus::ShuttingDown => {}
        }
        if sync_shutdown_at_ms(active) {
            changed = true;
        }

        for (event_type, reason) in pending_events {
            push_event(&mut store, Some(schedule_id.clone()), &event_type, "ok", reason);
        }

        if let Some(reason) = fail_safe_cancel_reason {
            should_execute = None;
            apply_process_exit_fail_safe_cancel(&mut store, &schedule_id, reason);
            notifications.push(PendingNotification {
                title: "Auto Shutdown Scheduler".to_string(),
                body: "프로세스 종료 감시 설정이 손상되어 스케줄을 안전 중단했습니다. 감시 대상을 다시 선택해 주세요."
                    .to_string(),
            });
            changed = true;
        }

        if changed {
            let _ = state.persist_locked(&store);
        }
    }

    for notification in notifications {
        send_desktop_notification(app, &notification.title, &notification.body);
    }

    if let Some(schedule_id) = should_execute {
        execute_active_shutdown(app, schedule_id);
    }
}

fn start_scheduler_loop(app: AppHandle) {
    scheduler::start_scheduler_loop(app, tick_scheduler);
}

fn upsert_active_schedule(
    store: &mut SchedulerStore,
    request: ScheduleRequest,
) -> Result<String, String> {
    if let Some(existing) = store.active.as_ref() {
        if is_shutdown_execution_started(existing) {
            return Err("shutdown has already started; cannot replace active schedule".to_string());
        }
    }

    let mut preview_store = store.clone();
    let next_active = build_active_schedule(&mut preview_store, request.clone())?;
    let schedule_id = next_active.id.clone();
    let summary = next_active.summary.clone();

    if let Some(existing) = store.active.take() {
        push_event(
            store,
            Some(existing.id),
            "cancelled",
            "ok",
            Some("cancelled(reason=replace)".to_string()),
        );
    }

    store.id_seq = preview_store.id_seq;
    store.active = Some(next_active);
    store.last_schedule_request = Some(request);
    push_event(
        store,
        Some(schedule_id),
        "armed",
        "ok",
        Some(summary.clone()),
    );

    Ok(summary)
}

fn default_quick_start_request(settings: &AppSettings) -> ScheduleRequest {
    ScheduleRequest {
        mode: ScheduleMode::Countdown,
        duration_sec: Some(60 * 60),
        target_local_time: None,
        process_selector: None,
        pre_alerts: Some(settings.default_pre_alerts.clone()),
        process_stable_sec: None,
    }
}

fn emit_tray_quick_start_request(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    let request = {
        let store = lock_store(&state.store);
        store
            .last_schedule_request
            .clone()
            .unwrap_or_else(|| default_quick_start_request(&store.settings))
    };

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }

    app.emit("tray_quick_start_requested", request)
        .map_err(|error| format!("failed to emit tray quick start request: {error}"))?;

    Ok(())
}

fn is_quit_guard_status(status: &ScheduleStatus) -> bool {
    matches!(status, ScheduleStatus::Armed | ScheduleStatus::FinalWarning)
}

fn active_status_requiring_quit_guard(app: &AppHandle) -> Option<ScheduleStatus> {
    let state = app.state::<AppState>();
    let store = lock_store(&state.store);
    store
        .active
        .as_ref()
        .map(|active| active.status.clone())
        .filter(is_quit_guard_status)
}

fn open_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn set_allow_exit_once(state: &tauri::State<AppState>, allow: bool) {
    let mut runtime = lock_runtime(&state.runtime);
    runtime.allow_exit_once = allow;
}

fn consume_allow_exit_once(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    let mut runtime = lock_runtime(&state.runtime);
    if runtime.allow_exit_once {
        runtime.allow_exit_once = false;
        true
    } else {
        false
    }
}

fn emit_quit_guard_requested(
    app: &AppHandle,
    source: &str,
    status: ScheduleStatus,
) -> Result<(), String> {
    open_main_window(app);
    app.emit(
        "quit_guard_requested",
        QuitGuardPayload {
            source: source.to_string(),
            status,
        },
    )
    .map_err(|error| format!("failed to emit quit guard request: {error}"))
}

fn request_quit_with_guard(app: &AppHandle, source: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    if let Some(status) = active_status_requiring_quit_guard(app) {
        set_allow_exit_once(&state, false);
        emit_quit_guard_requested(app, source, status)?;
        return Ok(());
    }

    set_allow_exit_once(&state, true);
    app.exit(0);
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct QuitResolutionOutcome {
    should_exit: bool,
    should_hide_window: bool,
    store_changed: bool,
}

fn apply_quit_guard_action(
    store: &mut SchedulerStore,
    action: QuitGuardAction,
) -> Result<QuitResolutionOutcome, String> {
    match action {
        QuitGuardAction::CancelAndQuit => {
            let mut changed = false;
            if let Some(active) = store.active.as_ref() {
                if is_shutdown_execution_started(active) {
                    return Err("shutdown has already started; cannot cancel".to_string());
                }

                let schedule_id = active.id.clone();
                store.active = None;
                push_event(
                    store,
                    Some(schedule_id),
                    "cancelled",
                    "ok",
                    Some("사용자가 '스케줄 취소 후 종료'를 선택했습니다.".to_string()),
                );
                changed = true;
            }
            Ok(QuitResolutionOutcome {
                should_exit: true,
                should_hide_window: false,
                store_changed: changed,
            })
        }
        QuitGuardAction::KeepBackground => Ok(QuitResolutionOutcome {
            should_exit: false,
            should_hide_window: true,
            store_changed: false,
        }),
        QuitGuardAction::Return => Ok(QuitResolutionOutcome {
            should_exit: false,
            should_hide_window: false,
            store_changed: false,
        }),
    }
}

fn show_countdown_from_tray(app: &AppHandle) {
    let state = app.state::<AppState>();
    let store = lock_store(&state.store);
    let now = now_ms();

    let message = if let Some(active) = store.active.as_ref() {
        if active.status == ScheduleStatus::ShuttingDown {
            "종료 명령 실행 중".to_string()
        } else if let Some(shutdown_at_ms) = active.shutdown_at_ms {
            let remaining = ((shutdown_at_ms - now).max(0) / 1000) as u64;
            format!(
                "종료 예정 {} · {}초 남음",
                format_local_timestamp_ms(shutdown_at_ms),
                remaining
            )
        } else if let Some(trigger_at_ms) = active.trigger_at_ms {
            let remaining = ((trigger_at_ms - now).max(0) / 1000) as u64;
            format!("자동 종료 대기 중 · {remaining}초 남음")
        } else {
            "자동 종료 대기 중 · 프로세스 종료 감시".to_string()
        }
    } else {
        "활성 스케줄 없음".to_string()
    };

    send_desktop_notification(app, "Auto Shutdown Scheduler", &message);
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let quick_start =
        MenuItemBuilder::with_id("quick_start_last_mode", "Quick Start Last Mode").build(app)?;
    let show_countdown = MenuItemBuilder::with_id("show_countdown", "Show Countdown").build(app)?;
    let show_window = MenuItemBuilder::with_id("show", "Open Window").build(app)?;
    let cancel = MenuItemBuilder::with_id("cancel", "Cancel Schedule").build(app)?;
    let postpone = MenuItemBuilder::with_id("postpone_10", "Snooze 10m").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "Quit App").build(app)?;

    let menu = MenuBuilder::new(app)
        .items(&[
            &quick_start,
            &show_countdown,
            &show_window,
            &cancel,
            &postpone,
            &quit,
        ])
        .build()?;

    TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("Auto Shutdown Scheduler")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "quick_start_last_mode" => {
                if let Err(error) = emit_tray_quick_start_request(app) {
                    send_desktop_notification(app, "Auto Shutdown Scheduler", &error);
                }
            }
            "show_countdown" => {
                show_countdown_from_tray(app);
            }
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "cancel" => {
                let _ = cancel_active_schedule_internal(app, "cancelled from tray menu", true);
            }
            "postpone_10" => {
                let _ = postpone_schedule_internal(app, 10, "snoozed 10m from tray menu");
            }
            "quit" => {
                if let Err(error) = request_quit_with_guard(app, "trayMenu") {
                    send_desktop_notification(app, "Auto Shutdown Scheduler", &error);
                }
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

#[tauri::command]
fn get_scheduler_snapshot(state: tauri::State<AppState>) -> SchedulerSnapshot {
    state.snapshot()
}

#[tauri::command]
async fn list_processes(state: tauri::State<'_, AppState>) -> Result<Vec<ProcessInfo>, String> {
    let scanner = Arc::clone(&state.scanner);
    tauri::async_runtime::spawn_blocking(move || {
        let mut scanner = lock_scanner(&scanner);
        Ok(scanner.list_running_processes())
    })
    .await
    .map_err(|error| format!("failed to join list_processes worker: {error}"))?
}

#[tauri::command]
fn arm_schedule(
    app: AppHandle,
    state: tauri::State<AppState>,
    request: ScheduleRequest,
) -> Result<SchedulerSnapshot, String> {
    let mut store = lock_store(&state.store);
    let previous_store = store.clone();
    let had_active_before = previous_store.active.is_some();
    let summary = upsert_active_schedule(&mut store, request)?;
    if let Err(error) = state.persist_locked(&store) {
        *store = previous_store;
        if had_active_before {
            let rollback_schedule_id = store.active.as_ref().map(|active| active.id.clone());
            if let Some(schedule_id) = rollback_schedule_id {
                push_event(
                    &mut store,
                    Some(schedule_id),
                    "replace_rolled_back",
                    "error",
                    Some("새 스케줄 활성화에 실패해 기존 스케줄로 복원했습니다.".to_string()),
                );
                let _ = state.persist_locked(&store);
            }
        }
        return Err(format!("상태를 저장하지 못했습니다. 다시 시도해 주세요. ({error})"));
    }
    drop(store);

    send_desktop_notification(&app, "Auto Shutdown Scheduler", &summary);
    Ok(state.snapshot())
}

#[tauri::command]
fn cancel_schedule(
    app: AppHandle,
    state: tauri::State<AppState>,
    reason: Option<String>,
) -> Result<SchedulerSnapshot, String> {
    cancel_active_schedule_internal(
        &app,
        reason
            .as_deref()
            .unwrap_or("cancelled by user from UI"),
        true,
    )?;
    Ok(state.snapshot())
}

#[tauri::command]
fn postpone_schedule(
    app: AppHandle,
    state: tauri::State<AppState>,
    minutes: u64,
    reason: Option<String>,
) -> Result<SchedulerSnapshot, String> {
    postpone_schedule_internal(
        &app,
        minutes,
        reason.as_deref().unwrap_or("snoozed by user from UI"),
    )?;
    Ok(state.snapshot())
}

#[tauri::command]
fn request_app_quit(
    app: AppHandle,
    state: tauri::State<AppState>,
) -> Result<SchedulerSnapshot, String> {
    request_quit_with_guard(&app, "uiCommand")?;
    Ok(state.snapshot())
}

#[tauri::command]
fn resolve_quit_guard(
    app: AppHandle,
    state: tauri::State<AppState>,
    action: QuitGuardAction,
) -> Result<SchedulerSnapshot, String> {
    let outcome = {
        let mut store = lock_store(&state.store);
        let outcome = apply_quit_guard_action(&mut store, action)?;
        if outcome.store_changed {
            state.persist_locked(&store)?;
        }
        outcome
    };

    if outcome.should_hide_window {
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.hide();
        }
    }

    if outcome.should_exit {
        set_allow_exit_once(&state, true);
        app.exit(0);
    } else {
        set_allow_exit_once(&state, false);
    }

    Ok(state.snapshot())
}

#[tauri::command]
fn update_settings(
    state: tauri::State<AppState>,
    updates: SettingsUpdate,
) -> Result<SchedulerSnapshot, String> {
    let mut store = lock_store(&state.store);

    if let Some(alerts) = updates.default_pre_alerts {
        store.settings.default_pre_alerts = normalize_alerts(&alerts);
    }

    if let Some(final_warning_sec) = updates.final_warning_sec {
        store.settings.final_warning_sec = validate_final_warning_sec(final_warning_sec)?;
    }

    if let Some(simulate_only) = updates.simulate_only {
        store.settings.simulate_only = simulate_only;
    }

    let final_warning_sec = store.settings.final_warning_sec;
    if let Some(active) = store.active.as_mut() {
        active.final_warning_duration_sec = final_warning_sec;
        let _ = sync_shutdown_at_ms(active);
    }

    push_event(
        &mut store,
        None,
        "settings_updated",
        "ok",
        Some("settings were updated".to_string()),
    );
    state.persist_locked(&store)?;
    Ok(state.snapshot())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let state_path = resolve_state_path(app.handle());
            let mut load_outcome = load_store(&state_path)
                .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
            let mut store = load_outcome.store;
            if enforce_no_resume_in_mvp(&mut store) {
                load_outcome.needs_persist = true;
            }

            if load_outcome.needs_persist {
                persist_store(&state_path, &store)
                    .map_err(|error| io::Error::new(io::ErrorKind::Other, error))?;
            }

            let startup_notice = load_outcome.startup_notice.take();
            app.manage(AppState {
                state_path,
                store: Mutex::new(store),
                runtime: Mutex::new(RuntimeState::default()),
                scanner: Arc::new(Mutex::new(ProcessScanner::new())),
            });

            setup_tray(app.handle())?;
            start_scheduler_loop(app.handle().clone());
            if let Some(notice) = startup_notice {
                send_desktop_notification(app.handle(), "Auto Shutdown Scheduler", &notice);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_scheduler_snapshot,
            list_processes,
            arm_schedule,
            cancel_schedule,
            postpone_schedule,
            request_app_quit,
            resolve_quit_guard,
            update_settings
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                if consume_allow_exit_once(app) {
                    return;
                }

                if let Some(status) = active_status_requiring_quit_guard(app) {
                    api.prevent_exit();
                    let _ = emit_quit_guard_requested(app, "appExit", status);
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_final_warning_schedule() -> ActiveSchedule {
        ActiveSchedule {
            id: "sch-test".to_string(),
            mode: ScheduleMode::Countdown,
            summary: "test".to_string(),
            armed_at_ms: 0,
            trigger_at_ms: Some(0),
            target_local_time: None,
            target_tz_offset_minutes: None,
            pre_alerts: vec![600, 300, 60],
            fired_alerts: vec![600, 300, 60],
            process_selector: None,
            process_tree_pids: Vec::new(),
            process_stable_sec: 10,
            process_missing_since_ms: None,
            snooze_until_ms: None,
            process_match_degraded_logged: false,
            status: ScheduleStatus::FinalWarning,
            final_warning_started_at_ms: Some(1_000),
            final_warning_duration_sec: 60,
            shutdown_at_ms: Some(61_000),
            shutdown_initiated_at_ms: None,
        }
    }

    #[test]
    fn shutdown_initiation_requires_elapsed_final_warning_window() {
        let mut schedule = sample_final_warning_schedule();

        assert!(!try_mark_shutdown_initiated(&mut schedule, 60_999));
        assert_eq!(schedule.status, ScheduleStatus::FinalWarning);
        assert_eq!(schedule.shutdown_initiated_at_ms, None);

        assert!(try_mark_shutdown_initiated(&mut schedule, 61_000));
        assert_eq!(schedule.status, ScheduleStatus::ShuttingDown);
        assert_eq!(schedule.shutdown_initiated_at_ms, Some(61_000));
    }

    #[test]
    fn shutdown_initiation_is_idempotent_after_first_transition() {
        let mut schedule = sample_final_warning_schedule();

        assert!(try_mark_shutdown_initiated(&mut schedule, 61_000));
        assert!(!try_mark_shutdown_initiated(&mut schedule, 62_000));
        assert_eq!(schedule.status, ScheduleStatus::ShuttingDown);
        assert_eq!(schedule.shutdown_initiated_at_ms, Some(61_000));
    }

    #[test]
    fn dry_run_shutdown_logs_abortable_command_plan() {
        let settings = AppSettings {
            default_pre_alerts: vec![600, 300, 60],
            final_warning_sec: 60,
            simulate_only: true,
        };

        let dispatch = run_shutdown_command(&settings)
            .expect("simulate-only dry run should always return dispatch details");

        assert!(dispatch.dry_run);
        assert!(dispatch.log_line().contains("DRY_RUN_SHUTDOWN_COMMAND"));

        #[cfg(target_os = "windows")]
        {
            assert!(dispatch.command_line.contains("shutdown /s /t"));
            assert!(dispatch
                .command_line
                .contains(&WINDOWS_ABORTABLE_SHUTDOWN_SEC.to_string()));
            assert_eq!(dispatch.abort_hint.as_deref(), Some("shutdown /a"));
        }

        #[cfg(target_os = "macos")]
        {
            assert!(dispatch.command_line.contains("osascript"));
            assert_eq!(dispatch.abort_hint, None);
        }

        #[cfg(not(any(target_os = "windows", target_os = "macos")))]
        {
            assert!(dispatch.command_line.contains("unsupported"));
            assert_eq!(dispatch.abort_hint, None);
        }
    }

    #[test]
    fn shutdown_at_ms_policy_for_armed_time_based_modes() {
        let mut schedule = sample_final_warning_schedule();
        schedule.status = ScheduleStatus::Armed;
        schedule.mode = ScheduleMode::Countdown;
        schedule.trigger_at_ms = Some(10_000);
        schedule.final_warning_started_at_ms = None;
        schedule.final_warning_duration_sec = 90;
        schedule.shutdown_at_ms = None;

        assert!(sync_shutdown_at_ms(&mut schedule));
        assert_eq!(schedule.shutdown_at_ms, Some(100_000));
    }

    #[test]
    fn shutdown_at_ms_policy_for_process_exit_armed_and_final_warning() {
        let mut armed = sample_final_warning_schedule();
        armed.mode = ScheduleMode::ProcessExit;
        armed.status = ScheduleStatus::Armed;
        armed.trigger_at_ms = None;
        armed.final_warning_started_at_ms = None;
        armed.shutdown_at_ms = Some(1);

        assert!(sync_shutdown_at_ms(&mut armed));
        assert_eq!(armed.shutdown_at_ms, None);

        let mut warning = armed.clone();
        warning.status = ScheduleStatus::FinalWarning;
        warning.final_warning_started_at_ms = Some(50_000);
        warning.final_warning_duration_sec = 60;

        assert!(sync_shutdown_at_ms(&mut warning));
        assert_eq!(warning.shutdown_at_ms, Some(110_000));
    }

    #[test]
    fn no_resume_policy_clears_persisted_active_schedule() {
        let mut store = SchedulerStore::default();
        let active = sample_final_warning_schedule();
        let schedule_id = active.id.clone();
        store.active = Some(active);

        assert!(enforce_no_resume_in_mvp(&mut store));
        assert!(store.active.is_none());

        let last_event = store.history.last().expect("startup event should be recorded");
        assert_eq!(last_event.event_type, "resume_not_supported");
        assert_eq!(last_event.result, "ok");
        assert_eq!(last_event.schedule_id.as_deref(), Some(schedule_id.as_str()));
    }

    #[test]
    fn no_resume_policy_is_noop_without_active_schedule() {
        let mut store = SchedulerStore::default();

        assert!(!enforce_no_resume_in_mvp(&mut store));
        assert!(store.history.is_empty());
        assert!(store.active.is_none());
    }

    #[test]
    fn process_selector_validation_rejects_missing_or_empty_selector() {
        assert_eq!(
            normalize_and_validate_process_selector(None).unwrap_err(),
            "process selector is missing"
        );

        let empty = ProcessSelector {
            pid: None,
            name: Some("   ".to_string()),
            executable: None,
            cmdline_contains: None,
        };
        assert_eq!(
            normalize_and_validate_process_selector(Some(&empty)).unwrap_err(),
            "process selector is empty"
        );
    }

    #[test]
    fn process_selector_validation_rejects_shell_name_without_advanced_match() {
        let selector = ProcessSelector {
            pid: None,
            name: Some("powershell".to_string()),
            executable: None,
            cmdline_contains: None,
        };

        let error = normalize_and_validate_process_selector(Some(&selector)).unwrap_err();
        assert!(error.contains("shell 계열 프로세스"));
    }

    #[test]
    fn process_selector_validation_accepts_and_normalizes_valid_selector() {
        let selector = ProcessSelector {
            pid: Some(1234),
            name: Some("  pwsh ".to_string()),
            executable: Some("  C:\\\\Windows\\\\System32\\\\pwsh.exe ".to_string()),
            cmdline_contains: Some("  -File ".to_string()),
        };

        let normalized = normalize_and_validate_process_selector(Some(&selector))
            .expect("selector should be valid");
        assert_eq!(normalized.pid, Some(1234));
        assert_eq!(normalized.name.as_deref(), Some("pwsh"));
        assert_eq!(
            normalized.executable.as_deref(),
            Some("C:\\\\Windows\\\\System32\\\\pwsh.exe")
        );
        assert_eq!(normalized.cmdline_contains.as_deref(), Some("-File"));
    }

    #[test]
    fn final_warning_policy_validates_range_and_recovers_defaults() {
        assert_eq!(normalize_final_warning_sec(60), 60);
        assert_eq!(normalize_final_warning_sec(14), FINAL_WARNING_DEFAULT_SEC);
        assert_eq!(normalize_final_warning_sec(301), FINAL_WARNING_DEFAULT_SEC);

        assert_eq!(validate_final_warning_sec(15).unwrap(), 15);
        assert_eq!(validate_final_warning_sec(300).unwrap(), 300);
        assert_eq!(
            validate_final_warning_sec(14).unwrap_err(),
            FINAL_WARNING_RANGE_ERROR
        );
        assert_eq!(
            validate_final_warning_sec(301).unwrap_err(),
            FINAL_WARNING_RANGE_ERROR
        );
    }

    #[test]
    fn quit_guard_policy_blocks_only_armed_and_final_warning() {
        assert!(is_quit_guard_status(&ScheduleStatus::Armed));
        assert!(is_quit_guard_status(&ScheduleStatus::FinalWarning));
        assert!(!is_quit_guard_status(&ScheduleStatus::ShuttingDown));
    }

    #[test]
    fn quit_guard_cancel_and_quit_cancels_active_and_requests_exit() {
        let mut store = SchedulerStore::default();
        let mut active = sample_final_warning_schedule();
        active.status = ScheduleStatus::Armed;
        let schedule_id = active.id.clone();
        store.active = Some(active);

        let outcome =
            apply_quit_guard_action(&mut store, QuitGuardAction::CancelAndQuit).unwrap();

        assert_eq!(
            outcome,
            QuitResolutionOutcome {
                should_exit: true,
                should_hide_window: false,
                store_changed: true,
            }
        );
        assert!(store.active.is_none());

        let last_event = store.history.last().expect("cancelled event should be recorded");
        assert_eq!(last_event.event_type, "cancelled");
        assert_eq!(last_event.result, "ok");
        assert_eq!(last_event.schedule_id.as_deref(), Some(schedule_id.as_str()));
    }

    #[test]
    fn quit_guard_keep_background_preserves_active_schedule() {
        let mut store = SchedulerStore::default();
        let mut active = sample_final_warning_schedule();
        active.status = ScheduleStatus::Armed;
        let schedule_id = active.id.clone();
        store.active = Some(active);

        let outcome =
            apply_quit_guard_action(&mut store, QuitGuardAction::KeepBackground).unwrap();
        assert_eq!(
            outcome,
            QuitResolutionOutcome {
                should_exit: false,
                should_hide_window: true,
                store_changed: false,
            }
        );
        assert_eq!(
            store.active.as_ref().map(|active| active.id.as_str()),
            Some(schedule_id.as_str())
        );
        assert!(store.history.is_empty());
    }

    #[test]
    fn quit_guard_return_keeps_state_unchanged() {
        let mut store = SchedulerStore::default();
        let mut active = sample_final_warning_schedule();
        active.status = ScheduleStatus::Armed;
        let schedule_id = active.id.clone();
        store.active = Some(active);

        let outcome = apply_quit_guard_action(&mut store, QuitGuardAction::Return).unwrap();
        assert_eq!(
            outcome,
            QuitResolutionOutcome {
                should_exit: false,
                should_hide_window: false,
                store_changed: false,
            }
        );
        assert_eq!(
            store.active.as_ref().map(|active| active.id.as_str()),
            Some(schedule_id.as_str())
        );
        assert!(store.history.is_empty());
    }

    #[test]
    fn replace_validation_failure_keeps_existing_active_schedule() {
        let mut store = SchedulerStore::default();
        let mut existing = sample_final_warning_schedule();
        existing.status = ScheduleStatus::Armed;
        let existing_id = existing.id.clone();
        store.active = Some(existing);

        let invalid_request = ScheduleRequest {
            mode: ScheduleMode::Countdown,
            duration_sec: None,
            target_local_time: None,
            process_selector: None,
            pre_alerts: None,
            process_stable_sec: None,
        };

        let error = upsert_active_schedule(&mut store, invalid_request).unwrap_err();
        assert!(error.contains("durationSec is required"));
        assert_eq!(
            store.active.as_ref().map(|active| active.id.as_str()),
            Some(existing_id.as_str())
        );
        assert!(
            store.history.is_empty(),
            "replace cancellation should not be recorded when validation fails"
        );
    }

    #[test]
    fn process_exit_fail_safe_cancels_active_and_records_failed_event() {
        let mut store = SchedulerStore::default();
        let mut active = sample_final_warning_schedule();
        active.mode = ScheduleMode::ProcessExit;
        let schedule_id = active.id.clone();
        store.active = Some(active);

        apply_process_exit_fail_safe_cancel(
            &mut store,
            &schedule_id,
            no_fail_open_process_exit_reason("process selector is missing"),
        );

        assert!(store.active.is_none());
        let last_event = store.history.last().expect("failed event should be recorded");
        assert_eq!(last_event.event_type, "failed");
        assert_eq!(last_event.result, "error");
        assert!(
            last_event
                .reason
                .as_deref()
                .unwrap_or_default()
                .contains("NO_FAIL_OPEN_PROCESS_EXIT")
        );
    }

    fn test_state_path(tag: &str) -> PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!(
            "autosd-state-{tag}-{}-{}.json",
            std::process::id(),
            now_ms()
        ));
        path
    }

    fn cleanup_state_files(path: &Path) {
        let _ = std::fs::remove_file(path);
        let _ = std::fs::remove_file(backup_state_path(path));
        let _ = std::fs::remove_file(state_companion_path(path, ".tmp"));

        let Some(parent) = path.parent() else {
            return;
        };
        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            return;
        };
        let corrupt_prefix = format!("{file_name}.corrupt-");
        if let Ok(entries) = std::fs::read_dir(parent) {
            for entry in entries.flatten() {
                if let Some(name) = entry.file_name().to_str() {
                    if name.starts_with(&corrupt_prefix) {
                        let _ = std::fs::remove_file(entry.path());
                    }
                }
            }
        }
    }

    #[test]
    fn persist_store_keeps_previous_snapshot_in_backup() {
        let path = test_state_path("persist-backup");
        cleanup_state_files(&path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("failed to create test directory");
        }

        let mut first = SchedulerStore::default();
        first.id_seq = 1;
        persist_store(&path, &first).expect("first persist should succeed");

        let mut second = first.clone();
        second.id_seq = 2;
        persist_store(&path, &second).expect("second persist should succeed");

        let backup_path = backup_state_path(&path);
        assert!(backup_path.exists(), "backup file should exist after second persist");

        let current_json =
            std::fs::read_to_string(&path).expect("current state file should be readable");
        let backup_json =
            std::fs::read_to_string(&backup_path).expect("backup state file should be readable");
        let current: PersistedState =
            serde_json::from_str(&current_json).expect("current state should parse");
        let backup: PersistedState =
            serde_json::from_str(&backup_json).expect("backup state should parse");

        assert_eq!(current.id_seq, 2);
        assert_eq!(backup.id_seq, 1);

        cleanup_state_files(&path);
    }

    #[test]
    fn persisted_state_never_contains_internal_shutting_down_status() {
        let path = test_state_path("persist-shutting-down");
        cleanup_state_files(&path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("failed to create test directory");
        }

        let mut store = SchedulerStore::default();
        let mut active = sample_final_warning_schedule();
        active.status = ScheduleStatus::ShuttingDown;
        store.active = Some(active);
        persist_store(&path, &store).expect("persist should succeed");

        let raw = std::fs::read_to_string(&path).expect("state file should be readable");
        let persisted: PersistedState = serde_json::from_str(&raw).expect("state should parse");
        assert_eq!(
            persisted
                .active
                .as_ref()
                .map(|active| active.status.clone()),
            Some(ScheduleStatus::FinalWarning)
        );

        cleanup_state_files(&path);
    }

    #[test]
    fn load_store_quarantines_corrupt_file_and_recovers_from_backup() {
        let path = test_state_path("load-recover");
        cleanup_state_files(&path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("failed to create test directory");
        }

        let backup_path = backup_state_path(&path);
        let mut backup_store = SchedulerStore::default();
        backup_store.id_seq = 77;
        let backup_json = serde_json::to_string_pretty(&backup_store.to_persisted())
            .expect("failed to serialize backup state");
        std::fs::write(&backup_path, backup_json).expect("failed to write backup state");
        std::fs::write(&path, "{ invalid json").expect("failed to write corrupt state");

        let outcome = load_store(&path).expect("load should recover from backup");
        assert!(outcome.needs_persist, "recovered state should be persisted");
        assert_eq!(outcome.store.id_seq, 77);
        assert!(
            outcome
                .store
                .history
                .iter()
                .any(|item| item.event_type == "state_parse_failed" && item.result == "error")
        );
        assert!(
            outcome
                .store
                .history
                .iter()
                .any(|item| item.event_type == "state_restored_from_backup" && item.result == "ok")
        );
        assert!(
            outcome
                .startup_notice
                .as_deref()
                .unwrap_or_default()
                .contains("백업")
        );
        assert!(!path.exists(), "corrupt file should be quarantined away from main path");

        let file_name = path
            .file_name()
            .and_then(|name| name.to_str())
            .expect("test path should have file name");
        let corrupt_prefix = format!("{file_name}.corrupt-");
        let corrupt_files = std::fs::read_dir(path.parent().expect("path should have parent"))
            .expect("failed to scan parent dir")
            .flatten()
            .filter(|entry| {
                entry
                    .file_name()
                    .to_str()
                    .map(|name| name.starts_with(&corrupt_prefix))
                    .unwrap_or(false)
            })
            .count();
        assert!(corrupt_files >= 1, "quarantined corrupt file should be present");

        cleanup_state_files(&path);
    }

    #[test]
    fn load_store_quarantines_corrupt_file_without_backup() {
        let path = test_state_path("load-default");
        cleanup_state_files(&path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("failed to create test directory");
        }

        std::fs::write(&path, "{ invalid json").expect("failed to write corrupt state");
        let outcome = load_store(&path).expect("load should fall back to default state");

        assert!(outcome.needs_persist, "fallback state should be persisted");
        assert!(outcome.store.active.is_none());
        assert_eq!(outcome.store.id_seq, 0);
        assert!(
            outcome
                .store
                .history
                .iter()
                .any(|item| item.event_type == "state_parse_failed" && item.result == "error")
        );
        assert!(
            outcome
                .store
                .history
                .iter()
                .all(|item| item.event_type != "state_restored_from_backup")
        );
        assert!(
            outcome
                .startup_notice
                .as_deref()
                .unwrap_or_default()
                .contains("기본 상태")
        );

        cleanup_state_files(&path);
    }
}
