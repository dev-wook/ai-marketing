import type { NaverBlogSearchItem } from '@/lib/naver'
import type { BlogSourceSummary } from '../types'

export type CrawledBlogPost = BlogSourceSummary & {
  text: string
}

const crawlUserAgent =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

export async function crawlNaverBlogPosts(items: NaverBlogSearchItem[], maxPosts = 6) {
  const targets = items.slice(0, maxPosts)

  return Promise.all(
    targets.map(async (item, index) => {
      const text = await fetchNaverBlogPostText(item.link)

      return {
        rank: index + 1,
        title: item.title,
        link: item.link,
        description: item.description,
        extracted: text.length > 0,
        textLength: text.length,
        text,
      } satisfies CrawledBlogPost
    }),
  )
}

async function fetchNaverBlogPostText(link: string) {
  try {
    const outerHtml = await fetchHtml(link)
    const iframeUrl = toNaverBlogIframeUrl(link, outerHtml)
    const postHtml = iframeUrl ? await fetchHtml(iframeUrl, link) : outerHtml

    return extractNaverBlogText(postHtml)
  } catch (error) {
    if (error instanceof Error) {
      console.error('Naver blog crawl skipped', {
        link,
        message: error.message,
      })
    }

    return ''
  }
}

async function fetchHtml(url: string, referer?: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': crawlUserAgent,
      ...(referer ? { Referer: referer } : {}),
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch blog HTML with status ${response.status}`)
  }

  return response.text()
}

function toNaverBlogIframeUrl(link: string, html: string) {
  const src =
    html.match(/id=["']mainFrame["'][\s\S]*?src=["']([^"']+)/i)?.[1] ??
    html.match(/src=["']([^"']*PostView[^"']+)/i)?.[1]

  if (!src) {
    return ''
  }

  return new URL(src, link).toString()
}

function extractNaverBlogText(html: string) {
  const mainStart = html.indexOf('class="se-main-container"')
  const footerStart = html.indexOf('<div id="post_footer_contents"')
  const legacyStart = html.indexOf('id="postViewArea"')

  const source =
    mainStart >= 0 && footerStart > mainStart
      ? html.slice(mainStart, footerStart)
      : legacyStart >= 0 && footerStart > legacyStart
        ? html.slice(legacyStart, footerStart)
        : html

  return decodeHtml(
    source
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  ).slice(0, 2200)
}

function decodeHtml(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}
