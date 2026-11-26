# 這個專案的工作規則

開始新任務時，先讀 `docs/plans/01-underwater-webgpu.md`（計畫）和 `docs/progress.md`（目前進度與待辦），從 progress 的「下一步」接著做。

## 1. 看截圖：一個任務的圖片總量有上限

每張讀進來的圖都會永久留在這個任務的對話裡。實際發生過兩件事（2026-11-26）：

- Cline 一個任務裡所有圖片合計上限約 8 MB，超過後新讀的圖一律變成 `[media omitted: invalid or exceeds size limit]`，等於看不到圖。
- 累積約 100 張全尺寸截圖時，VS Code 視窗記憶體不足當掉，任務中斷。

所以：

- **只讀 JPEG，寬度 ≤ 960、品質約 70**（每張約 100 KB）。不要用 `read_files` 讀 1920×1080 的 PNG。
- 要看多個 pose，用 `tools/sheet.js` 拼成**一張**總覽圖再讀；要看細節，用 `tools/crop.js` 裁出 ≤ 480 寬的小區域（存成 JPEG）。
- 同一張圖不要重讀；能用數值工具（`region.js`、`scan.js`、`png.js`）判斷的就不要看圖。
- 讀圖時一旦看到 `[media omitted …]`：停止讀圖，更新 `docs/progress.md`，用 ask_question 請使用者開新任務。

## 2. 截圖工具必須會自己結束

`tools/cdp.js` 目前每個 CDP 指令都沒有逾時、WebSocket 斷線也不會讓等待中的指令失敗——Edge 一次沒回應，指令就卡到 Cline 的 10 分鐘上限。下一個任務的第一件事先修好：

- 每個 CDP 指令逾時（例如 30 秒）就失敗；WebSocket `close`／`error` 時讓所有等待中的指令立刻失敗。
- 每支工具（`shoot.js`、`sheet.js`、`dbg.js`…）有總時間上限（例如 180 秒），到了就關掉 Edge（整棵行程樹）並以非 0 結束碼退出。
- 修完用一次故意卡住的情況驗證（例如 eval 一個永遠不 resolve 的 Promise），確認會在時限內結束。

## 3. 版本控制

- 這個資料夾是 git repo。每完成一個可運作的改動、或通過一次驗證，就 commit 一次：`git add -A; git commit -m "<做了什麼>；<驗證結果>"`（PowerShell 5.1 用 `;` 串，不能用 `&&`）。
- `_` 開頭的驗證輸出資料夾和 `node_modules` 已經在 `.gitignore`，不要 commit。
- 沒有遠端，不要 push；不要改寫歷史（`reset --hard`、`rebase`、`commit --amend` 都不用）。要退回某一版用 `git checkout <commit> -- <檔案>`。

## 4. 交接

- `docs/progress.md` 是交接文件：每完成一個階段就更新（已完成、驗證數字、依優先順序的待辦、工具用法）。
- 對話很長、或看圖額度快用完時，先更新 progress 並 commit，再請使用者開新任務。
