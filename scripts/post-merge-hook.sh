#!/usr/bin/env bash
# post-merge stage wrapper for the repo-keeper deploy copy.
#
# pre-commit runs this hook with no terminal attached, and install.sh exits under
# `set -euo pipefail` without a durable trace. This wrapper keeps the full
# install transcript in log/post-merge-hook.YYYYMMDD.log so a failed unattended
# update can be diagnosed afterwards instead of leaving only a one-line console
# error.
#
# Usage: bash scripts/post-merge-hook.sh   (invoked by .pre-commit-config.yaml)
set -uo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
REPO_ROOT="$(dirname -- "${SCRIPT_DIR}")"
LOG_DIR="${OPENCODE_INSTALL_LOG_DIR:-${REPO_ROOT}/log}"
LOG_FILE="${LOG_DIR}/post-merge-hook.$(date +%Y%m%d).log"

if ! mkdir -p -- "${LOG_DIR}" 2>/dev/null || ! : >>"${LOG_FILE}" 2>/dev/null; then
  printf '[post-merge] error: cannot write %s; fix permissions and rerun the hook\n' "${LOG_DIR}" >&2
  exit 1
fi

# One line per event, matching the platform hook log format:
# `[YYYY-MM-DD HH:MM:SS] [LEVEL] [stage:post-merge] message`.
emit() {
  local level=$1
  shift
  printf '[%s] [%s] [stage:post-merge] %s\n' \
    "$(date '+%Y-%m-%d %H:%M:%S')" "${level}" "$*" | tee -a "${LOG_FILE}"
}

if ! raw="$(mktemp -- "${LOG_DIR}/.post-merge-hook.raw.XXXXXX" 2>&1)"; then
  printf '[post-merge] error: cannot create temp file under %s: %s\n' "${LOG_DIR}" "${raw}" >&2
  exit 1
fi
# shellcheck disable=SC2064 # expand the raw path now, not at exit time
trap "rm -f -- '${raw}'" EXIT

emit INFO "start: bash ${REPO_ROOT}/install.sh"
status=0
bash "${REPO_ROOT}/install.sh" >"${raw}" 2>&1 || status=$?

# Re-emit the transcript with the stage/level prefix so the file stays a
# timestamped record while the console keeps the installer's own wording.
while IFS= read -r line; do
  case "${line}" in
    *error* | *ERROR*) emit ERROR "${line}" ;;
    *) emit INFO "${line}" ;;
  esac
done <"${raw}"

if ((status != 0)); then
  emit ERROR "install.sh rc=${status}"
  printf '[post-merge] error: install.sh failed (rc=%d); 详见 %s\n' "${status}" "${LOG_FILE}" >&2
  exit "${status}"
fi

emit INFO "install.sh rc=0"
