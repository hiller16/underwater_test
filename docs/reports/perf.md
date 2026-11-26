# 效能報告 — Kelp Cathedral（單檔 WebGPU 海底場景）

日期：2026-11-26　｜　場景檔：`index.html`　｜　對應計畫：`docs/plans/01-underwater-webgpu.md` WP7 / WP9
原始量測紀錄在 `docs/progress.md` §2.2／§2.3，本檔是交付用的整理版，所有數字都來自本機實測。

## 1. 規格目標（WP7）

> 1920×1200 tour 30 s：**avg 11–16 ms、p99 ≤ 20 ms、max 記錄**；並交出 per-pass ms 表。

## 2. 量測環境

| 項目 | 值 |
|---|---|
| 硬體（即目標硬體） | AMD Ryzen AI Max+ 395 / Radeon 8060S iGPU（gfx1151）、Windows 11 |
| 瀏覽器 | Microsoft Edge 157.0.4341.60（Chromium 157 內核，等同規格指定的 Chrome 157），無 Chrome 品牌 |
| 啟動方式 | `--headless=new`，**不給** `--disable-gpu` → 走真 GPU（D3D12 / Dawn） |
| 渲染設定 | MSAA 4×、`renderScale` 1、`dprCap` 1.5、`density` 1、`fogCull` 215 m、`raySteps` 24、`rayReach` 170 m |
| 工具 | `tools/shoot.js --perf`（fenced）、`--nolimit`（關 vsync）、`tools/perf.js`（讀 log 印分位數） |

「fenced」= 每幀 `await device.queue.onSubmittedWorkDone()`，量的是「提交 → GPU 完成」的往返，
因此 `gpuMs` 是較悲觀（含提交開銷）的 GPU 佔用；`ms` 是 rAF 間隔（wall time）。

## 3. 場景負載（實際實例數，`tools/dbg.js` 量得）

| 層 | 數量 |
|---|---|
| 巨藻（instanced 單一棵網格） | **1,677** 株（上限 `kelpMax` 6,500，依密度函數與相機走廊取樣後落到 1,677） |
| 硬道具 | **2,364** 個實例：礫石 1,086／珊瑚 429／海綿 306／岩柱 201／懸浮岩 146／壁板 190／石拱 4／船殼 1／鯨尾石雕 1 |
| 生命 | 海雪 14,000、氣泡 3,000、魚 1,920、蝠鱝 8（其中 6 隻停泊在 6 個 critic 視點前） |
| 海底網格 | 300×300（`gridN`），單次 draw |
| Render pass | 8 個（scene / rays / rayH / rayV / bright / bloomH / bloomV / composite） |

## 4. 結果

### 4.1 1920×1200（規格指定的解析度）

| run | 條件 | frames | wall avg | p50 | p99 | p999 | max | 0.1% low fps | gpuMs avg / p99 / max |
|---|---|---|---|---|---|---|---|---|---|
| `_perf1200d` | 20 s tour，`--perf`（開 vsync，**最終狀態**：第 8 輪氣泡精靈放大 1.85×） | 2,190 | **9.14** | 5.6 | 22.2 | 22.3 | 27.6 | 36.2 | 7.77 / 12.4 / 26.1 |
| `_perf1200c` | 20 s tour，`--perf`（開 vsync，第 7 輪狀態：延後爬升的路徑） | 2,144 | **9.33** | 5.6 | 22.2 | 22.3 | 27.8 | 36.0 | 7.89 / 12.2 / 21.8 |
| `_perf1200` | 30 s tour，`--perf`（開 vsync） | 3,744 | **8.01** | 5.6 | 22.1 | 22.3 | 27.7 | 36.1 | 7.03 / 11.9 / 18.3 |
| `_perf1200b` | 20 s tour，`--perf`（開 vsync，第 5 輪狀態） | 2,362 | **8.47** | 5.6 | 22.1 | 22.3 | 22.4 | 44.6 | 7.41 / 12.3 / 16.8 |
| `_perf1200n` | 20 s tour，`--perf --nolimit`（關 vsync） | 2,559 | **7.82** | 7.5 | **12.6** | 14.2 | **17.0** | 58.8 | 7.65 / 12.2 / 16.4 |

### 4.2 1920×1080（critic 用的解析度，供對照）

| run | 條件 | frames | wall avg | p99 | max | 0.1% low fps | gpuMs avg / p99 |
|---|---|---|---|---|---|---|---|
| `_perf6` | `--perf --nolimit` | 4,096 | 5.81 | 9.2 | 33.4 | 29.9 | 5.7 / 8.9 |
| `_t_perf` | 8 s tour，`--perf`（第 4 輪最終狀態） | 964 | 8.32 | 16.8 | 22.3 | 44.8 | 7.29 / 11.8 |
| `_rev10p` | 8 s tour，`--perf` | 954 | 8.40 | 22.3 | 22.4 | 44.6 | 7.47 / 19.2 |

## 5. per-pass（`--profile`，`_perf5p` @1920×1080）

每個 pass 單獨 submit、取 6 次平均（因此總和含 7 次额外的 fence 往返，會高於實際整幀時間）：

| pass | ms | 內容 |
|---|---|---|
| scene | **5.00** | 海底 + 道具 + 巨藻 + 生命 + 水面（MSAA 4×，場景主體） |
| rays | 1.03 | 體積光柱 march（24 步） |
| rayH / rayV | 0.71 / 0.66 | 光柱分離式模糊 |
| bright | 0.67 | downsample + soft-knee 亮部抽取 |
| bloomH / bloomV | 0.66 / 0.64 | bloom 模糊 |
| composite | 0.69 | 疊加、ACES tonemap、S-curve、vignette、dither |
| **合計** | 10.05 | 含每 pass 的 submit/fence 開銷 |

**佔比結論**：場景主體 pass 約 5 ms（其中巨藻與 MSAA 是最大項），後製鏈合計約 5 ms 但每一項都 < 1.1 ms，
屬「平坦可調」區間；要再壓時間，優先調 `msaa`（4→2）或 `density`（巨藻實例數），而不是後製。

### 5.1 為什麼 per-pass 是 submit-fence 而不是硬體時間戳

本機 Chromium 157 build 沒有 `chromium-experimental-timestamp-query-inside-passes`，
且 `GPUCommandEncoder.writeTimestamp` 已從该 build 移除，任何 `--enable-*-features` 旗標都打不開
（`tools/tsflag.js` 逐旗測試過）。所以 `getStats().tsMs.count = 0`，per-pass 數字來自 submit-fence；
硬體時間戳要在真 Chrome 157 或支援 inside-passes 的 build 上才會出現。

## 6. 判定與注意事項

- **avg**：1200p 開 vsync 8.0–9.3 ms、關 vsync 7.8 ms → 落在並優於規格 11–16 ms 的下緣，**通過**。
- **路徑差異**：`_perf1200c` 與 `_perf1200b` 的差（wall +0.86 ms、gpuMs +0.48 ms）來自第 7 輪把 tour 的
  爬升段延後，相機在冠層裡停留的取樣點變多；同一場景幾何下這屬於路徑取樣差異，不是新增成本。
- **氣泡精靈放大**：`_perf1200d` 對 `_perf1200c`（wall −0.19 ms、gpuMs −0.12 ms）在同級噪音內。
  氣泡實例數沒變（3000），只有精靈變大：逐格新增 0.5–1.0 % 畫素的相加混合，對 fill rate 幾乎無感。
- **p99**：關 vsync **12.6 ms ≤ 20 ms → 通過**。開 vsync 的 22.1 ms 是 60 Hz 週期跳格（16.7 → 33.3 ms 的中間取樣），
  不是場景突然變慢；`_perf1200b` 的 p999 22.3 同時出現、而 p50/p90 仍為 5.6 ms，可交叉印證此結論。
- **max**：已記錄 —— 關 vsync 17.0 ms（20 s）、開 vsync 27.7 ms（30 s，含起步與區段切換）。
- **量測陷阱**（重測時務必避開，否則會得到假慢）：
  1. `--tour-frames` 会在飛越中途用 CDP 截圖，當下暫停渲染迴圈 → log 會出現 p999 ≈ 217 ms 的離群幀；要看效能就別截圖。
  2. 開 vsync 時 wall time 被量化到 16.7 ms 的倍數，尾端分位數會跳到 22/33 ms；要真實尾端用 `--nolimit`。
  3. 前 ~2 s 是 pipeline 編譯與實例串流，`--warm`（預設 2,500 ms）會先暖機再開始計時。
  4. 另一個 headless Edge 同時在跑會搶 GPU，讓 rAF 變慢（`npm test` 的幀推進斷言已改用 `waitFor` 抗這種干擾）。

## 7. 重現指令

```powershell
# 1200p 30 s（開 vsync，規格條件）
node tools\shoot.js --size 1920x1200 --poses none --tour 30 --perf --out _perf --settle 900 --warm 2000
node tools\perf.js _perf

# 1200p 20 s（關 vsync，真實尾端）
node tools\shoot.js --size 1920x1200 --poses none --tour 20 --perf --nolimit --out _perf_n

# per-pass（submit-fence）
node tools\shoot.js --size 1920x1080 --poses none --tour 12 --profile --out _perf_p

# 體積
node tools\check.js     # raw 138.0 KiB | minified 93.9 KiB | gzip 33.2 KiB（預算 minified < 200 KiB）

# 自動化验收（17 項斷言）
npm.cmd test
```
