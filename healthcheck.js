// 這是「爬蟲還活著嗎」的存活檢查，不是完整性檢查：
// 未來 7 天 x 3 餐共 21 個檔案中只要有任何一個是有效菜單就算通過，
// 因為假日、廠商未上傳等原因本來就會有很多天沒有菜單。
// 逐檔的 [-] 只是診斷用的過程記錄，單獨一筆並不代表有問題。
const API_BASE = process.env.MENU_API_BASE || 'https://mcut-menu-api.henrywu.tw'

const main = async () => {
	const today = new Date()
	const checkedDates = []

	console.log(`Base date today (UTC): ${today.toISOString().split('T')[0]}`)
	console.log('Starting to check API data for the next 7 days...')
	console.log('(Passes as soon as one valid menu is found)\n')

	for (let i = 1; i <= 7; i++) {
		const targetDate = new Date()
		targetDate.setDate(today.getDate() + i)

		const year = targetDate.getFullYear()
		const month = String(targetDate.getMonth() + 1).padStart(2, '0')
		const day = String(targetDate.getDate()).padStart(2, '0')

		const datePath = `${year}/${month}/${day}`
		checkedDates.push(datePath)

		for (let meal = 1; meal <= 3; meal++) {
			const url = `${API_BASE}/${datePath}/${meal}.json`

			try {
				const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })

				if (response.status === 200) {
					const text = await response.text()
					try {
						const data = JSON.parse(text)
						const hasMenu1 = data && Array.isArray(data.menu_1) && data.menu_1.length > 0
						const hasMenu2 = data && Array.isArray(data.menu_2) && data.menu_2.length > 0

						if (hasMenu1 && hasMenu2) {
							console.log(`[+] ${datePath}/${meal}.json: Data exists and is valid (200 OK)`)
							console.log('\n✅ Crawler is alive: at least one valid menu found')
							process.exit(0)
						} else {
							console.log(`[-] ${datePath}/${meal}.json: Menu content is empty or incomplete (200 OK)`)
						}
					} catch (parseError) {
						console.log(`[-] ${datePath}/${meal}.json: Invalid JSON format (200 OK)`)
					}
				} else if (response.status === 404) {
					console.log(`[-] ${datePath}/${meal}.json: Data not found (404)`)
				} else {
					console.log(`[-] ${datePath}/${meal}.json: Unexpected status code (${response.status})`)
				}
			} catch (error) {
				console.log(`[-] ${datePath}/${meal}.json: Request failed (${error.message})`)
			}
		}
	}

	const startDate = checkedDates[0]
	const endDate = checkedDates[checkedDates.length - 1]
	const msg = `⚠️ No valid menu found at all for ${startDate} ~ ${endDate} — the crawler is probably broken`

	console.error('\n' + msg)
	process.exit(1)
}

main().catch((err) => {
	console.error('Unexpected error occurred during script execution:', err)
	process.exit(1)
})
