#!/usr/bin/env bash
# Install opencode-compact-resume into the OpenCode config directory by copying
# the prebuilt plugin files (no build step, no network).
#
# Usage:
#   bash install.sh                    # install into ${XDG_CONFIG_HOME:-$HOME/.config}/opencode
#   OPENCODE_CONFIG_DIR=/path bash install.sh
#   bash install.sh --uninstall
#
# Installed layout:
#   <config>/plugin/opencode-compact-resume.ts   v1 legacy entry
#   <config>/plugin/opencode-compact-resume/     dist modules + package.json
set -euo pipefail

PLUGIN_NAME="opencode-compact-resume"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="${OPENCODE_CONFIG_DIR:-${XDG_CONFIG_HOME:-${HOME}/.config}/opencode}"
PLUGIN_DIR="${CONFIG_DIR}/plugin"
LIB_DIR="${PLUGIN_DIR}/${PLUGIN_NAME}"
ENTRY_FILE="${PLUGIN_DIR}/${PLUGIN_NAME}.ts"
ENTRY_SOURCE="${SCRIPT_DIR}/install/${PLUGIN_NAME}.ts"
DIST_DIR="${SCRIPT_DIR}/dist"
readonly PLUGIN_NAME SCRIPT_DIR CONFIG_DIR PLUGIN_DIR LIB_DIR ENTRY_FILE ENTRY_SOURCE DIST_DIR

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
  bash install.sh --uninstall     remove the copied plugin files
  bash install.sh --help          show this help

Environment:
  OPENCODE_CONFIG_DIR             target config dir
                                  (default: ${XDG_CONFIG_HOME:-$HOME/.config}/opencode)

The installer only copies files; it never builds, installs packages or edits
opencode.json. Restart OpenCode after installing so the plugin is loaded.
EOF
}

install_plugin() {
  [[ -f "${DIST_DIR}/index.js" ]] ||
    die "dist/index.js is missing. Build it first: npm ci && npm run build"
  [[ -f "${ENTRY_SOURCE}" ]] || die "missing entry template: ${ENTRY_SOURCE}"

  mkdir -p -- "${PLUGIN_DIR}" 2>/dev/null ||
    die "cannot create ${PLUGIN_DIR} (read-only or no permission)"

  local staging tmp_entry
  staging="$(mktemp -d "${PLUGIN_DIR}/.${PLUGIN_NAME}.stage.XXXXXX")"
  # shellcheck disable=SC2064 # expand the staging path now, not at exit time
  trap "rm -rf -- '${staging}'" EXIT

  cp -- "${DIST_DIR}"/*.js "${staging}/"
  cat >"${staging}/package.json" <<EOF
{
  "name": "${PLUGIN_NAME}",
  "type": "module"
}
EOF
  chmod 0644 -- "${staging}"/*.js "${staging}/package.json"

  # Swap the module directory in one rename so a reader never sees a half
  # copied library while a session is loading the plugin.
  rm -rf -- "${LIB_DIR}"
  mv -- "${staging}" "${LIB_DIR}"
  trap - EXIT

  # Write the entry through a temp file in the same directory, then rename.
  tmp_entry="$(mktemp "${PLUGIN_DIR}/.${PLUGIN_NAME}.entry.XXXXXX")"
  cp -- "${ENTRY_SOURCE}" "${tmp_entry}"
  chmod 0644 -- "${tmp_entry}"
  mv -f -- "${tmp_entry}" "${ENTRY_FILE}"

  local modules=("${LIB_DIR}"/*.js)
  info "installed ${ENTRY_FILE}"
  info "installed ${LIB_DIR}/ (${#modules[@]} modules)"

  warn_duplicate_registration
  info "restart OpenCode to load the plugin"
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