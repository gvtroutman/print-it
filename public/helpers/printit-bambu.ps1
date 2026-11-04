# Print It! -> Bambu Studio. Install once on the Windows computer running Studio.
# Config stores only the trusted app address and executable path. Tokens arrive per click.
[CmdletBinding()]
param([string]$BaseUrl, [string]$BambuPath, [string]$OpenUrl)
$ErrorActionPreference = 'Stop'

function Get-PrintItBase([string]$Value) {
    $target = [Uri]$Value
    if (-not $target.IsAbsoluteUri -or $target.Scheme -notin @('http', 'https') -or $target.UserInfo -or $target.Query -or $target.Fragment -or $target.AbsolutePath -ne '/') {
        throw 'Enter the app origin only, for example https://print.example.'
    }
    $address = $null
    $privateLan = $false
    if ([Net.IPAddress]::TryParse($target.Host, [ref]$address) -and $address.AddressFamily -eq [Net.Sockets.AddressFamily]::InterNetwork) {
        $octets = $address.GetAddressBytes()
        $privateLan = $octets[0] -eq 10 -or ($octets[0] -eq 192 -and $octets[1] -eq 168) -or ($octets[0] -eq 172 -and $octets[1] -ge 16 -and $octets[1] -le 31)
    }
    if ($target.Scheme -ne 'https' -and -not ($target.IsLoopback -or $privateLan)) {
        throw 'Use HTTPS, or a local development/LAN address.'
    }
    return $target.GetLeftPart([UriPartial]::Authority)
}

function Read-PrintItLink([string]$Value) {
    # The link never chooses a host, local path or command. Only a ticket id and credential.
    if ($Value -cnotmatch '^printit-bambu://slice/([1-9][0-9]*)\?t=([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$') {
        throw 'Invalid Bambu ticket link. Open the ticket and click again.'
    }
    return @{ Id = $Matches[1]; Token = $Matches[2] }
}

function Find-BambuStudio([string]$Value) {
    if ($Value) {
        $candidate = Get-Item -LiteralPath $Value
        if ($candidate.PSIsContainer -or $candidate.Extension -ne '.exe') { throw 'Choose the Bambu Studio executable.' }
        return $candidate.FullName
    }
    foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
        if (-not $root) { continue }
        foreach ($relative in @('Bambu Studio\bambu-studio.exe', 'Programs\Bambu Studio\bambu-studio.exe')) {
            $candidate = Join-Path $root $relative
            if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
        }
    }
    throw 'Bambu Studio was not found. Install it or pass -BambuPath with its executable path.'
}

function Save-PrintItModel([string]$Origin, [hashtable]$Link, [string]$Directory) {
    $request = [Net.HttpWebRequest]::Create("$Origin/api/models/$($Link.Id)?t=$($Link.Token)")
    $request.AllowAutoRedirect = $false
    $request.Timeout = 30000
    $request.ReadWriteTimeout = 30000
    $request.MaximumResponseHeadersLength = 64
    $response = $null; $inputStream = $null; $outputStream = $null; $destination = $null
    try {
        try { $response = $request.GetResponse() } catch {
            throw 'Model download failed. Refresh the ticket link and check that this computer can reach the app.'
        }
        if ([int]$response.StatusCode -ne 200) { throw 'The app refused the download. Refresh the ticket and try again.' }
        $disposition = $response.Headers['Content-Disposition']
        if ($disposition -notmatch 'filename="[^"\r\n]*\.(stl|3mf|obj|amf|step|stp)"') {
            throw 'This model format cannot be opened in Bambu Studio. Download it and export STL or 3MF first.'
        }
        $extension = $Matches[1].ToLowerInvariant()
        $limit = 250 * 1024 * 1024
        if ($response.ContentLength -le 0 -or $response.ContentLength -gt $limit) { throw 'The model size is invalid.' }
        New-Item -ItemType Directory -Path $Directory -Force | Out-Null
        $destination = Join-Path $Directory ("PI-$($Link.Id)-" + [Guid]::NewGuid().ToString('N').Substring(0, 8) + ".$extension")
        $inputStream = $response.GetResponseStream()
        $outputStream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
        $buffer = New-Object byte[] 65536
        $total = 0
        while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $total += $read
            if ($total -gt $limit) { throw 'The model exceeded the size limit.' }
            $outputStream.Write($buffer, 0, $read)
        }
        if ($total -ne $response.ContentLength) { throw 'The model download was incomplete. Click the ticket link again.' }
    } finally {
        if ($outputStream) { $outputStream.Dispose() }
        if ($inputStream) { $inputStream.Dispose() }
        if ($response) { $response.Dispose() }
    }
    return $destination
}

function Install-PrintItBambu([string]$Origin, [string]$Executable, [string]$Source) {
    $directory = Join-Path $env:LOCALAPPDATA 'PrintIt\BambuStudio'
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $handler = Join-Path $directory 'printit-bambu.ps1'
    if ([IO.Path]::GetFullPath($Source) -ne [IO.Path]::GetFullPath($handler)) { Copy-Item -LiteralPath $Source -Destination $handler -Force }
    @{ BaseUrl = $Origin; BambuPath = $Executable } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $directory 'config.json') -Encoding UTF8
    $key = 'HKCU:\Software\Classes\printit-bambu'
    New-Item -Path "$key\shell\open\command" -Force | Out-Null
    Set-Item -LiteralPath $key -Value 'URL:Print It Bambu Studio'
    New-ItemProperty -LiteralPath $key -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
    $powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $command = '"' + $powershell + '" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $handler + '" -OpenUrl "%1"'
    Set-Item -LiteralPath "$key\shell\open\command" -Value $command
    Write-Output 'Installed. Open a Print It! ticket and click Open in Bambu Studio.'
}

# Dot-sourcing loads the functions for isolated verification without installing anything.
if ($MyInvocation.InvocationName -eq '.') { return }
try {
    if ($OpenUrl) {
        $link = Read-PrintItLink $OpenUrl
        $directory = Join-Path $env:LOCALAPPDATA 'PrintIt\BambuStudio'
        $config = Get-Content -LiteralPath (Join-Path $directory 'config.json') -Raw | ConvertFrom-Json
        $origin = Get-PrintItBase $config.BaseUrl
        $executable = Find-BambuStudio $config.BambuPath
        $file = Save-PrintItModel $origin $link (Join-Path $directory 'models')
        # Studio is the interactive app the user is opening, so its window is shown.
        Start-Process -FilePath $executable -ArgumentList ('"' + $file + '"')
    } else {
        if (-not $BaseUrl) { throw 'Pass -BaseUrl with your Print It! app address.' }
        Install-PrintItBambu (Get-PrintItBase $BaseUrl) (Find-BambuStudio $BambuPath) $PSCommandPath
    }
} catch {
    if ($OpenUrl) {
        Add-Type -AssemblyName System.Windows.Forms
        [Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Print It! - Bambu Studio') | Out-Null
    } else { Write-Error $_.Exception.Message }
    exit 1
}
