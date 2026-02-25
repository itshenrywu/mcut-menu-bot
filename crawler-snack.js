const axios = require('axios')
const cheerio = require('cheerio')
const { PDFParse } = require('pdf-parse')
const fs = require('fs').promises
const path = require('path')

const BASE_URL = 'http://elder.mcut.edu.tw/website1/'
const INDEX_URL = BASE_URL + 'index.aspx'
const REQUEST_TIMEOUT_MS = 30_000

const RECENT_ONLY = process.argv.includes('recent-only')

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

const parseAnnouncementDetailAttachments = (html) => {
	const $ = cheerio.load(html)
	const attachments = []

	$('table tr').each((_, row) => {
		const tds = $(row).find('td')
		if (tds.length < 2) return

		const label = $(tds).eq(0).text().trim()
		const linkEl = $(tds).eq(1).find('a[href]').first()

		if (!label.startsWith('檔案') || !label.includes('下載')) return

		const href = linkEl.attr('href')
		if (!href || !href.trim()) return

		const url = href.startsWith('http') ? href : new URL(href, BASE_URL).href
		const name = linkEl.text().trim() || label
		attachments.push({ label, name, url })
	})

	return attachments
}

const extractPdfWithTables = async (buffer) => {
	let parser
	try {
		parser = new PDFParse({ data: buffer })
		const result = await parser.getTable()

		const tables = []
		let fullText = ''

		for (const page of result.pages || []) {
			for (const table of page.tables || []) {
				const rows = Array.isArray(table) ? table : (table.rows || [])
				tables.push(rows)

				for (const row of rows) {
					const cells = Array.isArray(row) ? row : Object.values(row)
					fullText += cells.join(' ') + '\n'
				}
			}
		}

		await parser.destroy()
		parser = null

		if (tables.length > 0) {
			const flatRows = tables.flatMap((t) => (Array.isArray(t) ? t : []))
			const menuByDates = parseMenuByDates(flatRows)
			return {
				text: fullText.trim(),
				tables,
				rows: flatRows,
				menuByDates,
				numPages: result.pages?.length || 0
			}
		}

		const positioned = await extractPdfToPositionedArray(buffer)
		const menuByDates = parseMenuByDates(positioned.rows)
		return {
			text: positioned.text,
			tables: [],
			rows: positioned.rows,
			menuByDates,
			numPages: positioned.numPages
		}
	} finally {
		if (parser) await parser.destroy()
	}
}

const itemsToPositionedArray = (items, options = {}) => {
	const { yTolerance = 8, xGapThreshold = 60 } = options

	if (items.length === 0) return []

	const withCoords = items.map((item) => ({
		str: item.str,
		x: item.x,
		y: item.y
	}))

	const sorted = [...withCoords].sort((a, b) => b.y - a.y || a.x - b.x)

	const rows = []
	let currentRow = { y: sorted[0].y, items: [sorted[0]] }

	for (let i = 1; i < sorted.length; i++) {
		const item = sorted[i]
		if (Math.abs(item.y - currentRow.y) <= yTolerance) {
			currentRow.items.push(item)
		} else {
			rows.push(currentRow.items)
			currentRow = { y: item.y, items: [item] }
		}
	}
	rows.push(currentRow.items)

	return rows.map((rowItems) => {
		const sortedX = [...rowItems].sort((a, b) => a.x - b.x)
		const cells = []
		let cellStr = sortedX[0].str
		let lastX = sortedX[0].x

		for (let i = 1; i < sortedX.length; i++) {
			const item = sortedX[i]
			if (item.x - lastX > xGapThreshold) {
				cells.push(cellStr.trim())
				cellStr = item.str
			} else {
				cellStr += item.str
			}
			lastX = item.x
		}
		cells.push(cellStr.trim())
		return cells.filter((c) => c !== '')
	})
}

const extractPdfToPositionedArray = async (buffer) => {
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
	const { getDocument } = pdfjs.default ?? pdfjs

	if (typeof getDocument !== 'function') {
		throw new Error('pdfjs-dist getDocument not found')
	}

	const uint8 = buffer instanceof Buffer ? new Uint8Array(buffer) : buffer
	const loadingTask = getDocument({ data: uint8 })
	const doc = await loadingTask.promise
	const numPages = doc.numPages
	const allItems = []

	for (let p = 1; p <= numPages; p++) {
		const page = await doc.getPage(p)
		const textContent = await page.getTextContent({
			normalizeWhitespace: false,
			disableCombineTextItems: false
		})

		for (const item of textContent.items) {
			if (item.str != null) {
				allItems.push({
					str: item.str,
					x: item.transform[4],
					y: item.transform[5],
					page: p
				})
			}
		}
	}

	doc.destroy()

	const rows = itemsToPositionedArray(allItems)
	const text = rows.map((r) => r.join(' ')).join('\n')

	return { text, rows, numPages }
}

const DATE_ROW_REG = /^(\d+)月(\d+)日$/

const toYYYYMMDD = (dateStr) => { // 年份都當作今年，但如果在 12 月時查到公告寫 1 月，當作明年
	const match = dateStr.match(DATE_ROW_REG)
	if (!match) return null
	const month = parseInt(match[1], 10)
	const day = parseInt(match[2], 10)

	const now = new Date()
	const currentMonth = now.getMonth() + 1
	const currentYear = now.getFullYear()

	const year =
		currentMonth === 12 && month === 1 ? currentYear + 1 : currentYear

	return `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`
}

const parseMenuByDates = (rows) => {
	const dateIndices = []
	for (let i = 0; i < rows.length; i++) {
		const row = rows[i]
		if (row.length === 1 && DATE_ROW_REG.test(row[0].trim())) {
			dateIndices.push({ i, dateStr: row[0].trim() })
		}
	}

	const result = []
	for (const { i, dateStr } of dateIndices) {
		const before = rows[i - 1]
		const after = rows[i + 1]

		const foods = []
		if (before && before.length >= 2) {
			foods.push([before[0], before[1]])
		}
		if (after && after.length >= 2) {
			foods.push([after[0], after[1]])
		}

		const date = toYYYYMMDD(dateStr)

		const menu1 = foods.map((f) => f[0]).filter(Boolean)
		const menu2 = foods.map((f) => f[1]).filter(Boolean)

		const menu = {
			menu_1: [{ type: '主食', foods: menu1.join('、').replace(/\//g, '、') }],
			menu_2: [{ type: '主食', foods: menu2.join('、').replace(/\//g, '、') }]
		}

		result.push({ dateStr, date, foods, menu })
	}
	return result
}

const readAttachmentContent = async (url, name) => {
	try {
		const response = await axios.get(url, {
			...axiosConfig,
			responseType: 'arraybuffer'
		})
		const buffer = Buffer.from(response.data)
		const urlPath = new URL(url).pathname
		const ext = (urlPath.split('.').pop() || name.split('.').pop() || '').toLowerCase()

		if (ext === 'pdf') {
			const data = await extractPdfWithTables(buffer)
			return {
				url,
				name,
				text: data.text,
				tables: data.tables,
				rows: data.rows,
				menuByDates: data.menuByDates,
				numPages: data.numPages
			}
		}

		return { url, name, text: '(非 PDF，請手動查看)', rawSize: buffer.length }
	} catch (error) {
		return { url, name, text: null, error: error.message }
	}
}

const fetchNightSnackAnnouncements = async (keyword = '夜點供應') => {
	const all = await fetchAnnouncements()
	const filtered = all.filter((a) => a.title.includes(keyword))

	const results = await Promise.all(
		filtered.map(async (ann) => {
			const detailRes = await axios.get(ann.detailUrl, axiosConfig)
			const attachments = parseAnnouncementDetailAttachments(detailRes.data)

			const attachmentContents = await Promise.all(
				attachments.map((att) => readAttachmentContent(att.url, att.name))
			)

			return {
				announcement: ann,
				attachments: attachmentContents
			}
		})
	)

	return results
}

const processAnnouncement = async () => {
	const results = await fetchNightSnackAnnouncements('夜點供應')
	const sourceResults = RECENT_ONLY
		? results.filter(({ announcement }) =>
				isAnnouncementWithinDays(announcement.startDate || announcement.endDate)
			)
		: results

	if (RECENT_ONLY && sourceResults.length === 0) {
		console.log('沒有三天內的夜點供應公告')
		return []
	}

	const pdfUrls = []

	for (const { attachments } of sourceResults) {
		for (const att of attachments) {
			if (att.error || !att.menuByDates) continue
			if (att.url) pdfUrls.push(att.url)

			for (const { date, menu } of att.menuByDates) {
				if (!date) continue
				console.log(date)
				const [y, m, d] = date.split('/')
				const dir = path.join('data', 'menu', y, m, d)
				await fs.mkdir(dir, { recursive: true })
				const filePath = path.join(dir, '4.json')
				await fs.writeFile(filePath, JSON.stringify(menu))
			}
		}
	}

	const outPath = process.env.GITHUB_OUTPUT
	if (outPath && pdfUrls.length > 0) {
		const unique = [...new Set(pdfUrls)]
		const body = ['## PDF 公告來源', ...unique.map((u) => `- ${u}`)].join('\n')
		await fs.appendFile(outPath, `body<<PRBODY\n${body}\nPRBODY\n`, 'utf-8')
	}

	return results
}

processAnnouncement().catch((err) => {
	console.error(err)
	process.exitCode = 1
})