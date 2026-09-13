// 已發布的菜單若帶有 "lock": true，代表是人工修改過的臨時菜單，爬蟲不應覆蓋。
//
// 這支腳本在部署前執行：把爬蟲輸出中「gh-pages 上已鎖定」的檔案刪掉，
// 搭配 peaceiris/actions-gh-pages 的 keep_files: true 就等於「略過不覆蓋」。
// 判斷對象是已 checkout 的 gh-pages 分支內容，不經過 CDN，所以沒有快取與競態問題。
//
// 用法：node .github/scripts/filter-locked.js <爬蟲輸出目錄> <gh-pages checkout 目錄>

const fs = require('fs')
const path = require('path')

const [sourceDir, publishedDir] = process.argv.slice(2)

if (!sourceDir || !publishedDir) {
	console.error('用法：node .github/scripts/filter-locked.js <爬蟲輸出目錄> <gh-pages checkout 目錄>')
	process.exit(1)
}

if (!fs.existsSync(publishedDir)) {
	// 沒有 gh-pages 內容就無法判斷 lock，寧可讓 workflow 失敗也不要蓋掉人工修改
	console.error(`❌ 找不到已發布的內容目錄：${publishedDir}`)
	process.exit(1)
}

if (!fs.existsSync(sourceDir)) {
	console.log(`爬蟲沒有產生 ${sourceDir}，不需要過濾`)
	process.exit(0)
}

const listJsonFiles = (dir) => {
	const results = []
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) {
			results.push(...listJsonFiles(full))
		} else if (entry.isFile() && entry.name.endsWith('.json')) {
			results.push(full)
		}
	}
	return results
}

// 回傳 true 代表「不要覆蓋」。已發布的檔案壞掉時無法確認人工是否鎖定，保守視為已鎖定。
const isLocked = (publishedPath) => {
	if (!fs.existsSync(publishedPath)) return false

	let raw
	try {
		raw = fs.readFileSync(publishedPath, 'utf-8')
	} catch (error) {
		console.warn(`⚠️  ${publishedPath} 讀取失敗（${error.message}），保守視為已鎖定`)
		return true
	}

	try {
		return JSON.parse(raw)?.lock === true
	} catch (error) {
		console.warn(`⚠️  ${publishedPath} 不是合法的 JSON（${error.message}），保守視為已鎖定，請手動修正後再重跑`)
		return true
	}
}

let removed = 0
for (const sourcePath of listJsonFiles(sourceDir)) {
	const relativePath = path.relative(sourceDir, sourcePath)
	if (isLocked(path.join(publishedDir, relativePath))) {
		fs.rmSync(sourcePath)
		removed++
		console.log(`🔒 ${relativePath} 已鎖定 (lock: true)，略過不覆蓋`)
	}
}

console.log(`共略過 ${removed} 個已鎖定的檔案`)
