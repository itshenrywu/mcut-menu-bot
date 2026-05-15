const axios = require('axios')
const cheerio = require('cheerio')
const fs = require('fs').promises
const path = require('path')

const BASE_URL = 'http://elder.mcut.edu.tw/website1/'
const INDEX_URL = BASE_URL + 'index.aspx'
const REQUEST_TIMEOUT_MS = 30_000

const headers = {
	'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
}

const axiosConfig = { headers, timeout: REQUEST_TIMEOUT_MS }

const parseAnnouncementDate = (dateStr) => {
	if (!dateStr) return null

	const match = dateStr.match(/(\d{3,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/)
	if (!match) return null

	let year = parseInt(match[1], 10)
	const month = parseInt(match[2], 10)
	const day = parseInt(match[3], 10)

	if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null

	if (year < 1000) {
		year += 1911
	}

	return new Date(year, month - 1, day)
}

const isAnnouncementWithinDays = (dateStr, days = 3) => {
	const date = parseAnnouncementDate(dateStr)
	if (!date) return true

	const now = new Date()
	const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
	const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())

	const diffMs = Math.abs(startOfToday - target)
	const limitMs = days * 24 * 60 * 60 * 1000

	return diffMs <= limitMs
}

const parseAnnouncementTable = (html) => {
	const $ = cheerio.load(html)
	const announcements = []

	$('table').each((_, table) => {
		const rows = $(table).find('tr')
		if (rows.length < 2) return

		const firstRowText = $(rows).eq(0).text()
		if (!firstRowText.includes('公告主旨')) return

		rows.each((index, element) => {
			if (index === 0) return

			const tds = $(element).find('td')
			if (tds.length < 3) return

			const title = $(tds).eq(0).text().trim()
			const startDate = $(tds).eq(1).text().trim()
			const endDate = $(tds).eq(2).text().trim()

			if (!title || /^[\d\s]+$/.test(title)) return

			const linkEl = $(tds).eq(3).find('a[href*="index_post.aspx"]').first()
			const href = linkEl.attr('href') || ''
			const detailUrl = href.startsWith('http')
				? href
				: new URL(href, INDEX_URL).href

			announcements.push({
				title,
				startDate,
				endDate,
				detailUrl
			})
		})
	})

	return announcements
}

const fetchAnnouncements = async () => {
	try {
		const response = await axios.get(INDEX_URL, axiosConfig)
		return parseAnnouncementTable(response.data)
	} catch (error) {
		console.error('❌ 抓取公告失敗:', error.message)
		throw error
	}
}

const normalizeText = (value) => value.replace(/\s+/g, ' ').trim()

const parseAnnouncementDetail = (html) => {
	const $ = cheerio.load(html)
	const detail = {
		title: '',
		content: '',
		relatedUrl: '',
		attachments: []
	}

	$('table').each((_, table) => {
		const rows = $(table).find('tr')
		if (rows.length === 0) return

		const hasAnnouncementFields = rows.toArray().some((row) => {
			const label = normalizeText($(row).find('td').eq(0).text())
			return /公告主旨|公告內容|檔案\d+下載|相關網址/.test(label)
		})

		if (!hasAnnouncementFields) return

		rows.each((_, row) => {
			const tds = $(row).find('td')
			if (tds.length < 2) return

			const label = normalizeText($(tds).eq(0).text())
			const valueCell = $(tds).eq(1)
			const text = normalizeText(valueCell.text())

			if (label.includes('公告主旨')) {
				detail.title = text
				return
			}

			if (label.includes('公告內容')) {
				detail.content = text
				return
			}

			if (label.includes('相關網址')) {
				const linkEl = valueCell.find('a[href]').first()
				const href = linkEl.attr('href') || ''
				detail.relatedUrl = href ? (href.startsWith('http') ? href : new URL(href, BASE_URL).href) : text
				return
			}

			if (/^檔案\d+下載$/.test(label)) {
				const linkEl = valueCell.find('a[href]').first()
				const href = linkEl.attr('href') || ''
				if (!href) return

				detail.attachments.push({
					label,
					name: normalizeText(linkEl.text()) || text,
					url: href.startsWith('http') ? href : new URL(href, BASE_URL).href
				})
			}
		})
	})

	return detail
}

const fetchAnnouncementDetail = async (announcement) => {
	try {
		const response = await axios.get(announcement.detailUrl, axiosConfig)
		return parseAnnouncementDetail(response.data)
	} catch (error) {
		return {
			title: '',
			content: '',
			relatedUrl: '',
			attachments: [],
			error: error.message
		}
	}
}

const writeNewsList = async (announcements) => {
	const outDir = path.join(__dirname, '..', 'data', 'menu')
	const outPath = path.join(outDir, 'news.json')

	await fs.mkdir(outDir, { recursive: true })
	await fs.writeFile(outPath, JSON.stringify(announcements, null, 2), 'utf-8')
	console.log(`已寫入 ${outPath}`)
}

const processAnnouncement = async () => {
	const announcements = await fetchAnnouncements()
	const sorted = [...announcements].sort((a, b) => {
		const aTime = a.startDate ? new Date(a.startDate).getTime() : 0
		const bTime = b.startDate ? new Date(b.startDate).getTime() : 0
		return bTime - aTime
	})
	const expanded = await Promise.all(
		sorted.map(async (announcement) => ({
			...announcement,
			detail: await fetchAnnouncementDetail(announcement)
		}))
	)

	await writeNewsList(expanded)
	return expanded
}

processAnnouncement().catch((err) => {
	console.error(err)
	process.exitCode = 1
})