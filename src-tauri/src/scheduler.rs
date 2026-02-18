use std::{
    panic::{self, AssertUnwindSafe},
    thread,
    time::Duration,
};

use tauri::AppHandle;

pub(crate) fn start_scheduler_loop<F>(app: AppHandle, mut tick: F)
where
    F: FnMut(&AppHandle) + Send + 'static,
{
    thread::spawn(move || {
        loop {
            let _ = panic::catch_unwind(AssertUnwindSafe(|| {
                tick(&app);
            }))
            .map_err(|_| {
                eprintln!("scheduler tick panicked; loop continues");
            });

            thread::sleep(Duration::from_secs(1));
        }
    });
}
