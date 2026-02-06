# 🌌 Antigravity Node Aggregator

**Antigravity Node Aggregator** 是一个功能强大的全栈节点聚合与管理工具。它集成了多源采集、智能筛选、连通性测试、纯净度检测以及灵活的导出功能，旨在为您提供最优质、最纯净的代理节点资源。

---

## 📑 目录

- [核心特性](#-核心特性-key-features)
- [技术栈](#️-技术栈-tech-stack)
- [系统架构](#-系统架构)
- [安装部署](#-安装部署)
- [目录结构](#-目录结构)
- [核心模块详解](#-核心模块详解)
- [API 接口文档](#-api-接口文档)
- [定时任务](#-定时任务)
- [配置说明](#️-配置说明)
- [数据文件](#-数据文件)
- [故障排除](#-故障排除)
- [致谢](#-acknowledgements)

---

## ✨ 核心特性 (Key Features)

*   **🚀 多源聚合采集**
    *   支持从传统的订阅链接导入。
    *   **独家功能**：深度集成 **Linux.do** 论坛，可自动抓取并解析帖子中的节点资源。
    *   内置 Python 爬虫，自动从公开源获取最新节点。
    *   **⚠️ 注意**：节点获取与筛选结果基于**服务器所在的网络环境**。

*   **🛡️ 智能纯净度检测**
    *   集成 IP 纯净度数据库，自动识别节点 ISP 属性。
    *   精准标记 **"家庭宽带"** 与 **"数据中心"** 流量。
    *   自动识别并降低高风险 ISP（如 Google、Amazon AWS 等）的评分，助您避开"脏 IP"。

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

---

## 🛠️ 技术栈 (Tech Stack)

| 组件 | 技术 |
|------|------|
| **Backend** | Node.js, Express (原生 http 模块) |
| **Frontend** | HTML5, Vue.js 3 (CDN), TailwindCSS |
| **Core** | Clash Premium (Linux amd64) |
| **Addons** | Python 3.9+ (高级爬虫) |
| **Process Manager** | PM2 |

---

## 🏗️ 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Web 前端 (Vue.js 3)                       │
│                   Projects/Aggregator/index.html                │
└─────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Node.js 后端 (app.js)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ HTTP API │  │ 订阅采集 │  │ 节点验证 │  │ 定时任务调度器  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │                │               │
         ▼                ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐
│ Clash Core │  │ Python 爬虫 │  │ 外部 API           │
│ (验证节点)  │  │ (采集订阅)  │  │ (ip-api, ipwho.is) │
└─────────────┘  └─────────────┘  └─────────────────────┘
```

---

## 📦 安装部署

### 环境要求

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| **Linux** | amd64 架构 | 推荐 Ubuntu 20.04+ / Debian 11+ |
| **Node.js** | 16+ | 推荐使用 nvm 管理版本 |
| **Python** | 3.9+ | 用于高级爬虫功能 |
| **PM2** | 最新版 | 进程管理器 (可选但推荐) |

### 快速部署

#### 1. 克隆项目
```bash
# 如果是从备份恢复
cd /opt/1panel/apps/
tar -xzvf full_backup_YYYYMMDD_HHMMSS.tar.gz -C my-node-site/

# 或直接使用已有项目
cd /opt/1panel/apps/my-node-site
```

#### 2. 安装 Node.js 依赖
```bash
npm install
```

依赖包说明：
- `js-yaml`: YAML 配置文件解析
- `imap-simple`: 邮件接收（用于自动注册功能）
- `mailparser`: 邮件解析
- `puppeteer-core`: 浏览器自动化

#### 3. 配置 Python 环境（可选，用于高级爬虫）
```bash
# 创建虚拟环境
cd /opt/1panel/apps/my-node-site
python3 -m venv myenv
source myenv/bin/activate

# 安装 Python 爬虫依赖
cd external/aggregator
pip install -r requirements.txt
```

#### 4. 确保 Clash 二进制可执行
```bash
chmod +x clash_bin/clash-linux-amd64-*
```

#### 5. 启动服务

**使用 PM2（推荐）：**
```bash
# 首次启动
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs aggregator

# 设置开机自启
pm2 startup
pm2 save
```

**直接启动（开发/调试）：**
```bash
node app.js
```

服务默认运行在 `http://localhost:3000`。

### PM2 配置详解

`ecosystem.config.js` 配置说明：

```javascript
module.exports = {
    apps: [{
        name: 'aggregator',           // 应用名称
        script: 'app.js',             // 入口文件
        cwd: '/opt/1panel/apps/my-node-site',  // 工作目录
        instances: 1,                  // 实例数（单进程）
        autorestart: true,            // 崩溃时自动重启
        watch: false,                 // 不监听文件变化
        max_memory_restart: '500M',   // 内存超过 500M 时重启
        env: {
            NODE_ENV: 'production',
            PORT: 3000
        },
        error_file: './logs/error.log',
        out_file: './logs/out.log',
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        exp_backoff_restart_delay: 100,  // 指数退避重启延迟
        max_restarts: 10,                // 15分钟内最大重启次数
        min_uptime: '5s'                 // 最小运行时间
    }]
};
```

---

## 📂 目录结构

```
/opt/1panel/apps/my-node-site/
│
├── app.js                    # 🔥 主程序入口 (约 3000 行)
├── ecosystem.config.js       # PM2 配置文件
├── package.json              # Node.js 依赖配置
│
├── Projects/
│   └── Aggregator/
│       ├── index.html        # 前端界面 (Vue.js 单页应用)
│       ├── Aggregator.yaml   # 自动生成的 Clash 配置文件
│       └── docs/             # 文档资源
│
├── clash_bin/                # Clash 核心二进制文件
│   ├── clash-linux-amd64-*   # Clash 可执行文件
│   └── config.yaml           # Clash 运行时配置
│
├── clash_data/               # Clash 运行数据
│   └── Country.mmdb          # GeoIP 数据库
│
├── external/
│   └── aggregator/           # Python 爬虫项目 (来自 wzdnzd/aggregator)
│       ├── subscribe/        # 订阅采集模块
│       ├── data/             # 爬虫输出数据
│       └── tools/            # 工具脚本
│
├── myenv/                    # Python 虚拟环境
│
├── logs/                     # 日志目录
│   ├── out.log               # 标准输出日志
│   └── error.log             # 错误日志
│
├── backups/                  # 备份目录
│
├── proxies.json              # 📌 采集到的节点数据
├── manual_proxies.json       # 手动添加的节点
├── purity_db.json            # IP 纯净度数据库
├── cron_logs.json            # 定时任务执行日志
├── clash_template.yaml       # Clash 导出模板
│
├── linuxdo_cookie.txt        # Linux.do 登录 Cookie
└── email_config.json         # 邮件配置（自动注册功能）
```

---

## 🧩 核心模块详解

### 1. 订阅获取与解析

#### `fetchSubscriptions(pages)`
从多个订阅源获取节点，包括内置源和 Python 爬虫采集的动态源。

```javascript
// 核心流程
async function fetchSubscriptions(pages = 50) {
    // 1. 运行 Python 爬虫获取新订阅源
    const extraUrls = await runPythonCrawler(pages);
    
    // 2. 合并所有订阅源（内置 + 采集）
    const allUrls = [...new Set([...SUBSCRIPTION_URLS, ...extraUrls])];
    
    // 3. 分批并发下载（每批 10 个，15 秒超时）
    for (const chunk of chunks) {
        const results = await Promise.allSettled(chunk.map(url => fetchUrl(url)));
        // 解析并收集节点...
    }
    
    // 4. 深度去重
    return removeDuplicates(allProxies);
}
```

#### `parseContent(content)`
支持多种订阅格式的解析：

| 格式 | 说明 |
|------|------|
| **Base64** | 自动检测并解码 |
| **YAML (Clash)** | 解析 `proxies:` 数组 |
| **vmess://** | VMess 协议链接 |
| **vless://** | VLESS 协议链接 |
| **trojan://** | Trojan 协议链接 |
| **ss://** | Shadowsocks 协议链接 |
| **hysteria2://** | Hysteria2 协议链接 |

```javascript
function parseContent(content) {
    // 1. 尝试 Base64 解码
    if (!content.includes('proxies:') && !content.includes('://')) {
        decoded = decodeBase64(content.trim());
    }
    
    // 2. YAML 格式 (Clash 配置)
    if (decoded.includes('proxies:')) {
        const parsed = yaml.load(decoded);
        return parsed.proxies.map(...);
    }
    
    // 3. 逐行解析协议链接
    for (const line of lines) {
        if (line.startsWith('vmess://')) { ... }
        else if (line.startsWith('vless://')) { ... }
        else if (line.startsWith('trojan://')) { ... }
        else if (line.startsWith('ss://')) { ... }
        else if (line.startsWith('hysteria2://')) { ... }
    }
}
```

### 2. Python 爬虫集成

#### `runPythonCrawler(pages)`
调用 Python 爬虫从分享站自动采集订阅链接。

```javascript
async function runPythonCrawler(pages = 50) {
    const scriptDir = path.join(ROOT, 'external/aggregator');
    const args = [
        'subscribe/collect.py',
        '--skip',        // 跳过已处理的
        '--overwrite',   // 覆盖旧数据
        '--invisible',   // 后台运行
        '--pages', pages.toString()  // 爬取页数
    ];
    
    // 执行 Python 脚本，30 分钟超时
    const child = spawn('python3.11', args, {
        cwd: scriptDir,
        timeout: 1800000
    });
    
    // 读取结果文件
    const resultFile = path.join(scriptDir, 'data/subscribes.txt');
    return fs.readFileSync(resultFile).split('\n').filter(x => x.startsWith('http'));
}
```

### 3. 节点验证（Clash Core）

#### 验证流程
```
1. generateClashConfig(proxies)  → 生成 Clash 配置
2. startClash()                   → 启动 Clash 进程
3. validateProxies()              → 通过 Clash API 测试延迟
4. stopClash()                    → 停止 Clash 进程
```

#### `checkProxyDelay(proxyName, timeout)`
通过 Clash External Controller API 测试节点延迟。

```javascript
async function checkProxyDelay(proxyName, timeout = 5000) {
    const testUrls = [
        'http://www.gstatic.com/generate_204',
        'https://www.google.com/generate_204',
        'https://www.facebook.com/'
    ];
    
    // 并行测试多个 URL，任一成功即返回
    return await Promise.race(testUrls.map(url => 
        checkSingleUrl(proxyName, timeout, url)
    ));
}
```

#### `validateProxies(proxies, concurrency, delay)`
批量并发验证节点。

```javascript
async function validateProxies(proxies, concurrency = 24, delay = 5000) {
    await mapLimit(proxies, concurrency, async (proxy) => {
        const latency = await checkProxyDelay(proxy._clashName, delay);
        proxy.latency = latency > 0 ? latency : -1;
    });
    
    return proxies.filter(p => p.latency > 0);
}
```

### 4. 纯净度检测

#### `checkPurity(proxy, clashProxyName)`
通过代理访问 ip-api.com 获取 IP 属性并评分。

```javascript
async function checkPurity(proxy, clashProxyName) {
    // 1. 通过 Clash API 切换到目标代理
    await switchToProxy(clashProxyName);
    
    // 2. 通过该代理请求 ip-api.com
    const data = await fetchViaProxy('http://ip-api.com/json');
    
    // 3. 计算纯净度分数
    let score = 100;
    if (data.hosting === true) score -= 30;  // 机房 IP
    if (data.proxy === true) score -= 20;    // 被标记为代理
    
    // ISP 关键词检测（云服务商）
    const badKeywords = ['datacenter', 'cloud', 'hosting', 'amazon', 'google'];
    if (badKeywords.some(kw => data.isp.includes(kw))) {
        score -= 10;
    }
    
    return { score, ip: data.query, isp: data.isp };
}
```

### 5. 主聚合流程

#### `runAggregation(mode, pages)`
核心聚合任务，整合所有采集和验证流程。

```javascript
async function runAggregation(mode = 'github', pages = 50) {
    // 1. 状态检查
    if (globalState.status !== 'idle') return;
    globalState.status = 'fetching';
    
    // 2. Github 订阅获取
    const githubProxies = await fetchSubscriptions(pages);
    
    // 3. 全网获取模式（可选）
    if (mode === 'all') {
        proxies.push(...await scrapeWebSites());      // 网站抓取
        proxies.push(...await fetchFromLinuxDo());     // Linux.do 论坛
    }
    
    // 4. 深度去重
    proxies = removeDuplicates(proxies);
    
    // 5. 生成 Clash 配置并启动验证
    globalState.status = 'testing';
    generateClashConfig(proxies);
    await startClash();
    
    // 6. 节点验证（50 并发，10 秒超时）
    const validProxies = await validateProxies(proxies, 50, 10000);
    
    // 7. 纯净度检测（抽样 50 个）
    await checkPurityBatch(validProxies.slice(0, 50), 8);
    
    // 8. 保存结果
    fs.writeFileSync('proxies.json', JSON.stringify(validProxies));
    
    stopClash();
    globalState.status = 'idle';
}
```

### 6. 配置导出

#### `proxyToClashObj(proxy)`
将内部节点格式转换为标准 Clash 配置对象。

```javascript
function proxyToClashObj(p) {
    const base = {
        name: p.name,
        type: p.type,
        server: p.server,
        port: p.port,
        tfo: true,  // TCP Fast Open
        'skip-cert-verify': true
    };
    
    // 根据协议类型添加特定字段
    switch (p.type) {
        case 'vmess':
            base.uuid = p.uuid;
            base.alterId = p.alterId || 0;
            if (p['ws-opts']) base['ws-opts'] = p['ws-opts'];
            break;
        case 'vless':
            base.uuid = p.uuid;
            if (p['reality-opts']) base['reality-opts'] = p['reality-opts'];
            break;
        case 'trojan':
            base.password = p.password;
            base.tls = true;
            break;
        // ... 其他协议
    }
    
    return base;
}
```

---

## 🔌 API 接口文档

### 基础信息
- **Base URL**: `http://localhost:3000`
- **Content-Type**: `application/json`
- **CORS**: 已启用

### 节点操作

#### `POST /api/refresh`
触发 Github 订阅更新。

```bash
curl -X POST http://localhost:3000/api/refresh \
  -H "Content-Type: application/json" \
  -d '{"pages": 50}'
```

**参数**:
- `pages` (可选): 爬虫深度，默认 50

#### `POST /api/fetch_all`
触发全网节点获取（包括 Github + Linux.do + 网站抓取）。

```bash
curl -X POST http://localhost:3000/api/fetch_all \
  -H "Content-Type: application/json" \
  -d '{"pages": 100}'
```

#### `GET /api/proxies`
获取所有节点列表。

```bash
curl http://localhost:3000/api/proxies
```

**响应示例**:
```json
[
  {
    "id": "p_1706000000000_0_abc12",
    "name": "🇺🇸 US-Server",
    "type": "vmess",
    "server": "example.com",
    "port": 443,
    "latency": 156,
    "purityScore": 85
  }
]
```

#### `POST /api/clear_all`
清空所有节点数据。

#### `GET /api/status`
获取当前任务状态。

```json
{
  "status": "idle",      // idle | fetching | testing
  "total": 500,          // 总节点数
  "active": 120,         // 有效节点数
  "logs": [...],         // 最近日志
  "lastUpdated": "2026-02-05T12:00:00Z",
  "nextAutoUpdate": "2026-02-05T18:00:00Z"
}
```

### 导出接口

#### `GET /api/convert?type={format}`

| 参数 | 说明 |
|------|------|
| `type=clash` | 导出 Clash YAML 配置 |
| `type=base64` | 导出 Base64 编码订阅 |
| `type=singbox` | 导出 Sing-box JSON 配置 |

```bash
# 下载 Clash 配置
curl -o config.yaml "http://localhost:3000/api/convert?type=clash"
```

### 检测接口

#### `POST /api/check_connectivity`
批量检测节点 TCP 连通性。

```bash
curl -X POST http://localhost:3000/api/check_connectivity \
  -H "Content-Type: application/json" \
  -d '{"proxies": [{"id": "xxx", "server": "1.2.3.4", "port": 443}]}'
```

#### `POST /api/check_ip_batch`
批量检测 IP 纯净度。

```bash
curl -X POST http://localhost:3000/api/check_ip_batch \
  -H "Content-Type: application/json" \
  -d '["1.2.3.4", "5.6.7.8"]'
```

### 定时任务

#### `GET /api/cron_logs`
获取定时任务执行日志。

```json
{
  "logs": [
    {
      "id": 1706000000000,
      "startTime": "2026-02-05T06:00:00Z",
      "endTime": "2026-02-05T06:15:00Z",
      "duration": 900,
      "status": "success",
      "type": "全网节点更新",
      "details": {
        "beforeCount": 100,
        "afterCount": 150,
        "newNodes": 50,
        "yamlGenerated": true
      }
    }
  ],
  "nextRun": "2026-02-05T12:00:00Z"
}
```

---

## ⏰ 定时任务

系统内置 6 小时周期的自动更新任务。

### 任务流程

```
1. 全网节点更新 (runAggregation('all', 200))
   ├── Github 订阅采集 (200 页深度)
   ├── 网站抓取
   └── Linux.do 论坛抓取

2. 连通性检测 (runConnectivityCheck)
   └── 64 并发 TCP 握手测试

3. 纯净度检测 (runPurityCheck)
   └── 对新增节点进行 IP 属性检测

4. 生成配置文件 (saveAggregatorYaml)
   └── 输出到 Projects/Aggregator/Aggregator.yaml
```

### 核心函数

```javascript
function startAutoUpdateJob() {
    const AUTO_UPDATE_INTERVAL = 6 * 60 * 60 * 1000; // 6 小时
    
    autoUpdateTimer = setInterval(async () => {
        const logEntry = { startTime: new Date(), type: '全网节点更新' };
        
        try {
            await runAggregation('all', 200);
            await runConnectivityCheck();
            await runPurityCheck();
            await saveAggregatorYaml();
            logEntry.status = 'success';
        } catch (e) {
            logEntry.status = 'error';
            logEntry.error = e.message;
        }
        
        addCronLog(logEntry);
    }, AUTO_UPDATE_INTERVAL);
}
```

---

## ⚙️ 配置说明

### 内置订阅源 (`SUBSCRIPTION_URLS`)

```javascript
const SUBSCRIPTION_URLS = [
    // wzdnzd/aggregator 官方共享订阅 (每4小时自动更新)
    'https://www.xrayvip.com/free.yaml',
    'https://raw.githubusercontent.com/peasoft/NoMoreWalls/master/list.yml',
    'https://raw.githubusercontent.com/ts-sf/fly/main/v2',
    // ... 更多订阅源
];
```

### Clash 配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `mixed-port` | 7890 | HTTP/SOCKS5 混合端口 |
| `external-controller` | 127.0.0.1:9090 | 外部控制器地址 |
| `log-level` | warning | 日志级别 |

### Linux.do Cookie 配置

将 Cookie 保存到 `linuxdo_cookie.txt`：
```
_forum_session=xxx; _t=xxx; ...
```

---

## 📊 数据文件

### proxies.json
主节点数据存储，格式示例：
```json
[
  {
    "id": "p_1706000000000_0_abc12",
    "name": "🇺🇸 US-Server",
    "type": "vmess",
    "server": "us1.example.com",
    "port": 443,
    "uuid": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "alterId": 0,
    "cipher": "auto",
    "network": "ws",
    "tls": true,
    "ws-opts": {
      "path": "/path",
      "headers": { "Host": "example.com" }
    },
    "latency": 156,
    "localLatency": 120,
    "purityScore": 85,
    "purityInfo": {
      "countryCode": "US",
      "isp": "Example ISP",
      "hosting": false
    }
  }
]
```

### purity_db.json
IP 纯净度缓存数据库：
```json
{
  "1.2.3.4": {
    "score": 85,
    "info": {
      "countryCode": "US",
      "isp": "Example ISP",
      "hosting": false
    },
    "updatedAt": 1706000000000
  }
}
```

### cron_logs.json
定时任务执行日志：
```json
[
  {
    "id": 1706000000000,
    "startTime": "2026-02-05T06:00:00Z",
    "endTime": "2026-02-05T06:15:00Z",
    "duration": 900,
    "status": "success",
    "type": "全网节点更新",
    "details": {...}
  }
]
```

---

## 🔧 故障排除

### 常见问题

#### 1. 服务无法启动
```bash
# 检查端口占用
lsof -i :3000

# 检查 PM2 状态
pm2 status
pm2 logs aggregator --lines 100

# 手动启动调试
node app.js
```

#### 2. Clash 启动失败
```bash
# 检查二进制权限
chmod +x clash_bin/clash-linux-amd64-*

# 检查配置文件
cat clash_bin/config.yaml

# 手动测试运行
./clash_bin/clash-linux-amd64-* -d clash_bin -f clash_bin/config.yaml
```

#### 3. Python 爬虫失败
```bash
# 检查 Python 版本
python3.11 --version

# 检查依赖
cd external/aggregator
pip list

# 手动测试
python3.11 subscribe/collect.py --help
```

#### 4. 节点验证全部失败
- 检查服务器网络环境是否被墙
- 确认 Clash 端口 7890/9090 未被占用
- 查看 `clash.log` 日志

### 服务重启

```bash
# 使用 PM2
pm2 restart aggregator

# 完全重启
pm2 delete aggregator
pm2 start ecosystem.config.js
```

### 备份与恢复

```bash
# 创建完整备份
tar -czvf backup_$(date +%Y%m%d).tar.gz \
  --exclude='.git' \
  --exclude='backups' \
  --exclude='logs' \
  .

# 从备份恢复
tar -xzvf backup_YYYYMMDD.tar.gz -C /opt/1panel/apps/my-node-site/
npm install
pm2 restart aggregator
```

---

## 💐 Acknowledgements

*   本项目的部分核心采集逻辑（位于 `external/aggregator` 目录）派生自 [wzdnzd/aggregator](https://github.com/wzdnzd/aggregator)。感谢原作者的开源贡献！

---

## 📝 License

Private Project. Created for personal use.

---

## 📋 版本历史

| 日期 | 版本 | 说明 |
|------|------|------|
| 2026-02-05 | 1.0.0 | 完善文档，添加详细部署和方法说明 |
| 2026-02-04 | 0.9.0 | 添加定时任务日志功能 |
| 2026-02-03 | 0.8.0 | 项目结构优化，清理冗余代码 |
| 2026-02-02 | 0.7.0 | 集成 Linux.do 节点导入功能 |
| 2026-01-30 | 0.6.0 | 实时日志显示功能 |