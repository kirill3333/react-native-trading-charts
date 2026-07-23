#!/usr/bin/env bash
set -euo pipefail

readonly script_dir="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
  pwd
)"
readonly requirements_file="$script_dir/requirements.txt"
readonly venv_dir="$script_dir/.venv"
readonly stamp_file="$venv_dir/.requirements-checksum"
readonly requirements_checksum="$(cksum "$requirements_file")"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to install the pinned C++ style tools." >&2
  exit 127
fi

installed_checksum=""
if [[ -f "$stamp_file" ]]; then
  installed_checksum="$(<"$stamp_file")"
fi

if [[ "$installed_checksum" != "$requirements_checksum" ||
      ! -x "$venv_dir/bin/clang-format" ||
      ! -x "$venv_dir/bin/clang-tidy" ||
      ! -x "$venv_dir/bin/cpplint" ]]; then
  echo "Installing pinned C++ style tools..." >&2
  python3 -m venv "$venv_dir"
  "$venv_dir/bin/python" -m pip install \
    --disable-pip-version-check \
    --quiet \
    --requirement "$requirements_file"
  printf '%s\n' "$requirements_checksum" >"$stamp_file"
fi

printf '%s\n' "$venv_dir/bin"
