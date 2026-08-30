export function isGradleMavenDependencyFailure(logText: string): boolean {
  return /Could not (?:download [^\r\n]*\.jar|get resource ['"]https?:\/\/[^'"]+['"])/i.test(logText)
}

export function isGradleNetworkFailure(logText: string): boolean {
  if (isGradleMavenDependencyFailure(logText)) return false
  return /(?:java\.net\.(?:ConnectException|UnknownHostException|SocketTimeoutException)|Connection timed out|connection reset|Could not (?:GET|HEAD) ['"]?https?:\/\/[^\s'"]*(?:gradle-[^\s'"]*\.zip|services\.gradle\.org)|Could not (?:download|install) [^\r\n]*(?:gradle-[^\r\n]*\.zip|Gradle distribution))/i.test(logText)
}

export function isGradleDistributionLockFailure(logText: string): boolean {
  return /Timeout of \d+ reached waiting for exclusive access to file:[^\r\n]*wrapper[\\/]dists[\\/][^\r\n]*gradle-[^\r\n]*-bin\.zip/i.test(logText)
}

export function isGradleWrapperBootstrapFailure(logText: string): boolean {
  return isGradleNetworkFailure(logText) || isGradleDistributionLockFailure(logText)
}
