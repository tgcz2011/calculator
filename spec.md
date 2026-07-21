# Calculator - Project Spec

**This file is the single source of truth for every feature / requirement / improvement spec in this project. Read it before starting any work, and record every new spec here.** Purpose: stop the same problem being solved (or hit) twice, and stop wasted effort. (Mandatory rule in `AGENTS.md`.)

Last updated: 2026-07-21 · Version: 0.8.0 · Status: 9 requested modules shipped.

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

## 5. Release Process（摘要，详见 `AGENTS.md`）
- 严格 SemVer。`engine`/`history`/`sync` 签名改动至少 minor bump。
- `./scripts/release.sh` 一键发版（要求 main + 干净 + tag 唯一）。先 bump `package.json` version 的 PR squash-merge，再在 main 跑 release.sh。
- 0.8.0 = 9 模块全员首版（化学 #36 + 高数 #37 + 贷款/个税/亲戚/汇率 #38 + 既有科学/日期/单位/programmer）。
