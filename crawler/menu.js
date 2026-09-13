const axios = require('axios')
const cheerio = require('cheerio')
const fs = require('fs').promises
const path = require('path')

const USAGE = '用法：node crawler/menu.js [起始天數偏移=-7] [結束天數偏移=7]'

const parseOffsetArg = (value, fallback, label) => {
	if (value === undefined) return fallback
	const parsed = Number(value)
	if (!Number.isInteger(parsed)) {
		console.error(`❌ ${label} 必須是整數（收到 "${value}"）`)
		console.error(USAGE)
		process.exit(1)
	}
	return parsed
}

const parseMenuHtml = (html) => {
	const $ = cheerio.load(html)

	// 廠商未上傳菜單時學校網站會導到錯誤頁
	if ($('a[href="/website1/show_error.aspx"]').length > 0) {
		return []
	}

	const menu = {}
	$('tr').each((index, element) => {
		if (index === 0) return

		const tds = $(element).find('td')
		const key = $(tds).eq(2).text().trim()
		const value = $(tds).eq(4).text().trim().replace(/\\/g, '')

		if (key && value) {
			if (menu[key]) {
				menu[key] += `、${value}`
			} else {
				menu[key] = value
			}
		}
	})
	
	const order = ['自助餐', '快餐', '燴飯', '麵食', '湯']
	// 沒列在 order 裡的類型排到最後（indexOf 回傳 -1，直接相減會讓未知類型跑到最前面）
	const rank = (type) => {
		const index = order.indexOf(type)
		return index === -1 ? order.length : index
	}

	const output = Object.entries(menu).map(([type, foods]) => ({
		type,
		foods
	})).sort((a, b) => rank(a.type) - rank(b.type))

	return output
}

const fetchAndProcessMeal = async (date, mealId) => {
	const today = new Date(date)
	const year = today.getFullYear()
	const month = (today.getMonth() + 1).toString().padStart(2, '0')
	const day = today.getDate().toString().padStart(2, '0')

	const cookieDate = `${year}/${month}/${day}`

	const BASE_URL = 'http://elder.mcut.edu.tw/website1/showmenu.aspx'
	const headers = {
		'Cookie': `fooddate=${cookieDate}`,
		'User-Agent': 'Mozilla/5.0 (Windows NT 10.0 Win64 x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
	}

	try {
		const [response1, response2] = await Promise.all([
			axios.get(BASE_URL + `?rt=st&ms=0${mealId}`, { headers, timeout: 15_000 }),
			axios.get(BASE_URL + `?rt=nd&ms=0${mealId}`, { headers, timeout: 15_000 })
		])

		const menu1 = parseMenuHtml(response1.data)
		const menu2 = parseMenuHtml(response2.data)

		const saveData = {
			menu_1: menu1,
			menu_2: menu2
		}

		const outputDir = path.join(__dirname, '..', 'data', 'menu', cookieDate)
		await fs.mkdir(outputDir, { recursive: true })

		const filePath = path.join(outputDir, `${mealId}.json`)
		await fs.writeFile(filePath, JSON.stringify(saveData, null, 4))

		console.log(`✅ Successfully saved menu for mealId ${mealId} to ${filePath}`)

	} catch (error) {
		console.error(`❌ Failed to fetch menu for mealId ${mealId}:`, error.message)
	}
}

const crawler = async (date) => {
	for (let mealId = 1; mealId <= 3; mealId++) {
		await fetchAndProcessMeal(date, mealId)
	}
}

const run = async (start, end) => {
	for (let i = start; i < end; i++) {
		const nextDay = new Date()
		nextDay.setDate(nextDay.getDate() + i + 1)

		console.log(`\n📅 Starting process for date (${i}) : ${nextDay.toLocaleDateString()}`)
		await crawler(nextDay)
	}
}

if (require.main === module) {
	const args = process.argv.slice(2)
	const start = parseOffsetArg(args[0], -7, '起始天數偏移')
	const end = parseOffsetArg(args[1], 7, '結束天數偏移')

	run(start, end).catch((err) => {
		console.error(err)
		process.exitCode = 1
	})
}

module.exports = { parseMenuHtml, parseOffsetArg }
