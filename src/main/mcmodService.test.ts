import { describe, expect, it, vi } from 'vitest'
import { McmodHttpClient, McmodService, parseMcmodDownloadHtml, parseMcmodRecommendationsHtml, parseMcmodSearchHtml } from './mcmodService'

describe('MC百科 HTML parsing', () => {
  it('extracts only class results from the search page', () => {
    const html = `
      <div class="search-result-list">
        <div class="result-item"><div class="head"><a href="https://www.mcmod.cn/class/2021.html">机械动力 (<em>Create</em>)</a></div><div class="body">机械与自动化。</div></div>
        <div class="result-item"><div class="head"><a href="https://www.mcmod.cn/item/1.html">不是模组</a></div></div>
      </div>`
    expect(parseMcmodSearchHtml(html)).toEqual([{
      projectId: '2021',
      name: '机械动力 (Create)',
      englishName: 'Create',
      summary: '机械与自动化。',
      pageUrl: 'https://www.mcmod.cn/class/2021.html'
    }])
  })

  it('skips category links before the real mod link', () => {
    const html = `
      <div class="search-result-list">
        <div class="result-item"><div class="head">
          <div class="class-category"><a href="/class/category/24-1.html"></a></div>
          <a href="/class/2021.html">机械动力 (<em>Create</em>)</a>
        </div><div class="body">自动化与机械动力。</div></div>
      </div>`
    expect(parseMcmodSearchHtml(html)).toEqual([expect.objectContaining({
      projectId: '2021',
      name: '机械动力 (Create)',
      englishName: 'Create'
    })])
  })

  it('returns safe public file metadata while keeping the raw MD5 private', () => {
    const html = `<script>var file_token = 'token-1234';</script>
      <table><tr data-id="14502" data-head='<span title="Forge" class="download-api api-1">Forge</span>' data-version="1.20.1" data-md5="19d3b10e071a7cb048eb06255aaf4003" data-sha256="9d69b2abe440b39051cd2a366c7e7e9429c85d709632b65c853989f4f0581705" data-filename="china-only" data-suffix="jar">
      <td></td><td>china-only.jar</td><td class="version">1.20.1</td><td data-original-title="1276722 bytes"></td></tr></table>`
    const parsed = parseMcmodDownloadHtml('2021', html)
    expect(parsed.fileToken).toBe('token-1234')
    expect(parsed.files).toEqual([expect.objectContaining({ projectId: '2021', fileId: '14502', filename: 'china-only.jar', minecraftVersion: '1.20.1', loaders: ['Forge'], size: 1_276_722 })])
    expect(JSON.stringify(parsed.files)).not.toContain('19d3b10e071a7cb048eb06255aaf4003')
    expect(parsed.md5ByFileKey.get(parsed.files[0].fileKey)).toBe('19d3b10e071a7cb048eb06255aaf4003')
  })

  it('reads Chinese and English names from the public recommendation list', () => {
    const html = `<div class="modlist-block">
      <div class="intro"><a class="intro-content"><span>Automation mod.</span></a></div>
      <div class="cover"><img src="//i.mcmod.cn/class/cover/create.jpg"></div>
      <div class="title"><p class="name"><a href="/class/2021.html">机械动力</a></p><p class="ename"><a>Create</a></p></div>
    </div>`
    expect(parseMcmodRecommendationsHtml(html)).toEqual([{
      projectId: '2021',
      name: '机械动力',
      englishName: 'Create',
      summary: 'Automation mod.',
      pageUrl: 'https://www.mcmod.cn/class/2021.html',
      iconUrl: 'https://i.mcmod.cn/class/cover/create.jpg'
    }])
  })

  it('uses the all-category search so the base mod is not hidden by MC百科 filter ranking', async () => {
    const html = `<div class="search-result-list">
      <div class="result-item"><div class="head"><a href="/class/category/24-1.html">分类</a><a href="/class/2021.html">机械动力 (<em>Create</em>)</a></div><div class="body">机械与自动化。</div></div>
      <div class="result-item"><div class="head"><a href="/item/1.html">资料</a></div></div>
    </div>`
    const fetchMock = vi.fn().mockResolvedValue(new Response(html, { status: 200 }))
    const fetchImpl = fetchMock as unknown as typeof fetch
    const service = new McmodService(new McmodHttpClient(fetchImpl))
    await expect(service.search('Create')).resolves.toEqual([expect.objectContaining({ projectId: '2021', name: '机械动力 (Create)' })])
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('mold=0')
  })
})

describe('MC百科 request policy', () => {
  it('honors a zero Retry-After and retries a 429 deterministically', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '0' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 })) as unknown as typeof fetch
    const client = new McmodHttpClient(fetchImpl)
    await expect(client.request('https://search.mcmod.cn/s?key=test')).resolves.toBeInstanceOf(Response)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('stops the provider after a 403 instead of retrying or opening a download fallback', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status: 403 })) as unknown as typeof fetch
    const client = new McmodHttpClient(fetchImpl)
    await expect(client.request('https://www.mcmod.cn/download/2021.html')).rejects.toMatchObject({ status: 403 })
    await expect(client.request('https://search.mcmod.cn/s?key=test')).rejects.toMatchObject({ status: 403 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
