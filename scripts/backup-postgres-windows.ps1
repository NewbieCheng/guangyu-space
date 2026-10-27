$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backupDirectory = if ($env:GUANGYU_DB_BACKUP_DIR) { $env:GUANGYU_DB_BACKUP_DIR } else { Join-Path $projectRoot 'data\postgres-backups' }
$null = New-Item -ItemType Directory -Path $backupDirectory -Force
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupFile = Join-Path $backupDirectory "guangyu-postgres-$stamp.dump"

$startInfo = [System.Diagnostics.ProcessStartInfo]::new()
$startInfo.FileName = 'docker'
$composeFile = Join-Path $projectRoot 'docker-compose.yml'
$localComposeFile = Join-Path $projectRoot 'compose.local.yml'
$startInfo.Arguments = 'compose -f "{0}" -f "{1}" exec -T postgres pg_dump -U velobase -d velobase --format=custom' -f $composeFile, $localComposeFile
$startInfo.UseShellExecute = $false
$startInfo.RedirectStandardOutput = $true
$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $startInfo
$stream = $null
try {
    if (-not $process.Start()) { throw 'Unable to start Docker.' }
    $stream = [System.IO.File]::Open($backupFile, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::None)
    $process.StandardOutput.BaseStream.CopyTo($stream)
    $stream.Flush()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0 -or (Get-Item -LiteralPath $backupFile).Length -eq 0) { throw 'PostgreSQL backup failed or produced an empty file.' }
}
catch {
    if ($stream) { $stream.Dispose() }
    if (Test-Path -LiteralPath $backupFile) { Remove-Item -LiteralPath $backupFile -Force }
    throw
}
finally {
    if ($stream) { $stream.Dispose() }
    $process.Dispose()
}

$cutoff = (Get-Date).ToUniversalTime().AddDays(-7)
Get-ChildItem -LiteralPath $backupDirectory -Filter 'guangyu-postgres-*.dump' -File |
    Where-Object { $_.LastWriteTimeUtc -lt $cutoff } |
    Remove-Item -Force
Write-Host "Created $backupFile"
