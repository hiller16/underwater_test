# 計畫：WebGPU 即時海底場景（project_02）

## 0. 目標與限制

即時運行的奇幻海底世界，瀏覽器開啟 `index.html` 即可自由飛行觀景。

優先序（衝突時）：1) 視覺品質 → 2) 在目標規格下穩定的幀節奏 → 3) 小 bundle。

硬性限制：

- 不用 Three.js / Babylon.js 或其他引擎；WebGPU 渲染。
- 全程序化（no texture/model files）；交付物是單一自含的 `index.html`，要回報 minified size。
- 每幀零 JS 配置（preallocate 所有 buffer；每幀只允許 WebGPU API 必要的 encoder/wrapper 物件）。

目標規格：Windows 11 25H2、Chrome 157、AMD Ryzen AI Max+ 395（Radeon 8060S）、180 Hz 螢幕、
1920×1200 全解析度、1080p High 設定下 11–16 ms（60–90 FPS），0.1% low 允許竄到 27–37 ms。

## 1. 本機環境事實（已實測，非假設）

| 項目 | 實測結果 |
|---|---|
| GPU | AMD Radeon(TM) 8060S Graphics（Direct3D11），driver 32.0.32015.16001 |
| 螢幕 | 1920×1200 @ 180 Hz |
| 瀏覽器 | 僅 Microsoft Edge 157.0.4341.60（無 Chrome）；Chromium 157 = 規格的 Chrome 157 內核 |
| 無頭 WebGPU | `--headless=new`（不給 `--disable-gpu`）即可用真 GPU；rAF 以 181 Hz 運行 |
| WebGPU features | timestamp-query, float32-blendable, float32-filterable, shader-f16, dual-source-blending, subgroups, rg11b10ufloat-renderable, bgra8unorm-storage, depth32float-stencil8, depth-clip-control, indirect-first-instance, texture-compression-bc |
| WebGPU limits | maxTextureDimension2D=16384, maxStorageBuffersPerShaderStage=16, maxComputeWorkgroupSizeX=1024, maxColorAttachments=8 |
| canvas 格式 | `rgba16float` 可用於 pipeline 輸出；canvas 用 `bgra8unorm` |
| timestamp API | `GPUCommandEncoder.writeTimestamp` 已移除；`GPURenderPassEncoder.writeTimestamp` 需要 `chromium-experimental-timestamp-query-inside-passes`，`--enable-webgpu-developer-features`、`--enable-experimental-web-platform-features`、`--enable-blink-features=...`、`--enable-features=...` 皆無法啟用 |

由上列事實衍生的兩項替代做法（需使用者知曉）：

1. **驗證瀏覽器用 Edge 157**（Chromium 157），非 Chrome 品牌。
2. **per-pass GPU 計時用 submit-fence**：`timestamp-query-inside-passes` 開不了，
   所以 per-pass 用「每 pass 单独 submit + `queue.onSubmittedWorkDone()` 圍籬」量 GPU 毫秒；
   幀節奏用 rAF 時間戳 log（avg / p99 / max / 0.1% low）。場景同時保留 timestamp-query 要求，
   未來瀏覽器支援時自動改用 pass 內 writeTimestamp。

探測程式：`_probe/probe.html`、`_probe/probe2.html`、`_probe/probe3.html`、`_probe/run.js`（完成後可刪）。

## 2. 技術架構

### 2.1 Pass 結構

1. **Opaque pass** → HDR target `rgba16float`，MSAA ×4，附 `depth32float` MSAA ×4。
   內容：海床、岩壁/巨岩、拱門、懸崖突出、浮岩、沉船、鯨尾石雕、海绵/珊瑚、
   魚群、魟魚、水面（從下往上看的波浪天花板）。
2. **Resolve** → 單取樣 HDR。
3. **Transparent pass**（畫進同一 HDR，depth-test、不寫 depth）：
   kelp 葉片、葉簇、地被 tufts、氣泡、粒子。kelp/foliage 用 **alpha-to-coverage**
   （免排序、MSAA 下軟邊）；氣泡與粒子用 premultiplied alpha / additive。
4. **God-ray occlusion**（¼ 解析度，讀 MSAA depth 以 4 取樣平均）→ rg16float。
5. **God-ray radial blur**（太陽投影為中心，18 taps）→ 光柱項。
6. **Bloom**：bright-pass（¼）→ separable gaussian H/V（兩級半徑）。
7. **Composite/tonemap**：HDR + sunColor×shaft + bloom → exposure → ACES 近似 filmic
   → 輕度 grading/vignette → **有序 dither**（對藍霧 banding 關鍵）→ sRGB → `bgra8unorm` canvas。

### 2.2 霧與吸收（視覺主signature）

- 逐 fragment 計算：`T = exp(-σ·d)`（σ 為 RGB，紅通道吸收最快）。
- in-scatter 顏色沿視線取 3 個樣點積分：淺處 cyan 亮 → 深處 deep blue 暗；
  並加太陽方向 in-scatter（與 god-ray 疊加形成光柱）。
- 遠界隱形：fog 在 ~150–190 m 完全濃縮，世界半徑 ~230 m，起始區看不到邊界。

### 2.3 幾何與動畫（全程序化、全 GPU 動畫）

- `geo`：JS 於 init 產生交錯 vertex/index buffer（icosphere 變形巨岩、kelp 葉片帶、
  葉簇 quad、tuft、桶狀海绵、分枝珊瑚 3 變體、魟魚、小魚、billboard、沉船殼體、鯨尾石雕、
  海床 grid、水面 plane）。
- 實例資料存在 CPU `Float32Array`；每幀 CPU 只做**視錐 +  fog 距離**剔除並**緊湊打包**進
  預配置 staging buffer（每群一次 `writeBuffer`），零配置。
- 動畫全在 vertex shader：kelp 搖曳（`(y/H)^1.6` 振幅 + 二次漣波）、浮岩浮沉、
  魟魚拍翼與軌道 bank、魚群群體路徑 + 個體相位、粒子 toroidal wrap（對攝影機取 mod，
  免 CPU 更新）、氣泡上升扭動並 Y 向 wrap。

### 2.4 場景內容對應需求

| 需求 | 做法 |
|---|---|
| 高聳 kelp 柱 + 綠金閃點 + 搖曳 | 2.4k–3k 株 × 2–3 葉片帶，高度 40–70 m；fragment hash 閃點（fwidth 反鋸齒）+ fresnel 閃耀 |
| 深度霧/吸收 cyan→deep blue | §2.2 |
| 光柱、caustics、水面波浪 | god-ray pass；world-XZ 動态 voronoi caustics 套在朝上表面與魚背；水面 plane 含 Snell's window、全反射、太陽與 glitter |
| 岩峽谷、拱門、懸突、浮岩 | 巨岩實例叢沿峽谷緣、拱門 3 座、懸突平台、浮岩 60 顆 |
| 虹彩紫/粉葉群、magenta 地被、桶狀海绵、珊瑚 | iridescent fresnel 色相偏移；tufts 1.2 萬 + 地面 shader magenta 斑；海绵 250、珊瑚 600 |
| 魟魚、魚群、氣泡、粒子 | 魟 4、魚群 4 群（共 ~1100）、氣泡 3 發源點 ×400、粒子 6k |
| 沉船殼體、鯨尾石雕 | 程序化殼體（龍骨 loft + 3 桅 + 破帆）與石雕（雙葉 + 基座）各一，置於起始視野 |
| 邊界不可見 | 起始於峽谷中段，環形高岩 + 密 kelp + 濃霧 |

### 2.5 互動與 QA API

- 控制：WASD 移動、滑鼠視角（pointer lock）、Q/E 升降、Shift 加速（12 → 40 m/s，含阻尼）。
- `window.__scene`：`ready`、`poses[]`、`setPose(i)`、`startTour(sec)`、`stopTour()`、
  `resetStats()`、`getStats()`、`getPassMs()`、`errors[]`、`hideOverlay()`。
- URL 參數：`?pose=`、`?tour=`、`?msaa=`、`?scale=`、`?perf=1`、`?quality=`。
- HUD：DOM 文字（FPS / ms / GPU ms / 位置），5 Hz 更新，`H` 切換。

### 2.6 驗證工具（Node + CDP，無第三方套件，僅 esbuild 用於體積）

- `tools/cdp.js`：共用無頭 Edge（開 GPU）CDP 驅動。
- `tools/shoot.js`：1920×1080 拍 6 個固定 pose → `_critic/poseN-name.png`。
- `tools/tour.js`：腳本化 fly-through；1920×1200 跑 30 s，輸出幀時間 log
  （avg/p99/max/0.1% low）+ per-pass submit-fence GPU ms → `docs/reports/perf.md`；
  另在 1920×1080 取 24 張等距截圖序列 `_critic/tour/`（代替影片，無 ffmpeg 環境下的「短片」）。
- `tests/verify.js`（`npm test`）：TAP 輸出，檢查單一檔自含（無外部請求）、尺寸 budget、
  無主控台錯誤、`__scene.ready`、6 pose 可切換、canvas 非空白。

### 2.7 Visual critic

無獨立 subagent 工具，改由「只看渲染圖」的固定評審流程代替：每輪只看 6 張 pose 圖
+ tour 序列，不讀程式碼，依 rubric（構圖/色彩/霧感/光柱/鋸齒/閃爍/banding/真實感）
回報分級缺陷（blocker/major/minor）。停止條件：沒有 major 以上，且minor 收斂。

## 3. 工作包（順序與驗收）

| # | 工作包 | 驗收條件 |
|---|---|---|
| WP1 | bootstrap：WebGPU init、canvas/resize、camera+controls、HUD、`__scene`、幀計時；水面 + 海床 + 霧 | 截圖可見由下仰望的波浪水面與漸層藍霧；無 console error；WASD/QE 可用 |
| WP2 | rock material + 巨岩叢（峽谷壁、拱門、懸突、浮岩） | 截圖有明确岩形與材質細節，無 tiling 感；fog 連貫 |
| WP3 | kelp + foliage + 地被 + 海绵/珊瑚（A2C） | 起始視野被 kelp 柱包圍；閃點不鋸齒；無明顯排序錯誤 |
| WP4 | set pieces：沉船 + 鯨尾石雕 | 兩個 set piece 在指定 pose 中可辨識、比例正確、有附著生 |
| WP5 | life：魟魚、魚群、氣泡、粒子 | 動態可見（tour 序列）；群體轉向自然；氣泡不閃爍 |
| WP6 | post：god-ray、bloom、tonemap+dither+vignette | 光柱明確且有深度衰減；藍霧無 banding；高光不爆 |
| WP7 | 效能調校（實例數、MSAA、fog 取樣數） | 1920×1200 tour 30 s：avg 11–16 ms、p99 ≤ 20 ms、max 記錄；per-pass ms 表 |
| WP8 | critic 迴圈（6 poses + tour @1920×1080） | 評審回報無 major；minor 逐輪減少 |
| WP9 | 體積與文件：minified size、`npm test`、perf report、critic 最終評語 | `npm test` 全綠；報告齊全 |

## 4. 風險與對策

- **iGPU 頻寬/overdraw**：kelp 是最大不確定項 → 用距離剔除 + fog cull；必要時減少 kelp 數量
  （不降解析度）。以 per-pass 時序決定砍哪裡。
- **MSAA ×4 + rgba16float** 的頻寬成本：以 `?msaa=` 切換量測後定案。
- **A2C alpha 量化**：alpha 低於 1/4 會消失 → 淡出改「顏色插值到霧色」而非降 alpha。
- **god-ray 中心在螢幕外**：徑向模糊仍要穩定（ clamp + 距離衰減）。
- **WGSL 編譯錯誤**是最常見失敗來源：`device.onuncapturederror` 收集進 `__scene.errors`，
  每個 WP 都以無頭截圖驗證。
- **單一 HTML 體積**：目標 minified < 200 KB（gzip 另報）。

## 5. 既有文件

目前專案內無既有設計文件（僅 `.harness.yaml` 與 `cline-project.cmd`）。
本檔為第一份；後續 perf 報告放 `docs/reports/perf.md`，critic 紀錄放 `docs/reports/critic.md`。
