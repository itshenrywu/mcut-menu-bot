const axios = require('axios')
const cheerio = require('cheerio')
const fs = require('fs').promises
const path = require('path')

const args = process.argv.slice(2)
const start = args[0] ? parseInt(args[0], 10) : -7
const end = args[1] ? parseInt(args[1], 10) : 7

const parseMenuHtml = (html) => {
	const $ = cheerio.load(html)

	if ($('a[href="/website1/show_error.aspx"]').length > 0) {
		return {
			n: '\n廠商未上傳菜單\n'
		}
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
	
	const output = Object.entries(menu).map(([type, foods]) => ({
		type,
		foods
	})).sort((a, b) => {
		const order = ['自助餐', '快餐', '燴飯', '麵食', '湯']
		return order.indexOf(a.type) - order.indexOf(b.type)
	})

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
			axios.get(BASE_URL + `?rt=st&ms=0${mealId}`, { headers }),
			axios.get(BASE_URL + `?rt=nd&ms=0${mealId}`, { headers })
		])

		const menu1 = parseMenuHtml(response1.data)
		const menu2 = parseMenuHtml(response2.data)

		const saveData = {
			menu_1: menu1,
			menu_2: menu2
		}

		const outputDir = 'data/menu/' + cookieDate
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

const processNextDay = async (i) => {
	if (i >= end) {
		return
	}

	const nextDay = new Date()
	nextDay.setDate(nextDay.getDate() + i + 1)

	console.log(`\n📅 Starting process for date (${i}) : ${nextDay.toLocaleDateString()}`)
	await crawler(nextDay)

	processNextDay(i + 1)
}

processNextDay(start)