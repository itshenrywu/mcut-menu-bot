const axios = require('axios')
const fs = require('fs')
const path = require('path')

const CALENDAR_BASE = 'https://cdn.jsdelivr.net/gh/ruyut/TaiwanCalendar/data'

const fetchWorkdays = async (year) => {
	const url = `${CALENDAR_BASE}/${year}.json`
	const { data } = await axios.get(url, { timeout: 10_000 })
	if (!Array.isArray(data)) {
		throw new Error(`${url} 回傳的不是陣列`)
	}
	const workdays = data
		.filter((item) => item.isHoliday === false)
		.map((item) => item.date)
	if (workdays.length === 0) {
		throw new Error(`${url} 沒有任何上班日`)
	}
	return workdays
}

const getWorkingDays = async (year) => {
	const outputDir = path.join(__dirname, '..', 'data', 'menu', String(year))
	const outputPath = path.join(outputDir, 'working-day.json')

	const workdays = await fetchWorkdays(year)
	fs.mkdirSync(outputDir, { recursive: true })
	fs.writeFileSync(outputPath, JSON.stringify(workdays, null, 2), 'utf-8')
	console.log(`${year} 工作日天數：${workdays.length}`)
}

const yearArg = process.argv[2]
let year = yearArg ? parseInt(yearArg, 10) : new Date().getFullYear()
if (Number.isNaN(year) || year < 2000 || year > 2100) {
	console.warn(`⚠️  年份參數無效（${yearArg}），改用今年`)
	year = new Date().getFullYear()
}
getWorkingDays(year).catch((err) => {
	console.error(err)
	process.exitCode = 1
})
