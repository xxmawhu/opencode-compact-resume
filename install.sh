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
set -euo pipefail

PLUGIN_NAME="opencode-compact-resume"
SCRIPT_DIR="$(cd -- "$(dirname -- "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
CONFIG_DIR="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-${HOME}/.config}/opencode}"
PLUGIN_DIR="${CONFIG_DIR}/plugin"
LIB_DIR="${CONFIG_DIR}/${PLUGIN_NAME}-lib"
# Layout used before the module dir moved out of plugin/; removed on install so
# opencode2 stops scanning it.
LEGACY_LIB_DIR="${PLUGIN_DIR}/${PLUGIN_NAME}"
ENTRY_FILE="${PLUGIN_DIR}/${PLUGIN_NAME}.ts"
ENTRY_SOURCE="${SCRIPT_DIR}/install/${PLUGIN_NAME}.ts"
DIST_DIR="${SCRIPT_DIR}/dist"
readonly PLUGIN_NAME SCRIPT_DIR CONFIG_DIR PLUGIN_DIR LIB_DIR LEGACY_LIB_DIR \
  ENTRY_FILE ENTRY_SOURCE DIST_DIR

info() { printf '[install] %s\n' "$*"; }

die() {
  printf '[install] error: %s\n' "$*" >&2
  exit 1
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

The installer only copies files; it never builds, installs packages or edits
opencode.json. Restart OpenCode after installing so the plugin is loaded.
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

install_plugin() {
  [[ -f "${DIST_DIR}/index.js" ]] ||
    die "dist/index.js is missing. Build it first: npm ci && npm run build"
  [[ -f "${ENTRY_SOURCE}" ]] || die "missing entry template: ${ENTRY_SOURCE}"

  mkdir -p -- "${PLUGIN_DIR}" 2>/dev/null ||
    die "cannot create ${PLUGIN_DIR} (read-only or no permission)"
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
  staging="$(mktemp -d "${CONFIG_DIR}/.${PLUGIN_NAME}-lib.stage.XXXXXX")"
  # shellcheck disable=SC2064 # expand the staging path now, not at exit time
  trap "rm -rf -- '${staging}'" EXIT

  # mktemp -d creates 0700 (plus any inherited setgid), and `mv` keeps that
  # mode. The host may run as a different account than the installer, so the
  # module dir must stay traversable or `import` fails with EACCES and the
  # plugin never loads (no hook, no injection, no log).
  chmod 0755 -- "${staging}"

  cp -- "${DIST_DIR}"/*.js "${staging}/"
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
  # copied library while a session is loading the plugin.
  rm -rf -- "${LIB_DIR}"
  mv -- "${staging}" "${LIB_DIR}"
  chmod 0755 -- "${LIB_DIR}"
  trap - EXIT

  # Drop the previous layout's module dir from the scan path; otherwise opencode2
  # keeps loading it as a second plugin even though the entry imports the new copy.
  if [[ -d "${LEGACY_LIB_DIR}" ]]; then
    rm -rf -- "${LEGACY_LIB_DIR}"
    info "removed legacy module dir ${LEGACY_LIB_DIR}"
  fi

  # Write the entry through a temp file in the same directory, then rename.
  tmp_entry="$(mktemp "${PLUGIN_DIR}/.${PLUGIN_NAME}.entry.XXXXXX")"
  cp -- "${ENTRY_SOURCE}" "${tmp_entry}"
  chmod 0644 -- "${tmp_entry}"
  mv -f -- "${tmp_entry}" "${ENTRY_FILE}"

  local modules=("${LIB_DIR}"/*.js)
  verify_permissions || die "installed copy is not readable by the host account"

  info "installed ${ENTRY_FILE}"
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
  read -r mode owner < <(stat -c '%a %U:%G' -- "${path}")
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
  # Old layout: the module dir sits in plugin/, where opencode2 loads every
  # first-level directory as a plugin package. Report it even when the new
  # layout is missing, so an upgrade starts with the real reason.
  if [[ -d "${LEGACY_LIB_DIR}" ]]; then
    printf '[verify] legacy module dir inside the plugin scan path: %s\n' "${LEGACY_LIB_DIR}" >&2
    printf '[verify] opencode2 loads each first-level dir under plugin/ as a plugin; rerun install.sh to move it out\n' >&2
    status=1
  fi
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
  rm -rf -- "${LIB_DIR}"
  rm -rf -- "${LEGACY_LIB_DIR}"
  rm -f -- "${ENTRY_FILE}"
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
      verify_installed
      ;;
    --uninstall)
      uninstall_plugin
      ;;
    "")
      install_plugin
      ;;
    *)
      die "unknown argument: $1 (try --help)"
      ;;
  esac
}

main "$@"