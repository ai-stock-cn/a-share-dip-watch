# A股回撤观察

一个部署在 GitHub Pages 的纯静态自选股看板。页面打开时读取最新同步的沪深 A 股当日涨跌幅，并按最近完整财年现金分红计算静态股息率。

## 功能

- 默认包含 13 家银行股
- 输入 6 位代码添加沪深 A 股
- 自选股保存在浏览器 `localStorage`
- 每次打开页面读取最新行情并按跌幅排序
- GitHub Actions 在交易时段每 15 分钟同步一次全市场行情
- 跌幅达到 3% 显示绿色，达到 5% 显示红色
- 静态股息率 = 最近完整财年税前现金分红 / 当前价

## 数据

GitHub Actions 通过东方财富公开网页接口生成同源 JSON，页面不直接跨域访问第三方，也不需要 API Key。接口并非正式开放 API，若上游字段或访问策略变化，页面需要同步调整。

## 本地运行

```bash
python3 -m http.server 4173
```

打开 `http://localhost:4173/`。

## 部署

仓库设置中进入 **Pages**，将部署来源设为 **GitHub Actions**。`Update market data and deploy Pages` 工作流会同步行情、提交数据并直接发布网站。
