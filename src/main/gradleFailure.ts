export function isGradleNetworkFailure(logText: string): boolean {
  return /(?:java\.net\.(?:ConnectException|UnknownHostException|SocketTimeoutException)|Connection timed out|connection reset|Could not (?:GET|HEAD)|Downloading https:\/\/services\.gradle\.org)/i.test(logText)
}

export function isGradleDistributionLockFailure(logText: string): boolean {
  return /Timeout of \d+ reached waiting for exclusive access to file:[^\r\n]*wrapper[\\/]dists[\\/][^\r\n]*gradle-[^\r\n]*-bin\.zip/i.test(logText)
}

export function isGradleWrapperBootstrapFailure(logText: string): boolean {
  return isGradleNetworkFailure(logText) || isGradleDistributionLockFailure(logText)
}
