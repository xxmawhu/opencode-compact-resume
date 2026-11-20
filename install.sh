#!/usr/bin/env bash
# Install opencode-compact-resume into the OpenCode config directory by copying
# the prebuilt plugin files (no build step, no network).
#
# Usage:
#   bash install.sh                    # install into ${XDG_CONFIG_HOME:-$HOME/.config}/opencode
#   OPENCODE_CONFIG_DIR=/path bash install.sh
#   bash install.sh --verify           # read-only check of the installed copy
#   bash install.sh --uninstall
#
# Installed layout:
#   <config>/plugin/opencode-compact-resume.ts       local entry (v1 + v2)
#   <config>/opencode-compact-resume-lib/            dist modules + package.json + .install-info
#
# The module dir deliberately lives outside <config>/plugin/: opencode2 treats
# every first-level directory under `plugin/` as a plugin package, so keeping
# the library there loads it as a second plugin and relies on the host's
# undocumented id de-duplication to avoid a double setup.
#
# OpenCode plugin installation contract v1 (local implementation):
#   - the library stays outside the scan path; plugin/ holds the entry only (R1, R2)
#   - one hybrid object entry activates exactly once per host process (R3, R4)
#   - setup/server guard every host capability before use (R5)
#   - this installer is idempotent: legacy scan-path dirs are removed, unchanged
#     content keeps its mtime, and each artifact is staged next to its target
#     then renamed into place (R6)
#   - zero-warning acceptance (R7) means both hosts load with
#     `failed to load plugin` = 0 and one activation per process.
set -euo pipefail

PLUGIN_NAME="opencode-compact-resume"
SCRIPT_DIR="$(cd -- "$(dirname -- "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
CONFIG_DIR="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-${HOME}/.config}/opencode}"
PLUGIN_DIR="${CONFIG_DIR}/plugin"
LIB_DIR="${CONFIG_DIR}/${PLUGIN_NAME}-lib"
# Layouts used before the module dir moved out of plugin/; removed on install so
# opencode2 stops scanning them. `plugin/<name>-lib/` was the mistaken in-scan
# copy, `plugin/<name>/` the original 0.1.6 module dir.
LEGACY_LIB_DIR="${PLUGIN_DIR}/${PLUGIN_NAME}"
LEGACY_SCANNED_LIB_DIR="${PLUGIN_DIR}/${PLUGIN_NAME}-lib"
LEGACY_DIRS=("${LEGACY_LIB_DIR}" "${LEGACY_SCANNED_LIB_DIR}")
ENTRY_FILE="${PLUGIN_DIR}/${PLUGIN_NAME}.ts"
ENTRY_SOURCE="${SCRIPT_DIR}/install/${PLUGIN_NAME}.ts"
DIST_DIR="${SCRIPT_DIR}/dist"
# The post-merge hook runs this script unattended (repo-keeper pulls the deploy
# copy), so a failure reason must survive outside the console. The log lives in
# the checkout's log/ dir; OPENCODE_INSTALL_LOG_DIR overrides it for tests.
LOG_DIR="${OPENCODE_INSTALL_LOG_DIR:-${SCRIPT_DIR}/log}"
LOG_FILE="${LOG_DIR}/install.$(date +%Y%m%d).log"
readonly PLUGIN_NAME SCRIPT_DIR CONFIG_DIR PLUGIN_DIR LIB_DIR LEGACY_LIB_DIR \
  LEGACY_SCANNED_LIB_DIR LEGACY_DIRS ENTRY_FILE ENTRY_SOURCE DIST_DIR LOG_DIR

# One line per event: `[YYYY-MM-DD HH:MM:SS] [LEVEL] [stage:install] message`.
# The console keeps its terse `[install] ...` form; the file is the record that
# outlives the process.
log_write() {
  local level=$1
  shift
  [[ -n "${LOG_FILE:-}" ]] || return 0
  printf '[%s] [%s] [stage:%s] %s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "${level}" "install" "$*" \
    >>"${LOG_FILE}" 2>/dev/null || true
}

# Best effort on purpose: a read-only checkout must still install, so an
# unwritable log dir degrades to stderr only instead of aborting.
init_log() {
  local args=""
  (( $# == 0 )) || args=" $*"
  if mkdir -p -- "${LOG_DIR}" 2>/dev/null && : >>"${LOG_FILE}" 2>/dev/null; then
    log_write INFO "run: install.sh${args} (as $(id -un))"
    return 0
  fi
  LOG_FILE=""
  printf '[install] warning: cannot write %s; failure reason stays on stderr\n' \
    "${LOG_DIR}" >&2
}

info() {
  printf '[install] %s\n' "$*"
  log_write INFO "$*"
}

die() {
  printf '[install] error: %s\n' "$*" >&2
  log_write ERROR "$*"
  if [[ -n "${LOG_FILE:-}" ]]; then
    printf '[install] 详见 %s\n' "${LOG_FILE}" >&2
  fi
  exit 1
}

# Filesystem steps run under `set -e`; capture their stderr so the reason lands
# in the log before the script aborts. Without this the only record of a failed
# mktemp/cp/mv is the hook console, which the post-merge path discards.
run_step() {
  local what=$1 status=0 err
  shift
  err=$("$@" 2>&1 1>/dev/null) || status=$?
  # Log lines are one event per line; a multi-line stderr would break the
  # `[time] [LEVEL] [stage:...]` record that the hook log is parsed by eye.
  err="${err//$'\n'/ | }"
  if ((status != 0)); then
    die "${what} failed (rc=${status}): ${err:-no stderr}"
  fi
  # INFO on purpose: the step succeeded, so stderr here is noise worth keeping,
  # not a degraded outcome.
  [[ -z "${err}" ]] || log_write INFO "${what} wrote to stderr: ${err}"
}

usage() {
  cat <<'EOF'
Install opencode-compact-resume into the OpenCode config directory by copying
the prebuilt plugin files.

Usage:
  bash install.sh                 install (or update) the plugin
  bash install.sh --verify        check the installed copy without changing it
  bash install.sh --uninstall     remove the copied plugin files
  bash install.sh --help          show this help

Environment:
  OPENCODE_CONFIG_DIR             target config dir
                                  (default: ${XDG_CONFIG_HOME:-$HOME/.config}/opencode)
  OPENCODE_INSTALL_LOG_DIR        directory for install.YYYYMMDD.log
                                  (default: <repo>/log; unwritable falls back to stderr)

The installer only copies files; it never builds, installs packages or edits
opencode.json. Restart OpenCode after installing so the plugin is loaded.
Every run writes a timestamped log line; on failure the console also prints the
log path so an unattended post-merge run can be diagnosed afterwards.
EOF
}

# Read the shipped package version without extra tooling; the installer only
# promises bash, and the marker is informational.
read_plugin_version() {
  local line
  if [[ -f "${SCRIPT_DIR}/package.json" ]]; then
    while IFS= read -r line; do
      if [[ "${line}" =~ \"version\"[[:space:]]*:[[:space:]]*\"([^\"]+)\" ]]; then
        printf '%s' "${BASH_REMATCH[1]}"
        return 0
      fi
    done <"${SCRIPT_DIR}/package.json"
  fi
  printf 'unknown'
}

# True when staging and the installed module dir hold the same files byte for
# byte. The marker is excluded on purpose: it records when the current content
# was installed, so rewriting it would only bump the timestamp (contract R6:
# "内容未变时不更新时间戳").
same_installed_content() {
  local staged=$1 name
  [[ -d "${LIB_DIR}" ]] || return 1
  diff -q <(cd -- "${staged}" && printf '%s\n' *.js) \
    <(cd -- "${LIB_DIR}" && printf '%s\n' *.js) >/dev/null || return 1
  for name in "${staged}"/*.js; do
    cmp -s -- "${name}" "${LIB_DIR}/$(basename -- "${name}")" || return 1
  done
  cmp -s -- "${staged}/package.json" "${LIB_DIR}/package.json"
}

remove_legacy_dirs() {
  local dir
  for dir in "${LEGACY_DIRS[@]}"; do
    [[ -d "${dir}" ]] || continue
    run_step "remove legacy dir ${dir}" rm -rf -- "${dir}"
    info "removed legacy module dir ${dir}"
  done
}

install_plugin() {
  [[ -f "${DIST_DIR}/index.js" ]] ||
    die "dist/index.js is missing. Build it first: npm ci && npm run build"
  [[ -f "${ENTRY_SOURCE}" ]] || die "missing entry template: ${ENTRY_SOURCE}"

  local mkdir_err
  mkdir_err=$(mkdir -p -- "${PLUGIN_DIR}" 2>&1) ||
    die "cannot create ${PLUGIN_DIR}: ${mkdir_err:-no stderr}"
  # Fail with the real reason instead of letting mktemp abort under set -e: the
  # config dir is often owned by the desktop user while OpenCode runs as another
  # account that can only read the config tree.
  if [[ ! -w "${CONFIG_DIR}" ]]; then
    die "cannot write ${CONFIG_DIR} (owned by $(stat -c '%U' -- "${CONFIG_DIR}"), running as $(id -un)); run install.sh as the owner of the OpenCode config dir"
  fi
  if [[ ! -w "${PLUGIN_DIR}" ]]; then
    die "cannot write ${PLUGIN_DIR} (owned by $(stat -c '%U' -- "${PLUGIN_DIR}"), running as $(id -un)); run install.sh as the owner of the OpenCode config dir"
  fi

  local staging tmp_entry
  # Stage beside the final module dir so the rename stays on one filesystem,
  # and outside plugin/ so a concurrent host scan never sees a partial package.
  if ! staging=$(mktemp -d -- "${CONFIG_DIR}/.${PLUGIN_NAME}-lib.stage.XXXXXX" 2>&1); then
    die "cannot create staging dir under ${CONFIG_DIR}: ${staging}"
  fi
  # shellcheck disable=SC2064 # expand the staging path now, not at exit time
  trap "rm -rf -- '${staging}'" EXIT

  # mktemp -d creates 0700 (plus any inherited setgid), and `mv` keeps that
  # mode. The host may run as a different account than the installer, so the
  # module dir must stay traversable or `import` fails with EACCES and the
  # plugin never loads (no hook, no injection, no log).
  chmod 0755 -- "${staging}"

  run_step "copy dist modules" cp -- "${DIST_DIR}"/*.js "${staging}/"
  cat >"${staging}/package.json" <<EOF
{
  "name": "${PLUGIN_NAME}",
  "type": "module"
}
EOF
  # Read-only provenance for --verify: tells a current copy apart from one
  # installed before the mode fix, without touching the host config.
  cat >"${staging}/.install-info" <<EOF
{"name":"${PLUGIN_NAME}","version":"$(read_plugin_version)","installedAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)"}
EOF
  chmod 0644 -- "${staging}"/*.js "${staging}/package.json" "${staging}/.install-info"

  # Swap the module directory in one rename so a reader never sees a half
  # copied library while a session is loading the plugin. Identical content is
  # left alone so repeated installs keep the original timestamp (contract R6).
  if same_installed_content "${staging}"; then
    rm -rf -- "${staging}"
    trap - EXIT
    chmod 0755 -- "${LIB_DIR}"
    chmod 0644 -- "${LIB_DIR}"/*.js "${LIB_DIR}/package.json"
    info "unchanged ${LIB_DIR}/ (kept mtime)"
  else
    run_step "replace ${LIB_DIR}" rm -rf -- "${LIB_DIR}"
    run_step "rename staging dir into ${LIB_DIR}" mv -- "${staging}" "${LIB_DIR}"
    chmod 0755 -- "${LIB_DIR}"
    trap - EXIT
  fi

  # Drop previous layouts from the scan path; otherwise opencode2 keeps loading
  # them as extra plugins even though the entry imports the new copy.
  remove_legacy_dirs

  # Write the entry through a temp file in the same directory, then rename.
  # Same-content copies keep their mtime as well.
  if ! tmp_entry=$(mktemp -- "${PLUGIN_DIR}/.${PLUGIN_NAME}.entry.XXXXXX" 2>&1); then
    die "cannot create entry temp file in ${PLUGIN_DIR}: ${tmp_entry}"
  fi
  run_step "copy entry" cp -- "${ENTRY_SOURCE}" "${tmp_entry}"
  chmod 0644 -- "${tmp_entry}"
  if [[ -f "${ENTRY_FILE}" ]] && cmp -s -- "${tmp_entry}" "${ENTRY_FILE}"; then
    rm -f -- "${tmp_entry}"
    chmod 0644 -- "${ENTRY_FILE}"
    info "unchanged ${ENTRY_FILE}"
  else
    run_step "rename entry into ${ENTRY_FILE}" mv -f -- "${tmp_entry}" "${ENTRY_FILE}"
    info "installed ${ENTRY_FILE}"
  fi

  local modules=("${LIB_DIR}"/*.js)
  verify_permissions || die "installed copy is not readable by the host account"

  info "installed ${LIB_DIR}/ (${#modules[@]} modules)"

  warn_duplicate_registration
  info "restart OpenCode to load the plugin"
}

# One path check, shared by install (fail closed) and --verify (report all).
# The mode line is only printed when CHECK_VERBOSE=1 so install stays terse.
check_path() {
  local path=$1 mode owner tag="${CHECK_TAG:-install}"
  if [[ ! -e "${path}" ]]; then
    printf '[%s] missing installed path: %s\n' "${tag}" "${path}" >&2
    return 1
  fi
  if ! read -r mode owner < <(stat -c '%a %U:%G' -- "${path}"); then
    printf '[%s] cannot stat installed path: %s\n' "${tag}" "${path}" >&2
    return 1
  fi
  if [[ "${CHECK_VERBOSE:-0}" == 1 ]]; then
    printf '[%s] %s %s %s\n' "${tag}" "${mode}" "${owner}" "${path}"
  fi
  if [[ -d "${path}" ]]; then
    (( (8#${mode} & 8#005) == 8#005 )) || {
      printf '[%s] dir is not traversable by other users: %s (mode %s)\n' "${tag}" "${path}" "${mode}" >&2
      return 1
    }
  else
    (( (8#${mode} & 8#004) == 8#004 )) || {
      printf '[%s] file is not readable by other users: %s (mode %s)\n' "${tag}" "${path}" "${mode}" >&2
      return 1
    }
  fi
}

# OpenCode loads plugins from its own process account, which is not necessarily
# the account that ran install.sh. The loader needs traverse on the module dir
# and read on every file; anything narrower makes `import` fail before any hook
# exists, so the failure is silent unless verified here.
verify_permissions() {
  local path status=0
  for path in "${LIB_DIR}" "${LIB_DIR}"/*.js "${LIB_DIR}/package.json" "${LIB_DIR}/.install-info" "${ENTRY_FILE}"; do
    check_path "${path}" || status=1
  done
  return "${status}"
}

# Read-only: never writes, so it is safe to run from any account, including the
# one OpenCode itself runs as. Exit status is the health signal.
verify_installed() {
  local status=0 path
  # Old layouts: a module dir inside plugin/, where opencode2 loads every
  # first-level directory as a plugin package. Report it even when the new
  # layout is missing, so an upgrade starts with the real reason.
  for path in "${LEGACY_DIRS[@]}"; do
    [[ -d "${path}" ]] || continue
    printf '[verify] legacy module dir inside the plugin scan path: %s\n' "${path}" >&2
    printf '[verify] opencode2 loads each first-level dir under plugin/ as a plugin; rerun install.sh to move it out\n' >&2
    status=1
  done
  if [[ ! -d "${LIB_DIR}" || ! -f "${ENTRY_FILE}" ]]; then
    printf '[verify] not installed under %s\n' "${CONFIG_DIR}" >&2
    printf '[verify] run: bash install.sh\n' >&2
    return 1
  fi

  printf '[verify] config dir: %s (%s)\n' "${CONFIG_DIR}" "$(stat -c '%U:%G' -- "${CONFIG_DIR}")"
  printf '[verify] current account: %s (%s)\n' "$(id -un)" "$(id -u)"
  CHECK_TAG=verify
  CHECK_VERBOSE=1
  verify_permissions || status=1
  unset CHECK_TAG CHECK_VERBOSE

  if [[ -f "${LIB_DIR}/.install-info" ]]; then
    printf '[verify] install marker: %s\n' "$(tr -d '\n' <"${LIB_DIR}/.install-info")"
  else
    # WARN: not an error because the copy may still be healthy (3f67447 kept the
    # perms fix without a marker); only the provenance is unknown, so refresh is
    # recommended rather than demanded.
    printf '[verify] warning: no install marker; copy predates 0.1.5, rerun install.sh to refresh\n'
  fi

  if ((status == 0)); then
    printf '[verify] layout ok: entry is the only plugin artifact; module dir is outside plugin/\n'
    printf '[verify] ok: the host account can traverse the module dir and read every file\n'
  else
    printf '[verify] FAILED: installed copy needs repair (see messages above)\n' >&2
  fi
  return "${status}"
}

# A host-native registration (opencode.json plugin array / v2 plugins entry)
# plus this local copy injects the reminder twice. Copy installs never touch
# the config file, so any match is a leftover registration worth flagging.
warn_duplicate_registration() {
  command -v rg >/dev/null 2>&1 || return 0
  local config_file
  for config_file in "${CONFIG_DIR}/opencode.json" "${CONFIG_DIR}/opencode.jsonc"; do
    [[ -f "${config_file}" ]] || continue
    if rg -q --fixed-strings "${PLUGIN_NAME}" "${config_file}"; then
      info "warning: ${config_file} still registers ${PLUGIN_NAME}; remove that entry to avoid double reminders"
    fi
  done
}

uninstall_plugin() {
  run_step "remove ${LIB_DIR}" rm -rf -- "${LIB_DIR}"
  remove_legacy_dirs
  run_step "remove ${ENTRY_FILE}" rm -f -- "${ENTRY_FILE}"
  info "removed ${ENTRY_FILE}"
  info "removed ${LIB_DIR}/"
  info "restart OpenCode to unload the plugin"
}

main() {
  case "${1:-}" in
    -h | --help)
      usage
      ;;
    --verify)
      # Read-only by contract: --verify never creates the log dir either.
      verify_installed
      ;;
    --uninstall)
      init_log "$@"
      uninstall_plugin
      ;;
    "")
      init_log "$@"
      install_plugin
      ;;
    *)
      init_log "$@"
      die "unknown argument: $1 (try --help)"
      ;;
  esac
}

main "$@"