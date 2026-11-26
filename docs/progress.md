# Kelp Cathedral — 進度紀錄

> 更新時間：2026-11-26（第 5 輪：`_rev10` 殘留的 3 個 minor 全收、`npm test`（WP9）上線、1920×1200 效能重測完成）。
> 單一交付檔 `index.html`（WebGPU、全程序化、無引擎）。
> 圖片通道已恢復（可讀 ≤960 寬 JPEG），本輪的視覺判斷是肉眼 + 數值工具並行。

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
- **巢狀三元運算子會让整个 shader 解析失敗**（本機 Edge 157：`:315:42 error: invalid character found`，
  直指出 `?` 那字元）。症狀是整組道具消失 + `Invalid ShaderModule`，不是畫面跑色。
  shader 內要條件赋值就用 `var` + `if`（或 `select()`），並在改完一定看 `shoot.js` 的 `errors`。
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
| 畫面中純黑塊（major→blocker） | mote 精靈的 NaN alpha 進 HDR buffer，經 bloom 擴散成黑卡；另 VS 四角公式 `*4` 應為 `*2` | VS 加 `!(d >= 1.2)` 剔除；FS 加 `!(s>=0)\|\|!(s<4e4)` discard | `tools/scan.js` pose0/pose3 @1280×720 → 0 blobs（此前 1–3 個 48×48～60×52） |
| pose5 整張平坦藍（blocker） | `finalizePoses()` 執行時 `SET.arches` 還是空的 → yaw/pitch = NaN | 新增 `layoutArches()`，順序改為 layoutArches → finalizePoses → buildCamPath | pose5 恢復內容（mean 0.339，edge 0.049） |
| 相機埋進岩石 / 布景看不到 | 大道具隨機落在視點上 | 新增相機走廊 `CAMPTS`（6 poses ±9 m 擺頭 + 120 個 tour 取樣），大道具落在管內就剔除；arch 改為對準視點（standoff 44）；tour 相機鉗在 bed+12 | 各 pose 不再出現整屏單色 |
| 布景方向錯誤（船殼側邊、鯨尾成細片） | `rot3` 旋轉順序為 Y→X→Z，yaw 先做 | 改為 roll→pitch→yaw（yaw 最後）；船殼 yaw 0.95 + 10° 傾側；鯨尾 rx90 站起再 ry90 轉向走廊 | 第 3 輪 `_view/f1.jpg` 已肉眼覆核通過 |
| 「魚群」在畫面裡看不見（第 4 輪） | `fishVS` 的軌道半徑 `13 + 30·fract(sc·0.618)` m → 一群魚其實是直徑 26–86 m 的空心殼，群心對準鏡頭時成員反而散到鏡頭前後 | `i1.w` 由擺尾相位改為軌道半徑縮放（擺尾相位改用 `fract(sc·7.13)` hash），錨定 pose 的群用 0.16–0.30，`ext/wide` 也同步縮小 | `_view/g4.jpg` pose0/2/4 都看得到銀色魚群；`dbg.js` 投影確認群心在框內 |
| kelp 加氣囊時網格錯位風險 | `sweep()` 每頂點寫 6 floats，但 kelp pipeline 是 `arrayStride: 32`（pos+normal+uv 共 8 floats） | 氣囊改用 kelp 自己的 `push()`（8 floats）建八面體並手寫索引 | `errors: []`、`_t_minor/k0.png` 葉柄基部可見小球 |
| `crop.js` 裁出的 tile 在瀏覽器裡全黑（第 5 輪） | 非整數 scale（470×1.25 = 587.5）時 IHDR 寬度被 `writeUInt32BE` 截斷成 587，而行距仍是 587.5×3 → 解碼錯位 | 輸出尺寸改 `Math.round(...)` 並設下限 1 | 同一裁切 `png.js mean` 0.3648（黑幀是 0）、contact sheet 由 3.8 KB 變成 55 KB |
| `tests/verify.js` 第一版 7 項紅 | 我把 `cam.y` 拿去比 `POSES[i].z`；另外開頁後 1 s 內 rAF 還在編 pipeline，幀數幾乎不推進 | 索引改成 `cam.xz` 對 `POSES[i].xz`；量幀前先 `sleep(1200)` 讓迴圈穩定 | 17/17 passed、`npm.cmd test` exit 0 |
| 圖層 A/B 誤判成「完全沒畫」（第 8 輪） | PowerShell 單引號不脫字：`--eval '__scene.hide(\"bub\")'` 把 `\"` 原樣傳給 node，eval 其實拋錯，hide 從未生效 → 對照兩張幀逐像素全等 | 圖層 A/B 一律用 **URL 參數**（`shoot.js --param "time=12&hide=bub"`，兩次 run）；`dbg.js --eval` 要帶字串就用雙引號外殼 | 同一幀改用 URL 參數後：氣泡 1787 px／maxAbs 198（原本是 0）；`hide=kelp` 對照 66.18% 畫素差異 |
| `diff.js` 被 HUD 干擾 | HUD 的 FPS 數字每張圖都變，差分 bbox 一律被拉到左上角 15,12–183,25，把場景裡的真實貢獻淹掉 | 新增 `--mask=x,y,w,h`（跳過該矩形）與 `changed2`（>2 LSB 的畫素數）；同時修掉 `MASK` 為 null 時反向跳過全部像素的判斷式 | 遮罩後氣泡貢獻可由 0.14–0.32 % 逐格讀出；`mask:null` 時 `meanAbs` 不再變 NaN |

---

## 2. 驗證結果

### 2.1 Visual critic（只准看 render，不準看 code）

> 交付用的最終評語（六輪摘要、缺陷→修法→驗證、判定與保留的取捨）在 `docs/reports/critic.md`。
狀態：**0 blocker、0 major，`_rev10` 清單上的 minor 也已全數收完**（第 5 輪 a/b/c，見下方第 5 輪表）。
第 3 輪修完 `_rev9` 的 1 blocker + 4 major；第 4 輪修完 `_rev10` 的 2 個 major（pose4 洗白、iridescent 葉過飽和）
與 4 個 minor（莖無節／肋骨看不見／貼鏡葉片／生命體不可見）；第 5 輪收掉剩下的 3 個 minor
（葉片質感、tour 貼葉面、船殼木板紋理）。每項都是「改一項 → 截圖或數值覆核 → commit」。
判讀限制：總覽圖每格只有 480×270，細節一律用 `crop.js` 裁 ≤480 寬小圖再看。

#### `_rev9` 缺陷清單與本輪修法（留檔）
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

本輪對應修法（一項一 commit）：

| # | 做了什麼 | 驗證 |
|---|---|---|
| 1 | `POSES` 的 `lookDx/lookDz` 把船殼 45→33 m、鯨尾 36→27 m；`placeFlora` 新增 `onStage()`：每個视点 10 m 空地 + 视点→道具的視線廊道（9 m 漸開放 5 m）內不長巨藻；船殼 scale 1.45→1.72、木料 albedo 提亮約 1.6×；fluke 加雕刻弦紋 + 方形基座並抬高到 `bed+11`；arch 管徑 0.15→0.27、rz 0.46→0.58、跨徑 13–23→17–28 | `_view/f1.jpg`、`_fix5/pose5`：船身+桅杆、立石+基座、岩塊拱都可辨識 |
| 2 | kelp 莖半徑 0.075→0.15（基部 ≈0.5 m）；葉帶加長加寬（len 1.25–1.80 ×crown、wid 基值 0.17→0.26）、ROWS 5→6、節點分佈 0.48–1.00、頂端 perNode 最多 4、juvenile 0.17→0.24 | `_view/f2.jpg`：pose4 出現羽狀冠層；1080p 6 s tour fenced avg 7.22 ms / gpuMs 6.23 |
| 3 | `waterInscat` 前向瓣改 0.24·sd⁴ + 0.52·sd³⁴、環境項 0.55→0.46、太陽項 0.070→0.062；`raysFS` beam 阈值收窄、sky halo 0.30→0.22 而太陽盤 2.2→2.7；bloom 阈值 1.35→1.55、強度 0.55→0.64 | `_view/f3.jpg`：pose0/1 有藍階與明確太陽盤，不再整片洗白 |
| 4 | kelpFS 貼鏡溶解視窗 0.45–3.2 m → 1.2–6.5 m（保留 15% 本體色） | `_view/f4.jpg`：pose1 中央巨莖化為霧 |
| 5 | ground cover 改樺色 + 依深度最多 50% 往水色插值、覆蓋 0.82→0.70、bounce 下修；道具 `cov` 與岩壁反弹同步降飽和 | `_view/f5.jpg`：地面變柔和藍紫，與水色同調 |

#### `_rev10` 複核結果（依嚴重度）
| # | 等級 | 缺陷 | 出現在 | 建議方向 |
|---|---|---|---|---|
| 1 | **major** | `kelp-corridor`（pose4）幾乎全圖洗白：逆陽 + 光柱鋪滿，遠景沒有可辨識形體 → 六格中唯一「沒有主體」的一张 | 4 | pose4 偏轉看向岩壁/道具，或逆陽時降 `shaft` 並保留遠景輪廓 |
| 2 | **major** | 洋紅只是「搬家」：地面好了，但 iridescent 巨藻葉（pose0 右半、pose2 右側）是畫面中最飽和的色塊，仍與冷調分裂 | 0、2 | kelp 的 `irid` 色降飽和，並與 bed 一樣依深度往霧色插值 |
| 3 | minor | 莖仍是等徑純色圓柱：無節、無氣囊（pneumatocyst）、無粗細變化，遠看仍偏竹竿 | 全部 | 莖直徑沿高度抖動 + 葉柄基部小球；莖加低頻色變異 |
| 4 | minor | 船殼肋骨/木板在 30 m 外看不見，只剩輪廓 | 2 | 肋骨加大，或 pose2 standoff 再近一些 |
| 5 | minor | pose0 左上/右上仍有貼鏡葉片成大片色塊（已軟化但搶眼） | 0 | 视点空地 10 m 再外推，或貼鏡葉再降飽和 |
| 6 | minor | 生命體仍不易看見（只有零星小點） | 0、2、5 | 魚群/氣泡移進 pose 視野 |

本輪（第 4 輪）對應修法（一項一 commit）：

| # | 等級 | 做了什麼 | 驗證 |
|---|---|---|---|
| 1 | major | god ray 拆出 shaft-only 增益：新增 `CFG.godrayShaft`（URL `gs`，走 `params4.y`）只縮光柱、不動太陽盤 halo，逆陽視角不再把遠景沖平 | 診斷 `gr=0` 時 pose4 mean 0.626 → 0.252（證實洗白來自 `raysFS` 積分）；定稿 `gs=0.62` → pose4 mean 0.548 / edge 0.0251→0.0315、clip 0%；`_view/g1.jpg`、`g4.jpg`：光柱仍在但出現中距岩塊與林相深度 |
| 2 | major | `kelpFS` iridescent 變體色 `(0.245,0.055,0.230)/(0.480,0.150,0.320)` → `(0.150,0.090,0.150)/(0.300,0.200,0.275)`，並 `irid *= 1 - 0.60·sstep(20,62,dist)`（遠處回到普通綠） | `_diag/chroma.js` pose0 chromaMean 0.1971 → 0.1912（本輪結束 0.1863）；`_view/g2.jpg`：洋紅葉轉柔和淡紫，不再是畫面最搶眼物體 |
| 3 | minor | 莖加節理：直徑沿高度叠兩個諧波（`1 + 0.13·sin(21v) + 0.07·sin(7.3v+1.1)`、SR 8→10）；每片葉柄基部加一顆 pneumatocyst（八面體、6 頂點 8 三角形；kelp 是 8-float stride，不能用只寫 6 floats 的 `sweep()`） | `_t_minor/k0.png`、`_view/g4.jpg`：莖出現環狀節、葉柄基部有小球；1080p 8 s tour gpuMs avg 7.29 / p99 11.8（+39% kelp 頂點仍合於預算） |
| 4 | minor | 船殼肋骨半徑 0.24 → 0.34（實例 scale 1.72 → 實際肋徑約 0.58 m） | `_t_f2/kh2.png`：33 m 處可見到肋骨起伏 |
| 5 | minor | 視點空地 10 m → 6 m（`onStage`）——10 m 把整片冠層清掉反而變成空洞，6 m 只推掉貼鏡葉 | `_view/g4.jpg` pose0：四周仍有藻林包圍，中央不被葉片切死 |
| 6 | minor | 每個 pose 前 15–24 m 停一團魚（`placeLife` 用 pose 的 forward/right 定位）+ 魚體放大（0.34–1.07 → 0.45–1.35 m）+ **修正「魚群」其實是直徑 26–86 m 的軌道殼**：`i1.w` 從擺尾相位改成軌道半徑縮放（相位改由 `fract(sc*7.13)` 產生），錨定群用 0.16–0.30 | `dbg.js` 投影證明群心在框內（pose0 458,317／pose2 368,650／pose4 716,380）；`_t_f2/kh2.png`、`_view/g4.jpg` 三格都看得到銀色魚群 |

停止條件（無 major 以上、minor 收斂）：**已達成**（剩船殼肋骨的近距離辨識度一項 minor，屬可交付範圍）。
`tools/scan.js` @1280×720：pose0 / pose3 / pose4 = 0 blobs（黑塊未復發）。
`shoot.js` 所有 run 的 `errors: []`（改 shader 後一定看這個欄位——見 §1 的 WGSL 教訓）。

#### 第 4 輪追加：`_rev11` + tour 覆核浮出的兩項（已修，`_rev12` 覆核）

`_rev11`（6 poses @1920×1080 + `--tour 12 --tour-frames 12`）是我第一次看 tour 畫面，浮出兩項：

| 缺陷 | 根因 | 處置 | 驗證 |
|---|---|---|---|
| pose5 `deep-arch` 的拱門又被巨藻切掉，只剩左側一塊岩石 | `placeFlora` 的視線廊道用 `SET[p.look]` 取目標，但拱門是 `SET.arches` **陣列**、沒有 `SET.arch` → pose5 從來沒有廊道（第 3 輪以為有） | 解析 `p.look === 'arch'` 時改取 `SET.arches.find(a => a.isPose)`（與 `finalizePoses` 同一個目標）；另把視點空地改成 `p.look ? 9 : 6` m（看道具的 pose 要寬、純風景的 pose 只要推掉貼鏡葉） | `_view/c12.jpg` pose5：石拱與拱下開口清楚可見、魚群從拱下穿過 |
| tour 畫面被大片葉面糊住（`_view/t11.jpg` 六格中四格是抽象綠面） | 巨藻只按「峽谷中軸距離」稀疏化，但 tour 路徑在峽谷裡左右 wander → 相機直接穿進藻林 | `placeFlora` 加 `if (!camClear(xx, zz, 3.2)) p *= 0.42;`（`CAMPTS` 已含 120 個 tour 取樣點，保留少量前景做視差） | `_view/t12.jpg`：f000 看到石雕與林相深度、f009 魚群 + 巨藻 + 岩塊；僅 f003 仍是貼著葉面飛；pose0 chromaMean 0.1863 → 0.1332、scan 6 poses 全 0 blobs |

量測注意：`--tour --tour-frames` 的 run 裡 `tourStats` 會出現 p999 ≈ 217 ms / max 222 ms 的離群幀，
而 p50 5.6 / p90 5.6 / p99 5.7 ms——那是 CDP 截圖當下暫停迴圈造成的，不是場景變慢。
要看真實效能請用 `--perf`（不截圖）或 `--nolimit`。


#### 數值輔助判讀（`_rev9` 期間的量測，留檔）

`tools/region.js`（edge = 邊緣能量、std = 對比）：

| pose | 上方 40% mean / std / edge | 下方 35% mean / std / edge | 判讀 |
|---|---|---|---|
| 0 canyon-start | 0.712 / 0.157 / 0.023 | ~0.36 / 0.107 / 0.042 | 天花板有結構但偏亮，仍需確認不致「milky」 |
| 1 look-up-surface | 0.556 / 0.234 / 0.024 | 0.656 / 0.258 / 0.023 | clip 0%（此前 7.5%），天空已退回 tonemap 肩部以下 |
| 4 kelp-corridor | 0.690 / 0.169 / 0.027 | 0.409 / 0.111 / 0.043 | 同上 |
| 5 deep-arch | 0.446 / 0.148 / 0.049 | 0.231 / 0.125 / 0.057 | 深區確實較暗（深度階梯正確） |

黑塊檢查（`tools/scan.js`）：pose0/pose3 = 0 blobs；pose5 殘留 2 個小塊（18×31、13×25，
RGB≈1/7/2）→ 偏暗的綠葉剪影，非 NaN 黑卡。

critic 清單的累計處理進度：
- 已修：黑塊、pose5 空白、相機埋岩、布景轉向、Snell 硬邊、遠處 hash 馬賽克（crackle 隨距離淡出）、
  grain 距離切換產生移動環（改 cross-fade），以及本輪的 set piece 辨識度 / kelp 造型 /
  白霧過曝 / 近景硬切 / 地面洋紅。
- 已肉眼覆核並通過：道具可辨識度（`_view/f1.jpg`、`f5.jpg`）、god ray 不再 milky（`f3.jpg`）、
  近景巨莖淡出（`f4.jpg`）、地面色彩（`f5.jpg`）。
- 第 5 輪已定案：葉緣鋸齒／中肋（`_view/g5.jpg`）、船殼木板紋（`_view/g7.jpg`）、
  pose1 白色漸層 banding（第 6 輪用 `tools/band.js` 逐像素定案為 JPEG 假影，見下）。

#### 第 5 輪：`_rev10` 殘留的 3 個 minor（已全部收掉）

| # | 缺陷 | 做了什麼 | 驗證 |
|---|---|---|---|
| c | 葉片仍像平滑卡片（無葉緣鋸齒、無中肋、無沿葉色相變化） | 葉緣用兩個不同頻率的鋸齒（`frillA` 13–17、`frillB` 20–26，兩側相位不同），`ROWS` 6→8（低於 8 列時鋸齒會 alias 成一個隨機凸起）；`kelpFS` 加中肋（`1-\|2u-1\|` → albedo ×0.84–1.08）與 canopy 金綠漸層（依 `wp.y` 靠水面偏金 `1.14/1.02/0.62`）；近距 grain 由 `fbm3(0.9,0.32,0.9)×2` 改 `(1.35,0.48,1.35)×3` | pose4 中部 region **std 0.0743 → 0.1107**（+49% 細節）；`_view/g5.jpg`（`crop.js` 1.4×）可見到波浪葉緣、中肋與氣囊串；1200p 20 s tour gpuMs avg 7.41 / p99 12.3 |
| b | tour 有幾格被大片葉面糊住（`_view/t12.jpg` 的 f003） | `placeFlora` 在硬排除圈（3.2 m ×0.42）外再加軟性稀釋環（**7.0 m ×0.68**，因為葉片可從莖外伸 4–6 m） | tour 12 格 **edge 均值 0.0388 → 0.0437、最差格 0.0172 → 0.0249（+45%）、最低 std 0.0845 → 0.1013**；`_view/g6.jpg`：原本以為變差的 f001/f009 其實是好格（石拱、石雕＋魚群入鏡），仍留下的 f004 是「貼著葉面飛」這種合法但平淡的鏡頭 |
| a | 船殼肋骨／木板在 33 m 外只剩平滑灰牆 | `buildShip` 加 4 條縱向舷帶（`jS = 2/4/6/8`、r = 0.13 的純幾何，會自己產生陰影；world-space 花紋在偏轉＋傾側的船殼上會滑過表面而不是貼在木板上，所以不用 shader 花紋）；木料 kind 的 crackle 距離窗 40 → 72 m | pose2 全圖 **edge 0.0413 → 0.0459、std 0.1533 → 0.1624**；`_view/g7.jpg`（上＝修前、下＝修後）可清楚看到木板線 |

嘗試過但**回退**的調整：把 kelp 貼鏡溶解視窗由 1.2–6.5 m 再放寬到 1.2–7.8 m、floor 0.15→0.10。
理由是 tour 12 格 edge 均值從 0.0420 掉到 0.0364（前景化開之後結構更少），屬「把貼葉面換成霧」而非改善。

#### 第 5 輪最終覆核：`_rev13`（6 poses @1920×1080 + tour 12 s／12 格）＋ `_rev13p`（同場景 @1280×720 PNG，供數值工具）

- 肉眼（`_view/c13.jpg`）：六格都有可辨識主體——pose0 魚群＋林相深度、pose1 太陽盤＋Snell window、
  pose2 船殼（舷帶與桅杆可辨）、pose3 鯨尾石雕＋基座、pose4 逆陽但中距有石拱、pose5 魚群從石拱下穿過。
  色調統一在冷青＋橄欖，最高飽和的物體不再是洋紅（`chromaMean` pose0 0.1452、pose2 0.1119）。
- 數值：`scan.js` 六格 **0 blobs**；所有 run `errors: []`；`npm.cmd test` **17/17**。
- 判定：**停止條件成立**（0 blocker / 0 major / critic 清單上的 minor 全收）。

#### 第 6 輪：結清三個「未定案／可選」項（`9f5d89c`、`724bdc6`）

| # | 項目 | 做了什麼 | 驗證 |
|---|---|---|---|
| P2 #9 | pose1 天空漸層 banding（之前只在 JPEG contact sheet 上看到，無法定案） | 新增 `tools/band.js`：不用瀏覽器，PNG 逐像素找「台階」——兩側各 3 行同值且左右 9 px 同值、落差 ≥ 2 LSB 才算 contour（1 LSB 不可見），另算平坦塊的 `levels/(range+1)` 使用率；`--selftest` 用三條合成垂直梯度證明判別力 | 合成樣本：平滑無 dither clean、8 級 posterised **BANDING**（901.6 contours/10k、maxStep 8）、加 dither clean。場景：pose1 上方 40% **contours = 0**、67 個平坦塊 ratioAvg 1.000；pose0 contours = 0 → 定案為 **contact sheet 的 JPEG 假影**，場景本身沒有 banding |
| P2 #8 | 蝠鱝在 6 格 critic pose 裡幾乎看不見（原本只在中距巡航，34–74 m 的繞圈永远不進框） | `placeLife` 讓前 6 隻（每格 pose 一隻）**停在視軸上**：沿 `p.yaw/pitch` 前瞻 24–34 m、依 `eye = max(p.y, bed+14)` 重算高度、地形不夠深就重試 8 次、繞圈半徑改 4–9 m、相位對準鏡頭、span 6.8–10 m；`WGSL_LIFE` 的 climb 幅度改成每實例（`i2.w`）→ 停泊的_hover_ 2.5–4 m 不會滾出畫面，巡航的仍 9 m；新增 `?time=<sec>` 鎖住時鐘讓截圖可重現（`dt = 0`） | `_diag/mproj.js`（投影＋深度測試）：t = 8 與 t = 25 每格 pose 的蝠鱝都在框內且可見；`tools/diff.js` 對照同幀開／關 `hide=manta`：每格 **0.14–0.99% 畫素、maxAbs 129–156**；裁切圖 `_view/m1.jpg` 可辨識寬三角翼、細長尾、深色背＋白腹緣；`errors: []` |
| §5 可選項 | tour 有「貼著葉面飛」的平淡格 | 已在第 5 輪以 `placeFlora` 軟性稀釋環（7.0 m × 0.68）處理，本輪用 `tools/edges.js` 重測確認沒有退步 | tour 12 格 edge 均值 0.0420、最差格 0.0200、最低 std 0.1141（改前 0.0388 / 0.0172 / 0.0845） |

本輪另外新增兩個通用工具：`tools/edges.js`（多張圖的 edge/std/mean 一次印，比較用）、
`tools/diff.js`（兩張 PNG 逐像素差異：changed pct、maxAbs、bbox）；`npm.cmd test` 全綠 **17/17**。

#### 第 6 輪最終覆核：`_rev14`（6 poses @1920×1080）＋ `_rev14t`（tour 20 s／12 格）

加停泊蝠鱝前擔心它會擋掉 set piece（pose2/3/5 是沿視軸 24–34 m 放置，道具在 27–44 m），
所以重跑一輪。覆核圖 `_view/c14.jpg`：

- 六格主體仍在——pose2 船殼（左下暗色船身＋舷線）、pose3 鯨尾石雕＋方形基座、
  pose4 遠處石拱、pose5 石拱與穿過拱下的魚群；pose1 太陽盤與 Snell window 邊界清楚。
- pose3／pose5 的蝠鱝壓到道具下緣一部分，但讀成「劃過畫面的生物」，反而補了比例參照；
  pose4 中距那隻是最有效的一格（逆陽剪影＋尺度）。
- 結構量不退步：tour 12 格 **edgeAvg 5.2837 → 5.5754、最差格 2.1551 → 3.0802、最低 std 17.12 → 24.67**
  （`tools/edges.js _rev14t\tour` 對照 `_b0\tour`）。
- 兩個 run 都 `errors: []`；`npm.cmd test` 17/17。判定：**停止條件維持成立**，可進入交付。

#### 第 7 輪（低 CP 項）：讓 tour 路徑繞開藻冠（`_tv1`）

`_rev14t` 最差的一格是 f006（edge 3.0802）。新增 `tools/tourprobe.js` 沿 `shoot.js` 的取樣時間還原相機位置再數巨藻：
f006 停在**水面下 36 m、pitch +0.36 仰視**，前向錐內只有 5 株且最近 10.6 m → 畫格內容是「幾片散葉飄在亮水裡」，
不是貼鏡糊住（那是 f005，最近一株 0.7 m）。

| 變體 | 改了什麼 | edgeAvg | edgeMin | stdMin | 判定 |
|---|---|---|---|---|---|
| baseline `_rev14t` | — | 5.5754 | 3.0802 | 24.67 | — |
| **B（採用）** | `TOUR_WP` 第 7 點 y 24 → **10**：爬升延後，一次衝穿葉帶而不是停在帶中間 | **5.6673** | **3.7060**（+20%） | **28.76** | 對照圖 `_view/tour_f6.jpg`：舊格＝一張貼鏡葉＋大片藍水；新格＝分層冠層＋魚群與氣泡 |
| C（不採用） | 再把第 7/8 點 dx 24→16、12→8（往河道中心，那裏藻被 `smoothstep(11,48,dd)` 壓得更疏） | 5.0865 | 2.8052 | 25.10 | 變成開闊水面，最差格換到 f004/f005（2.81／2.85）——疏到沒有結構，故放棄 |

回歸檢查（`CAMPTS` 含 120 個 tour 取樣點，改路徑會連動 `placeFlora` 的稀釋環，所以 pose 也要複核）：
用 `git stash` 做前後 A/B（`_poseBase` vs `_poseB`，@1280×720），6 個 critic pose
**edgeAvg 5.4306 → 5.4443**、逐格 ±0.10、`scan.js` 六格 **0 blobs**、兩個 run `errors: []`。

#### 第 8 輪（低 CP 項，最後一項）：氣泡逐格辨識度（P2 #8）

量法：`?time=12` 鎖住時鐘，`shoot.js` 跑兩次（開氣泡／`hide=bub`）@1280×720，再 `diff.js --mask=0,0,300,52`
（遮掉 HUD 的 FPS 數字）。逐格「因氣泡而改變 >3 LSB 的畫素比例」：

| pose | 0 | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|---|
| 改前 changed % | 0.15 | 0.30 | 0.20 | 0.25 | 0.14 | 0.32 |
| **改後 changed %** | **0.51** | **1.02** | **0.63** | **0.80** | **0.46** | **1.02** |

根因是尺寸不是數量：精靈半徑 0.05–0.29 m 在 15–25 m 距離只有 2–4 px，3000 株氣泡全畫面只剩 1.3–2.9 k 畫素。
處置：`placeLife` 的 `a[o+4]` 由 `0.05 + 0.24·r²` 改成 `0.10 + 0.42·r²`（半徑 ×1.85 → 面積 ×3.4，實測 ×3.3），
`moteFS` 的環形銳度對氣泡由 7.5 軟化到 5.2（`mix(7.5, 5.2, kind)`，海雪維持細線）免得放大後斷成粒子點。

- 未洗成一片：`p99Abs ≤ 9`、maxAbs 131–234（未到 255，沒有爆白）；`scan.js` pose1/pose5 仍 **0 blobs**（無 NaN 黑卡）。
- 裁切目視 `_view/bub1.jpg`（pose5  brightest 點 ±160 px、2×）：開氣泡那格可辨識環狀氣泡附在巨藻莖旁，關掉那格乾淨。
- 成本：`_perf1200d`（1200p／20 s tour／`--perf`）wall avg 9.14、gpuMs avg 7.77／p99 12.4 —— 與第 7 輪的 9.33／7.89／12.2
  同級（在噪音內），因為只多 0.5–1.0 % 畫素的相加混合。
- 過程中一度誤判「氣泡一個像素都沒畫」，其實是 PowerShell 引號讓 `--eval __scene.hide(...)` 靜默拋錯
  （見 §1 缺陷表最後兩列）。


### 2.2 效能（scripted fly-through，fenced = 每幀等 `onSubmittedWorkDone`）

> 交付用的整理版（含場景負載實例數、per-pass 解讀、量測陷阱與重現指令）在 `docs/reports/perf.md`。

| run | size | 條件 | frames | avg | p50 | p99 | p999 | max | 0.1% low (fps) |
|---|---|---|---|---|---|---|---|---|---|
| `_perf1200d` | 1920×1200 | `--perf`（vsync，20 s tour，**第 8 輪最終狀態**：氣泡精靈放大 1.85×） | 2190 | 9.14 | 5.6 | 22.2 | 22.3 | 27.6 | 36.2 |
| `_perf1200c` | 1920×1200 | `--perf`（vsync，20 s tour，**第 7 輪最終狀態**：延後爬升的 tour 路徑） | 2144 | 9.33 | 5.6 | 22.2 | 22.3 | 27.8 | 36.0 |
| `_perf1200b` | 1920×1200 | `--perf`（vsync，20 s tour，第 5 輪狀態：葉緣鋸齒＋中肋＋舷帶） | 2362 | 8.47 | 5.6 | 22.1 | 22.3 | 22.4 | 44.6 |
| `_perf1200` | 1920×1200 | `--perf`（vsync，30 s tour，minor (c) 之前） | 3744 | 8.01 | 5.6 | 22.1 | 22.3 | 27.7 | 36.1 |
| `_perf1200n` | 1920×1200 | `--perf --nolimit`（關 vsync，20 s tour） | 2559 | 7.82 | 7.5 | 12.6 | 14.2 | 17.0 | 58.8 |
| `_t_perf` | 1920×1080 | `--perf`（vsync，8 s tour，第 4 輪最終狀態） | 964 | 8.32 | 5.6 | 16.8 | 22.2 | 22.3 | 44.8 |
| `_rev10p` | 1920×1080 | `--perf`（vsync，8 s tour） | 954 | 8.40 | 5.6 | 22.3 | 22.4 | 22.4 | 44.6 |
| `_fix2p` | 1920×1080 | `--perf`（vsync，6 s tour） | 832 | 7.22 | 5.6 | 16.8 | 16.8 | 16.8 | 59.5 |
| `_perf6` | 1920×1080 | `--perf --nolimit` | 4096 | **5.81** | 5.6 | 9.2 | 14.1 | 33.4 | 29.9 |
| `_perf5` | 1920×1080 | `--perf`（vsync 180 Hz） | 3041 | 7.90 | 5.6 | 22.3 | 27.8 | 33.4 | 29.9 |
| `_perf4` | 1920×1200 | `--perf`（vsync） | 4096 | 6.82 | 5.6 | 16.8 | 16.9 | 22.2 | 45.0 |

GPU 端（`gpuMs`，同一 submit 的 fence 往返）：**`_perf1200d`（最終狀態）avg 7.77 / p50 7.4 / p99 12.4 / max 26.1**；
**`_perf1200c`（第 7 輪狀態）avg 7.89 / p50 7.7 / p99 12.2 / max 21.8**；
**`_perf1200b`（第 5 輪狀態）avg 7.41 / p50 6.8 / p99 12.3 / max 16.8**；
`_perf1200` avg 7.03 / p99 11.9 / max 18.3；`_perf1200n`（關 vsync）avg 7.65 / p99 12.2 / max 16.4；
`_t_perf` avg 7.29 / p99 11.8 / max 15.4；`_rev10p` avg 7.47 / p99 19.2 / max 24.7；
`_fix2p` avg 6.23 / p99 10.4 / max 12.3；舊版 1080p avg 5.7 / p99 8.9 / max 19.7。
注意：`_t_perf` / `_rev10p` / `_fix2p` / `_perf1200*` 都是 kelp 幾何加重（ROWS 5→6→8、頂端 perNode 最多 4、
juvenile 0.17→0.24，第 4 輪再加每株約 270 個氣囊頂點 ≈ +39% kelp 頂點，第 5 輪鋸齒再多 ~18% 葉面頂點）
之後的數字，且 tour 區間較短、取樣點不同，不能直接和 4096 幀的舊 run 比大小。
**1200p 已重測完成**（規格 WP7 的 target 是 avg 11–16 ms）：開 vsync 的 wall avg 8.0–8.5 ms、
關 vsync 7.8 ms 且 p99 12.6 / max 17.0，都有餘裕；尾端 p999 22 ms 是 vsync 週期的跳格，不是場景变慢。

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
`node tools/check.js` → **raw 138.5 KiB | minified 94.1 KiB | gzip 33.3 KiB**（單檔，無外部資源，第 8 輪狀態）。
計畫的預算線是 minified < 200 KiB；`tests/verify.js` 那條斷言查的是檔案實際大小（raw ≤ 200 KiB），
目前 raw 138.5 KiB 已經比 minified 200 KiB 的線更嚴，兩個面向都過。

### 2.4 自動化測試（WP9，本輪新增）
`npm test`（PowerShell 5.1 若被執行原則擋掉，改用 `npm.cmd test`）→ `tests/verify.js`，TAP 13，**17 項斷言**：

| 組 | 斷言 |
|---|---|
| 靜態 | 單一檔案自含（沒有 `<script src>`／`<link>`／媒體元素／`fetch()`／`XMLHttpRequest`／ES module／CSS `url()`）；體積 ≤ 200 KiB |
| 啟動 | `__scene.ready` 且 canvas 真的拿到 `webgpu` context；渲染迴圈在 5 s 內推進 ≥ 12 幀（改用 `waitFor`：另一個 headless Edge 搶 GPU 時 rAF 會變慢，死閾值會假紅）；`performance` 的 resource entries = 0（運行期零外部請求） |
| 相機 | `__scene.poses` 有 6 個；逐個 `setPose(i)` 後 `cam.xz` 與 `POSES[i].xz` 的偏移 < 0.01 m、`cam.y` 為有限值 |
| 乾淨 | `console.error`／page exception = 0；`__scene.errors`（GPU）= 0 |
| 畫面 | pose 0 / 2 / 5 各截一張 PNG，`png.js` 解碼後 `sd > 0.05`、`max-min > 0.3`、`0.03 < mean < 0.97`（黑幀、白幀、平 wash 都會紅） |

反向驗證（證明斷言會紅，不是恒綠）：`node tests/verify.js _neg/blank.html`（把 `exposure` 改成 0 的副本）
→ 最後 3 項 `not ok`（mean 0.006 / sd 0.008 / range 0.00..0.02）、exit 1。
常用環境變數：`VERIFY_SIZE=1280x720`（預設 800×500）、`VERIFY_KEEP=1`（保留 `_test/` 的截圖）。

### 2.5 驗證環境
- 本機即目標硬體（Ryzen AI Max+ 395 / Radeon 8060S，Windows 11）。
- 只有 Microsoft Edge 157.0.4341.60（Chromium 157，等同規格的 Chrome 157 內核），無 Chrome 品牌。
  無頭模式 `--headless=new`（不給 `--disable-gpu`）即可使用真 GPU。
- 詳細環境探測紀錄在 `docs/plans/01-underwater-webgpu.md`。

---

## 3. 還沒解決的問題（依優先順序）

**P0 — 完成門檻本身**
1. **Visual critic：停止條件已達成**（0 blocker、0 major，critic 清單上的 minor 全數收完；見 §2.1 第 4、5 輪）。
   最終覆核：`_rev13`（6 poses @1920×1080 **＋** tour 12 s／12 格）與 `_rev13p`（同場景 PNG，供數值工具），
   覆核圖 `_view/c13.jpg`；`scan.js` 六格 0 blobs、`chromaMean` pose0 0.1452 / pose2 0.1119、所有 run `errors: []`。
   剩下的都不是缺陷而是取捨，若要再動只這一項有意義：tour 裡「貼著葉面飛」的平淡格（`_view/g6.jpg` 的 f004 型）——
   要嘛讓 tour 路徑繞開藻冠（改 `tourSample` 的 y／偏移），要嘛接受它為穿越林相的過場鏡頭。
2. **圖片通道**：已恢復（11-26 起可讀 ≤960 寬 JPEG）。整個任務讀了 14 張
   （`diag12`、`f1–f5`、`c10`、`g5`、`g6`、`g7` 兩次、`c13`、`m1`、`c14`），合計約 1.5 MB，
   沒有再出現 `media omitted`。
   額度規則見 §1：一個任務的圖片總量有上限，能用數值工具（`region.js`／`chroma.js`／`scan.js`）就不要看圖。
3. **`npm test` 已上線**（§2.4）：`tests/verify.js` 17 項斷言全綠、`exit 0`，
   且用 `exposure=0` 的副本做過反向驗證（3 項 `not ok`、`exit 1`）→ 不是恒綠的假測試。

**P1 — 規格符合度**
3. **深度階梯的肉眼確認：已完成**（第 5 輪 `_view/c13.jpg`）。近距有細節、中距保留青綠林相、
   遠處轉深藍；數值同向（pose0 mean 0.47 → pose5 0.231，`region.js` 逐區 edge 都有結構）。
4. **1920×1200 重測：已完成**（本輪，見 §2.2 的 `_perf1200` / `_perf1200n` / `_perf1200b` 三列）。
   新 kelp／舷帶之下 wall avg 8.0–8.5 ms（開 vsync）、關 vsync 7.82 ms 且 p99 12.6 / max 17.0，
   gpuMs avg 7.0–7.6 / p99 ≤ 12.3 → 規格 WP7 的 avg 11–16 ms 有充分餘裕。
5. **0.1% low 尾端：已確認**。關 vsync 的 20 s run 是 p999 14.2 ms / max 17.0 ms、0.1% low 58.8 fps；
   開 vsync 的 p999 22 ms 是 60→30 fps 的跳格（vsync 週期），不是場景突然變慢。
6. **timestamp query**：要不要把 per-pass 計時正式定位成「submit-fence 量測」並寫進交付報告
   （或改用 `__scene` 的 `ts=1` 路徑等真 Chrome）。

**P2 — 打磨**
7. 巨藻葉片形狀：**第 5 輪已做**（葉緣鋸齒 ×2 頻率、中肋、canopy 金綠漸層、節理與氣囊）。
   若還要更寫實，剩下的只有「葉面局部破洞／附著生」這類微細節，CP 值低。
8. 魚群已入鏡（pose0/2/4 皆可見）；**蝠鱝第 6 輪已處理**——每格 pose 各有一隻停在視軸上
   （0.14–0.99% 畫素、t=8/t=25 都在框內，見 §2.1 第 6 輪）。氣泡屬氛围層，未逐格辨識。
9. **pose1 已結清**：clip 0%（此前 7.5%），banding 用 `tools/band.js` 逐像素定案為 JPEG 假影，場景 contours = 0。
10. 交付前清掉暫存目錄：`_rev*`、`_shots*`、`_view`、`_critic*`、`_perf*`。

---

## 4. tools/ 驗證工具用法

前置：Windows PowerShell 5.1（指令用 `;` 串，不能用 `&&`）；Node 24。
所有工具零外部相依（自寫 CDP client + PNG decoder）。

| 工具 | 用途 | 範例 |
|---|---|---|
| `cdp.js` | 共用函式庫：啟動 headless Edge（真 GPU）、開頁、eval、screenshot、事件收集；指令逾時 30 s、總預算 180 s、斷線即失敗（見上節）。其他工具都 require 它 | `const {launch}=require('./tools/cdp.js')` |
| `check.js` | 語法檢查 inline script + 回報 raw/minified/gzip 體積 | `node tools\check.js` |
| `tests/verify.js`（`npm test`） | 交付驗收：TAP 13、17 項斷言（自含、體積、WebGPU device、幀推進、零外部請求、6 poses 切相機、errors 空、畫面非空白） | `npm.cmd test`；反向驗證 `node tests\verify.js _neg\blank.html`；`VERIFY_SIZE=1280x720`、`VERIFY_KEEP=1` |
| `shoot.js` | 主力驗證：6 個 critic poses 截圖、scripted fly-through、per-frame log | 見下方三例 |
| `perf.js` | 讀 `frame-log.json`/`tour-stats.json`，印 avg/percentiles/最差幀/直方圖 | `node tools\perf.js _perf6` |
| `scan.js` | 找黑塊（NaN 黑卡偵測），輸出 bbox 與平均 RGB | `node tools\scan.js _rev8\pose0-canyon-start.png 18 400` |
| `chroma.js` | 彩度統計（mean/p50/p95/max + 平均 RGB），證明某個顏色不再是畫面最搶眼的東西 | `node tools/chroma.js _rev12/pose0-canyon-start.png` |
| `region.js` | 區域統計：mean/std/edge/clip，證明某區域有結構不是平 wash | `node tools\region.js _rev8\pose1-look-up-surface.png 0 0 1 0.4` |
| `png.js` | PNG decoder + 全圖統計（mean、max、darkPct、clipPct、stripe） | `node tools\png.js _rev8\pose0-canyon-start.png` |
| `ascii.js` | 文字預覽（亮度 ASCII 圖 + 顏色提示字元），沒有圖片通道時用 | `node tools\ascii.js _rev8\pose3-fluke-garden.png 74` |
| `crop.js` | 純 Node 裁剪/放大 PNG → 新 PNG（看細節用）；**scale 建議整數**，第 5 輪已修掉非整數寬度導致瀏覽器解出黑 tile 的問題 | `node tools\crop.js in.png 440 190 400 300 1 out.png` |
| `band.js` | PNG 的 banding 檢查（不用瀏覽器）：每欄往下找 ≥2 LSB 的「台階」＋平坦塊色階使用率；`--selftest` 用合成梯度自證判別力 | `node tools\band.js _rev13p\pose1-look-up-surface.png` |
| `edges.js` | 一次印多張圖的 edge/std/mean（改前後比較結構量） | `node tools\edges.js _b0\tour baseline_20s_1280x720` |
| `tourprobe.js` | 不靠看圖找出 fly-through 哪一格為何沒結構：重現 `shoot.js` 的取樣時間，印每格相機位置與「前向錐內的巨藻數／最近距離／貼鏡莖」 | `node tools\tourprobe.js 20` |
| `mdcheck.js` | 文件表格欄數檢查（不用瀏覽器）：同一表格每列的欄數要與標題一致，儲存格內未跳脫的豎線是最常見殺手；有錯 exit 1 | `node tools\mdcheck.js`（預設查 progress + 兩份報告） |
| `diff.js` | 兩張 PNG 逐像素差異：changed pct、maxAbs、bbox、changed2（>2 LSB）；`--mask=x,y,w,h` 遮掉 HUD（它的 FPS 數字每張都變）；搭配 `?time=<sec>` 與 URL `hide=` 隔离圖層 | `node tools\diff.js _bb2_on\pose5-deep-arch.png _bb2_off\pose5-deep-arch.png 3 --mask=0,0,300,52` |
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
頁面 URL 參數（`--param`／`--q` 傳）：`hide=<層>`、`pose=`、`tour=`、`msaa=`、`scale=`、`perf=1`、
`profile=1`，以及第 6 輪加的 **`time=<sec>`**——鎖住時鐘（`dt = 0`），同一 setup 的兩張截圖逐像素相同，
`diff.js` 才能用來隔离單一圖層（搭配 `hide=`）。
環境變數（`cdp.js`，全部工具通用）：`CDP_CMD_TIMEOUT_MS`（單條指令，預設 30000）、
`CDP_BOOT_TIMEOUT_MS`（開瀏覽器，預設 60000）、`CDP_BUDGET_MS`（整體，預設 180000）。

---

## 5. 下一步（順序）

第 3–6 輪的 critic 清單、1200p 重測、`npm test`、banding 定案與生命體入鏡都已結清，
兩個低 CP 項（第 7、8 輪）與交付動作都已結清；留在這裡給之後接手的人：

1. **交付前清暫存目錄**：**已做（2026-11-26）**。保留 `_view`（歷輪覆核圖）與最新一輪的
   `_bb2_on`／`_bb2_off`（氣泡 A/B）／`_perf1200d`（1200p 效能）／`_tv1`（tour A/B），共 38.9 MB；
   其餘 87 個 `_` 目錄（423.9 MB）已刪。文件裡引用的舊 run 名稱（`_rev1`–`_rev14t`、`_perf*`、`_b0`、
   `_poseBase`／`_poseB`、`_fix*`、`_t_*`、`_diag`）是數字的出處，都能用 §4 的指令重跑，不必留檔。
   重跑整套覆核：`node tools\shoot.js --size 1920x1080 --out _rev15 --settle 1500`
   ＋ `node tools\shoot.js --size 1280x720 --poses none --tour 20 --tour-frames 12 --out _rev15t`。
2. **交付三件套**（計畫 WP9）：**已完成**——`index.html`（138.5 KiB raw / 94.1 KiB min / 33.3 KiB gzip，第 8 輪狀態）
   ＋ `docs/reports/perf.md`（環境、負載實例數、1200p/1080p 結果、per-pass、timestamp 限制、量測陷阱、重現指令）
   ＋ `docs/reports/critic.md`（方法、六輪摘要與缺陷→修法→驗證、最終判定、保留的取捨、判讀限制）。
   本檔 §2.1／§2.2 仍是原始留檔，報告是整理版；數字若要更新兩邊都要改。
   **2026-11-26 補上 `README.md`**（倉庫首頁用法文件：執行需求、操作鍵、URL 參數、`window.__scene` API、
   `npm.cmd` 指令、`tools/` 一覽、1200p 效能、文件索引、已知限制），頂部配圖 `docs/preview.jpg`
   （960×810、201 KB，由 `_readme/` 六格 1920×1080 JPEG 經 `tools/sheet.js --cols 2 --w 960` 產生，可重跑）；
   `tools/mdcheck.js` 的預設清單因此加入 `README.md`（現在預設查 4 份文件）。
3. **可選（低 CP）**：
   - ~~tour 仍有一格偏平淡（f006）~~ **第 7 輪已做**：`TOUR_WP` 第 7 點 y 24→10（延後爬升、快速穿過葉帶），
     tour 12 格 edgeMin 3.0802 → **3.7060**、edgeAvg 5.5754 → **5.6673**（見 §2.1 第 7 輪）。
     驗收指令：`node tools\shoot.js --size 1280x720 --poses none --tour 20 --tour-frames 12 --out _tour2`
     ＋ `node tools\edges.js _tour2\tour`；要查是哪一段的問題用 `node tools\tourprobe.js 20`。
   - per-pass 計時要不要正式定位成「submit-fence 量測」寫進報告（P1 #6）——**報告 `perf.md` §5 已這樣寫**。
   - ~~氣泡逐格辨識度（P2 #8 剩餘）~~ **第 8 輪已做**：精靈半徑 ×1.85、環形對氣泡軟化，
     逐格貢獻 0.14–0.32 % → **0.46–1.02 %**（見 §2.1 第 8 輪）。至此 §3 的清單全數結清。
4. **遠端 repo**：**已建並推送（2026-11-26）**——private repo `underwater_test`，
   `origin = https://github.com/hiller16/underwater_test.git`，預設分支 `main`；
   伺服器端 `refs/heads/main` = 本地 `HEAD` = `fee1fc0`，27 個 commit／34 個檔案全部推上，
   最大檔 `index.html` 135.8 KiB（`_*/` 與 `node_modules/` 由 `.gitignore` 排除，不會被推上去）。
   之後推檔只用 `git push`；`gh` 不在 PATH，要用 `& 'C:\Program Files\GitHub CLI\gh.exe'`，
   且 PowerShell 5.1 會把 `git push` 寫到 stderr 的正常訊息當成錯誤（結束碼 1），要另查 `git ls-remote`。
5. **接手必讀**：本檔 §4（工具怎么用）＋ §1 缺陷表最後五列——
   WGSL 不支援巢狀三元運算子（整個 shader 解析失敗、整組道具消失）、
   `crop.js` 非整數 scale 會解出黑 tile、`verify.js` 的 rAF 斷言要抗 GPU 搶佔、
   PowerShell 單引號不脫字（`--eval '__scene.hide(\"bub\")'` 會靜默拋錯，圖層 A/B 改用 URL 參數）、
   `diff.js` 一定要 `--mask` 遮 HUD，否則差分只看到 FPS 數字。
   改 shader 後一定看 `shoot.js` 的 `errors`；改文件後跑 `node tools\mdcheck.js`。
