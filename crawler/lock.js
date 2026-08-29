const axios = require('axios')

const API_BASE = process.env.MENU_API_BASE || 'https://mcut-menu-api.henrywu.tw'

// 已發布的菜單若帶有 "lock": true，代表是人工修改過的臨時菜單，爬蟲不應覆蓋
const isLocked = async (relativePath) => {
	// 帶上時間戳避開 GitHub Pages / CDN 的快取，盡量拿到最新的檔案
	const url = `${API_BASE}/${relativePath}?t=${Date.now()}`

	let response
	try {
		response = await axios.get(url, {
			timeout: 10_000,
			transformResponse: (data) => data,
			headers: { 'Cache-Control': 'no-cache' },
			validateStatus: (status) => status === 200 || status === 404
		})
	} catch (error) {
		// 查不到目前狀態時保守處理：這次不覆蓋，等下一次執行再更新
		console.warn(`⚠️  無法確認 ${relativePath} 的 lock 狀態 (${error.message})，這次略過不覆蓋`)
		return true
	}

	if (response.status === 404) return false

	try {
		const data = JSON.parse(response.data)
		return data?.lock === true
	} catch (error) {
		// 內容不是合法 JSON，視為未鎖定
		return false
	}
}

module.exports = { isLocked, API_BASE }
