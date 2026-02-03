# 🌌 Antigravity Node Aggregator

**Antigravity Node Aggregator** 是一个功能强大的全栈节点聚合与管理工具。它集成了多源采集、智能筛选、连通性测试、纯净度检测以及灵活的导出功能，旨在为您提供最优质、最纯净的代理节点资源。

## ✨ 核心特性 (Key Features)

*   **🚀 多源聚合采集**
    *   支持从传统的订阅链接导入。
    *   **独家功能**：深度集成 **Linux.do** 论坛，可自动抓取并解析帖子中的节点资源。
    *   内置 Python 爬虫，自动从公开源获取最新节点。
    *   **⚠️ 注意**：节点获取与筛选结果基于**服务器所在的网络环境**。

*   **🛡️ 智能纯净度检测**
    *   集成 IP 纯净度数据库，自动识别节点 ISP 属性。
    *   精准标记 **"家庭宽带"** 与 **"数据中心"** 流量。
    *   自动识别并降低高风险 ISP（如 Google、Amazon AWS 等）的评分，助您避开“脏 IP”。

*   **⚡ 真实连通性测试**
    *   **后端驱动**：调用 **Clash Core** 进行真实的落地连通性测试（非简单的 Ping），确保节点真正可用。
    *   支持批量 TCP 握手测试，快速筛选超时节点。

*   **🔍 深度去重与清洗**
    *   采用严格的三维去重逻辑：基于 `Server IP + Port + UUID/Password` 判定。
    *   自动清理无效、重复或格式错误的节点配置。

*   **📤 灵活导出**
    *   **多格式支持**：一键导出为 Clash (YAML)、Sing-box (JSON) 或 Base64 通用订阅格式。
    *   支持将节点一键复制到剪贴板。

*   **💻 现代 Web 界面**
    *   基于 Vue.js 构建的响应式前端。
    *   实时日志控制台：像极客一样监控每一个抓取和测试步骤。
    *   可视化图表：国家/地区分布、协议类型占比一目了然。

## 🛠️ 技术栈 (Tech Stack)

*   **Backend**: Node.js, Express
*   **Frontend**: HTML5, Vue.js 3 (CDN), TailwindCSS
*   **Core**: Clash Premium (Linux amd64)
*   **Addons**: Python 3 (for advanced crawling)

## 📦 部署与运行

### 环境要求
*   Linux (amd64)
*   Node.js 16+
*   Python 3.9+ (可选，用于高级爬虫)

### 快速启动

```bash
# 安装依赖
npm install

# 启动服务 (使用 PM2)
pm2 start ecosystem.config.js

# 或者直接启动
node app.js
```

服务默认运行在 `http://localhost:3000`。

## 📂 目录结构

*   `app.js` - 后端核心逻辑
*   `Projects/Aggregator/` - 前端静态资源
*   `clash_bin/` - Clash 核心及配置文件
*   `external/` - 外部爬虫脚本
*   `proxies.json` - 节点数据存储

## 💐 Acknowledgements

*   本项目的部分核心采集逻辑（位于 `external/aggregator` 目录）派生自 [wzdnzd/aggregator](https://github.com/wzdnzd/aggregator)。感谢原作者的开源贡献！

## 📝 License

Private Project. Created for personal use.