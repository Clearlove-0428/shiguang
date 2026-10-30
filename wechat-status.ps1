[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
@{running=[bool](Get-Process Weixin,WeChat -ErrorAction SilentlyContinue)}|ConvertTo-Json -Compress
