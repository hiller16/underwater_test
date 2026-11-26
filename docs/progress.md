# Kelp Cathedral — 進度紀錄

> 更新時間：2026-11-26（第 4 輪：`_rev10` 的 2 個 major + 4 個 minor 全修完並逐項截圖覆核）。
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
| 畫面中純黑塊（major→blocker） | mote 精靈的 NaN alpha 進 HDR buffer，經 bloom 擴散成黑卡；另 VS 四角公式 `*4` 應為 `*2` | VS 加 `!(d >= 1.2)` 剔除；FS 加 `!(s>=0)||!(s<4e4)` discard | `tools/scan.js` pose0/pose3 @1280×720 → 0 blobs（此前 1–3 個 48×48～60×52） |
| pose5 整張平坦藍（blocker） | `finalizePoses()` 執行時 `SET.arches` 還是空的 → yaw/pitch = NaN | 新增 `layoutArches()`，順序改為 layoutArches → finalizePoses → buildCamPath | pose5 恢復內容（mean 0.339，edge 0.049） |
| 相機埋進岩石 / 布景看不到 | 大道具隨機落在視點上 | 新增相機走廊 `CAMPTS`（6 poses ±9 m 擺頭 + 120 個 tour 取樣），大道具落在管內就剔除；arch 改為對準視點（standoff 44）；tour 相機鉗在 bed+12 | 各 pose 不再出現整屏單色 |
| 布景方向錯誤（船殼側邊、鯨尾成細片） | `rot3` 旋轉順序為 Y→X→Z，yaw 先做 | 改為 roll→pitch→yaw（yaw 最後）；船殼 yaw 0.95 + 10° 傾側；鯨尾 rx90 站起再 ry90 轉向走廊 | 第 3 輪 `_view/f1.jpg` 已肉眼覆核通過 |
| 「魚群」在畫面裡看不見（第 4 輪） | `fishVS` 的軌道半徑 `13 + 30·fract(sc·0.618)` m → 一群魚其實是直徑 26–86 m 的空心殼，群心對準鏡頭時成員反而散到鏡頭前後 | `i1.w` 由擺尾相位改為軌道半徑縮放（擺尾相位改用 `fract(sc·7.13)` hash），錨定 pose 的群用 0.16–0.30，`ext/wide` 也同步縮小 | `_view/g4.jpg` pose0/2/4 都看得到銀色魚群；`dbg.js` 投影確認群心在框內 |
| kelp 加氣囊時網格錯位風險 | `sweep()` 每頂點寫 6 floats，但 kelp pipeline 是 `arrayStride: 32`（pos+normal+uv 共 8 floats） | 氣囊改用 kelp 自己的 `push()`（8 floats）建八面體並手寫索引 | `errors: []`、`_t_minor/k0.png` 葉柄基部可見小球 |

---

## 2. 驗證結果

### 2.1 Visual critic（只准看 render，不準看 code）
狀態：**0 blocker、0 major，只剩 1 個 minor（船殼肋骨的近距離辨識度）**。
第 3 輪修完 `_rev9` 的 1 blocker + 4 major；第 4 輪把 `_rev10` 的 2 個 major（pose4 洗白、iridescent 葉過飽和）
與 4 個 minor（莖無節／肋骨看不見／貼鏡葉片／生命體不可見）逐項修完，每項截圖覆核並各自 commit。
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
- 仍未定案：pose1 banding（要 1280×720 PNG + `png.js`）、葉緣鋸齒與肋骨紋（要 `crop.js` 小圖）。

### 2.2 效能（scripted fly-through，fenced = 每幀等 `onSubmittedWorkDone`）

| run | size | 條件 | frames | avg | p50 | p99 | p999 | max | 0.1% low (fps) |
|---|---|---|---|---|---|---|---|---|---|
| `_t_perf` | 1920×1080 | `--perf`（vsync，8 s tour，第 4 輪最終狀態） | 964 | 8.32 | 5.6 | 16.8 | 22.2 | 22.3 | 44.8 |
| `_rev10p` | 1920×1080 | `--perf`（vsync，8 s tour） | 954 | 8.40 | 5.6 | 22.3 | 22.4 | 22.4 | 44.6 |
| `_fix2p` | 1920×1080 | `--perf`（vsync，6 s tour） | 832 | 7.22 | 5.6 | 16.8 | 16.8 | 16.8 | 59.5 |
| `_perf6` | 1920×1080 | `--perf --nolimit` | 4096 | **5.81** | 5.6 | 9.2 | 14.1 | 33.4 | 29.9 |
| `_perf5` | 1920×1080 | `--perf`（vsync 180 Hz） | 3041 | 7.90 | 5.6 | 22.3 | 27.8 | 33.4 | 29.9 |
| `_perf4` | 1920×1200 | `--perf`（vsync） | 4096 | 6.82 | 5.6 | 16.8 | 16.9 | 22.2 | 45.0 |

GPU 端（`gpuMs`，同一 submit 的 fence 往返）：`_t_perf` avg 7.29 / p99 11.8 / max 15.4；
`_rev10p` avg 7.47 / p99 19.2 / max 24.7；
`_fix2p` avg 6.23 / p99 10.4 / max 12.3；舊版 1080p avg 5.7 / p99 8.9 / max 19.7、
1200p avg 6.01 / p99 9.7 / max 21.4。
注意：`_t_perf` / `_rev10p` / `_fix2p` 都是 kelp 幾何加重（ROWS 5→6、頂端 perNode 最多 4、
juvenile 0.17→0.24，第 4 輪再加每株約 270 個氣囊頂點 ≈ +39% kelp 頂點）之後的數字，
且 tour 區間較短、取樣點不同，不能直接和 4096 幀的舊 run 比大小；
1200p 在新 kelp 下尚未重測（見待辦 P1）。

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
`node tools/check.js` → **raw 132.8 KiB | minified 92.0 KiB | gzip 32.4 KiB**（單檔，無外部資源）。

### 2.4 驗證環境
- 本機即目標硬體（Ryzen AI Max+ 395 / Radeon 8060S，Windows 11）。
- 只有 Microsoft Edge 157.0.4341.60（Chromium 157，等同規格的 Chrome 157 內核），無 Chrome 品牌。
  無頭模式 `--headless=new`（不給 `--disable-gpu`）即可使用真 GPU。
- 詳細環境探測紀錄在 `docs/plans/01-underwater-webgpu.md`。

---

## 3. 還沒解決的問題（依優先順序）

**P0 — 完成門檻本身**
1. **Visual critic：停止條件已達成**（0 blocker、0 major；見 §2.1 第 4 輪表，含追加的兩項）。
   已跑過：6 poses @1920×1080（`_rev11`→修→`_rev12`）**以及** tour 序列
   `--tour 12 --tour-frames 12`（`_rev11/tour/f000-f011.jpg`、覆核圖 `_view/t11.jpg`、`_view/t12.jpg`）。
   下一輪如果還要收，只剩這些 minor（依價值排序）：
   (a) 船殼肋骨／木板在 30 m 外的紋理解析度（`_t_f2/kh2.png` 只隱約可見）；
   (b) tour 中貼著葉面飛的片段（`_view/t12.jpg` 的 f003）——要嘛再壓低葉面尺寸／靠近路徑的密度，
   要嘛讓 tour 路徑避開藻冠；
   (c) 葉片本身的質感（無葉緣鋸齒、無沿葉色相漸層，近看仍像平滑卡片）。
2. **圖片通道**：已恢復（11-26 起可讀 ≤960 寬 JPEG）。本輪讀 8 張（`diag12`、`f1–f5`、
   一張 960×540 單圖、`c10.jpg`），合計約 0.9 MB，沒有再出現 `media omitted`。
   額度規則見 §1：一個任務的圖片總量有上限，能用數值工具就不要看圖。
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
7. 巨藻葉片形狀／寬度／密度：第 4 輪已加節理＋pneumatocyst＋更長的葉帶，近距離仍偏「平滑」（無葉緣鋸齒、無沿葉色相漸層）。
8. 魚群已入鏡（pose0/2/4 皆可見）；蝠鱝與氣泡在 pose 內的辨識度尚未逐格確認。
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
| `chroma.js` | 彩度統計（mean/p50/p95/max + 平均 RGB），證明某個顏色不再是畫面最搶眼的東西 | `node tools/chroma.js _rev12/pose0-canyon-start.png` |
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
1. 修 §2.1 `_rev10` 的 major #1：pose4 `kelp-corridor` 洗白無主體 —
   先試 `shoot.js --q "gr=0.55"` 確認是光柱還是 in-scatter，再決定改 pose4 的 yaw/pitch
   （看向岩壁或拱門）或逆陽時壓 `shaft`。驗收：`shoot.js --poses 4 --fmt jpeg` + `region.js`。
2. 修 major #2：iridescent 巨藻葉的洋紅依深度往霧色插值 + 降飽和（比照 bed 的 `gcCool` 作法），
   目標是畫面裡最高飽和的物體回到冷調range。驗收：`--poses 0,2`。
3. 收 minor #3/#5：莖加直徑抖動與葉柄氣囊、视点空地 10 m 再外推（`placeFlora.onStage`）。
4. 收 minor #4/#6：船殼肋骨加大或 pose2 再靠近；魚群/氣泡移進 pose 視野。
5. 重跑 6 poses @1920×1080（`_rev11`）+ tour 截圖序列，直到沒有 major。
6. 重測 1920×1200（`--perf` 與 `--profile`，新 kelp 幾何），把 avg / p99 / max 寫進 `docs/reports/perf.md`。
7. 補 `tests/verify.js` + `npm test`（WP9，環境驗收現在是 Missing script），
   清理暫存目錄（`_fix*`、`_rev*`、`_diag`、`_t_cdp`），交付 `index.html` + 體積 + 效能報告 + critic 最終評語。
