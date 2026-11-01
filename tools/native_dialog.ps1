param(
  [Parameter(Mandatory = $true)][int]$ProcessId,
  [Parameter(Mandatory = $true)][string]$FilePath
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$condition = [System.Windows.Automation.AndCondition]::new(
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ProcessIdProperty, $ProcessId),
  [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ClassNameProperty, '#32770')
)
$dialog = $null
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  $dialog = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $condition)
  if ($dialog) { break }
  Start-Sleep -Milliseconds 250
}
if (-not $dialog) { throw 'Native file dialog did not appear for the test process.' }
$shell = New-Object -ComObject WScript.Shell
if (-not $shell.AppActivate($ProcessId)) { throw 'Cannot activate the desktop test dialog.' }
Start-Sleep -Milliseconds 250
$shell.SendKeys('%n')
$shell.SendKeys('^a')
$escaped = ($FilePath -replace '([+^%~(){}\[\]])', '{$1}')
$shell.SendKeys($escaped)
$shell.SendKeys('{ENTER}')
