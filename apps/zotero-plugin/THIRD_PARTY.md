# 固定版本来源

CuLingo for Zotero 是独立项目。本次从浏览器版提交 `179594d` 固定复制通用词形规则、CSV 解析及已经生成的词典；没有创建跨端公共包，也没有修改浏览器项目的依赖或构建入口。SQLite、备份格式、宿主读取和界面适配单独实现。

## ECDICT

- 来源：https://github.com/skywind3000/ECDICT/tree/bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b
- 许可证：词库原始 MIT 许可证随 `assets/dictionary/LICENSE` 和 XPI 分发。
- 原始 CSV SHA-256：`1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf`。
- 57,829 个词条，39,833 个词形映射，20 个词典分块。
- `frq` 优先，缺失时使用 `bnc`；有标签但缺失词频的词条保留查询能力，不自动提示。筛选和转换规则见独立 `scripts/build-dictionary.mjs`。
- Manifest 记录每个分块和索引的 SHA-256；首次导入校验、分块事务提交，失败可重试，不删除学习数据库。

转换脚本固定复制浏览器转换逻辑，只写本项目 `assets/dictionary`。默认只读仓库已有的 `../../data/source/ecdict.csv` 和 `LICENSE`，不改变它们。使用独立源码时，从上述固定提交准备原始 CSV 和许可证，再显式传入路径：

```powershell
node scripts/build-dictionary.mjs 'D:\ecdict\ecdict.csv' 'D:\ecdict\LICENSE'
npm run build
```

输入哈希不匹配时，脚本在写出资产前停止。已经包含转换后的词典，常规构建无需下载原始 CSV。

## 运行依赖

| 依赖 | 固定版本 | 用途与许可证 |
| --- | --- | --- |
| React / React DOM | 19.2.0 | 独立管理页及侧栏，MIT |
| ts-fsrs | 5.4.2 | FSRS 间隔复习，MIT |
| Zod | 3.25.76 | 数据与导入校验，MIT |

工具依赖由本项目 `package-lock.json` 锁定。SQLite 使用 Zotero 的数据库连接能力，仅连接插件独立文件；无需外部运行时或额外常驻服务。Zotero 阅读器公开事件为扩展入口，必要的私有 PDF 文字与坐标接口集中在 `ReaderAdapter10`，以安装的 10.0.5 实际接口为准。

参考：

- https://www.zotero.org/support/dev/client_coding/plugin_development
- https://www.zotero.org/support/dev/zotero_7_for_developers#custom_reader_event_handlers
- https://github.com/open-spaced-repetition/ts-fsrs
