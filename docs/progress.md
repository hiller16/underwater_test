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
狀態：**尚未通過**。最新一輪（`_rev8`，6 poses @1280×720，無 error）之後就再也讀不到圖片，
所以「set piece 重整方向 + god ray 加固 + 海面亮度下修」這批變更尚無肉眼簽核。

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
1. **Visual critic 需要重新跑一輪簽核**：以目前 build 輸出 6 poses @1920×1080 + tour 截圖序列，
   由「只看圖」的 critic 判定；目標是没有任何項目高於 minor。
   重點複核：船殼/鯨尾可辨识度、god ray 強度（要明顯但不把中間調洗白）、
   近距離巨藻葉片過大過平、紫色地面飽和度、banding。
2. **圖片通道失效**：本 session `read_files` 讀 PNG/JPG 一律 `media omitted`
   （378 KB～1 MB 都試過，舊檔也一樣）。肉眼覆核被迫暫停，
   目前靠 `ascii.js / region.js / scan.js` 撐住組合與數值判斷。

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
| `cdp.js` | 共用函式庫：啟動 headless Edge（真 GPU）、開頁、eval、screenshot、事件收集。其他工具都 require 它 | `const {launch}=require('./tools/cdp.js')` |
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
`--q "exposure=1.2&gr=1.4"`（直接覆寫 `CFG`）、`--warm 2500`（先暖機再開始計時）、`--hud`。
環境變數（`dbg.js`）：`PAGE`、`VW`、`VH`、`FLAGS`。

---

## 5. 下一步（順序）
1. 圖片通道恢復後，重跑 6 poses @1920×1080 + tour 序列，交給 critic 出清單。
2. 依清單修 P0/P2 視覺項。
3. 重測 1920×1200（--perf 與 --profile），把 avg / p99 / max 寫進交付報告。
4. 清理暫存目錄，交付 `index.html` + 體積 + 效能報告 + critic 最終評語。
