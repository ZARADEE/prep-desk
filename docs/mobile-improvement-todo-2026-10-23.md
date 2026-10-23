# 手机端竞品调研与改进待办

调研日期：2026-10-23。我们的基线：`90b56e2eeb574ff154779aada2a9342a72f93bb5`。

**建议先做好三件事：打开就能接着学、长题也能单手操作、断线和换设备时能确认答案保存到了哪里。** 然后补齐微信小程序的复习、收藏和题面展示，最后加入与学习结果有关的小反馈。

这是一份待实施清单。`W` 指根目录扫码打开的手机网页，`M` 指 `if_wechatapps_clickhere` 原生微信小程序。两端能力分别核对，不把桌面端已有、手机网页已经复用的功能重新算成缺失。

## 1. 调研范围与证据

查看了 7 个独立项目：GitHub 6 个，Gitee 另有华创学习考试系统；学之思同时有 GitHub/Gitee 仓库，只算一个项目。核对官方仓库、选定提交的页面源码，以及能够取得的官方截图；未安装竞品、登录演示账号或完成真机交互测试。截图可证明页面摆放，源码可证明局部实现，均不能证明整条链路的运行质量。

版本与下载文件的校验值见 [证据索引](research/mobile-competitor-evidence-2026-10-23.json)。下文 `[S]` 为官方说明，`[C]` 为源码观察，`[V]` 为实际查看的官方截图，`[P]` 为我们的改进建议。

| 项目与来源 | 观察到的手机相关能力 / 布局 | 值得借鉴的位置 | 证据边界 |
| --- | --- | --- | --- |
| [学之思 XZS：GitHub](https://github.com/mindskip/xzs) / [Gitee](https://gitee.com/mindskip/xzs) | `[S/C/V]` 任务、固定/时段试卷、答卷记录；记录列表可区分“查看”和“去批改”。小程序使用底部导航，题目包含富文本 | 手机上的考试记录与待自评入口；按状态决定下一步 | 已看记录截图及考试源码；源码中有整卷长表单，不建议照搬其长页答题方式。官方截图包含旧日期，不代表最新运行界面。[E01] [E02] |
| [kesixin/dati：GitHub](https://github.com/kesixin/dati) | `[V]` 手机首页集中展示练习、错题、收藏、搜题等入口；答题图把收藏、答题卡、上一题、下一题放在底部，题面可见数学公式 | 底部操作区、独立收藏入口、快捷搜题 | README 第一组图实际是 PC 页面，已排除；仅第二组手机图作为布局参考。当前仓库页面与宣传图有差异，不能据此声称整套演示均可从此仓库复现。[E03] [E04] |
| [CS408-mini-program：GitHub](https://github.com/lonelyhty/CS408-mini-program) | `[C]` 继续刷题、今日目标、科目/年份/章节筛选，收藏、笔记、提示、刷题/背题切换，打卡日历与文案 | 首页继续入口、年份筛选、题目上下文笔记、可调整的小目标 | 首版项目；README 明确部分真题为索引、需联网补全文本。“二步提示”按钮实际只切换一块提示，不能称已验证多层教学提示。[E05] [E06] [E07] |
| [华创 castlestudy-uniapp：Gitee](https://gitee.com/hcwdc/castlestudy-uniapp) | `[C]` 答题页顶部倒计时，中间单题，底部固定前后题与答题卡；答题卡弹层；底栏处理安全区；课程目录与课程收藏 | 长题答题布局、弹层答题卡、资料与学习进度组织 | 读取了 Gitee 固定提交源码；官方截图外链返回 403，没有把截图当作已看过。其“收藏”抽查到的是课程收藏，不冒充题目收藏。[E08] [E09] |
| [AnkiDroid：GitHub](https://github.com/ankidroid/Anki-Android) | `[S/V]` 先回忆、再显示答案、再评级；评级区显示时间，支持撤销、手势、白板、字体调整、同步及导入导出 | 连续复习、手写草稿、误触撤销与本机数据管理 | 仓库截图为旧样式，只借任务结构；功能依据官方手册。我们 W 已有 FSRS、评级时间预览和撤销，需要优化操作路径；M 才需要补接。[E10] [E11] |
| [Habitica Android：GitHub](https://github.com/HabitRPG/habitica-android) | `[C/V]` 角色进度与任务列表同屏；任务有颜色、子项；升级反馈支持庆祝弹窗，也可按设置降级成轻提示 | 学习完成后的一次角色回应、任务子步骤、可关闭的庆祝 | 是任务激励参考，不能证明刷题学习效果。只借轻反馈，不引入整套角色经济或社交系统。[E12] [E13] |
| [Tomodoro：GitHub](https://github.com/shahriaarrr/Tomodoro) | `[C/V]` 计时页面主体突出剩余时间和开始/重置；时长选择使用底部滚轮面板，任务可完成/撤回，支持明暗主题 | 专注页减少控件、时长选择面板、完成反馈 | 官方 README 将通知标记为“soon”，本次不把通知算已具备；没有把原生 Android/iOS 能力直接等同小程序或浏览器能力。[E14] [E15] |

## 2. 我们真正缺什么

以下是本地源码核对结果；“待优化”不等于功能不存在。页面是否遮挡、触摸是否顺手仍需按第 7 节在真机验收。

| 能力 | W 手机网页 | M 微信小程序 | 结论 |
| --- | --- | --- | --- |
| 单/多选、主观题草稿、自评、继续练习、答题卡 | 已有 | 已有 | 优化位置、连续性与误触，不重做基础流程 |
| 整卷限时考试、快照、到时封卷、分值自评 | 已有 | 模板随机组卷后进入普通练习；未接同等考试生命周期 | M 的组卷不等于 W 的限时考试 |
| FSRS 到期队列、评级预览、撤销 | 已有，位于小题狂练内 | 未提供对应页面与调度链路 | W 前置入口；M 增量接入 |
| 收藏、错因、题目笔记、同知识点训练 | 已有解析后的复盘组件 | 未提供对应题目操作 | W 提高可发现性；M 补功能 |
| 数学公式与原版题面图片 | 已有网页渲染和题面预览；手机放大体验待验收 | 以文本显示，原版图片未移植 | M 的内容可读性是优先缺口 |
| 按题库/题型/章节筛选 | 已有 | 已有 | 增加快捷预设；跨题库全文搜题、直接按年份找题需另补 |
| 学习记录同步 | API 记录共用 SQLite；首页待办/目标约每 5 秒同步 | 默认配置为空；有可选状态桥接代码，但缺少成品连接/冲突处理流程 | 不能写成“两端都没同步”，也不能写成“小程序已完整同步” |
| 无电脑离线使用 | 当前依赖局域网电脑；未见完整 PWA 缓存、离线题包与作答队列 | 有离线文本题包与本机存储 | W 需要离线架构；M 要验证分包首次获取、资源完整性及升级行为 |
| 错题长期掌握状态 | 有错题记录、错因和复习基础 | `setAnswer()` 答对即移出错题；历史只保留最近约 500 次 | M 缺少“待复测/已掌握”与长期可恢复记录 |
| 手机上的数据备份/恢复 | 未见统一用户入口 | 未见统一用户入口 | 数据可带走与误清理恢复属于共同缺口 |
| 轻交互 | 已有题目反馈、计时状态等 | 已有按压变淡、进度条、答题卡状态、到点振动、专注暂停恢复 | 继续打磨，不把现有交互列为新增 |
| 手写草稿、学习成果驱动的陪伴成长 | 未见完整流程；网页能预览角色 | 未见 | 可作为第二阶段增量 |

本地证据：[导航与手机 CSS][L01]、[网页学习模块][L02]、[网页复盘][L03]、[网页考试][L04]、[小程序首页][L05]、[小程序答题模板][L06]、[小程序记录/同步][L07]、[小程序组卷][L08]、[扫码启动][L09]。旧版 [发展规划](product-roadmap-2026-10-15.md) 中的模考、手机接续已部分落地，本清单以本次基线为准。

## 3. 手机布局建议

### 首屏：让已有进度先出现

当前 M 把继续练习排在题库、题型、范围、题数和开始按钮之后；W 保留了较多桌面面板和模块导航。[L01] [L05]

建议首屏按以下顺序组织，延续项目的硬边框、平面色块和短标签：

| 顺序 | 内容 | 操作 |
| --- | --- | --- |
| 顶部一行 | 日期 / 今日计划，右侧简短的本机或同步状态 | 点状态可看保存详情 |
| 第一张主卡 | 有未完成练习时显示科目、进度、最后保存时间；没有时显示“来 5 题” | 一个明确主按钮“继续第 N 题”或“开始练习” |
| 第二行 | 到期复习数量、今日目标完成量 | 直接进入队列；没有到期任务时展示完成状态 |
| 第三行 | 三科入口、最近使用的范围 | 点按直接选中；详细筛选进底部面板 |
| 下方 | 组卷/考试快捷入口、今日待办 | 进入相应任务；低频设置放“更多” |

第一轮可保留现有四个底栏入口，先改善页面内部。待 M 到期复习接通后，将“错题”扩为“复习”，内部放到期 / 错题 / 收藏。W 手机导航单独评估，把低频模板编辑收进组卷的“更多”；桌面端导航不随手机调整。

### 答题：题面占主体，动作贴近底部

| 区域 | 建议布局 | 与当前实现的差别 |
| --- | --- | --- |
| 顶部 | 返回、题号/总数、考试剩余时间或练习保存状态 | 减少重复标题和大块介绍 |
| 中间 | 一道题、选项/草稿；题面图片点开全屏 | 长题自然纵向滚动，公式溢出在自身容器内处理 |
| 底部固定区 | 小按钮“答题卡”“收藏/标记”；一个主按钮“提交答案”或“下一题” | M 当前按钮位于正文末尾；W 多处操作随文档滚动 |
| 按需弹层 | 答题卡、筛选、字号、简短笔记 | 答题卡不把整篇题面往下顶；关闭后回到原滚动位置 |
| 提交后 | 对错与选项差异 → 解析 → 错因/加入复习 | 不自动滚到很远的位置，不把下一题推到长解析末尾 |

依据：dati 的手机答题截图、华创固定底栏及答题卡弹层源码。[E04] [E08] 这里借的是操作结构，颜色和组件继续使用我们自己的样式。

### 复习与专注：每个状态只突出一个下一步

复习页先给“现在到期 N 项 / 开始复习”；进入后是“回忆 → 看参考解 → 四档评级 → 下一项”。管理、历史、参数放二级入口。W 的评级时间预览和撤销保留；M 复用同样语义。[L02] [E10]

专注页主要显示任务名称、剩余时间、暂停/继续；时长设置只在开始前展开。结束后提供“完成任务 / 继续下一步 / 休息”。M 已有后台暂停与返回继续，不改成无法实现的系统锁机承诺。[E14] [E15]

## 4. 改进待办：先解决可读性、操作和保存

优先级：**P0** 为第一轮体验与数据可靠性；**P1** 为补齐手机学习流程；**P2** 为增强陪伴与表现。工作量 S/M/L 是相对复杂度，不是承诺工期。每项验收均为建议目标，尚未实测达成。

- [ ] **M01 · P0 · W/M · 首页前置继续练习与快捷开练（M）**

  将最后一场未完成练习放到筛选之前，显示进度和保存状态；新增“沿用上次范围，来 5 题”。**验收：**在 390×844 视口无需滚动即可继续；最多两次点击到达题面；没有记录和记录已完成时均有明确替代入口。参考 [E05]；改进 [L05]。

- [ ] **M02 · P0 · W/M · 固定答题操作栏与弹层答题卡（M）**

  长题页面的主动作固定在底部；答题卡可筛未答、标记、待自评，状态同时用文字/形状区分。**验收：**十屏长解析下仍可提交/下一题；跳题后关闭弹层、恢复焦点；最后一题保留未答提醒；不提前显示考试对错。参考 [E04] [E08]；保留现有答题卡功能 [L06]。

- [ ] **M03 · P0 · M 为主，W 优化 · 公式、题面图片与全屏查看（L）**

  M 补齐可读公式和原版题面，先支持当前练习需要的资源；W 增加适合手机的图片全屏/缩放入口。**验收：**抽取三科各 10 道含公式、图或表格的题，题面、选项、解析完整；图片失败可重试且不出现空白题；缩放时不触发换题。参考 [E01] [E04] [E11]。依赖资源清单；不要一次把所有原图硬塞进主包。

- [ ] **M04 · P0 · W/M · 保存状态与异常恢复（L）**

  区分“已存本机 / 待同步 / 已存电脑 / 保存失败”；草稿失败能重试，退出前给出可执行提示。W 整卷考试补本机待发送草稿恢复，M 将当前内存兜底状态持续可见。**验收：**断网、关闭页面、重新授权、重复提交后不悄悄丢答案、不重复计分；考试到时后补传按明示规则处理，不能改写已封卷成绩。改进 [L04] [L07] [L09]；同步交互参考 [E10]。

- [ ] **M05 · P0 · W/M · 小屏、安全区和键盘适配（M）**

  检查底栏安全区、长标签、软键盘、系统字体放大；W 的 66px 底栏和 34px 把握度按钮纳入手机专项调整。**验收：**360/390/430px 竖屏无页面级横向溢出，主要点击区目标至少 44 CSS px；M 按实际设备换算触摸尺寸；字号放大后按钮可操作，键盘弹出不挡输入/保存。参考华创安全区实现 [E08]；本地依据 [L01]。

- [ ] **M06 · P1 · M 增量，W 前置 · 题目收藏、错因与笔记（M）**

  在题目上下文提供收藏和短笔记，集中查看收藏、笔记与错因；W 复用已有保存接口。**验收：**收藏不算作答；离线笔记重进保留；从收藏/笔记返回题目时定位正确；保存成功与失败有反馈。参考 [E04] [E06]；W 已有实现 [L03]。

- [ ] **M07 · P1 · M 增量，W 优化 · 到期复习与连续评级（L）**

  M 接入既有复习模型，W 增加首屏直达；保持先回忆再显示答案、四档人工评级、下次时间和撤销。**验收：**同一张卡不会因重试被评级两次；操作后可连续下一项；不会把“答对”“很确定”自动换算成“轻松”。参考 [E10]；复用 [L02]。依赖 M04、M11；离线评级在 M12 的版本与对账规则就绪后开放。

- [ ] **M08 · P1 · M 为主 · 错题保留掌握轨迹与撤销（M）**

  将一次答对就移出的行为改为“待复测 / 复测通过 / 已掌握”的明确状态，保留错因和历史；用户可手动归档。**验收：**重答正确仍能找到原错题及笔记；移出/归档可撤销；复测计划不与 FSRS 重复建卡。参考 AnkiDroid 的撤销与复习思想 [E10]；当前行为见 [L07]。依赖 M07。

- [ ] **M09 · P1 · M 增量，W 补入口 · 整卷考试与记录中心（L）**

  M 区分普通练习和限时考试；W 增加直接找回进行中/已交卷/待自评答卷的入口。**验收：**试卷版本、截止时间、答案和分值一致；待自评单独显示；退出后可恢复；历史答卷不因题库更新被修改。参考 [E01] [E02]；W 已有生命周期 [L04]。依赖 M03、M04、M11。

- [ ] **M10 · P1 · W/M · 搜题、年份筛选与常用范围（M）**

  提供题干关键词/题号检索、科目与年份过滤；常用范围存成快捷项。知识点搜索继续保留，不把它等同全题库搜索。**验收：**可定位已知题号与一句题干；无结果时可清除范围；题目来源年份缺失时显示“未标注”；搜索结果不展示正在考试的隐藏答案。参考 [E03] [E06]。

- [ ] **M11 · P1 · W/M · 设备连接、同步队列与冲突处理（L）**

  给 M 的同步桥接增加正式连接入口；学习记录采用可去重的事件，待办按条目处理冲突，显示最后同步时间与待发送数量。**验收：**两台设备分别修改不同待办不互相覆盖；同一题离线作答后重试不重复记分；草稿冲突可选版本；更换扫码授权不删除本机记录。参考 [E10]，当前基础 [L07] [L09]。依赖 M04。

- [ ] **M12 · P1 · W/M · 可选下载的离线学习包（L）**

  提供科目/范围、题数、大小、版本、下载进度及删除入口；M 验证文本分包和图片离线完整性；W 先明确支持离线运行的部署入口，再做缓存。**验收：**下载完成后飞行模式重新打开并完成 20 题，恢复连接可对账；部分下载不可标“已离线”；升级保留学习记录。参考 [E10]。依赖 M03、M04、M11。当前手机 `http://局域网IP:8765` 不能直接视为可用 Service Worker 的环境，需 HTTPS 等可信来源方案；见 [平台条件][E16]。

- [ ] **M13 · P1 · W/M · 用户可操作的备份/恢复（M）**

  导出包含草稿、作答、错题、笔记、复习事件的个人备份；导入前展示版本、数量和合并规则。**验收：**清空测试设备后恢复数量与题目关联一致；损坏文件不覆盖当前数据；不把仅有题库 JSON 称作个人学习备份。参考 [E10]。依赖 M04、M11 的稳定数据标识。

- [ ] **M14 · P1 · W/M · 今日小目标与任务接入专注（M）**

  用户选择今天做 5/10/20 题或复习若干项，任务可直接开始对应练习/计时；只显示短摘要，不恢复已移除的大型学习记录面板。**验收：**已完成任务不重复结算；专注分钟与答题数分别统计；允许调整目标和休息日；中断后可继续。参考 [E05] [E07] [E14]。

- [ ] **M15 · P1 · W/M · 阅读偏好与低干扰模式（M）**

  增加字号、行距、明暗/纸张配色，设置跟随设备；错/对/标记除颜色外仍有符号和文字。**验收：**切主题和字号不丢当前答案，公式不被裁切；暗色题面图有清楚背景；动画与声音可独立关闭。参考 [E10] [E14]。

- [ ] **M16 · P2 · W/M · 手写草稿板（L）**

  从当前题打开轻量草稿板，提供笔、橡皮、撤销、清空确认；草稿与题目/会话绑定。**验收：**数学演算可在换题后找回，缩放/书写不串成翻题手势；清空可撤销。先做本机草稿，不把手写识别正确率或 AI 批改当作已具备。参考 AnkiDroid 白板 [E10]。

- [ ] **M17 · P2 · W/M · 分层提示与三分钟补弱（L）**

  在练习中按“概念提醒 → 关键一步 → 完整解”展开，并记录使用提示；错题可跳一个已有知识点/图解，再做同考点题。**验收：**考试模式不提供提示；提示后的答对与独立答对可区分；没有经审核提示时不伪造。参考 CS408 提示入口 [E06]，分层与补弱链是我们的扩展方案。W 复用现有知识点/图解；M 先完成 M03、M06。

## 5. 有趣的小交互：做成可验收的小任务

这一组中，竞品已有行为与我们的改编分别说明。震动/音效只作可选反馈，不影响无声音、无震动设备的操作。

- [ ] **M18 · P1 · W/M · 答题卡“当前位置”与进度到达反馈（S）**

  参考华创答题卡跳转 [E08]；在我们已有进度条上增加短暂定位高亮，完成一题后进度轻推一次。**验收：**反馈与已保存结果一致；不因刷新重复播放；减弱动画时立即更新；未答题仍可自由跳转。属于现有进度条的增强。

- [ ] **M19 · P1 · W/M · 收藏/归档后的撤销条（S）**

  参考 AnkiDroid 撤销 [E10]；收藏按压后图标填实并提示“已收藏”，归档显示可撤销提示条。**验收：**误点可恢复，连续操作撤销对象明确；“已保存”只在对应存储成功后显示。依赖 M06、M08；不得把修改已交考试答案当成可撤销练习动作。

- [ ] **M20 · P2 · W/M · 可选轻扫换题（M）**

  参考 AnkiDroid 可配置手势 [E10]；保留显式上一题/下一题按钮，轻扫只作快捷方式。**验收：**纵向滚动、选中文字、输入草稿、横向公式及图片缩放不换题；未提交选择/草稿不丢失；首题/末题轻提示，不循环跳转。

- [ ] **M21 · P2 · W/M · 学习搭子的一次完成回应（M）**

  参考 Habitica 升级反馈及其轻提示设置 [E12] [E13]；把我们现有角色用于“完成一组题 / 纠正一条错因”后的挥手或盖章。**验收：**一个完成事件最多回应一次；不挡解析或下一题；可关闭动效；挂机计时不自动算掌握，不因断签惩罚。

- [ ] **M22 · P2 · W/M · 今日学习小票（M）**

  参考 CS408 的目标、日历与可复制文案 [E07]；生成含真实题数、复习数、专注分钟的小票，可保存为图或复制摘要。**验收：**只统计真实完成事件；未授权时不自动分享；不夹带答案、笔记或连接凭据。图片排版是我们的新增方案，不宣称竞品已实现同样导出。

- [ ] **M23 · P2 · W/M · 休息时的轻呼吸节奏（S）**

  参考 Tomodoro 聚焦时间的布局 [E14]，新增低幅度呼吸动画作为可选休息反馈；保留剩余时间和跳过入口。**验收：**不改变后台计时，不强制看完动画；系统减弱动态效果时改为静态；M 原有到点振动只在必要事件触发。呼吸动画是我们的设计提案。

## 6. 建议执行顺序

| 批次 | 待办 | 完成后的用户体验 |
| --- | --- | --- |
| 第一轮：基本操作和可靠性 | M01、M02、M03、M04、M05；顺带 M18 | 首屏可接着学，长题能操作，题面可读，知道是否保存 |
| 第二轮：学习闭环 | 先 M06、M10、M11，再 M07、M08、M09、M13、M14、M15、M19 | 手机能收藏、复习、找卷、找题、接续和恢复数据 |
| 第三轮：随身学习 | M12；条件具备后 M16、M17 | 下载后真正离线用，支持演算及有记录的提示 |
| 第四轮：有趣且可关闭 | M20、M21、M22、M23 | 手势更省操作，完成更有反馈，休息更舒服 |

不优先移植企业课程商城、班级组织、付费会员、排行榜或多人公会。这些项目中有相关产品方向，但目前我们的核心任务是个人考研学习；优先把每次练习、复习和模考连接起来。大幅首页海报、自动播放轮播和强制庆祝弹窗也不作为默认布局。

## 7. 手机专项验收清单

- [ ] 在 Android Chrome、iPhone Safari、微信真机分别走适用流程；明确设备、系统、浏览器/微信版本，不能只用桌面缩窗替代。
- [ ] 360/390/430px、系统大字体、刘海/底部手势区、横竖屏、软键盘下检查布局；主要点击区目标至少 44 CSS px，实际 rpx 尺寸按设备核算。
- [ ] 各科各 10 道代表题，涵盖长材料、图片、宽公式、表格、多选、文字作答；确认题面与解析都能阅读。
- [ ] 从首页继续、切题、打开答题卡、保存草稿、收藏、复习评级、交卷、自评，每步有明确下一步与保存反馈。
- [ ] 断线、授权过期、双设备编辑、重复提交、刷新、进后台、时钟变化、存储失败；记录恢复结果，不只看成功提示。
- [ ] 新增动画可关闭；颜色不是唯一状态提示；错误提示不依赖振动；读屏能辨识选中项与主按钮。
- [ ] 离线能力单独以“飞行模式重新打开”验收；严格考试的离线与补交规则单独测试，不与普通练习混用。

## 8. 来源索引

以下为定位证据的入口。源码使用固定提交；外部截图与在线手册可能更新，获取日期与哈希另存于证据索引。截图版权仍属原项目，本仓库不重新发布竞品截图文件。

- **E01**：学之思 [README 与小程序功能](https://github.com/mindskip/xzs/blob/68571338efaea499e0aab6ae0895ba67316aebfb/README.md)、[小程序考试源码](https://github.com/mindskip/xzs/blob/68571338efaea499e0aab6ae0895ba67316aebfb/source/wx/xzs-student/pages/exam/do/index.wxml)。
- **E02**：学之思 [官方首页截图](https://www.mindskip.net/style/git/images/wx/student/2.png)、[答卷记录截图](https://www.mindskip.net/style/git/images/wx/student/5.png)、[记录页面源码](https://github.com/mindskip/xzs/blob/68571338efaea499e0aab6ae0895ba67316aebfb/source/wx/xzs-student/pages/record/index.wxml)。
- **E03**：dati [README 与截图分组](https://github.com/kesixin/dati/blob/26ba1d09243f627b7af1f5328cc32f47249035c0/README.md)、[手机首页截图](https://mamba-blog-images.oss-cn-shanghai.aliyuncs.com/2025-01-09/8c32e210d0193f27524b6b5667b7650e.jpg)。
- **E04**：dati [手机答题截图](https://mamba-blog-images.oss-cn-shanghai.aliyuncs.com/2025-01-09/802c77e0c66dc442e6d4a30ffc6ad361.jpg)、[仓库答题模板](https://github.com/kesixin/dati/blob/26ba1d09243f627b7af1f5328cc32f47249035c0/pages/dati/index.wxml)。
- **E05**：CS408 [首页源码](https://github.com/lonelyhty/CS408-mini-program/blob/76c2cc138733bb03391acbd38e3f41e781b5f20d/pages/dashboard/dashboard.wxml)。
- **E06**：CS408 [练习页模板](https://github.com/lonelyhty/CS408-mini-program/blob/76c2cc138733bb03391acbd38e3f41e781b5f20d/pages/practice/practice.wxml)、[提示与收藏逻辑](https://github.com/lonelyhty/CS408-mini-program/blob/76c2cc138733bb03391acbd38e3f41e781b5f20d/pages/practice/practice.js)。
- **E07**：CS408 [打卡目标、日历和文案](https://github.com/lonelyhty/CS408-mini-program/blob/76c2cc138733bb03391acbd38e3f41e781b5f20d/pages/checkin/checkin.wxml)。
- **E08**：华创 Gitee [答题页：固定底栏/弹层/安全区](https://gitee.com/hcwdc/castlestudy-uniapp/blob/9ef0fdee91e0ef777b7d9e36ebef6d3febc2809c/pages/exam/answer.vue)、[答题卡](https://gitee.com/hcwdc/castlestudy-uniapp/blob/9ef0fdee91e0ef777b7d9e36ebef6d3febc2809c/pages/exam/components/answer-card.vue)。
- **E09**：华创 Gitee [README](https://gitee.com/hcwdc/castlestudy-uniapp/blob/9ef0fdee91e0ef777b7d9e36ebef6d3febc2809c/README.md)、[课程收藏源码](https://gitee.com/hcwdc/castlestudy-uniapp/blob/9ef0fdee91e0ef777b7d9e36ebef6d3febc2809c/pages/mine/collect.vue)。
- **E10**：AnkiDroid [官方手册：学习、白板、撤销、手势、同步及备份](https://docs.ankidroid.org/)。
- **E11**：AnkiDroid [仓库评级页截图](https://github.com/ankidroid/Anki-Android/blob/483c63cb090594db4fd43cc5fb3519e6841f6e0e/docs/marketing/screenshots/en-US/phone/02-answer_zealand.png)、[复习布局源码](https://github.com/ankidroid/Anki-Android/blob/483c63cb090594db4fd43cc5fb3519e6841f6e0e/AnkiDroid/src/main/res/layout/fragment_reviewer.xml)。
- **E12**：Habitica [任务与角色宣传截图](https://github.com/HabitRPG/habitica-android/blob/52fbfd7a1bc76b153fb55fba7220644798de54b2/fastlane/metadata/android/en-US/images/phoneScreenshots/1_en-US.png)、[任务子项截图](https://github.com/HabitRPG/habitica-android/blob/52fbfd7a1bc76b153fb55fba7220644798de54b2/fastlane/metadata/android/en-US/images/phoneScreenshots/2_en-US.png)。
- **E13**：Habitica [升级反馈与轻提示分支](https://github.com/HabitRPG/habitica-android/blob/52fbfd7a1bc76b153fb55fba7220644798de54b2/Habitica/src/main/java/com/habitrpg/android/habitica/interactors/LevelUpUseCase.kt)。
- **E14**：Tomodoro [README](https://github.com/shahriaarrr/Tomodoro/blob/17aa856547a2efb6cda0f3b9f3b27d9a4f112f78/README.md)、[手机计时截图](https://github.com/shahriaarrr/Tomodoro/blob/17aa856547a2efb6cda0f3b9f3b27d9a4f112f78/fastlane/metadata/android/en-US/images/phoneScreenshots/1.png)。
- **E15**：Tomodoro [时长选择面板](https://github.com/shahriaarrr/Tomodoro/blob/17aa856547a2efb6cda0f3b9f3b27d9a4f112f78/lib/widgets/duration_picker_sheet.dart)、[任务完成与撤回](https://github.com/shahriaarrr/Tomodoro/blob/17aa856547a2efb6cda0f3b9f3b27d9a4f112f78/lib/widgets/task_tile.dart)。
- **E16**：[MDN Service Worker：安全上下文条件](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#service_worker_concepts_and_usage)。

[E01]: https://github.com/mindskip/xzs/blob/68571338efaea499e0aab6ae0895ba67316aebfb/README.md
[E02]: https://www.mindskip.net/style/git/images/wx/student/5.png
[E03]: https://github.com/kesixin/dati/blob/26ba1d09243f627b7af1f5328cc32f47249035c0/README.md
[E04]: https://mamba-blog-images.oss-cn-shanghai.aliyuncs.com/2025-01-09/802c77e0c66dc442e6d4a30ffc6ad361.jpg
[E05]: https://github.com/lonelyhty/CS408-mini-program/blob/76c2cc138733bb03391acbd38e3f41e781b5f20d/pages/dashboard/dashboard.wxml
[E06]: https://github.com/lonelyhty/CS408-mini-program/blob/76c2cc138733bb03391acbd38e3f41e781b5f20d/pages/practice/practice.wxml
[E07]: https://github.com/lonelyhty/CS408-mini-program/blob/76c2cc138733bb03391acbd38e3f41e781b5f20d/pages/checkin/checkin.wxml
[E08]: https://gitee.com/hcwdc/castlestudy-uniapp/blob/9ef0fdee91e0ef777b7d9e36ebef6d3febc2809c/pages/exam/answer.vue
[E09]: https://gitee.com/hcwdc/castlestudy-uniapp/blob/9ef0fdee91e0ef777b7d9e36ebef6d3febc2809c/pages/mine/collect.vue
[E10]: https://docs.ankidroid.org/
[E11]: https://github.com/ankidroid/Anki-Android/blob/483c63cb090594db4fd43cc5fb3519e6841f6e0e/docs/marketing/screenshots/en-US/phone/02-answer_zealand.png
[E12]: https://github.com/HabitRPG/habitica-android/blob/52fbfd7a1bc76b153fb55fba7220644798de54b2/fastlane/metadata/android/en-US/images/phoneScreenshots/1_en-US.png
[E13]: https://github.com/HabitRPG/habitica-android/blob/52fbfd7a1bc76b153fb55fba7220644798de54b2/Habitica/src/main/java/com/habitrpg/android/habitica/interactors/LevelUpUseCase.kt
[E14]: https://github.com/shahriaarrr/Tomodoro/blob/17aa856547a2efb6cda0f3b9f3b27d9a4f112f78/README.md
[E15]: https://github.com/shahriaarrr/Tomodoro/blob/17aa856547a2efb6cda0f3b9f3b27d9a4f112f78/lib/widgets/duration_picker_sheet.dart
[E16]: https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API#service_worker_concepts_and_usage
[L01]: ../frontend/src/styles.css
[L02]: ../frontend/src/components/ReviewQueue.tsx
[L03]: ../frontend/src/components/LearningPanel.tsx
[L04]: ../frontend/src/components/ExamView.tsx
[L05]: ../if_wechatapps_clickhere/pages/home/index.wxml
[L06]: ../if_wechatapps_clickhere/tools/practice-template.wxml
[L07]: ../if_wechatapps_clickhere/shared/store.js
[L08]: ../if_wechatapps_clickhere/pages/compose/index.js
[L09]: ../scripts/start-mobile-web.ps1
