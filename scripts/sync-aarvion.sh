#!/bin/bash
# Copy every branch and tag from the main repository (origin) to the Aarvion copy.
# Run after each merge, until the Aarvion repository becomes the main one.
#
#   bash scripts/sync-aarvion.sh
#
# Needs the gh CLI logged in to both accounts.
set -e
SRC_TOKEN="$(gh auth token --user rohitsadhu1947)"
DST_TOKEN="$(gh auth token --user rohitaarvion)"
as() { git -c credential.helper= -c credential.helper="!f() { echo username=x-access-token; echo password=$1; }; f" "${@:2}"; }
git remote get-url aarvion >/dev/null 2>&1 || git remote add aarvion https://github.com/Aarvion-AI/stocktrading.git
as "$SRC_TOKEN" fetch -q --prune origin
# One refspec per branch; origin/HEAD is a pointer, not a branch
SPECS=$(git for-each-ref --format='%(refname)' refs/remotes/origin | grep -v '/HEAD$' | sed 's#^refs/remotes/origin/\(.*\)$#refs/remotes/origin/\1:refs/heads/\1#')
as "$DST_TOKEN" push -q aarvion $SPECS --tags
echo "Aarvion main: $(as "$DST_TOKEN" ls-remote aarvion refs/heads/main | cut -c1-7)  origin main: $(git rev-parse --short origin/main)"
