# Sign the built relay executable with a local self-signed code-signing certificate.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\sign-server-exe.ps1 `
#     -FilePath dist\server\abuu-start-relay.exe
#
# Optional environment variables:
#   ABUU_SIGN_PFX
#   ABUU_SIGN_PFX_PASSWORD
#   ABUU_SIGN_PFX_PASSWORD_FILE
#   ABUU_SIGN_TIMESTAMP_URL
#   ABUU_SIGNTOOL
param(
  [Parameter(Mandatory = $true)]
  [string]$FilePath,

  [string]$PfxPath = $env:ABUU_SIGN_PFX,
  [string]$PasswordFile = $env:ABUU_SIGN_PFX_PASSWORD_FILE,
  [string]$Password = $env:ABUU_SIGN_PFX_PASSWORD,
  [string]$TimestampUrl = $env:ABUU_SIGN_TIMESTAMP_URL,
  [string]$SignToolPath = $env:ABUU_SIGNTOOL
)

$ErrorActionPreference = 'Stop'
$env:PSModulePath = "$env:SystemRoot\system32\WindowsPowerShell\v1.0\Modules"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Resolve-InputPath([string]$path) {
  if ([System.IO.Path]::IsPathRooted($path)) {
    return [System.IO.Path]::GetFullPath($path)
  }
  return [System.IO.Path]::GetFullPath((Join-Path $repoRoot $path))
}

function ConvertTo-SecureStringValue([string]$value) {
  return ConvertTo-SecureString -String $value -AsPlainText -Force
}

function Read-PasswordFromFile {
  if (-not (Test-Path -LiteralPath $PasswordFile -PathType Leaf)) {
    return $null
  }
  return (Get-Content -LiteralPath $PasswordFile -Raw).Trim()
}

if (-not $PfxPath) {
  $PfxPath = Join-Path $repoRoot 'private\code-signing\abuu-start-dev.pfx'
}
if (-not $PasswordFile) {
  $PasswordFile = Join-Path $repoRoot 'private\code-signing\abuu-start-dev.password.txt'
}
if (-not $SignToolPath) {
  $SignToolPath = Join-Path $repoRoot 'node_modules\@electron\windows-sign\vendor\signtool.exe'
}

$FilePath = Resolve-InputPath $FilePath
$PfxPath = Resolve-InputPath $PfxPath
$PasswordFile = Resolve-InputPath $PasswordFile
$SignToolPath = Resolve-InputPath $SignToolPath
$CerPath = [System.IO.Path]::ChangeExtension($PfxPath, '.cer')

if (-not (Test-Path -LiteralPath $FilePath -PathType Leaf)) {
  throw "Executable not found: $FilePath"
}
if (-not (Test-Path -LiteralPath $SignToolPath -PathType Leaf)) {
  throw "signtool.exe not found: $SignToolPath. Run npm install first."
}

$certificateDirectory = Split-Path -Parent $PfxPath
if (-not (Test-Path -LiteralPath $certificateDirectory)) {
  New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null
}

if (-not (Test-Path -LiteralPath $PfxPath -PathType Leaf)) {
  if (-not $Password) {
    $Password = Read-PasswordFromFile
  }

  if (-not $Password) {
    $bytes = New-Object byte[] 24
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
      $rng.GetBytes($bytes)
    } finally {
      $rng.Dispose()
    }
    $Password = [Convert]::ToBase64String($bytes)
    [System.IO.File]::WriteAllText(
      $PasswordFile,
      $Password,
      (New-Object System.Text.UTF8Encoding($false))
    )
    Write-Host "[sign] generated password file: $PasswordFile"
  }

  Write-Host '[sign] generating self-signed code-signing certificate...'
  $generatedCertificate = New-SelfSignedCertificate `
    -Subject 'CN=abuu-start local relay (dev)' `
    -FriendlyName 'abuu-start local relay (dev)' `
    -Type CodeSigningCert `
    -KeyAlgorithm RSA `
    -KeyLength 3072 `
    -HashAlgorithm SHA256 `
    -KeyUsage DigitalSignature `
    -KeyExportPolicy Exportable `
    -NotAfter (Get-Date).AddYears(5) `
    -CertStoreLocation 'Cert:\CurrentUser\My'

  try {
    $securePassword = ConvertTo-SecureStringValue $Password
    Export-PfxCertificate `
      -Cert $generatedCertificate `
      -FilePath $PfxPath `
      -Password $securePassword `
      -ChainOption EndEntityCertOnly | Out-Null
    Export-Certificate `
      -Cert $generatedCertificate `
      -FilePath $CerPath `
      -Type CERT | Out-Null
    Write-Host "[sign] certificate generated: $CerPath"
  } finally {
    try {
      Remove-Item `
        -LiteralPath ("Cert:\CurrentUser\My\" + $generatedCertificate.Thumbprint) `
        -Force
    } catch {
      Write-Warning "[sign] failed to remove generated certificate from store: $($_.Exception.Message)"
    }
  }
} else {
  if (-not $Password) {
    $Password = Read-PasswordFromFile
  }
  if (-not $Password) {
    throw "PFX exists but password is missing. Set ABUU_SIGN_PFX_PASSWORD or create $PasswordFile"
  }
}

$pfxCertificate = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
  $PfxPath,
  $Password
)

if (-not $pfxCertificate.HasPrivateKey) {
  throw 'The signing certificate has no private key.'
}
if ($pfxCertificate.NotAfter -lt (Get-Date)) {
  throw "The signing certificate has expired: $($pfxCertificate.NotAfter)"
}

$ekuExtension = $pfxCertificate.Extensions |
  Where-Object { $_.Oid.Value -eq '2.5.29.37' } |
  Select-Object -First 1
if (-not $ekuExtension -or $ekuExtension.Format($false) -notmatch '1\.3\.6\.1\.5\.5\.7\.3\.3') {
  throw 'The signing certificate does not contain the Code Signing EKU.'
}

Write-Host "[sign] certificate: $($pfxCertificate.Subject)"
Write-Host "[sign] thumbprint: $($pfxCertificate.Thumbprint)"
if ($TimestampUrl) {
  Write-Host "[sign] timestamp: $TimestampUrl"
} else {
  Write-Host '[sign] timestamp: disabled'
}

$signArguments = @(
  'sign',
  '/fd', 'SHA256',
  '/f', $PfxPath,
  '/p', $Password,
  '/d', 'abuu-start local relay'
)
if ($TimestampUrl) {
  $signArguments += @('/tr', $TimestampUrl, '/td', 'SHA256')
}
$signArguments += $FilePath

& $SignToolPath @signArguments
if ($LASTEXITCODE -ne 0) {
  throw "signtool.exe failed with exit code $LASTEXITCODE"
}

Write-Host "[sign] signed: $FilePath"

if ($pfxCertificate.Subject -eq $pfxCertificate.Issuer) {
  Write-Host '[sign] self-signed certificate is not trusted by default.'
  Write-Host '[sign] To trust it locally, run:'
  Write-Host "       certutil -addstore -user Root `"$CerPath`""
  Write-Host "       certutil -addstore -user TrustedPublisher `"$CerPath`""
}
