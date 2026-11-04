param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$ArtworkRoot,
  [string]$PythonExe = 'python',
  [string]$PythonPackages,
  [string]$LogFile = (Join-Path $env:LOCALAPPDATA 'PrintIt\sticker-artwork-sync.log')
)
$ErrorActionPreference = 'Stop'
if ($PythonPackages) {
  $env:PYTHONPATH = if ($env:PYTHONPATH) { $PythonPackages + [IO.Path]::PathSeparator + $env:PYTHONPATH } else { $PythonPackages }
}
$syncScript = Join-Path $PSScriptRoot 'sync-sticker-artwork.py'
$target = Join-Path $ArtworkRoot 'stickers'
$pythonPath = (Get-Command -Name $PythonExe -CommandType Application -ErrorAction Stop).Source
# Task Scheduler can stop this PowerShell parent while leaving Python running.
# Replace only a watcher for this exact executable, script, source and target;
# otherwise its process lock can make the updated exporter exit immediately.
$argumentPatterns = @($syncScript, $Source, $target) | ForEach-Object {
  '(?:^|\s)"?' + [regex]::Escape($_) + '"?(?=\s|$)'
}
$existing = Get-CimInstance Win32_Process -Filter "Name = 'python.exe' OR Name = 'pythonw.exe'" | Where-Object {
  $commandLine = $_.CommandLine
  $_.ExecutablePath -ieq $pythonPath -and $commandLine -match '(?:^|\s)--watch(?:\s|$)' -and
    @($argumentPatterns | Where-Object { $commandLine -notmatch $_ }).Count -eq 0
}
foreach ($process in $existing) {
  Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
}
& $pythonPath $syncScript --source $Source --target $target --watch --log-file $LogFile
exit $LASTEXITCODE
