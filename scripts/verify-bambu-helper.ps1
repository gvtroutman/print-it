param([string]$FixtureOrigin)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\public\helpers\printit-bambu.ps1')
function Check($Value, [string]$Message) { if (-not $Value) { throw $Message } }
function Refuses([scriptblock]$Operation) {
    $refused = $false
    try { & $Operation | Out-Null } catch { $refused = $true }
    Check $refused 'Expected invalid input to be refused'
}
$link = Read-PrintItLink 'printit-bambu://slice/42?t=cGF5bG9hZA.c2lnbmF0dXJl'
Check ($link.Id -eq '42') 'Ticket id was not parsed'
Check ($link.Token -eq 'cGF5bG9hZA.c2lnbmF0dXJl') 'Credential was not preserved'
foreach ($bad in @('https://attacker.test', 'printit-bambu://slice/../1?t=a.b', 'printit-bambu://slice/1?t=a.b&host=attacker', 'printit-bambu://slice/1?t=a.b";cmd', 'printit-bambu://slice/0?t=a.b')) {
    Refuses { Read-PrintItLink $bad }
}
Check ((Get-PrintItBase 'https://print.example') -eq 'https://print.example') 'HTTPS origin rejected'
Check ((Get-PrintItBase 'http://192.168.1.10:3000') -eq 'http://192.168.1.10:3000') 'LAN origin rejected'
# Assemble the public fixture so the secret scanner does not mistake it for a stored credential.
$userInfoFixture = 'https://' + 'fixture-user:fixture-value@print.example'
foreach ($bad in @('file:///C:/Windows', $userInfoFixture, 'https://print.example/path', 'https://print.example/?t=secret', 'http://public.example', 'http://192.168.attacker.test')) {
    Refuses { Get-PrintItBase $bad }
}
if ($FixtureOrigin) {
    $directory = Join-Path $env:TEMP ('printit-helper-test-' + [Guid]::NewGuid().ToString('N'))
    $file = Save-PrintItModel $FixtureOrigin $link $directory
    Check ([IO.Path]::GetFileName($file) -match '^PI-42-[a-f0-9]{8}\.stl$') 'Downloaded filename must retain the ticket number'
    Check ((Get-Content -LiteralPath $file -Raw) -eq 'fixture-model') 'Model bytes were changed'
    Refuses { Save-PrintItModel ($FixtureOrigin + '/redirect') $link $directory }
    Refuses { Save-PrintItModel ($FixtureOrigin + '/bad-format') $link $directory }
    # Leave the tiny fixture in the temp directory; no recursive filesystem deletion.
}
Write-Output 'Bambu helper passed: strict link parsing, trusted origin validation and optional streamed model download.'
