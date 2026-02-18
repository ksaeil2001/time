use std::collections::{HashMap, HashSet};

use sysinfo::{Pid, ProcessesToUpdate, System};

use super::{
    is_shell_like_process_name, normalize_selector_path, normalize_selector_text, ProcessInfo,
    ProcessMatchResult, ProcessMatchSource, ProcessSelector,
};

#[derive(Debug)]
pub(crate) struct ProcessScanner {
    system: System,
}

impl Default for ProcessScanner {
    fn default() -> Self {
        Self::new()
    }
}

impl ProcessScanner {
    pub(crate) fn new() -> Self {
        Self {
            system: System::new_all(),
        }
    }

    fn refresh(&mut self) {
        self.system.refresh_processes(ProcessesToUpdate::All, true);
    }

    pub(crate) fn list_running_processes(&mut self) -> Vec<ProcessInfo> {
        self.refresh();

        let mut processes = self
            .system
            .processes()
            .iter()
            .map(|(pid, process)| ProcessInfo {
                pid: pid.as_u32(),
                name: process.name().to_string_lossy().to_string(),
                executable: process.exe().map(|path| path.display().to_string()),
            })
            .filter(|item| !item.name.is_empty())
            .collect::<Vec<_>>();

        processes.sort_by(|left, right| left.name.cmp(&right.name).then(left.pid.cmp(&right.pid)));
        processes
    }

    pub(crate) fn is_process_running(
        &mut self,
        selector: &ProcessSelector,
        tracked_pids: &[u32],
    ) -> ProcessMatchResult {
        self.refresh();

        let selector_name =
            normalize_selector_text(selector.name.as_ref()).map(|name| name.to_lowercase());
        let selector_executable = normalize_selector_path(selector.executable.as_ref());
        let selector_cmdline = normalize_selector_text(selector.cmdline_contains.as_ref())
            .map(|item| item.to_lowercase());
        let allow_name_fallback = selector_name
            .as_ref()
            .map(|name| {
                !is_shell_like_process_name(name)
                    || selector_executable.is_some()
                    || selector_cmdline.is_some()
            })
            .unwrap_or(false);

        let advanced_requested = selector_executable.is_some() || selector_cmdline.is_some();
        let mut advanced_data_unavailable = false;
        let mut running = false;
        let mut source = ProcessMatchSource::None;
        let mut next_tracked = tracked_pids.iter().copied().collect::<HashSet<u32>>();

        if let Some(pid) = selector.pid {
            let children_index = self.build_children_index();
            let tree = collect_tree_from_index(
                Pid::from_u32(pid),
                &children_index,
                |candidate| self.system.process(candidate).is_some(),
            );
            if !tree.is_empty() {
                running = true;
                source = ProcessMatchSource::PidTree;
                next_tracked.extend(tree);
            }
        }

        next_tracked = next_tracked
            .into_iter()
            .filter(|pid| self.system.process(Pid::from_u32(*pid)).is_some())
            .collect();

        if !running && !next_tracked.is_empty() {
            running = true;
            source = ProcessMatchSource::TrackedPids;
        }

        if !running && advanced_requested {
            let advanced_match = self
                .system
                .processes()
                .iter()
                .filter_map(|(pid, process)| {
                    let executable_match = if let Some(expected) = selector_executable.as_ref() {
                        match process.exe() {
                            Some(actual_path) => {
                                actual_path.display().to_string().replace('\\', "/").to_lowercase()
                                    == *expected
                            }
                            None => {
                                advanced_data_unavailable = true;
                                false
                            }
                        }
                    } else {
                        true
                    };

                    if !executable_match {
                        return None;
                    }

                    let cmdline_match = if let Some(token) = selector_cmdline.as_ref() {
                        let cmdline = process.cmd();
                        if cmdline.is_empty() {
                            advanced_data_unavailable = true;
                            false
                        } else {
                            cmdline
                                .iter()
                                .map(|part| part.to_string_lossy().into_owned())
                                .collect::<Vec<_>>()
                                .join(" ")
                                .to_lowercase()
                                .contains(token)
                        }
                    } else {
                        true
                    };

                    if cmdline_match {
                        Some(pid.as_u32())
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>();

            if !advanced_match.is_empty() {
                running = true;
                source = ProcessMatchSource::Advanced;
                next_tracked.extend(advanced_match);
            }
        }

        if !running && allow_name_fallback {
            if let Some(needle) = selector_name.as_ref() {
                let by_name = self
                    .system
                    .processes()
                    .iter()
                    .filter_map(|(pid, process)| {
                        if process.name().to_string_lossy().to_lowercase() == *needle {
                            Some(pid.as_u32())
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>();
                if !by_name.is_empty() {
                    running = true;
                    source = ProcessMatchSource::NameFallback;
                    next_tracked.extend(by_name);
                }
            }
        }

        let mut normalized = next_tracked.into_iter().collect::<Vec<_>>();
        normalized.sort_unstable();

        ProcessMatchResult {
            running,
            matched_pids: normalized,
            source,
            degraded_to_name: advanced_requested
                && advanced_data_unavailable
                && source == ProcessMatchSource::NameFallback,
        }
    }

    fn build_children_index(&self) -> HashMap<Pid, Vec<Pid>> {
        let mut index = HashMap::<Pid, Vec<Pid>>::new();
        for (pid, process) in self.system.processes() {
            if let Some(parent) = process.parent() {
                index.entry(parent).or_default().push(*pid);
            }
        }
        index
    }
}

fn collect_tree_from_index<F>(
    root_pid: Pid,
    children_index: &HashMap<Pid, Vec<Pid>>,
    mut is_alive: F,
) -> Vec<u32>
where
    F: FnMut(Pid) -> bool,
{
    let mut stack = vec![root_pid];
    let mut visited = HashSet::<Pid>::new();
    let mut collected = Vec::<u32>::new();

    while let Some(current) = stack.pop() {
        if !visited.insert(current) {
            continue;
        }

        if !is_alive(current) {
            continue;
        }

        collected.push(current.as_u32());

        if let Some(children) = children_index.get(&current) {
            for child in children.iter().rev() {
                stack.push(*child);
            }
        }
    }

    collected
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_tree_from_index_deduplicates_and_visits_descendants() {
        let root = Pid::from_u32(10);
        let child_a = Pid::from_u32(11);
        let child_b = Pid::from_u32(12);
        let grandchild = Pid::from_u32(13);

        let mut index = HashMap::<Pid, Vec<Pid>>::new();
        index.insert(root, vec![child_a, child_b]);
        index.insert(child_a, vec![grandchild]);
        index.insert(child_b, vec![grandchild]);

        let alive = HashSet::from([root, child_a, child_b, grandchild]);

        let mut collected = collect_tree_from_index(root, &index, |pid| alive.contains(&pid));
        collected.sort_unstable();

        assert_eq!(collected, vec![10, 11, 12, 13]);
    }
}
