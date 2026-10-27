param(
    [Parameter(Mandatory = $true)]
    [string]$ExecutablePath
)

$resolvedExecutable = (Resolve-Path -LiteralPath $ExecutablePath).Path
$protocolRoot = 'HKCU:\Software\Classes\guangyu-open'
$openCommand = Join-Path $protocolRoot 'shell\open\command'

New-Item -Path $protocolRoot -Force | Out-Null
Set-Item -Path $protocolRoot -Value 'URL:Guangyu Space local materials'
New-ItemProperty -Path $protocolRoot -Name 'URL Protocol' -Value '' -PropertyType String -Force | Out-Null
New-Item -Path $openCommand -Force | Out-Null
$command = '"{0}" "%1"' -f $resolvedExecutable
Set-Item -Path $openCommand -Value $command

Write-Host '光域空间本机资料工具已为当前 Windows 用户注册。'
Write-Host '打开网页中的本机资料链接时，Windows 会询问是否允许启动 guangyu-open 协议。'
