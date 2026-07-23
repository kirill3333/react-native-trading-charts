#!/usr/bin/env bash
set -euo pipefail

readonly script_dir="$(
  cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
  pwd
)"
tool_dir="$(bash "$script_dir/bootstrap.sh")"
readonly tool_dir

cpp_files=()
for file in "$@"; do
  if [[ -f "$file" ]]; then
    cpp_files+=("$file")
  fi
done

if [[ ${#cpp_files[@]} -eq 0 ]]; then
  exit 0
fi

"$tool_dir/clang-format" --dry-run --Werror "${cpp_files[@]}"
"$tool_dir/cpplint" "${cpp_files[@]}"
