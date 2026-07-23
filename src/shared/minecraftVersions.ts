const fabricApiVersions: Record<string, string> = {
  '1.20.1': '0.92.9+1.20.1',
  '1.20.6': '0.100.8+1.20.6',
  '1.21.1': '0.116.13+1.21.1'
}

export function fabricApiVersionFor(minecraftVersion: string): string {
  const version = fabricApiVersions[minecraftVersion]
  if (!version) throw new Error(`没有为 Minecraft ${minecraftVersion} 配置 Fabric API 版本`)
  return version
}
