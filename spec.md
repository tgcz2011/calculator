# Calculator - Project Spec

**This file is the single source of truth for every feature / requirement / improvement spec in this project. Read it before starting any work, and record every new spec here.** Purpose: stop the same problem being solved (or hit) twice, and stop wasted effort. (Mandatory rule in `AGENTS.md`.)

Last updated: 2026-07-23 · Version: 0.2.0.0 · Status: 9 requested modules shipped + TGC-23 UI polish shipped + TGC-25 (#1–9: force-landscape/aspect/landscape root fixes + scrollable toolbar, history entry, scroll-safe expression, tax & chem touch keypads) shipped + TGC-26 (#4 rotate button root fix: ↻ drives CSS rotated state on web, dataDesktop gate on desktop; #1/2/3/5 calculator isolation + input polish: per-calculator drafts/history, multi-page chem keyboard, wrapped toolbar, adjacent display) shipped + TGC-27 (#1 transform containment: chip-segment + toolbar wrap + shell clip-path instead of overflow:hidden; #2 long-expression wrap: input→textarea, multi-line result, no auto-shrink; #2 follow-up result/keypad containment) shipped.

---

## 1. Requirements & Roadmap

### Origin
"做一个全能计算器" - Apple-style all-platform calculator (iOS/iPadOS/Android via Capacitor, macOS/Win/Linux via Tauri, Web PWA). React + Vite + TypeScript + mathjs engine. The 9 modules requested in TGC-22:

贷款（多种方式）· 汇率（实时）· 亲戚称呼 · 科学（初等数学）· 个税 · 日期 · 单位换算 · 化学式配平器（输入要简洁）· 高等数学计算器（解方程/微积分/逻辑运算等）。

### Differentiation (from market research)
国内全能计算器红海中三个明显空子：
1. **化学方程式配平** - 国内 App 全员缺席（Wolfram/ChemBalance 主战场）。
2. **符号解方程 + 微积分** - 国内档没人做；Wolfram/Symbolab 国内访问不稳。
3. **个税年终奖双轨试算** - 国内档只算"应纳税额"，没人帮用户在"并入综合所得" vs "单独计税"间二选一并推荐最优。

辅以：实时汇率接 Frankfurter（国内档普遍用静态数据）+ 亲戚称呼南北/粤语方言。

### Roadmap (P0-P3)
| 阶段 | 模块 | 状态 |
|---|---|---|
| P0（首版） | 化学配平 + 符号数学（高数）+ 实时汇率 | ✅ 已发 0.8.0 |
| P1 | 个税双轨试算 + 亲戚称呼 + 贷款（IRR/提前还款） | ✅ 已发 0.8.0 |
| P2 | 拍照解题 / 单位换算扩展 / 历史搜索 | 未启动 |
| P3 | 解题步骤 / 笔记本风格 / 图形 | 不做（差异化交给 Desmos；首版明确不做图形/分步） |

### Module inventory (picker tiles)
`basic` · `scientific` · `programmer` · `units`(+实时汇率) · `date` · `chemistry` · `advanced` · `loan` · `tax` · `kin` = 10 tiles. History is NOT a picker tile (it's a view, reachable via TabBar inside any calculator).

---

## 2. Feature Specs

### 2.1 化学式配平器 (`src/chemistry/balancer.ts` + `src/components/ChemBalancer.tsx`)
- **输入：方案 A 纯文本**（单行输入框 + 配平按钮）。语法：`H2 + O2 -> H2O`。支持括号 `Ca(OH)2`、水合物 `CuSO4·5H2O`（`·` `⋅` `∙` `.`）、离子电荷 `Fe2+` / `SO4^2-` / `Na+` / `Cl-`、箭头 `->` `=>` `=` `<->` `<=>` `⟶` `⇌` `↔`。
- **化合物分隔符**：` + `（加号前有空白）。这样电荷 `+`/`-`（紧贴 token，无前置空白）不会被误判为分隔符。
- **配平算法**：构建元素/电荷守恒矩阵 A（反应物正、生成物负），求 `A·x = 0` 的最小正整数解。**用精确有理 RREF**（整数分数 + gcd 归约），不是浮点零空间 + 舍入。电荷作为矩阵额外一行，离子方程自动平衡。
- **结果 UI**：高亮系数（`data-coefficient`）+ 化学式渲染下标/上标（`<sub>`/`<sup>`）+ 原子守恒表 + 电荷守恒行。
- **错误码**：`EMPTY` / `SYNTAX` / `NO_SOLUTION`（元素不守恒或系数为 0）/ `AMBIGUOUS`（零空间 >1 维，混入多个独立反应）。
- **P1 留作**：元素芯片键盘（方案 B）。

### 2.2 高等数学计算器 (`src/advanced/cas.ts` + `simplifyWorker.ts` + `src/components/AdvancedMath.tsx`)
- **7 个 Tab**：解方程 / 求导 / 积分 / 极限 / 级数 / 矩阵 / 逻辑。
- **mathjs 14 原生能力直接用**：`derivative`（CAS 求导，n 阶）、`simplify`、`rationalize`、`parse().toTex()`、矩阵 `det/inv/transpose/eigs/lusolve`、逻辑 `and/or/not/xor`。
- **mathjs 没有的**用数值/基于导数的方法补：
  - 解方程 = 数值求根（范围内采样 + 二分，`h = LHS - RHS`）。
  - 积分 = 数值定积分（Simpson，1000 区间）；符号不定积分标"暂不支持"。
  - 极限 = 数值双侧逼近（缩 ε；`x->∞` 用大数采样）。
  - 级数 = Taylor（重复求导取系数 `f^(k)(a)/k!`）。
  - 矩阵补 `rref`（自实现）、`trace`。
  - 逻辑 = 真值表（自动识别变量，枚举组合）。
- **渲染**：KaTeX（`parse().toTex()` + `katex.renderToString`，display mode，`throwOnError:false`）。结果同时输出 `data-text` 明文镜像供 e2e 断言（KaTeX HTML 用 U+2212 减号，直接断言文本不可靠）。
- **simplify 500ms timeout**：`simplifyAsync` 在 Vite module worker（`simplifyWorker.ts`）里跑 `math.simplify`，超时则 terminate worker + 回退同步路径。无 Worker 环境（Node/smoke）直接走同步。求导用此路径。
- **不做**：图形 / 分步推导（P3）。

### 2.3 贷款 (`src/loan/engine.ts` + `src/components/Loan.tsx`)
- **两种还款方式**：等额本息 / 等额本金。
- **IRR 反推**：Newton 迭代求月利率，揭露砍头息（自动检测）。
- **提前还款对比**：缩短年限 vs 减少月供（`PrepayStrategy`）。
- 纯函数，不经过 engine；金额用 Number（分期表 ≤360 行，本金远在 2^53 内）。CNY，月供/利息保留 2 位，总额取整。

### 2.4 个税 (`src/tax/engine.ts` + `src/components/Tax.tsx`)
- **综合所得年度表**（7 档，3%-45%）+ **月均表**（年终奖单独计税用，7 档独立速算扣除数，非简单 ÷12）。
- 起征点 60,000 ¥/年（2026-07 snapshot，详见 `ANNUAL_BRACKETS` / `MONTHLY_BRACKETS`）。
- **7 项专项附加扣除**：子女教育 / 3 岁以下婴幼儿照护 / 继续教育 / 大病医疗 / 住房贷款利息 / 住房租金 / 赡养老人。
- **年终奖双轨试算**：同时算"单独计税" vs "并入综合所得"，自动推荐最优。
- 到手月薪反推税前。金额 CNY；档位下含上不含（match 税务总局口径）。

### 2.5 亲戚称呼 (`src/components/Kin.tsx`)
- **库**：`relationship.js`（mumuy），**仅亲属模块用**，不引入其它数学库。
- 输入框 + 10 个快捷 chip（父/母/兄/弟/姐/妹/夫/妻/子/女），"的"字连关系链。
- **三区域**：default（普通话）/ 北方 / 粤语（`KinMode`）。
- "reverse" 切换：对方称呼我。不做家族树。

### 2.6 实时汇率 (`src/units/engine.ts`，扩展 Units 的 currency 子视图)
- **数据源链**（按序兜底）：
  1. `https://api.frankfurter.dev/v1/latest?base=USD`（主，ECB EOD，无 key）。
  2. `https://open.er-api.com/v6/latest/USD`（兜底，166 货币）。
  3. LocalStorage 24h 缓存。
  4. 打包的 `src/data/rates.json`（`BASELINE_RATES`，离线最后兜底）。
- UI：Units 货币子视图 + "刷新"按钮 + 源标签（`getCurrencySource()`）。
- `RatesSource = 'frankfurter.dev' | 'open.er-api.com' | 'cache' | 'bundled' | 'none'`。

### 2.7 既有模块（科学 / 日期 / 单位换算 / programmer / basic）
- **科学 = 初等数学计算器**（`Keypad.tsx` scientific 模式 + engine `evaluate()`，三角/对数/幂/阶乘，DEG/RAD）。
- **日期**（`DateTime.tsx`）：差值 / 加减 / 星期；UTC 正午锚点避免 DST 偏移。
- **单位换算**（`Units.tsx` + `units/engine.ts`）：长度/质量/体积/温度/数据/货币；mathjs unit math + 静态/实时汇率。
- **programmer**（`Programmer.tsx` + `engine/programmer.ts`）：BigInt QWORD 精确，HEX/DEC/OCT/BIN，位运算，字宽 8/16/32/64。
- **basic**：加减乘除 + Apple 风格 percent/negate。

### 2.9 TGC-24 layout polish
- Calculator keys use container gaps instead of per-button margins, preventing outer-edge overflow and overlapping hit areas while preserving consistent Apple-style spacing.
- Display expression and result share balanced vertical padding so short results do not leave excessive empty space and long results do not crowd the keypad.
- Scientific mode keeps the TGC-23 orientation lock and desktop aspect-ratio behavior unchanged; its keypad layout remains scroll-safe when the available height is constrained.

- **顶栏选择栏删除**：计算器页内不再渲染 `TabBar`（旧的 11 个 mode chip + DEG/RAD pill），改用首页 `CalculatorPicker` 作为唯一的模式选择入口。右上工具栏仅保留：返回首页 / 横竖屏 / 长宽比（仅 PC）/ 角度（仅 scientific）/ 语言 / 主题 / 同步。模式切换路径：返回首页 → 选 tile → 进入；或 Ctrl/Cmd+1..6（保留键盘快捷方式）。
- **科学计算器强制横屏**：`applyOrientationForMode('scientific')` 调 `screen.orientation.lock('landscape')`；iOS Safari 不支持时显示可点 hint 让用户手动旋转；PC 已是横向，跳过 lock 避免误报 hint。Ctrl/Cmd+2 也走同一个 hook（见 §3.9）。
- **电脑端长宽比锁定**：`@media (min-width: 1024px)` 下 `.shell[data-aspect='locked']` 强制 9/16 长宽比（手机壳样式），避免 PC 拖动窗口时计算器被拉变形。默认 ON，用户可用工具栏"长宽比" Pill 关闭；状态写 `calc:aspect-locked` localStorage。
- **一键切换横竖屏（移动+PC）**：工具栏右上 `toggle-orientation` Pill **同时**在 mobile 和 PC 显示。
  - 移动端：`orientation.toggle()` 调 `screen.orientation.lock(target)`；iOS Safari / 桌面浏览器不支持时降级为 no-op（不报错）。
  - PC 端：因为 `screen.orientation` 不可用，按钮改为 toggle `aspectLocked`（locked=9/16 竖屏壳 / unlocked=横向 480px 列）。这给用户一个"PC 上也能横竖切换"的真实视觉效果，与长宽比 Pill 行为一致但语义不同。
- **数字显示字号动态**：`--display-fs` 由 `clamp(56px, 9.5vw, 100px)` 提供基于视口的流体大小（最小值从 48 提到 56，读数更清楚）。当结果超长（多位数小数、错误信息等）时，`Display.tsx` 的 `useAutoShrinkFont` 用 `useLayoutEffect` 测量 `scrollWidth > clientWidth` 并按 0.9 倍率循环缩小直到合入，单次 effect 同步执行不触发 re-render。横屏 (`max-height: 500px`) 阈值降为 `clamp(32px, 8vh, 56px)`。

### 2.10 TGC-25 accessibility and touch-input polish
- The calculator toolbar is horizontally scrollable and its pills never shrink, so Home, History, Rotate, aspect, locale, theme, and sync controls remain reachable on narrow screens. The former ambiguous arrow is a labeled Rotate control.
- History is reachable through a visible clock button from the picker and every calculator view; it remains a view rather than a picker tile.
- The basic expression editor keeps long input inside the display width and scrolls horizontally with the cursor instead of overflowing the shell.
- Tax numeric fields expose a sticky in-app decimal keypad for touch users. It edits whichever field most recently received focus and provides digits, decimal point, backspace, and clear.
- Chemistry provides a formula keypad with common elements, operators, parentheses, hydrate dot, an arrow, and visually subscripted digit keys that insert parser-compatible ASCII counts at the current cursor.

### 2.11 TGC-25 orientation/landscape/aspect root fixes (#6/#7/#8)
- **#6 科学强制横屏（CSS 旋转，非 Screen Orientation API）**：`screen.orientation.lock()` 在 iOS Safari 完全不可用，在其它移动 web 需 fullscreen（常被拒），所以旧的 lock+hint 方案从不生效、"tap here for landscape" 点了没反应。根因修复：scientific 模式在**非桌面、phone tier、物理竖屏**时，给 shell 加 `data-force-landscape='true'`，CSS 把 shell `position:fixed` + `width:100dvh`/`height:100dvw` + `transform: rotate(90deg) translateY(-100%)`（数学：点 (x,y)->(H-y,x)，恰好覆盖 0..100vw × 0..100vh），指针事件由浏览器自动重映射（实测点 Sine 插入 `sin(`）。web 不再尝试 lock（避免无意义 fullscreen）；native 仍先试真 lock，失败则 CSS 旋转兜底。`Modal` 改用 `createPortal(document.body)` 以免被旋转 shell 的 transform 拑为 containing block。
- **#7 横屏显示区被遮挡**：landscape 下 scientific 键盘 8 行 + toolbar 超出短视口高度；display-area 原内联 `minHeight:0` 让 flex 把它压到 0px（实测 iPhone13 landscape scientific 显示区 = 0px）。根因修复：`.display-area` 默认 `min-height:0`，但在 `@media (orientation:landscape) and (max-height:500px)` 下 `min-height:22vh`、在 `[data-force-landscape='true']` 下 `min-height:22vw`（旋转后高度=物理宽度，故用 vw 镜像 vh）。键盘本就 `overflow:auto`，现在改为内部滚动而非吃掉显示区。
- **#8 电脑端长宽比锁**：两处根因。① CSS 数学错：旧规则 `width:100%`+`max-width:480`+`aspect-ratio`+`max-height`，当 `max-height` 封顶高度时 `aspect-ratio` 无法回缩**显式 width**，比例漂到 ~0.64（实测 1200×800 下 480×752=0.638，应为 0.5625）。修复：`width: min(480px, calc((100vh - var(--s-12)) * 9 / 16))`，width 与 max-height 同锚 `(100vh - s-12)`，故 width/max-height 恒为 9/16。② 门槛错：desktop 列 + 锁定原用 `@media (min-width:1024px)` / `tier==='desktop'`，但 Tauri Mac 默认窗口 420×720 永远 <1024 -> 锁与 Pill 都不出现。修复：改用 shell 属性 `data-desktop = isTauri || tier==='desktop'` 驱动（Tauri 任意宽度都算桌面），`aspectLocked` 默认 ON 也含 `isTauri`。

### 2.12 TGC-26 #4 rotate button root fix（↻ 驱动 CSS，不挂死的 Screen Orientation API）
- **根因**：`↻` 旋转按钮的 onClick 在非桌面分支调 `orientation.toggle()` -> `screen.orientation.lock()`，而该 API 在 iOS Safari 完全不存在、在其它移动 web 需 fullscreen（常被拒），所以在 web 上是 no-op--用户点 ↻ 没反应（"rotate键不生效"）。§2.11 #6 已为 scientific 的**自动**横屏改用 CSS 旋转，但那个修复没覆盖到**手动** ↻ 按钮，按钮仍挂在死的 API 上。桌面分支另用 `isDesktop`（`platform.ts` 静态常量，768px 门槛、模块加载时算一次）而非 `dataDesktop`（`isTauri || tier==='desktop'`，1024px、响应式），与 aspect CSS 的 gate（`.shell[data-desktop='true']`）不一致：768-1023px 窗口下 `isDesktop=true` 翻了 `aspectLocked` 状态但 `dataDesktop=false` CSS 不应，视觉无变化。
- **修复**：① 非桌面 web 分支改为 toggle `rotated` 状态（驱动 `[data-force-landscape]` CSS 旋转），不再调死的 `orientation.toggle()`；进入 scientific 在 phone 上 auto-set `rotated=true`（保留 TGC-24 #6 自动横屏），↻ 按钮可手动覆盖任意模式。② 桌面分支 gate 从 `isDesktop` 改为 `dataDesktop`（与 aspect CSS 同锚、响应式）。③ native 移动仍用真 `orientation.toggle()`（Capacitor 上可用）。④ 删掉死的 `sciLockFailed` + "tap here for landscape" hint（它重试一个永远失败的 lock，是症状补丁；force-landscape CSS 现在恒生效，hint 永不显示）。
- **force-landscape 单一状态**：`forceLandscape = !showPicker && !isDesktop && tier==='phone' && rotated && orientation.orientation==='portrait'`。`rotated` 是用户/应用的旋转请求：scientific 进入时 auto-set、↻ 按钮手动 toggle、退出 picker / 切非 scientific 时清零。物理横屏时 `orientation==='landscape'` 让 forceLandscape 自动关（避免 native 真 lock + CSS 双重旋转）。

### 2.13 TGC-26 calculator isolation and input polish
- Narrow-view toolbars wrap all controls onto visible rows instead of hiding controls behind an undiscoverable scrollbar.
- Basic/scientific expression and result stay adjacent; the result no longer uses an auto margin that creates empty vertical space.
- Chemistry input uses three switchable touch-keyboard pages: digits, the complete Latin alphabet, and parser-supported symbols including grouping, hydrate, charge, reaction, and equilibrium tokens.
- Calculator components remain mounted while switching modes so each calculator keeps its own temporary input. Basic/scientific reducer drafts and history views are scoped by calculator; legacy unscoped history belongs to Basic.

### 2.14 TGC-27 long-expression wrap + transform containment fixes
- **#1 菜单/弹层被遮根因**：picker/units/programmer/chem 的 `ChipSegment` 用 `flex-wrap: wrap` + `overflow: visible` 取代 `overflow-x: auto`（隐藏滚动条 + 卡片 `overflow: hidden`），窄视口（phone-portrait + 9:16 锁定壳、旋转 scientific）下分类标签不再被右切。`.app-toolbar` 同上：wrap + visible，所有 pill 直接可见。`.shell[data-desktop='true']` 与 `.shell[data-force-landscape='true']` 把 `overflow: hidden` 换成 `clip-path: inset(0 …)`，保留圆角阴影但允许 `<select>` / 下拉 / native 弹层溢出 containing block。
- **#2 长输入多行换行根因**：`Display.tsx` 把 expression 从 `<input>` 换成 `<textarea>`（readOnly、自动 `height = scrollHeight` 撑高），`whiteSpace: pre-wrap` + `wordBreak: break-all` + `overflowWrap: anywhere`，70+ 数字直接折行铺满多行，删掉"强制 1 行"的 `useLayoutEffect` 0.4× 自动收缩。result 也改为 `overflow-wrap: anywhere` + `word-break: break-all`，允许数字结果自然换行，不再被压成 0.4× 字号。
- **#2 follow-up：长结果画到 keypad 上**（Tester 在桌面 aspect-locked basic 抓到的回归）。`#2` 删除 auto-shrink + result 允许多行折行 + `.display-area` 从 `overflow:hidden` 释放（为 #1 弹层留出空间），三者叠加导致：长数字 result 在桌面 9:16 锁定壳里折 3 行 ≈ 315px，而 display 列只有 ~150px，结果文字直接画到 keypad 上（hit-test 还在 keypad 上、视觉污染）。根因修复：`.display-area` 的内部 `<Display>` 包装加 `overflow:hidden`（children 不会画到 keypad），result 改 `flex:1 1 0` + `minHeight:0` + `overflow-y:auto`（超出列内空间就在 result 内部滚动），expression textarea 的 JS auto-grow 在撑高超过 display 列 50% 时也 cap 到 50% 并翻 `overflow-y:auto`（同样内部滚动，绝不向下推）。保留 `.shell` 的 `clip-path`（#1 弹层释放不回归）。

---

## 3. Improvement & Pitfall Specs（重点 - 避免重犯）

> 每条都是已踩过的坑。新代码必须遵守，review 时对照检查。

### 3.1 全局 keydown 劫持（`src/App.tsx` `handleKey`）
- **坑**：window 级 `handleKey` 对 `0-9 . , + - * / ( ) ! ^` 及字母一律 `preventDefault()` + `calc.insert()`，只放过基础计算器的 `aria-label="Expression"` 输入。其它 Tab 的 `<input>/<textarea>` 打字被吞 + 串到基础计算器。`fill()` 不暴露（直接设 value），`type()` 才暴露。
- **规约**：非基础计算器的文本输入框聚焦时 `handleKey` 必须早退。`isEditableFieldTarget(t)` = `HTMLInputElement`（且 `aria-label !== 'Expression'`）|| `HTMLTextAreaElement`，在 `handleKey` showPicker 分支后、Enter/Backspace/数字路由前 `return`。
- **基础计算器不能破**：Expression 输入是 readOnly，依赖 `handleKey` 路由 `calc.insert()` + Enter 求值，故被 `isEditableFieldTarget` 排除，TGC-20 的 Enter/Backspace/Escape 跳过逻辑保留。新增输入型模块自动受此 guard 保护，无需各自 patch。
- **回归测试**：用 `page.keyboard.type()`（不是 `fill()`）验证输入完整不丢字；同时基础计算器 `type('2+3=')->5` 不回归。

### 3.2 Chip 组件 `testId` prop vs `data-testid`
- **坑**：React 对未知 DOM prop 静默丢弃。如果组件没把 `testId` 显式映射到 `data-testid`，e2e `getByTestId` 找不到。
- **规约**：`Chip` / `ChipSegment` 等组件必须 `data-testid={testId}` 透传（见 `src/components/Chip.tsx`）。新增可点选组件若带 `testId` prop，必须同样透传。e2e selector 优先 `getByTestId`。

### 3.3 汇率源 CORS / 域名迁移
- **坑**：`api.frankfurter.app` 现在 301 重定向（CORS 失败）；`exchangerate.host` 403。两者已弃。
- **规约**：主源用 `api.frankfurter.dev`，兜底 `open.er-api.com`。换源前必须浏览器实测 live（CORS + 返回结构），不要只看文档。`open.er-api.com` 返回 `{ result: 'success' | 'error', rates }`，只认 success。

### 3.4 LUP/RREF 浮点舍入对大系数氧化还原的坑
- **坑**：化学配平用浮点零空间 + 舍入，在大系数反应（如 `KMnO4 + HCl -> ...` = `[2,16,2,2,8,5]`）上会算错。
- **规约**：化学配平用**精确有理 RREF**（整数分数 + gcd 归约），不用浮点。任何涉及整数解的线性代数优先有理数运算。

### 3.5 `simplify` 启发式卡顿
- **坑**：mathjs `simplify` 是启发式，病态输入可能挂死主线程。
- **规约**：暴露给用户输入的 simplify 必须走 Web Worker + timeout（500ms）兜底回退同步。同步路径加输入长度 guard（≤400 字符）。

### 3.6 engine 契约锁定
- **坑**：`src/engine/index.ts` 的 `evaluate(expr, options?)` 签名是 UI 依赖的锁定契约，改签名会破全部模式。
- **规约**：`engine` / `history` / `sync` 是公开契约，**签名不改**（改了至少 minor bump）。新计算模块走独立子模块（`src/chemistry/`、`src/advanced/`、`src/loan/`、`src/tax/` 等），不路由进 `evaluate()`（除非本就是 basic/scientific 表达式求值）。mathjs 实例各模块可自建（如 `units/engine.ts`、`advanced/cas.ts` 各自 `create(all)`），避免互相污染（trig DEG/RAD override 等）。

### 3.7 `CURRENCY_UPDATED_AT` / `SOURCE` 用 getter 非 const 捕获
- **坑**：`setLiveRates()` 改 `liveRatesUpdatedAt` / `liveRatesSource`，但若用 `const` 字符串在模块加载时捕获一次，live fetch 后 UI 永远显示旧的 snapshot 时间/源。
- **规约**：用 getter 函数（`getCurrencyUpdatedAt()` / `getCurrencySource()`）读当前闭包状态。任何会被运行时 mutate 的导出值都用 getter，不用 const 快照。

### 3.8 KaTeX 渲染断言
- **坑**：KaTeX 渲染的 HTML 用 U+2212（数学减号）不是 ASCII `-`，`innerText` 断言数字会偶发失败。
- **规约**：结果组件输出 `data-text` 明文镜像供 e2e 断言；不要直接断言 KaTeX 渲染 HTML 的文本。

### 3.9 模式切换要走 orientation 包装（不是裸 setMode）
- **坑**：TabBar 删了之后只剩 `useKeyboardExtras` 调 `calc.setMode`（裸 dispatch，不触发 `applyOrientationForMode`）。Ctrl/Cmd+2 进科学模式 → 表达式窗口看起来是科学，但屏幕没有自动横屏锁定，违反 §2.8。
- **规约**：所有跨模式切换（TabBar 时代是 `handleModeChange`、未来 picker / 快捷键）必须经过 App 的 `applyOrientationForMode` 包装。`useKeyboardExtras` 接受 `onModeChange` 回调，App 把 `handleModeChange` 注入。直接 `calc.setMode` 只用于同 mode 内部状态（如科学模式里切 DEG/RAD）。

### 3.10 动态字号收缩要同步测量，不能用 ResizeObserver 的异步回调
- **坑**：结果超长时，用 `ResizeObserver` 异步缩字号会让第一帧先以 96px 渲染溢出再触发二次 layout，肉眼能看见"砰"地一下缩回去。e2e 拿 `scrollWidth > clientWidth` 断言时也会偶发抓到中间帧。
- **规约**：`Display` 用 `useLayoutEffect` 同步跑"先清空 fontSize -> 测量 -> 若溢出按 0.9 折"循环。一次性同步测完，避免动画感。错误状态 clamp 到 22px 上限、不参与自动收缩（错误信息字号固定为小号红字）。

### 3.11 web 上"强制横屏"不能用 Screen Orientation API
- **坑**：`screen.orientation.lock()` 在 iOS Safari 根本不存在该方法；其它移动 web 需先 `requestFullscreen()`（常被拒/打断），所以 lock 永远 false。旧实现失败后弹"tap here for landscape"hint，hint 再调 lock 仍 false -> 用户点了没反应（TGC-25 #6 被报两次"仍未生效"）。
- **规约**：web 上要"强制横屏"只能用 CSS 旋转 shell（`transform: rotate(90deg) translateY(-100%)` + `width:100dvh`/`height:100dvw`，见 §2.10 #6），不要依赖 Screen Orientation API。web 分支直接跳过 lock 调用（避免无意义 fullscreen 闪烁）。native（Capacitor）仍可先试真 lock，失败再 CSS 旋转兜底。任何 `position:fixed` 子元素（如 `Modal`）必须 portal 到 `document.body`，否则旋转 shell 的 transform 会让它以旋转后的 shell 为 containing block 而错位。

### 3.12 `aspect-ratio` + 显式 width + max-height 会漂比例
- **坑**：`.shell { width:100%; max-width:480px; aspect-ratio:9/16; height:auto; max-height:calc(100%-48px) }`——`aspect-ratio` 只能推导 **auto** 那一维。width 是显式（100%/480），height 由 width 推出；当 `max-height` 把 height 封顶时，`aspect-ratio` **不会**回缩显式 width，比例从 0.5625 漂到 ~0.64（实测 1200×800 得 480×752）。
- **规约**：要恒定比例且双向受限于 max-width 与 max-height，把 width 直接写成可用高度的函数：`width: min(maxW, calc((100vh - margin) * W/H))`，让 width 与 max-height 同锚于可用高度，则 width/max-height 恒 = W/H。e2e 用 `getBoundingClientRect` 断言 `|ratio - W/H| < 0.01`，不要只断 `data-aspect` 属性（属性对、几何错的情况测不出来）。

### 3.13 桌面壳布局别用 `min-width` 媒体查询当门槛
- **坑**：desktop 列（居中 480 圆角阴影）+ 长宽比锁原用 `@media (min-width:1024px)` / `tier==='desktop'`。但 Tauri Mac 默认窗口 420×720（minWidth 360），永远 <1024 -> 桌面壳样式与锁定 Pill 都不出现，Mac 上"长宽比锁不生效"。
- **规约**：桌面壳布局/锁定门槛用 shell 属性 `data-desktop = isTauri || tier==='desktop'`（CSS 用 `.shell[data-desktop='true']`），让 Tauri 任意窗口宽度都算桌面。`aspectLocked` 默认 ON 的条件也要含 `isTauri`。判定"是否桌面级设备"用平台标志（isTauri），不要用像素宽度（会漏掉默认窗口小的桌面 app）。

### 3.14 flex 子项 `min-height:0` 在短视口会压塌显示区
- **坑**：竖排 flex 容器里 display-area 用 `flex:1; minHeight:0` 让它可缩；landscape 短视口下 scientific 键盘 8 行自然高 > 视口，flex 把 display-area 压到 0px（实测 0px），显示区被完全遮挡。
- **规约**：可滚动键盘（`overflow:auto`）+ 显示区共存时，给显示区一个视口比例下限（`min-height: 22vh` 物理横屏 / `22vw` CSS 旋转横屏），让键盘在剩余空间内滚动而非吃掉显示区。`minHeight:0` 只在"需要让位给另一个固定高元素"时用，且要确认该元素本身有 floor。

### 3.15 手动旋转按钮不能挂在死的 Screen Orientation API 上
- **坑**：§2.11 #6 把 scientific 的**自动**横屏改成了 CSS 旋转，但 `↻` 旋转按钮的 onClick 仍调 `orientation.toggle()` -> `screen.orientation.lock()`。该 API 在 iOS Safari 不存在、在其它移动 web 需 fullscreen（常被拒），所以按钮在 web 上是 no-op--用户点 ↻ 没反应（TGC-26 #4 被报"rotate键不生效"）。e2e 只断言按钮存在 + 文案是"↻ 旋转"，不断言点击效果，所以这个死按钮漏过了 645 passed 的回归。
- **规约**：web 上任何"旋转/横屏"的用户操作都驱动 CSS `[data-force-landscape]`（`rotated` 状态），不要调 `screen.orientation.lock`。native（Capacitor）才用真 lock。桌面旋转按钮的 gate 用 `dataDesktop`（`isTauri || tier==='desktop'`，与 aspect CSS 同锚、响应式），不要用 `platform.ts` 的静态 `isDesktop`（768px 门槛、加载时算一次，会与响应式 CSS 漂移）。e2e 必须断言点击 ↻ 后 `data-force-landscape`/`data-aspect` 翻转，不能只断言按钮存在。

### 3.16 多行折行的 result/textarea 必须有高度上限，不能让 display 列"自由生长"
- **坑**：TGC-27 #2 把 `result` 从 1 行 auto-shrink（0.4× 压字）改成允许多行折行（`overflow-wrap:anywhere` + `word-break:break-all`），同时 `expression` 从 `<input>` 换 `<textarea>` + `height = scrollHeight` 自动撑高。两者单独看都 OK，但叠加 + #1 把 `.display-area` / `.shell` 从 `overflow:hidden` 释放（为了让 `<select>` / `<details>` 弹层能溢出 containing block）后，桌面 aspect-locked basic 长算式（如 `1234567*8910111`）的 result 在 100px 字号下折 3 行 ≈ 315px，而 display 列实测只有 152px -> `.display-area` 的 `scrollHeight=369` 而 `clientHeight=152` -> 结果文字**画到 keypad 上**（hit-test 不受影响，因为 keypad 仍在上层，但视觉上"结果叠在 AC、%、÷、× 按键上"）。回归原例：`.display-area` 152 / keypad 起 y≈152。
- **规约**：在 `<Display>` 内部给 expression textarea 和 result 各自加列内高度上限 + 内部滚动，绝不让它们把高度外溢到 display 列之外。`result` 改 `flex:1 1 0` + `min-height:0` + `overflow-y:auto`（吃 expression 留下的剩余空间，超出就在 result 内滚动）。textarea 在 JS useEffect 里 auto-grow 时 cap 到 display 列的 50%（`column.clientHeight * 0.5`），超过则把 `height` 写死成 cap 并翻 `overflow-y:'auto'`。Display 包装层加 `overflow:hidden`（兜底，children 即使再次引入也会被裁在列内）。**绝不能简单把 display-area 的 `overflow` 改回 `hidden` 解决**——那样 `#1` 的弹层释放会被改回去，picker / units / programmer / chem 的 `<select>` 弹层、`<details>`、chip-segment 又会被壳裁切。e2e 必须断言：长结果时 result 的 `clientHeight ≤ display-area.clientHeight`、keypad 元素 `getBoundingClientRect().top ≥ display-area.getBoundingClientRect().bottom`。

---

## 4. Tech Stack Constraints

- **mathjs@14** 是唯一数学库（CAS、矩阵、单位、求导）。不引入其它数学/符号库。
- **KaTeX** 渲染数学（`parse().toTex()` + `katex.renderToString`）。不用 MathJax。
- **relationship.js** 仅亲戚称呼模块用。
- **UI 壳**：`Tab` + `Panel`（`src/components/Chip.tsx` + `Panel.tsx`）。新模块沿用 `ChipSegment` sub-tab + `Panel` 卡片 + `.ui-field` 输入样式，不自造样式系统。设计 token 全走 `src/styles/tokens.css`（颜色/间距/圆角/动效），不内联 hex。
- **错误码契约**：各模块返回稳定 `errorCode` 供 UI 分支 + e2e 断言。基础 engine：`UNCLOSED/PAREN/MISSING_OPERAND/UNKNOWN_SYMBOL/NOT_FUNCTION/CONVERT/ENGINE`（programmer 加 `INVALID_DIGIT/DIV_ZERO/SYNTAX`）。化学：`EMPTY/SYNTAX/NO_SOLUTION/AMBIGUOUS`。高数：`SYNTAX/DOMAIN/DIV_ZERO/UNSUPPORTED/ENGINE`。
- **i18n**：所有可见文本 + aria-label 走 `t()`（`src/i18n/zh.ts` 为权威源，`en.ts` 1:1 镜像）。zh 缺键回退 zh，最后回退 key 本身。
- **平台**：web PWA + Capacitor (iOS/iPadOS/Android) + Tauri (macOS/Win/Linux)。SQLite history 后端按平台 picker（web=LocalStorage，Capacitor=@capacitor-community/sqlite，Tauri=plugin-sql），UI 不变。
- **测试**：`npm run typecheck`（0 错）+ `npm run smoke`（契约逻辑，tsx）+ `npm run build` + `npm run e2e`（Playwright，4 device projects）。新功能必须带 smoke 逻辑测试 + e2e（`getByTestId` 优先）。

---

## 5. Release Process（摘要，详见 [`AGENTS.md`](./AGENTS.md) → `RELEASING.md`）
- **四段版本号**：`大改版.小改版.重大问题修复.小问题修复`（`MAJOR.MINOR.HOTFIX.PATCH`）。每一次改动 → 一个 bump → 一个 release。
- `./scripts/release.sh` 一键发版（要求 main + 干净 + tag 唯一）。先 bump `package.json` version 的 PR squash-merge，再在 main 跑 release.sh。feature-branch 上的预发版用 `gh release create ... --prerelease` 手动发（详见 `RELEASING.md` §3b）。
- `engine` / `history` / `sync` 签名是公开契约：新增参数 = minor，去掉/改返回 = major，wrong-output 不动签名 = hotfix（详见 `RELEASING.md` §5）。
- 历史版本：
  - 0.8.0 = 9 模块全员首版（化学 #36 + 高数 #37 + 贷款/个税/亲戚/汇率 #38 + 既有科学/日期/单位/programmer）。
  - 0.8.1 = TGC-23 改进：顶栏 TabBar 移除 / 数字显示字号动态 / 横竖屏一键切换（移动+PC）/ 电脑长宽比保留。
  - **0.0.0.0** = 项目改用四段版本号方案的首版（自身仅 bump version + 文档 + 脚本）。同一 commit 5620679（即 0.8.1）的 UI 工作打上 v0.0.0.0 tag；后续每次改动在 main 上独立 bump + release。
