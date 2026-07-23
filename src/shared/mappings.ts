export interface MappingClassResult {
  version: string
  pagePath: string
  names: Record<string, string>
}

export interface MappingMember {
  kind: 'field' | 'constructor' | 'method'
  type: string
  names: Record<string, string>
}

export interface MappingSearchResult {
  version: string
  query: string
  source: string
  cached: boolean
  results: MappingClassResult[]
}

export interface MappingClassDetail extends MappingClassResult {
  sourceUrl: string
  declaration: string
  cached: boolean
  members: MappingMember[]
}

export interface MappingsApi {
  search: (version: string, query: string, limit?: number) => Promise<MappingSearchResult>
  getClass: (version: string, className: string, memberQuery?: string) => Promise<MappingClassDetail>
  openSource: (version: string) => Promise<void>
}
