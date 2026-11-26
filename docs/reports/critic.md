# Visual critic 最終評語 — Kelp Cathedral

日期：2026-11-26　｜　對應計畫：`docs/plans/01-underwater-webgpu.md` WP8 / WP9
逐輪的完整缺陷表與數值留檔在 `docs/progress.md` §2.1，本檔是最終交付評語。

## 1. 方法

- **只看 render，不看 code**：每輪固定拍 6 個 critic poses ＋ fly-through（@1920×1080，contact sheet 每格 480×270），
  细节另用 `tools/crop.js` 裁 ≤480 寬小圖，避免在小圖上臆測。
- **一項一動**：一個缺陷 → 一個修法 → 截圖或數值覆核 → 一個 commit；不退著改、不順手改無關程式碼。
- **數值佐證**：肉眼判斷一定配一個可重跑的數字（`region.js` 結構量、`chroma.js` 彩度、`scan.js` 黑塊、
  `band.js` 色階台階、`edges.js` 多格比較、`diff.js` 圖層隔離），避免「看著好像變好了」。
- **停止條件**：無 blocker / 無 major，且 critic 清單上的 minor 逐輪收斂到零。

## 2. 輪次摘要

| 輪 | 輸入 run | 評審結果 | 主要處置 | 覆核 |
|---|---|---|---|---|
| 1 | `_rev9`（6 poses @1080） | **1 blocker + 4 major + 4 minor** | 見 §3 第 1 批 | `_view/f1–f5.jpg` |
| 2 | `_rev10` | 0 blocker + **2 major** + 4 minor | shaft-only god-ray 增益、iridescent 葉降飽和並依深度插值、莖節理＋氣囊、船殼肋骨加大、視點空地 10→6 m、每格 pose 前放魚群 | `_view/g1/g2/g4.jpg` |
| 3 | `_rev11` + tour 12 格 | 浮出 2 項（pose5 拱門又被切、tour 被葉面糊住） | 修 `SET.arches` 的視線廊道 bug（第 2 輪以為有）、`placeFlora` 對相機走廊做軟性稀釋 | `_view/c12/t12.jpg` |
| 4 | `_rev12` | **3 minor**（葉片質感、tour 貼葉面、船殼木板紋） | 葉緣雙頻率鋸齒＋中肋＋canopy 金綠漸層、稀釋環 7.0 m、舷帶 ×4 純幾何 | `_view/g5/g6/g7.jpg` |
| 5 | `_rev13`（6 poses + tour） | **停止條件成立**（0 / 0 / 0） | — | `_view/c13.jpg` |
| 6 | `_rev14` + `_rev14t` | 結清兩個「未定案／可選」項 | 天空 banding 定案為 JPEG 假影；每格 pose 停一艘蝠鱝補比例與生命感 | `_view/c14.jpg` |

minor 數量變化：**4 → 4 → 3 → 0**（major 1 blocker+4 → 2 → 0），符合 WP8「minor 逐輪減少」。

## 3. 缺陷 → 修法 → 驗證

### 第 1 批（`_rev9`）

| 等級 | 缺陷 | 修法 | 驗證 |
|---|---|---|---|
| blocker | Set piece 認不出：船殼只剩深灰長條、鯨尾找不到、拱門像細彎管 | 視點拉近（船殼 45→33 m、鯨尾 36→27 m）＋ `placeFlora` 清出視點空地與「視點→道具」視線廊道；船殼 scale 1.45→1.72 並提亮木料；鯨尾加雕刻弦紋與方形基座；拱門管徑 0.15→0.27、跨徑 13–23→17–28 | `f1.jpg`／`f5.jpg`：船身＋桅杆、立石＋基座、岩塊拱都可辨識 |
| major | 巨藻讀成「竹竿＋飄落楓葉」 | 莖半徑 0.075→0.15、葉帶加長加寬、節點分佈改 0.48–1.00、頂端每節最多 4 葉、juvenile 比例提高做多層冠 | `f2.jpg`：出現羽狀冠層；1080p tour avg 7.22 ms（效能未退步） |
| major | 白霧過曝、光柱看不明確 | in-scatter 前向瓣改寬改弱（0.24·sd⁴＋0.52·sd³⁴）、環境項 0.55→0.46；beam 阈值收窄、halo 減半而太陽盤增強；bloom 阈值 1.35→1.55／強度 0.55→0.64 | `f3.jpg`：有藍階與明確太陽盤，不再整片洗白 |
| major | 近景巨莖硬切構圖 | 貼鏡溶解視窗 0.45–3.2 m → 1.2–6.5 m（留 15% 本體色） | `f4.jpg`：pose1 中央巨莖化為霧 |
| major | 地面洋紅過飽和、與冷調分裂 | cover 改樺色並依深度最多 50% 往水色插值、覆蓋 0.82→0.70、反弹光下修 | `f5.jpg`：地面轉柔和藍紫，與水色同調 |

### 第 2–4 批（`_rev10`／`_rev11`／`_rev12`）

| 等級 | 缺陷 | 修法 | 驗證 |
|---|---|---|---|
| major | pose4 逆陽整片洗白、無主體 | `raysFS` 拆出 **shaft-only 增益**（新增 `CFG.godrayShaft`，URL `gs`，走 `params4.y`）——只縮光柱、不動太陽盤 | 診斷 `gr=0` 時 mean 0.626→0.252（證實洗白來自 ray 積分）；定稿 `gs=0.62` → mean 0.548、edge 0.0251→0.0315、clip 0% |
| major | 洋紅「搬家」到 iridescent 葉 | 變體色改 `(0.150,0.090,0.150)/(0.300,0.200,0.275)` 並 `irid *= 1-0.60·sstep(20,62,dist)` | `chromaMean` pose0 0.1971→0.1863；`g2.jpg` 轉柔和淡紫 |
| minor | 莖等徑無節 | 直徑叠兩個諧波（SR 8→10）＋每片葉柄基部一顆 pneumatocyst | `g4.jpg`：環狀節與葉柄小球可見 |
| minor | 船殼肋骨 30 m 外看不見 | 肋骨半徑 0.24→0.34，再加 4 條縱向舷帶（純幾何自遮蔭）、木料 crackle 距離窗 40→72 m | pose2 全圖 edge 0.0413→0.0459、std 0.1533→0.1624；`g7.jpg` 可看木板線 |
| minor | 貼鏡葉片成大片色塊 | 視點空地 10→6 m（10 m 會把冠層清光變成空洞） | `g4.jpg`：四周仍被藻林包圍，中央不被葉切死 |
| minor | 生命體看不見 | 每格 pose 前 15–24 m 放一團魚＋魚體放大，並修正「魚群」其實是 26–86 m 的軌道殼（`i1.w` 改軌道半徑縮放） | 投影證明群心在框內；三格都看到銀色魚群 |
| minor | 葉片像平滑卡片 | 葉緣雙頻率鋸齒（`ROWS` 6→8 才抓得住）、中肋、canopy 依深度金綠漸層、近距 grain 提頻加 oct | pose4 中部 std **0.0743→0.1107**（+49% 細節）；`g5.jpg` 可見波浪葉緣與中肋 |
| minor | tour 有格被葉面糊住 | 相機走廊硬排除 3.2 m 之外再加 7.0 m 軟性稀釋環（葉片可外伸 4–6 m） | tour 12 格 edge 均值 0.0388→0.0437、最差格 0.0172→0.0249 |
| bug | pose5 的拱門视线廊道其實從來沒生效 | `p.look === 'arch'` 要從 `SET.arches` 陣列裡找 `isPose` 那一個，不是 `SET.arch` | `c12.jpg`：石拱與拱下開口清楚、魚群穿拱而過 |

### 第 6 批（`_rev14`）

| 等級 | 項目 | 修法 | 驗證 |
|---|---|---|---|
| 未定案 | pose1 天空漸層疑似 banding（只在 JPEG 上見過） | 新增 `tools/band.js`（PNG 逐像素找 ≥2 LSB 台階，附 `--selftest` 合成樣本自證判別力） | 場景 pose1 上方 40% **contours = 0**、平坦塊 ratioAvg 1.000 → **是 contact sheet 的 JPEG 假影**，場景無 banding |
| minor | 蝠鱝在 6 格裡幾乎看不見（繞圈 34–74 m 永遠不進框） | 每格 pose 停一艘在視軸上（前瞻 24–34 m、依 `eye = bed+14` 重算高度、绕圈 4–9 m、span 6.8–10 m、climb 改 per-instance 以免滾出框）；新增 `?time=` 鎖時鐘讓截圖可重現 | `diff.js` 開／關 `hide=manta`：每格 0.14–0.99% 畫素、maxAbs 129–156；`m1.jpg` 可辨識寬三角翼與細尾；t=8 與 t=25 都在框內 |

## 4. 最終判定

**0 blocker、0 major、critic 清單上的 minor 全數收完 —— 停止條件成立。**

- `_rev13`（6 poses + tour 12 格）與 `_rev14`（6 poses）兩個 run 都 `errors: []`；
  `tools/scan.js` 六格 **0 blobs**（NaN 黑卡未復發）。
- 彩度：最高飽和的物體已不是洋紅（`chromaMean` pose0 0.1452、pose2 0.1119）。
- 曝光：pose1 直視太陽的 clip 從 7.5% 降到 **0%**，亮度退回 tonemap 肩部以下。
- 深度階梯：近距有細節、中距保留青綠林相、遠處轉深藍（mean pose0 0.47 → pose5 0.231，逐區 edge 都有結構）。
- 加停泊蝠鱝之後重跑覆核：六格主體仍在，且 tour 結構量**不退步**（edgeAvg 5.2837→5.5754、
  最差格 2.1551→3.0802、最低 std 17.12→24.67）。
- 每格最終讀法（`_view/c14.jpg`）：pose0 巨藻林相＋銀色魚群＋天光深度；pose1 太陽盤＋Snell window 邊界；
  pose2 沉船殼體＋舷線＋桅杆；pose3 鯨尾石雕＋方形基座（一艘蝠鱝劃過下緣，補比例）；
  pose4 逆陽光柱＋中距石拱＋蝠鱝剪影；pose5 石拱＋穿拱魚群。

## 5. 保留的取捨（不是缺陷）

1. ~~tour 有一格偏平淡（f006）~~ **已改善**（第 7 輪）：`TOUR_WP` 第 7 點 y 24 → 10，讓爬升延後、
   一次衝穿葉帶而不是停在帶中間。tour 12 格 edgeMin 3.0802 → **3.7060**、edgeAvg 5.5754 → **5.6673**、
   最低 std 24.67 → **28.76**，6 個 critic pose 前後 A/B 不變（edgeAvg 5.4306 → 5.4443、0 blobs）。
   對照圖 `_view/tour_f6.jpg`；診斷工具 `tools/tourprobe.js`。仍然留著的是「穿越藻林」這種合法的過場鏡頭。
2. 蝠鱝在 pose3／pose5 壓到道具下緣一小塊，换来的是中距生命體與尺度參照，屬刻意取捨。
3. 開 vsync 的 p99（22 ms）是 60 Hz 跳格，非場景成本；見 `docs/reports/perf.md` §6。
4. 氣泡屬於氛圍層，未逐格辨識；再往前列都是低 CP 微細節（葉面破洞／附著生）。

## 6. 判讀限制（下次接手的注意）

- contact sheet 每格只有 480×270，**細節一律用 `crop.js` 裁小圖**；JPEG 會造成假影（banding 就是一例），
  定案要用 PNG + `png.js`／`band.js`。
- 每個對話的讀圖額度有限（約 8 MB），能用數值工具判斷就不要看圖。
- 改 shader 之後一定要看 `shoot.js` 輸出的 `errors`：本專案曾因巢狀三元運算子讓 WGSL 解析失敗，
  症狀是「整組道具消失」而不是畫面跑色。

## 7. 重現指令

```powershell
# 6 poses 截圖 + contact sheet（critic 一輪）
node tools\shoot.js --size 1920x1080 --out _rev --settle 1500 --fmt jpeg
node tools\sheet.js --out _view\sheet.jpg --cols 2 --w 960 _rev\pose*.jpg

# tour 12 格結構量（比較改動有無退步）
node tools\shoot.js --size 1280x720 --poses none --tour 20 --tour-frames 12 --out _tour
node tools\edges.js _tour\tour

# 隔離單一圖層（鎖時鐘 + hide）
node tools\dbg.js --param "time=8" --eval "__scene.setPose(3)" --shot _t\a.png
node tools\dbg.js --param "time=8&hide=manta" --eval "__scene.setPose(3)" --shot _t\b.png
node tools\diff.js _t\a.png _t\b.png
```
