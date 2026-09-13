# 明志科技大學學餐菜單機器人

[<img src="https://scdn.line-apps.com/n/line_add_friends/btn/zh-Hant.png" width=100>](https://lin.ee/1CY9bEW)

## 功能
- 查詢近七天內的菜單
- 使用者可設定偏好顯示方式
- 前一天/後一天的按鈕會顯示前一個/後一個上班日（使用 [ruyut/TaiwanCalendar](https://github.com/ruyut/TaiwanCalendar)）

## 菜單 API
```
https://mcut-menu-api.henrywu.tw/{YYYY}/{MM}/{DD}/{MEAL_ID}.json
```

- 可查詢的日期範圍：2013/04/01 ~ 今日 +7 天
- MEAL_ID：`1` = 早餐，`2` = 午餐，`3` = 晚餐，`4` = 段考週免費宵夜

### 回應格式 
```json
{
    "menu_1": [
        {
            "type": "主食",
            "foods": "特製三明治、豬排漢堡、焙果、蔥抓餅、火腿蛋餅"
        }
    ],
    "menu_2": [
        {
            "type": "主食",
            "foods": "昱品麵包、現做三明治、雞肉蛋漢堡、肉鬆蛋餅"
        }
    ]
}
```

- `menu_1` = 第一餐廳，`menu_2` = 第二餐廳
- 廠商未上傳菜單時，對應的陣列會是空陣列

## 環境變數

複製 `.env.sample` 為 `.env` 後填入：

| 變數 | 必填 | 說明 |
| --- | --- | --- |
| `CHANNEL_SECRET` | ✅ | LINE Channel secret，用於 webhook 簽章驗證 |
| `CHANNEL_ACCESS_TOKEN` | ✅ | LINE Channel access token |
| `URL` | ✅ | bot 對外的網址，imagemap 會用它組出圖片網址 |
| `PORT` | | 預設 `80` |
| `TZ` | | 預設請設為 `Asia/Taipei` |
| `MENU_API_BASE` | | 菜單 API 位址，預設 `https://mcut-menu-api.henrywu.tw` |

必填的變數缺少時，bot 會在啟動時直接結束並印出缺少哪一項。

## 爬蟲與 workflow

四個 workflow 都只由 `workflow_dispatch` 觸發（healthcheck 與 Get Working Day 另有排程）。
外部觸發方式（需要有 `actions: write` 權限的 token）：

```bash
curl -X POST \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer <GITHUB_TOKEN>" \
  https://api.github.com/repos/itshenrywu/mcut-menu-bot/actions/workflows/get-menu.yml/dispatches \
  -d '{"ref":"main"}'
```

把 `get-menu.yml` 換成 `get-snack-menu.yml`、`get-working-day.yml`、`healthcheck.yml` 即可觸發其他 workflow。

`get-snack-menu.yml` 可帶 `recent_only` 參數（預設 `true`，只處理七天內的夜點供應公告）：

```bash
  -d '{"ref":"main","inputs":{"recent_only":"false"}}'
```

### 暫停爬蟲

在 `.github/.skip-until` 寫入 `YYYY-MM-DD`，在該日期之前爬蟲步驟會被略過（例如寒暑假）。

### 鎖定人工修改的菜單

在 `gh-pages` 分支上直接編輯菜單 JSON 並加上 `"lock": true`，之後的爬蟲就不會覆蓋這個檔案：

```json
{
    "lock": true,
    "menu_1": [{ "type": "主食", "foods": "臨時調整的菜色" }],
    "menu_2": []
}
```

部署前 workflow 會 checkout `gh-pages`，用 `.github/scripts/filter-locked.js` 把已鎖定的檔案從爬蟲輸出中移除，
再搭配 `keep_files: true` 部署，所以鎖定的檔案會維持原樣。
若已發布的檔案不是合法 JSON，會保守視為已鎖定（不覆蓋）並在 workflow log 印出警告。

## 開發

```bash
npm ci
npm run lint   # ESLint（tab 縮排、強制 ===）
npm test       # node:test，涵蓋各爬蟲的解析器與 lock 過濾腳本
npm start
```

push 與 PR 會由 [test.yml](.github/workflows/test.yml) 自動跑 lint 與測試。

## 資料來源
http://elder.mcut.edu.tw/website1/
