#!/bin/zsh
set -eu

biocontext_skill_scripts=${0:A:h}
biocontext_capture_dir=$(mktemp -d /tmp/biocontext-skill.XXXXXX)
export BIOCONTEXT_CAPTURE_FILE="$biocontext_capture_dir/exchange.txt"
export PATH="$biocontext_skill_scripts:$PATH"

biocontext_cleanup() {
	command rm -rf -- "$biocontext_capture_dir"
}
trap biocontext_cleanup EXIT

print -r -- "BIOCONTEXT_CAPTURE_FILE=$BIOCONTEXT_CAPTURE_FILE"
command biocontext
