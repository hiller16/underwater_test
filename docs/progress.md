# Kelp Cathedral — 進度紀錄

> 更新時間：2026-11-26。單一交付檔 `index.html`（WebGPU、全程序化、無引擎）。
> 本輪在「圖片通道失效」（`read_files` 回傳 `media omitted`）的情況下工作，
> 因此最近的判斷多半來自數值工具，不是肉眼。

---

## 1. 已完成

### 場景（全部程序化，無貼圖／模型檔）
- **地形**：沿 z 蜿蜒的峽谷（`canyonCenter` + `bedHeight`），谷床約 -34，兩側岩壁爬過水面，
  far-z 用 `smoothstep(120,196)` 抬升收口 → 起始區看不到世界邊界。
- **巨藻林**：instanced 扭轉絲帶（最多 6500 株 ×13 節點），懸臂式搖曳（位移 ∝ lv²、相位沿莖上升）、
  繞軸扭葉、綠→金色調、少量紫紅變體、世界錨定的圓形 `specks()` 閃光。
- **海面（由下看）**：跟隨相機的圓盤（密集環圈永遠在頭頂）、逐像素波浪法線
  （有限差分寬度隨距離變大，抑制遠處 shimmer）、Snell window 以 cosT 平順過渡（不再是硬邊）、
  天空雲層結構、glitter、掠射角增亮。
- **岩石／道具**：boulder、floating boulder、pinnacle、slab、barrel sponge、coral、arch、
  沉船船殼（含桅杆與肋骨）、石雕鯨尾。單一 instanced shader 以 `kind` 分支材質。
- **動態生命**：marine snow（相機包覆 box wrap）、上昇氣泡（通氣口噴流）、魚群（尾鰭擺動 +
  群體路徑）、蝠鱝（展翅 + 傾轉）。全部在 VS 內由 `u.camPos.w` 驅動 → 每幀零 CPU 更新。
- **大氣**：Beer-Lambert 吸收 + 積分 in-scatter（`fogBlend`，所有材質共用，背景 pass 用同一式子，
  所以遠處無接縫）、screen-space god rays（往太陽方向 march，遇深度停止）、
  bright→blur bloom、ACES（已重新正規化肩部）、暗角、dither。
- **相機控制**：WASD + Q/E + Shift、pointer lock 滑鼠視角、H 切換 HUD、R reset。

### 工程
- 單一 `index.html`；零 per-frame JS 配置（所有動畫在 VS、instance buffer 只在建檔時寫入）。
- WGSL 除错成果：AMD 上 `pow()` 負底數回傳 NaN。已加 `cube()` 取代負底數 pow、
  `fogBlend()` 內 `select()` 防毒 fallback、mote 的 `discard` 閘門與近鏡剔除。
- 驗證 API `window.__scene`：`setPose / startTour / resetStats / getStats / hide / luma / sheet`。

### 驗證工具強化（本輪，2026-11-26）
`.clinerules/workflow.md` §2 要求的逾時保護已補進 `tools/cdp.js`（其他瀏覽器工具都 require 它，自動適用）：

- **每條 CDP 指令 30 s 逾時**（`CDP_CMD_TIMEOUT_MS` 覆寫），錯誤訊息帶 method 名稱。
- **WebSocket `close`／`error` 時一次讓所有 in-flight 指令失敗**；`b.close()` 冪等，`b.pending()` 可看還在等什麼。
- **整體時間預算 180 s**（`CDP_BUDGET_MS`）：由第一次 `launch()` 啟動、之後共用同一條截止線
  （所以 `tsflag.js` 那種連續開 6 個瀏覽器的工具也算總量）；到點 `taskkill /T /F` 整棵行程樹
  + `exit 1`，並印出還在等的 CDP 指令。計時器 unref → 正常跑完不會多撐時間。
- 啟動階段同樣封頂：等 `DevToolsActivePort` 60 s（`CDP_BOOT_TIMEOUT_MS`）、`/json/list` 與 WS 連線各 30 s；
  `process.on('exit')` 兜底掃掉沒 `close()` 的 Edge。
- `shoot.js` 依工作量推算預算：`60 s + tour + warm + poses×(settle+12 s) + tour-frames×2.5 s`，可用 `--budget <sec>` 覆寫。

實測（暫存目錄 `_t_cdp`，已刪）：

| 情境 | 結果 |
|---|---|
| 正常：1 pose @854×480 | 2 s 完成，exit 0，errors `[]` |
| 正常：tour 6 s + 4 張截圖 @1280×720 | 11 s 完成，exit 0，avg 5.56 ms |
| 卡住：`eval new Promise(()=>{})`，`CDP_CMD_TIMEOUT_MS=3000` | `ERR CDP Runtime.evaluate timed out after 3 s`，工具繼續跑完，exit 0 |
| 卡住：30 s 的 eval + `CDP_BUDGET_MS=6000` | `TIMEOUT: tool run exceeded 6 s (waiting on CDP: Runtime.evaluate for 3s) - browser killed`，exit 1 |
| 指令進行中殺掉 Edge | 等待中的 eval 1.7 s 內以 `CDP socket error` 失敗（而不是等 30 s） |
| 未捕獲的 rejection | exit 1，Edge 在約 2 s 內完全消失（taskkill 已發出，OS 收尾需要一點時間） |

### 本輪修掉的缺陷
| 缺陷 | 根因 | 處置 | 驗證 |
|---|---|---|---|
| 畫面中純黑塊（major→blocker） | mote 精靈的 NaN alpha 進 HDR buffer，經 bloom 擴散成黑卡；另 VS 四角公式 `*4` 應為 `*2` | VS 加 `!(d >= 1.2)` 剔除；FS 加 `!(s>=0)||!(s<4e4)` discard | `tools/scan.js` pose0/pose3 @1280×720 → 0 blobs（此前 1–3 個 48×48～60×52） |
| pose5 整張平坦藍（blocker） | `finalizePoses()` 執行時 `SET.arches` 還是空的 → yaw/pitch = NaN | 新增 `layoutArches()`，順序改為 layoutArches → finalizePoses → buildCamPath | pose5 恢復內容（mean 0.339，edge 0.049） |
| 相機埋進岩石 / 布景看不到 | 大道具隨機落在視點上 | 新增相機走廊 `CAMPTS`（6 poses ±9 m 擺頭 + 120 個 tour 取樣），大道具落在管內就剔除；arch 改為對準視點（standoff 44）；tour 相機鉗在 bed+12 | 各 pose 不再出現整屏單色 |
| 布景方向錯誤（船殼側邊、鯨尾成細片） | `rot3` 旋轉順序為 Y→X→Z，yaw 先做 | 改為 roll→pitch→yaw（yaw 最後）；船殼 yaw 0.95 + 10° 傾側；鯨尾 rx90 站起再 ry90 轉向走廊 | 見「待辦 P0」：需肉眼覆核 |

---

## 2. 驗證結果

### 2.1 Visual critic（只准看 render，不準看 code）
狀態：**尚未通過（有 blocker）**。本輪 `_rev9`：6 poses @1920×1080、`errors: []`、12 s 跑完，
拼成 `_view/c9.jpg`（960×810、190 KB）一張讀完。上一輪之後的「set piece 轉向 + god ray 加固 +
海面亮度下修」現在有肉眼結果：道具轉向确实有到（不再看到側邊/細片），但 set piece 仍不好認，
而亮度問題從「黑」變成另一頭「白」。

#### 本輪缺陷清單（依嚴重度）
| # | 等級 | 缺陷 | 出現在 | 建議方向 |
|---|---|---|---|---|
| 1 | **blocker** | Set piece 辨識度不足：pose2 的船殼只剩左中一段深灰長條、被 kelp 切掉；pose3 找不到鯨尾石雕；pose5 的拱門像一根細彎管/馬蹄鐵，沒有岩質與厚度 | 2、3、5 | 清出道具視線（走廊半徑再放大或對準 pose）、arch 由岩壁擠出而非 tube、fluke 加基座與附著生 |
| 2 | major | Kelp 讀成「竹竿 + 飄落的楓葉」：莖是筆直等徑的純色圓柱，葉是小扁片隨機方向，沒有長葉帶與頂冠 → 缺了巨藻林的主 signature | 全部 | 葉改成沿莖的長帶（寬度隨高度漸變、頂部成冠）；莖加弧度與粗細變化 |
| 3 | major | 白霧過曝（milky）：上半部／太陽方向洗成接近純白、沒有漸層與結構，god ray 看不到明確光柱 | 1（右半整片白）、2、4（上半）、0（中右） | in-scatter 設亮度上限、太陽近旁交給 bloom；god ray 提高對比但別把中間調洗白 |
| 4 | major | 近景巨莖硬切構圖：pose0 右側一整條巨大綠柱、pose1 中央一根粗莖變成主體，沒有淡出或剔除 | 0、1、3 | 距鏡頭 <~2.5 m 的 kelp 淡出／剔除，或相機推擠 |
| 5 | major | 地面洋紅過飽和：前景紫紅與上方冷調分裂，像兩張圖拼起來 | 3（最明顯）、0、4、5 | magenta 依深度往霧色插值、縮小連續面積（摻條紋/斑塊） |
| 6 | minor | 葉片像無透光紙卡片：邊緣硬、無透光與色相漸層，specks 只點亮小塊 | 3、4 | 葉加薄壁透光（back-light）+ 沿葉漸層，A2C 邊緣軟化 |
| 7 | minor | 生命體不可見：這 6 格看不出魚群/蝠鱝/氣泡，只有零星小黑點 | 0、2、5 | 魚群路徑收進 pose 視野、氣泡柱加密並移近鏡頭 |
| 8 | minor | 遠景岩壁 blocky 雜訊：crackle/hash 在遠處仍成小方塊 | 5、2 | 更早淡出高頻項，遠處改低頻色變異 |
| 9 | minor | pose1 白色漸層疑似輕微 banding（JPEG 下不能定案） | 1 | 用 1280×720 PNG + `png.js` 複查 gradient |

停止條件（無 major 以上、minor 收斂）未達成 → #1–#5 修完再跑一輪。

已經用數值工具確認的部分（`tools/region.js`，edge = 邊緣能量、std = 對比）：

| pose | 上方 40% mean / std / edge | 下方 35% mean / std / edge | 判讀 |
|---|---|---|---|
| 0 canyon-start | 0.712 / 0.157 / 0.023 | ~0.36 / 0.107 / 0.042 | 天花板有結構但偏亮，仍需確認不致「milky」 |
| 1 look-up-surface | 0.556 / 0.234 / 0.024 | 0.656 / 0.258 / 0.023 | clip 0%（此前 7.5%），天空已退回 tonemap 肩部以下 |
| 4 kelp-corridor | 0.690 / 0.169 / 0.027 | 0.409 / 0.111 / 0.043 | 同上 |
| 5 deep-arch | 0.446 / 0.148 / 0.049 | 0.231 / 0.125 / 0.057 | 深區確實較暗（深度階梯正確） |

黑塊檢查（`tools/scan.js`）：pose0/pose3 = 0 blobs；pose5 殘留 2 個小塊（18×31、13×25，
RGB≈1/7/2）→ 偏暗的綠葉剪影，非 NaN 黑卡。

critic 上一輪清單的處理進度：
- 已修：黑塊、pose5 空白、相機埋岩、布景轉向、Snell 硬邊、遠處 hash 馬賽克（crackle 隨距離淡出）、
  grain 距離切換產生移動環（改 cross-fade）。
- 待肉眼覆核：船殼/鯨尾是否好認、god ray 是否明顯但不 milky、巨藻葉片是否過大過平、
  紫色地面是否過飽和、banding。

### 2.2 效能（scripted fly-through，fenced = 每幀等 `onSubmittedWorkDone`）

| run | size | 條件 | frames | avg | p50 | p99 | p999 | max | 0.1% low (fps) |
|---|---|---|---|---|---|---|---|---|---|
| `_perf6` | 1920×1080 | `--perf --nolimit` | 4096 | **5.81** | 5.6 | 9.2 | 14.1 | 33.4 | 29.9 |
| `_perf5` | 1920×1080 | `--perf`（vsync 180 Hz） | 3041 | 7.90 | 5.6 | 22.3 | 27.8 | 33.4 | 29.9 |
| `_perf4` | 1920×1200 | `--perf`（vsync） | 4096 | 6.82 | 5.6 | 16.8 | 16.9 | 22.2 | 45.0 |

GPU 端（`gpuMs`，同一 submit 的 fence 往返）：1080p avg 5.7 / p99 8.9 / max 19.7；
1200p avg 6.01 / p99 9.7 / max 21.4。

逐 pass（`--profile`，`_perf5p` @1920×1080，每 pass 單獨 submit ×6 取平均）：

| pass | ms |
|---|---|
| scene | 5.00 |
| rays | 1.03 |
| rayH / rayV | 0.71 / 0.66 |
| bright | 0.67 |
| bloomH / bloomV | 0.66 / 0.64 |
| composite | 0.69 |
| 合計 | 10.05（含 fence 開銷，profile 模式 wall time 不代表實際節奏） |

**GPU timestamp queries 限制**：本機 Chromium 157 build 沒有
`chromium-experimental-timestamp-query-inside-passes`，`GPUCommandEncoder.writeTimestamp`
也已移除，任何 `--enable-*-features` flag 都打不開（`tools/tsflag.js` 逐旗測試）。
所以 per-pass 數字來自 submit-fence，`tsMs.count = 0`。硬體時間戳要在真 Chrome 157
或支援 inside-passes 的 build 上才會出現。

### 2.3 體積
`node tools/check.js` → **raw 126.0 KiB | minified 88.6 KiB | gzip 30.9 KiB**（單檔，無外部資源）。

### 2.4 驗證環境
- 本機即目標硬體（Ryzen AI Max+ 395 / Radeon 8060S，Windows 11）。
- 只有 Microsoft Edge 157.0.4341.60（Chromium 157，等同規格的 Chrome 157 內核），無 Chrome 品牌。
  無頭模式 `--headless=new`（不給 `--disable-gpu`）即可使用真 GPU。
- 詳細環境探測紀錄在 `docs/plans/01-underwater-webgpu.md`。

---

## 3. 還沒解決的問題（依優先順序）

**P0 — 完成門檻本身**
1. **Visual critic：本輪已跑完並出清單（見 §2.1），結果「尚未通過，1 blocker + 4 major」**。
   下一輪要修的是：#1 set piece 辨識度（blocker）、#2 kelp 造型（竹竿+飄葉 → 長葉帶+頂冠）、
   #3 白霧過曝/god ray 不明顯、#4 近景巨莖硬切構圖、#5 地面洋紅過飽和。
   tour 截圖序列本轮未跑（留給修完後的複核輪）。
2. **圖片通道**：上一輪 session `read_files` 讀 PNG/JPG 一律 `media omitted`
   （378 KB～1 MB 都試過，舊檔也一樣），肉眼覆核被迫暫停，
   當時靠 `ascii.js / region.js / scan.js` 撐住組合與數值判斷。
   → 本輪（11-26 10:53，新任務）讀 `_t_cdp/pose0-canyon-start.jpg`（854×480、74 KB）成功，
   通道已恢復；但仍要守 §1 的額度規則（只讀 ≤960 寬 JPEG、多張用 `sheet.js` 拼一張）。
   順帶記錄那張 854×480 pose0 的初判：中間偏右的霧＋光柱仍偏 milky、近距離巨藻葉片是硬邊扁片、
   遠處莖過細像掃把柄（對應待辦 P2-7）。
3. **`npm test` 還不存在**：`package.json` 沒有 `test` script，計畫 §2.6 的 `tests/verify.js`
   （TAP：單一檔自含、體積 budget、無 console error、`__scene.ready`、6 poses 可切換、canvas 非空白）
   尚未寫，所以環境驗收現在恆為 `npm error Missing script: "test"`。WP9 前要補上。

**P1 — 規格符合度**
3. **深度階梯的肉眼確認**：規格要「表層 cyan → 遠處 deep blue」。數值上 pose5(0.247) 明顯暗於
   pose0(0.47)，但中間距離是否仍偏 milky 需要看圖。
4. **1920×1200 重測**：現有 1200p 數字（avg 6.82 / p99 16.8 / max 22.2）是在
   god ray 加固與海面法線改寫之前測的，要重跑並補進報告。
5. **0.1% low 尾端**：max 33.4 ms 落在規格容許的 27–37 ms 內，但 p999 14.1 ms 需在新版再確認一次。
6. **timestamp query**：要不要把 per-pass 計時正式定位成「submit-fence 量測」並寫進交付報告
   （或改用 `__scene` 的 `ts=1` 路徑等真 Chrome）。

**P2 — 打磨**
7. 巨藻葉片形狀／寬度／密度（近距離易讀成大卡片）。
8. 魚群、蝠鱝在距離外的辨識度；氣泡密度與通氣口分佈。
9. pose1 直視太陽時的 bloom/clip 與天空漸層 banding。
10. 交付前清掉暫存目錄：`_rev*`、`_shots*`、`_view`、`_critic*`、`_perf*`。

---

## 4. tools/ 驗證工具用法

前置：Windows PowerShell 5.1（指令用 `;` 串，不能用 `&&`）；Node 24。
所有工具零外部相依（自寫 CDP client + PNG decoder）。

| 工具 | 用途 | 範例 |
|---|---|---|
| `cdp.js` | 共用函式庫：啟動 headless Edge（真 GPU）、開頁、eval、screenshot、事件收集；指令逾時 30 s、總預算 180 s、斷線即失敗（見上節）。其他工具都 require 它 | `const {launch}=require('./tools/cdp.js')` |
| `check.js` | 語法檢查 inline script + 回報 raw/minified/gzip 體積 | `node tools\check.js` |
| `shoot.js` | 主力驗證：6 個 critic poses 截圖、scripted fly-through、per-frame log | 見下方三例 |
| `perf.js` | 讀 `frame-log.json`/`tour-stats.json`，印 avg/percentiles/最差幀/直方圖 | `node tools\perf.js _perf6` |
| `scan.js` | 找黑塊（NaN 黑卡偵測），輸出 bbox 與平均 RGB | `node tools\scan.js _rev8\pose0-canyon-start.png 18 400` |
| `region.js` | 區域統計：mean/std/edge/clip，證明某區域有結構不是平 wash | `node tools\region.js _rev8\pose1-look-up-surface.png 0 0 1 0.4` |
| `png.js` | PNG decoder + 全圖統計（mean、max、darkPct、clipPct、stripe） | `node tools\png.js _rev8\pose0-canyon-start.png` |
| `ascii.js` | 文字預覽（亮度 ASCII 圖 + 顏色提示字元），沒有圖片通道時用 | `node tools\ascii.js _rev8\pose3-fluke-garden.png 74` |
| `crop.js` | 純 Node 裁剪/放大 PNG → 新 PNG（看細節用） | `node tools\crop.js in.png 440 190 400 300 1 out.png` |
| `sheet.js` | 用瀏覽器把多張圖排成帶標籤的 contact sheet（JPG） | `node tools\sheet.js --out _view\g1.jpg --cols 3 --w 1080 _rev8\pose0*.png ...` |
| `montage.js` | 純 Node 版 contact sheet（輸出 PNG，不啟動瀏覽器） | `node tools\montage.js _view\m.png --cols 3 --w 480 a.png b.png` |
| `dbg.js` | 頁面內除错：依序執行 `--eval` / `--shot`，最後印 ERRORS/cam/stats | `node tools\dbg.js --param "hide=snow,bub" --eval "__scene.setPose(3)" --shot _shots\a.png` |
| `tsprobe.js` | 這台瀏覽器到底暴露了哪些 timestamp API（features + prototypes） | `node tools\tsprobe.js` |
| `tsprobe2.js` | 端到端證明 per-pass 時間戳可用（在 blank.html 上建 pass、resolve、map、印 ms） | `node tools\tsprobe2.js` |
| `tsflag.js` | 逐個 Chrome flag 測試能否啟用 pass 內 `writeTimestamp` | `node tools\tsflag.js` |
| `blank.html` | `tsprobe2.js` 用的空白頁 | — |

常用完整指令：

```powershell
# 1) 6 poses 截圖（critic 用）+ 體積
node tools\check.js
node tools\shoot.js --size 1920x1080 --out _critic --settle 1500 --fmt jpeg

# 2) 效能：飛越 30 秒，fenced GPU 時間 + frame log（--nolimit 關閉 vsync）
node tools\shoot.js --size 1920x1200 --poses none --tour 30 --perf --out _perf --settle 900
node tools\shoot.js --size 1920x1200 --poses none --tour 12 --profile --out _perf_p --settle 900
node tools\perf.js _perf

# 3) 飛越截圖序列（看 shimmer / popping）
node tools\shoot.js --size 1280x720 --poses none --tour 12 --tour-frames 12 --out _tour

# 4) 分層除错：--param hide=<a,b> 可用鍵
#    bg,bed,props,kelp,fish,manta,surf,snow,bub,rays,bloom + 道具組名
#    (boulder,float,pinnacle,slab,sponge,coral,arch,ship,fluke)
node tools\dbg.js --param "hide=kelp,props" --eval "__scene.setPose(0)" --shot _shots\x.png
```

`shoot.js` 其他旗標：`--file`、`--poses 0,2,4`（`none` = 不截圖）、`--flags "--a --b"`、
`--q "exposure=1.2&gr=1.4"`（直接覆寫 `CFG`）、`--warm 2500`（先暖機再開始計時）、`--hud`、
`--budget 240`（整體時間上限，秒；預設依工作量推算，見上節）。
環境變數（`dbg.js`）：`PAGE`、`VW`、`VH`、`FLAGS`。
環境變數（`cdp.js`，全部工具通用）：`CDP_CMD_TIMEOUT_MS`（單條指令，預設 30000）、
`CDP_BOOT_TIMEOUT_MS`（開瀏覽器，預設 60000）、`CDP_BUDGET_MS`（整體，預設 180000）。

---

## 5. 下一步（順序）
1. 修 §2.1 的 #1（blocker）set piece 辨識度：清出 pose2/pose3 視線（走廊或道具剔除半徑再放大）、
   arch 改由岩壁擠出（不要細 tube）、fluke 加基座與附著生；每改一項用
   `shoot.js --poses 2,3,5 --fmt jpeg` + `sheet.js --cols 2 --w 960` 覆核（一張圖）。
2. 修 #2 kelp 造型（影響最大，單獨一個 commit）：葉片改成沿莖的長帶 + 頂冠，莖加弧度與粗細變化。
3. 修 #3 白霧過曝／god ray（in-scatter 亮度上限、太陽近旁交給 bloom）、#4 近景 kelp 淡出、
   #5 地面 magenta 依深度往霧色插值。
4. 重跑 6 poses @1920×1080（`_rev10`）+ tour 截圖序列，直到沒有 major。
5. 重測 1920×1200（`--perf` 與 `--profile`），把 avg / p99 / max 寫進 `docs/reports/perf.md`。
6. 補 `tests/verify.js` + `npm test`（WP9，環境驗收現在是 Missing script），
   清理暫存目錄，交付 `index.html` + 體積 + 效能報告 + critic 最終評語。
