/**
 * Self-contained unpackers, downloaded next to an archive and run there.
 *
 * The in-app import reads the whole archive into memory, which is fine for photographs and
 * wrong for a family archive of many gigabytes. These stream it to disk instead.
 *
 * Deliberately plain `unzip` and PowerShell rather than Node: a testimony giver restoring
 * their own story on a borrowed computer shouldn't have to install a toolchain, and both
 * are present by default on macOS, Linux and Windows.
 *
 * They also move the archive's `materials/` contents up to the folder root, so the result
 * is the story folder as it was — not a folder containing a copy of the archive's layout.
 */

export const UNPACK_SH_FILENAME = "unpack-story.sh";
export const UNPACK_CMD_FILENAME = "unpack-story.cmd";

export const UNPACK_SH = `#!/usr/bin/env bash
# Unpacks a Zikaron BaSalon Story Studio export into a folder.
#
#   1. Put this file in the same folder as the .zikaron.zip archive
#   2. Open Terminal there and run:  bash unpack-story.sh
#   3. Open the Studio and connect the folder it reports
#
# Nothing is overwritten: a file already present is left as it is.

set -euo pipefail

ARCHIVE="\${1:-}"
if [ -z "$ARCHIVE" ]; then
  matches=( *.zikaron.zip )
  if [ \${#matches[@]} -eq 1 ] && [ -f "\${matches[0]}" ]; then
    ARCHIVE="\${matches[0]}"
  else
    echo "Which archive? Run: bash unpack-story.sh <archive.zikaron.zip> [target-folder]" >&2
    exit 1
  fi
fi

[ -f "$ARCHIVE" ] || { echo "No such file: $ARCHIVE" >&2; exit 1; }
command -v unzip >/dev/null || { echo "This needs 'unzip', which doesn't seem to be installed." >&2; exit 1; }

TARGET="\${2:-$(basename "$ARCHIVE" .zikaron.zip)-story}"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

echo "Reading $ARCHIVE ..."
unzip -q "$ARCHIVE" -d "$STAGING"

if [ -f "$STAGING/manifest.json" ]; then
  echo
  if command -v python3 >/dev/null; then
    python3 - "$STAGING/manifest.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))
print(f'Export of "{m.get("story", {}).get("label", "a story")}"')
print(f'  made       {m.get("exportedAt", "")[:19].replace("T", " ")}')
app = m.get("app", {})
print(f'  by         Story Studio v{app.get("version")} (build {app.get("build")})')
db = m.get("database", {})
print(f'  catalog    schema {db.get("schemaVersion")}, revision {db.get("revision")}')
c = m.get("counts", {})
print(f'  materials  {c.get("included")} included, {c.get("missing")} missing, {c.get("materials")} total')
missing = [b for b in m.get("bom", []) if not b.get("included")]
if missing:
    print("\\n  Recorded but not in the archive:")
    for b in missing[:20]:
        print(f'    - {b.get("name")}' + (f' ({b["reason"]})' if b.get("reason") else ""))
    if len(missing) > 20:
        print(f"    ...and {len(missing) - 20} more")
PY
  else
    echo "(Install python3 to see the archive's details.)"
  fi
fi

mkdir -p "$TARGET"

echo
echo "Restoring into $TARGET ..."
# -n never replaces a file that is already there.
[ -d "$STAGING/materials" ] && cp -Rn "$STAGING/materials/." "$TARGET/" 2>/dev/null || true
for db in "$STAGING"/*.sqlite; do
  [ -f "$db" ] && cp -n "$db" "$TARGET/" 2>/dev/null || true
done

restored=$(find "$TARGET" -type f ! -name '*.sqlite' | wc -l | tr -d ' ')
echo "  materials in folder: $restored"
if ls "$TARGET"/*.sqlite >/dev/null 2>&1; then
  echo "  catalog:             present"
else
  echo "  catalog:             MISSING - the story will open empty"
fi

echo
echo "Done. Open the Studio, choose Storage, and connect:"
echo "  $(cd "$TARGET" && pwd)"
echo
`;

export const UNPACK_CMD = `@echo off
REM Unpacks a Zikaron BaSalon Story Studio export into a folder.
REM
REM   1. Put this file in the same folder as the .zikaron.zip archive
REM   2. Double-click it, or run it from the Command Prompt
REM   3. Open the Studio and connect the folder it reports
REM
REM Nothing is overwritten: a file already present is left as it is.

setlocal enabledelayedexpansion

set "ARCHIVE=%~1"
if "%ARCHIVE%"=="" (
  for %%F in (*.zikaron.zip) do (
    if "!ARCHIVE!"=="" ( set "ARCHIVE=%%F" ) else ( set "ARCHIVE=__many__" )
  )
)

if "%ARCHIVE%"=="" (
  echo No .zikaron.zip found in this folder.
  echo Run: unpack-story.cmd ^<archive.zikaron.zip^> [target-folder]
  pause
  exit /b 1
)
if "%ARCHIVE%"=="__many__" (
  echo More than one archive here - name the one to unpack:
  echo   unpack-story.cmd ^<archive.zikaron.zip^> [target-folder]
  pause
  exit /b 1
)

set "TARGET=%~2"
if "%TARGET%"=="" set "TARGET=%~n1-story"
if "%TARGET%"=="-story" for %%F in ("%ARCHIVE%") do set "TARGET=%%~nF-story"

set "STAGING=%TEMP%\\zikaron-unpack-%RANDOM%"

echo Reading %ARCHIVE% ...
powershell -NoProfile -Command ^
  "Expand-Archive -LiteralPath '%ARCHIVE%' -DestinationPath '%STAGING%' -Force" || goto :failed

if exist "%STAGING%\\manifest.json" (
  echo.
  powershell -NoProfile -Command ^
    "$m = Get-Content -Raw '%STAGING%\\manifest.json' | ConvertFrom-Json;" ^
    "Write-Host ('Export of \\"' + $m.story.label + '\\"');" ^
    "Write-Host ('  made       ' + $m.exportedAt);" ^
    "Write-Host ('  by         Story Studio v' + $m.app.version + ' (build ' + $m.app.build + ')');" ^
    "Write-Host ('  catalog    schema ' + $m.database.schemaVersion + ', revision ' + $m.database.revision);" ^
    "Write-Host ('  materials  ' + $m.counts.included + ' included, ' + $m.counts.missing + ' missing, ' + $m.counts.materials + ' total')"
)

if not exist "%TARGET%" mkdir "%TARGET%"

echo.
echo Restoring into %TARGET% ...
REM xcopy /D copies only when newer, so an existing file is not clobbered.
if exist "%STAGING%\\materials" xcopy "%STAGING%\\materials\\*" "%TARGET%\\" /E /I /Q /Y /D >nul
copy /-Y "%STAGING%\\*.sqlite" "%TARGET%\\" >nul 2>&1

rmdir /s /q "%STAGING%" 2>nul

echo.
echo Done. Open the Studio, choose Storage, and connect:
echo   %CD%\\%TARGET%
echo.
pause
exit /b 0

:failed
echo.
echo Could not read the archive. It may be incomplete.
rmdir /s /q "%STAGING%" 2>nul
pause
exit /b 1
`;
