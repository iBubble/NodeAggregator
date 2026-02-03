/**
 * Antigravity Airport Aggregator - Web Backend
 * 
 * 参考 wzdnzd/aggregator 和 Mac App 的实现方式
 * 使用 Clash External Controller API 进行节点验证
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const net = require('net');
const os = require('os');
const { spawn } = require('child_process');
const yaml = require('js-yaml');



// --- 配置 ---
const ROOT = __dirname;
const PORT = 3000;
const CLASH_DIR = path.join(ROOT, 'clash_bin');
const CLASH_CONFIG = path.join(CLASH_DIR, 'config.yaml');
const CLASH_PORT_HTTP = 7890;
const CLASH_EXTERNAL_CONTROLLER = '127.0.0.1:9090';

// Clash 二进制文件路径
let CLASH_BIN = '';
const platform = os.platform();
const arch = os.arch();

if (platform === 'darwin') {
    CLASH_BIN = path.join(CLASH_DIR, 'clash-darwin');
} else if (platform === 'linux') {
    if (arch === 'x64') CLASH_BIN = path.join(CLASH_DIR, 'clash-linux-amd64');
    else if (arch === 'arm64') CLASH_BIN = path.join(CLASH_DIR, 'clash-linux-arm64');
    else CLASH_BIN = path.join(CLASH_DIR, 'clash-linux-amd64');
} else {
    CLASH_BIN = path.join(CLASH_DIR, 'clash-windows-amd64.exe');
}

// 动态查找 Clash 二进制
if (!fs.existsSync(CLASH_BIN)) {
    try {
        const files = fs.readdirSync(CLASH_DIR);
        const bin = files.find(f => f.includes('clash') && !f.endsWith('.yaml'));
        if (bin) CLASH_BIN = path.join(CLASH_DIR, bin);
    } catch (e) { }
}

const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.yaml': 'text/yaml'
};

// 全局状态
const globalState = {
    status: 'idle', // idle, fetching, testing
    total: 0,
    active: 0,
    logs: [],
    lastUpdated: null
};



function addLog(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${timestamp}] [${type.toUpperCase()}] ${msg}`);
    globalState.logs.push({ timestamp, type, msg });
    if (globalState.logs.length > 500) globalState.logs.shift();
}

// 确保目录存在
if (!fs.existsSync(CLASH_DIR)) fs.mkdirSync(CLASH_DIR, { recursive: true });

// --- 订阅源 ---
const SUBSCRIPTION_URLS = [
    // ⭐ wzdnzd/aggregator 官方共享订阅 (Issue #91) - 每4小时自动更新，高质量节点
    // API 文档: https://github.com/wzdnzd/aggregator/issues/91
    // token: 2i94lkqi1uvd9eeab6 | target: v2ray/clash/singbox | list=1: 仅输出节点
    'https://qybndbviblvt.us-west-1.clawcloudrun.com/api/v1/subscribe?token=2i94lkqi1uvd9eeab6&target=v2ray&list=1',
    'https://qybndbviblvt.us-west-1.clawcloudrun.com/api/v1/subscribe?token=2i94lkqi1uvd9eeab6&target=clash&list=1',
    'https://qybndbviblvt.us-west-1.clawcloudrun.com/api/v1/subscribe?token=2i94lkqi1uvd9eeab6&target=singbox&list=1',

    // GitHub Sources
    'https://raw.githubusercontent.com/ermaozi/get_subscribe/main/subscribe/v2ray.txt',
    'https://raw.githubusercontent.com/mianfeifq/share/main/data',
    'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/EternityAirConfig64.txt',
    'https://raw.githubusercontent.com/Pawdroid/Free-servers/main/sub',
    'https://raw.githubusercontent.com/freefq/free/master/v2',
    'https://raw.githubusercontent.com/aiboboxx/v2rayfree/main/v2',
    'https://raw.githubusercontent.com/peasoft/NoMoreWalls/master/list.txt',
    'https://raw.githubusercontent.com/mfuu/v2ray/master/v2ray',
    'https://raw.githubusercontent.com/ts-sf/fly/main/v2',
    'https://raw.githubusercontent.com/Jsnzkpg/Jsnzkpg/Jsnzkpg/Jsnzkpg',
    'https://raw.githubusercontent.com/open-proxies/clash/main/clash.yaml', // Try YAML parsing
];



// --- HTTP 请求工具 ---
function fetchUrl(url, timeout = 15000, customHeaders = {}) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const timer = setTimeout(() => reject(new Error('Timeout')), timeout);

        const defaultHeaders = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5'
        };

        client.get(url, {
            headers: { ...defaultHeaders, ...customHeaders },
            timeout: timeout
        }, (res) => {
            clearTimeout(timer);
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchUrl(res.headers.location, timeout, customHeaders).then(resolve).catch(reject);
            }
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

// 加载 Linux.do Cookie
function getLinuxDoCookie() {
    const configPath = path.join(ROOT, 'linuxdo_cookie.txt');
    try {
        if (fs.existsSync(configPath)) {
            return fs.readFileSync(configPath, 'utf8').trim();
        }
    } catch (e) { }
    return '';
}
// 读取 Linux.do Cookie
function getLinuxDoCookie() {
    try {
        const cookieFile = path.join(ROOT, 'linuxdo_cookie.txt');
        if (fs.existsSync(cookieFile)) {
            return fs.readFileSync(cookieFile, 'utf8').trim();
        }
    } catch (e) { }
    return '';
}

let isLinuxDoImporting = false;

// 全局异常捕获，防止进程崩溃
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    // addLog('系统严重错误: ' + err.message, 'error'); // 尝试写入日志
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

async function runLinuxDoImportTask() {
    if (isLinuxDoImporting) return;
    isLinuxDoImporting = true;

    addLog('========== 开始 Linux.do 导入任务 (后台) ==========', 'info');

    try {
        // 使用 JSON API 获取带有 "订阅节点" 标签的帖子列表
        // 采用 OAuth 认证接入 (使用 Cookie)
        const baseUrl = 'https://linux.do/tag/%E8%AE%A2%E9%98%85%E8%8A%82%E7%82%B9.json';
        addLog('开始从 linux.do 抓取帖子列表 (Tag: 订阅节点, OAuth 模式)...', 'info');

        // 1. 检查/刷新 Cookie
        let cookie = getLinuxDoCookie();
        if (!cookie) {
            addLog('未找到 Cookie，尝试执行 OAuth 登录...', 'warning');
            try {
                // Fix path to point to root
                const authScript = path.join(ROOT, 'linuxdo_auth.js');
                if (fs.existsSync(authScript)) {
                    addLog('执行认证脚本...', 'info');
                    // spawnSync blocks the event loop! Use async spawn instead.
                    await new Promise((resolve, reject) => {
                        const { spawn } = require('child_process');
                        const child = spawn('node', [authScript], { stdio: 'pipe' });

                        let output = '';
                        child.stdout.on('data', d => { output += d.toString(); });
                        child.stderr.on('data', d => { console.error(d.toString()); });

                        child.on('close', (code) => {
                            if (code === 0) resolve();
                            else {
                                console.log('Auth script output:', output);
                                resolve(); // Try to continue anyway
                            }
                        });
                        child.on('error', (err) => {
                            console.error('Failed to start auth script:', err);
                            resolve();
                        });
                    });

                    cookie = getLinuxDoCookie(); // Reload
                } else {
                    addLog('认证脚本不存在: ' + authScript, 'error');
                }
            } catch (e) {
                addLog(`登录脚本执行失败: ${e.message}`, 'error');
            }
        }

        if (cookie) addLog('已加载 Cookie，将以登录用户身份访问', 'info');
        else addLog('Cookie加载失败，尝试游客访问 (可能受到限制)', 'warning');

        let allTopics = [];
        let page = 0;
        const targetCount = 300; // 目标获取300篇帖子
        const maxPages = 20; // 最多尝试20页

        // 频率控制：每页间隔 3 秒
        const PAGE_DELAY = 3000;

        while (allTopics.length < targetCount && page < maxPages) {
            const pageUrl = page === 0 ? baseUrl : `${baseUrl}?page=${page}`;
            addLog(`正在获取第 ${page + 1} 页...`, 'info');

            try {
                const listJson = await fetchLinuxDo(pageUrl, cookie);

                // 检查是否是被拦截或需要登录
                if (listJson.includes('<!DOCTYPE') || listJson.includes('login-required')) {
                    addLog(`第 ${page + 1} 页访问被拒绝 (需要登录或被风控)，停止获取`, 'warning');
                    break;
                }

                const listData = JSON.parse(listJson);
                const topics = listData.topic_list?.topics || [];

                if (topics.length === 0) {
                    addLog(`第 ${page + 1} 页没有更多帖子，停止获取`, 'info');
                    break;
                }

                // 过滤重复的帖子（基于 ID）
                const existingIds = new Set(allTopics.map(t => t.id));
                const newTopics = topics.filter(t => !existingIds.has(t.id));

                if (newTopics.length === 0) {
                    addLog(`第 ${page + 1} 页帖子全部重复，停止获取`, 'info');
                    break;
                }

                allTopics = allTopics.concat(newTopics);
                addLog(`第 ${page + 1} 页获取 ${newTopics.length} 个新帖子，累计 ${allTopics.length} 个`, 'info');

                page++;

                // 频率控制
                await new Promise(r => setTimeout(r, PAGE_DELAY));
            } catch (e) {
                addLog(`获取第 ${page + 1} 页失败: ${e.message}，继续下一页`, 'warning');
                page++;
            }
        }

        addLog(`总共从 JSON API 获取到 ${allTopics.length} 个帖子`, 'success');

        // 过滤最近30天的帖子，最多处理300个
        const now = new Date();
        const recentTopics = allTopics.filter(t => {
            const createdAt = new Date(t.created_at);
            const daysDiff = (now - createdAt) / (1000 * 60 * 60 * 24);
            return daysDiff <= 30;
        }).slice(0, 300);

        addLog(`过滤后剩余 ${recentTopics.length} 个近30天帖子`, 'info');

        const allProxies = [];
        const allSubscriptions = [];
        let processedCount = 0;

        for (let i = 0; i < recentTopics.length; i++) {
            const topic = recentTopics[i];
            const topicId = topic.id;
            const topicTitle = topic.title || '未知标题';

            try {
                addLog(`[${i + 1}/${recentTopics.length}] 读取帖子: ${topicTitle.substring(0, 30)}...`, 'info');

                const topicUrl = `https://linux.do/t/topic/${topicId}.json`;
                // 使用 Cookie 获取帖子内容
                const topicJson = await fetchLinuxDo(topicUrl, cookie);
                const topicData = JSON.parse(topicJson);

                // 获取帖子内容（所有楼层）
                const posts = topicData.post_stream?.posts || [];

                for (const post of posts.slice(0, 10)) { // 读取前10楼
                    const content = post.cooked || '';

                    // 查找订阅链接
                    const subPatterns = [
                        /https?:\/\/[^\s<>"'\)]+(?:subscribe|sub|api|link|clash|v2ray|vmess|trojan|ss|ssr|yaml|txt)[^\s<>"'\)]*/gi,
                        /https?:\/\/[^\s<>"'\)]+\.(yaml|txt|json)(?:\?[^\s<>"'\)]*)?/gi
                    ];

                    for (const pattern of subPatterns) {
                        const matches = content.match(pattern) || [];
                        for (let url of matches) {
                            url = url.replace(/&amp;/g, '&')
                                .replace(/&lt;/g, '<')
                                .replace(/&gt;/g, '>')
                                .replace(/<[^>]+>/g, '')
                                .replace(/[,;。，；]+$/, '')
                                .trim();

                            if (url.includes('github.com') && !url.includes('raw.')) continue;
                            if (url.includes('linux.do')) continue;
                            if (url.length > 500) continue;

                            if (url && !allSubscriptions.includes(url)) {
                                allSubscriptions.push(url);
                                addLog(`  发现订阅: ${url.substring(0, 60)}...`, 'success');
                            }
                        }
                    }

                    // 查找直接的节点链接
                    const nodePatterns = [
                        /vmess:\/\/[A-Za-z0-9+\/=_-]+/g,
                        /vless:\/\/[A-Za-z0-9@.:_\-?&=%#\/]+/g,
                        /trojan:\/\/[A-Za-z0-9@.:_\-?&=%#\/]+/g,
                        /ss:\/\/[A-Za-z0-9@.:_\-?&=%#\/]+/g,
                        /ssr:\/\/[A-Za-z0-9+\/=_-]+/g,
                        /hysteria2?:\/\/[A-Za-z0-9@.:_\-?&=%#\/]+/g,
                        /hy2:\/\/[A-Za-z0-9@.:_\-?&=%#\/]+/g
                    ];

                    for (const pattern of nodePatterns) {
                        const matches = content.match(pattern) || [];
                        for (let m of matches) {
                            m = m.replace(/<[^>]+>/g, '')
                                .replace(/&amp;/g, '&')
                                .trim();

                            if (m && !allProxies.includes(m)) {
                                allProxies.push(m);
                            }
                        }
                    }

                    // Base64 Simple Check
                    if (content.match(/[A-Za-z0-9+\/]{100,}/)) {
                        // Too complex to parse extensively here, rely on direct matches or sub links
                    }
                }

                processedCount++;

                if ((i + 1) % 5 === 0) {
                    addLog(`进度: ${i + 1}/${recentTopics.length}, 已发现 ${allSubscriptions.length} 订阅, ${allProxies.length} 节点`, 'info');
                }
            } catch (e) {
                addLog(`  读取帖子 ${topicId} 失败: ${e.message}`, 'warning');
            }

            // Rate Limit
            await new Promise(r => setTimeout(r, 2000));
        }

        addLog(`内容抓取完成！发现 ${allSubscriptions.length} 个订阅, ${allProxies.length} 个节点`, 'success');

        // 解析节点
        let parsedProxies = [];
        for (const raw of allProxies) {
            const parsed = parseContent(raw);
            if (parsed.length > 0) parsedProxies = parsedProxies.concat(parsed);
        }

        // 解析订阅 (Limit 10)
        for (const subUrl of allSubscriptions.slice(0, 10)) {
            try {
                addLog(`解析订阅: ${subUrl.substring(0, 50)}...`, 'info');
                const subContent = await fetchUrl(subUrl, 15000);
                const subProxies = parseContent(subContent);
                if (subProxies.length > 0) {
                    addLog(`  > 成功获取 ${subProxies.length} 个节点`, 'success');
                    parsedProxies = parsedProxies.concat(subProxies);
                }
            } catch (e) {
                addLog(`  > 订阅解析失败: ${e.message}`, 'warning');
            }
        }

        // 去重
        const uniqueProxies = removeDuplicates(parsedProxies);

        // 标记论坛来源
        uniqueProxies.forEach(p => {
            p.isFromForum = true;
            p.forumSource = 'linux.do';
            p.importedAt = new Date().toISOString();
        });

        addLog(`分析完成！共获得 ${uniqueProxies.length} 个有效节点。正在保存...`, 'success');

        // 保存到 manual_proxies.json
        const manualFile = path.join(ROOT, 'manual_proxies.json');
        let existing = [];
        if (fs.existsSync(manualFile)) {
            try { existing = JSON.parse(fs.readFileSync(manualFile, 'utf8')); } catch (e) { }
        }

        const existingRaws = new Set(existing.map(p => p.raw));
        let addedCount = 0;

        for (const p of uniqueProxies) {
            if (!existingRaws.has(p.raw)) {
                existing.push(p);
                existingRaws.add(p.raw);
                addedCount++;
            }
        }

        if (addedCount > 0) {
            fs.writeFileSync(manualFile, JSON.stringify(existing, null, 2));
            addLog(`======== 导入完成！新增 ${addedCount} 个节点，当前共 ${existing.length} 个 ========`, 'success');
        } else {
            addLog(`======== 导入完成！没有发现新节点，当前共 ${existing.length} 个 ========`, 'info');
        }

    } catch (e) {
        addLog(`导入任务异常中止: ${e.message}`, 'error');
        console.error(e);
    } finally {
        isLinuxDoImporting = false;
    }
}


// 使用 curl 命令获取 linux.do 内容（绕过 Cloudflare 拦截）
function fetchLinuxDo(url, cookie = '') {
    return new Promise((resolve, reject) => {
        const curlArgs = [
            '-s',
            '-H', 'Accept: application/json',
            '-H', 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ];

        if (cookie) {
            curlArgs.push('-H', `Cookie: ${cookie}`);
        }

        curlArgs.push(url);

        const child = spawn('curl', curlArgs, { timeout: 30000 });
        let data = '';
        let error = '';

        child.stdout.on('data', chunk => data += chunk);
        child.stderr.on('data', chunk => error += chunk);

        child.on('close', code => {
            if (code === 0 && data) {
                resolve(data);
            } else {
                reject(new Error(error || `curl exited with code ${code}`));
            }
        });

        child.on('error', err => reject(err));
    });
}

// Base64 解码
function decodeBase64(str) {
    try {
        return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
    } catch (e) { return ''; }
}







function parseContent(content) {
    const proxies = [];

    // 尝试 Base64 解码
    let decoded = content;
    if (!content.includes('proxies:') && !content.trim().startsWith('{') && !content.includes('://')) {
        const maybeDecoded = decodeBase64(content.trim());
        if (maybeDecoded && maybeDecoded.includes('://')) {
            decoded = maybeDecoded;
        }
    }

    // YAML 格式 (Clash)
    if (decoded.includes('proxies:')) {
        try {
            const parsed = yaml.load(decoded);
            if (parsed && Array.isArray(parsed.proxies)) {
                return parsed.proxies.map((p, i) => ({
                    ...p,
                    id: `p_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`
                }));
            }
        } catch (e) { }
    }

    // 逐行解析 (vmess://, vless://, trojan://, ss://, hysteria2://)
    const lines = decoded.split(/[\r\n]+/);
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        try {
            if (line.startsWith('vmess://')) {
                const b64 = line.substring(8);
                const json = JSON.parse(decodeBase64(b64));
                if (json && json.add) {
                    proxies.push({
                        id: `p_${Date.now()}_${proxies.length}_${Math.random().toString(36).substr(2, 5)}`,
                        name: json.ps || 'VMess',
                        type: 'vmess',
                        server: json.add,
                        port: parseInt(json.port, 10) || 443,
                        uuid: json.id,
                        alterId: parseInt(json.aid, 10) || 0,
                        cipher: 'auto',
                        network: json.net || 'tcp',
                        tls: json.tls === 'tls',
                        'skip-cert-verify': true,
                        'ws-opts': json.net === 'ws' ? { path: json.path || '/', headers: json.host ? { Host: json.host } : undefined } : undefined,
                        servername: json.sni || json.host,
                        raw: line
                    });
                }
            } else if (line.startsWith('vless://') || line.startsWith('trojan://')) {
                const type = line.startsWith('vless') ? 'vless' : 'trojan';
                const url = new URL(line);
                const params = Object.fromEntries(url.searchParams);

                const proxy = {
                    id: `p_${Date.now()}_${proxies.length}_${Math.random().toString(36).substr(2, 5)}`,
                    name: decodeURIComponent(url.hash.slice(1)) || type,
                    type: type,
                    server: url.hostname,
                    port: parseInt(url.port, 10) || 443,
                    uuid: type === 'vless' ? url.username : undefined,
                    password: type === 'trojan' ? url.username : undefined,
                    tls: params.security === 'tls' || params.security === 'reality' || type === 'trojan',
                    'skip-cert-verify': true,
                    network: params.type || 'tcp',
                    servername: params.sni || params.host,
                    flow: params.flow,
                    raw: line
                };

                if (params.security === 'reality') {
                    proxy['reality-opts'] = {
                        'public-key': params.pbk,
                        'short-id': params.sid
                    };
                    proxy['client-fingerprint'] = params.fp || 'chrome';
                }

                if (proxy.network === 'ws') {
                    proxy['ws-opts'] = { path: params.path || '/', headers: params.host ? { Host: params.host } : undefined };
                } else if (proxy.network === 'grpc') {
                    proxy['grpc-opts'] = { 'grpc-service-name': params.serviceName || 'grpc' };
                }

                proxies.push(proxy);
            } else if (line.startsWith('ss://')) {
                // SS 解析
                try {
                    const url = new URL(line);
                    let tag = url.hash.slice(1);
                    if (tag) tag = decodeURIComponent(tag);

                    // 解析 userinfo (method:password)
                    let method = 'aes-256-gcm', password = '';
                    if (url.username) {
                        const decoded = decodeBase64(url.username);
                        if (decoded.includes(':')) {
                            [method, password] = decoded.split(':', 2);
                        } else {
                            password = url.username;
                        }
                    }

                    if (url.hostname) {
                        proxies.push({
                            id: `p_${Date.now()}_${proxies.length}_${Math.random().toString(36).substr(2, 5)}`,
                            name: tag || 'SS',
                            type: 'ss',
                            server: url.hostname,
                            port: parseInt(url.port, 10) || 443,
                            cipher: method,
                            password: password,
                            raw: line
                        });
                    }
                } catch (e) { }
            } else if (line.startsWith('hysteria2://') || line.startsWith('hy2://')) {
                try {
                    const normalized = line.replace('hysteria2://', 'https://').replace('hy2://', 'https://');
                    const url = new URL(normalized);
                    proxies.push({
                        id: `p_${Date.now()}_${proxies.length}_${Math.random().toString(36).substr(2, 5)}`,
                        name: decodeURIComponent(url.hash.slice(1)) || 'Hysteria2',
                        type: 'hysteria2',
                        server: url.hostname,
                        port: parseInt(url.port, 10) || 443,
                        password: url.username,
                        sni: url.searchParams.get('sni') || url.hostname,
                        'skip-cert-verify': true,
                        raw: line
                    });
                } catch (e) { }
            }
        } catch (e) { }
    }

    return proxies;
}

// 去重
function removeDuplicates(proxies) {
    const map = new Map();
    for (const p of proxies) {
        if (!p.server || !p.port) continue;
        // 使用 server:port:uuid/password 作为唯一键
        const key = `${p.server}:${p.port}:${p.uuid || p.password || ''}`;
        if (!map.has(key)) {
            map.set(key, p);
        }
    }
    return Array.from(map.values());
}

// --- 获取订阅 ---
// --- 获取订阅 ---
async function fetchSubscriptions(pages = 50) {
    let allProxies = [];
    let extraUrls = [];

    // 1. 运行 Python 爬虫获取新订阅 (必须优先执行)
    try {
        addLog(`启动 Python 采集器 (Powered by wzdnzd/aggregator, 深度: ${pages}页)...`, 'info');
        extraUrls = await runPythonCrawler(pages);
        addLog(`Python 采集器返回了 ${extraUrls.length} 个有效订阅源`, 'success');
    } catch (e) {
        addLog(`Python 采集器执行异常: ${e.message}`, 'warning');
    }

    // 2. 合并所有订阅源 (去重)
    const allUrls = [...new Set([...SUBSCRIPTION_URLS, ...extraUrls])];

    if (allUrls.length === 0) {
        addLog('未找到任何订阅源', 'warning');
        return [];
    }

    addLog(`准备从 ${allUrls.length} 个订阅源获取节点 (内置: ${SUBSCRIPTION_URLS.length}, 采集: ${extraUrls.length})...`, 'info');

    // 3. 并发下载 (分批执行以免爆内存/网络)
    const BATCH_SIZE = 10;
    const chunks = [];
    for (let i = 0; i < allUrls.length; i += BATCH_SIZE) {
        chunks.push(allUrls.slice(i, i + BATCH_SIZE));
    }

    let processedCount = 0;
    for (const chunk of chunks) {
        const results = await Promise.allSettled(chunk.map(async (url) => {
            try {
                // 15秒超时
                const content = await fetchUrl(url, 15000);
                if (!content) return [];
                const parsed = parseContent(content);
                // 简单的来源标记
                parsed.forEach(p => p._sourceUrl = url);
                return parsed;
            } catch (e) { return []; }
        }));

        for (const res of results) {
            if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                allProxies.push(...res.value);
            }
        }

        processedCount += chunk.length;
        if (processedCount % 20 === 0 || processedCount === allUrls.length) {
            addLog(`进度: ${processedCount}/${allUrls.length} 个订阅源已处理`, 'info');
        }
    }

    const unique = removeDuplicates(allProxies);
    addLog(`总计获取 ${unique.length} 个唯一节点 (去重前: ${allProxies.length})`, 'success');
    return unique;
}

// 执行 Python 脚本
async function runPythonCrawler(pages = 50) {
    const scriptDir = path.join(ROOT, 'external/aggregator');
    const scriptFile = 'subscribe/collect.py';

    if (!fs.existsSync(scriptDir)) {
        addLog('错误: Python 项目目录不存在 (external/aggregator)', 'error');
        return [];
    }

    return new Promise((resolve) => {
        // 参数: --pages 动态传入
        const args = [scriptFile, '--skip', '--overwrite', '--invisible', '--pages', pages.toString()];

        addLog(`执行命令: python3.11 ${args.join(' ')}`, 'info');

        const child = spawn('python3.11', args, {
            cwd: scriptDir,
            env: { ...process.env, PYTHONPATH: scriptDir, PYTHONUNBUFFERED: '1' },
            timeout: 1800000 // 30分钟超时
        });

        // Python 脚本通常把日志打在 stderr
        child.stderr.on('data', (d) => {
            const lines = d.toString().trim().split('\n');
            lines.forEach(line => {
                if (line) addLog(`[PY] ${line}`, 'info');
            });
        });

        // stdout 也可能有输出
        child.stdout.on('data', (d) => {
            const lines = d.toString().trim().split('\n');
            lines.forEach(line => {
                if (line.includes('crawl') || line.includes('finished')) {
                    addLog(`[PY] ${line}`, 'info');
                }
            });
        });

        child.on('close', (code) => {
            if (code !== 0) {
                addLog(`Python 采集器非零退出 (Code ${code})`, 'warning');
            } else {
                addLog('Python 采集器执行完毕', 'success');
            }

            // 读取结果
            try {
                const resultFile = path.join(scriptDir, 'data/subscribes.txt');
                if (fs.existsSync(resultFile)) {
                    const content = fs.readFileSync(resultFile, 'utf8');
                    const urls = content.split('\n').map(x => x.trim()).filter(x => x && x.startsWith('http'));
                    resolve(urls);
                } else {
                    addLog('未找到 Python 生成的 subscribes.txt', 'warning');
                    resolve([]);
                }
            } catch (e) {
                addLog(`读取 Python 结果失败: ${e.message}`, 'error');
                resolve([]);
            }
        });

        child.on('error', (err) => {
            addLog(`启动 Python 进程失败: ${err.message}`, 'error');
            resolve([]);
        });
    });
}



// --- Clash 配置生成 ---
function generateClashConfig(proxies) {
    const uniqueNames = new Set();
    const proxyList = [];
    const addedNames = [];

    for (const p of proxies) {
        // 净化名称
        let name = (p.name || 'node').replace(/[,"]/g, '').trim();
        if (!name) name = `node_${Math.random().toString(36).substr(2, 5)}`;

        // 确保名称唯一
        let finalName = name;
        let counter = 1;
        while (uniqueNames.has(finalName)) {
            finalName = `${name}_${counter++}`;
        }
        uniqueNames.add(finalName);

        // 构建代理对象
        const proxy = {
            name: finalName,
            type: p.type,
            server: p.server,
            port: parseInt(p.port, 10) || 443
        };

        // 根据类型添加字段
        if (p.type === 'vmess') {
            proxy.uuid = p.uuid;
            proxy.alterId = p.alterId || 0;
            proxy.cipher = p.cipher || 'auto';
            if (p.network) proxy.network = p.network;
            if (p.tls) proxy.tls = true;
            if (p['skip-cert-verify']) proxy['skip-cert-verify'] = true;
            if (p.servername) proxy.servername = p.servername;
            if (p['ws-opts']) proxy['ws-opts'] = p['ws-opts'];
        } else if (p.type === 'vless') {
            proxy.uuid = p.uuid;
            if (p.flow) proxy.flow = p.flow;
            if (p.network) proxy.network = p.network;
            if (p.tls) proxy.tls = true;
            if (p['skip-cert-verify']) proxy['skip-cert-verify'] = true;
            if (p.servername) proxy.servername = p.servername;
            if (p['reality-opts']) proxy['reality-opts'] = p['reality-opts'];
            if (p['client-fingerprint']) proxy['client-fingerprint'] = p['client-fingerprint'];
            if (p['ws-opts']) proxy['ws-opts'] = p['ws-opts'];
            if (p['grpc-opts']) proxy['grpc-opts'] = p['grpc-opts'];
        } else if (p.type === 'trojan') {
            proxy.password = p.password;
            if (p.network) proxy.network = p.network;
            proxy.tls = true;
            if (p['skip-cert-verify']) proxy['skip-cert-verify'] = true;
            if (p.servername) proxy.servername = p.servername;
            if (p['ws-opts']) proxy['ws-opts'] = p['ws-opts'];
            if (p['grpc-opts']) proxy['grpc-opts'] = p['grpc-opts'];
        } else if (p.type === 'ss') {
            proxy.cipher = p.cipher || 'aes-256-gcm';
            proxy.password = p.password;
        } else if (p.type === 'hysteria2') {
            proxy.password = p.password;
            if (p.sni) proxy.sni = p.sni;
            if (p['skip-cert-verify']) proxy['skip-cert-verify'] = true;
        } else {
            continue; // 跳过不支持的类型
        }

        // 清理 undefined 值
        Object.keys(proxy).forEach(key => {
            if (proxy[key] === undefined) delete proxy[key];
        });

        proxyList.push(proxy);
        addedNames.push(finalName);

        // 保存原始名称映射
        p._clashName = finalName;
    }

    const config = {
        'mixed-port': CLASH_PORT_HTTP,
        'external-controller': CLASH_EXTERNAL_CONTROLLER,
        mode: 'Global',
        'log-level': 'warning',
        dns: {
            enable: true,
            nameserver: ['223.5.5.5', '119.29.29.29', '8.8.8.8', '1.1.1.1']
        },
        proxies: proxyList,
        'proxy-groups': [
            {
                name: 'PROXY',
                type: 'select',
                proxies: addedNames
            }
        ],
        rules: ['MATCH,PROXY']
    };

    fs.writeFileSync(CLASH_CONFIG, yaml.dump(config, { lineWidth: -1 }));
    addLog(`Clash 配置已生成，包含 ${proxyList.length} 个代理`, 'info');
    return proxyList;
}

// --- Clash 进程管理 ---
let clashProcess = null;

function startClash() {
    return new Promise((resolve, reject) => {
        if (clashProcess) {
            try { clashProcess.kill('SIGTERM'); } catch (e) { }
            clashProcess = null;
        }

        addLog(`启动 Clash: ${CLASH_BIN}`, 'info');

        // 确保二进制有执行权限
        try { fs.chmodSync(CLASH_BIN, 0o755); } catch (e) { }

        clashProcess = spawn(CLASH_BIN, ['-d', CLASH_DIR, '-f', CLASH_CONFIG], {
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let startupLog = '';

        clashProcess.stdout.on('data', d => {
            const msg = d.toString().trim();
            if (msg) console.log('Clash:', msg);
        });

        clashProcess.stderr.on('data', d => {
            const msg = d.toString().trim();
            if (msg) {
                console.error('ClashErr:', msg);
                startupLog += msg + '\n';
            }
        });

        // 监听早期退出
        const exitHandler = (code) => {
            if (!isResolved) {
                isResolved = true;
                clearInterval(checkInterval);
                const errMsg = `Clash 启动失败，进程意外退出 (Code ${code})。错误日志:\n${startupLog}`;
                addLog(errMsg, 'error');
                reject(new Error(errMsg));
            }
        };
        clashProcess.on('exit', exitHandler);

        clashProcess.on('error', (err) => {
            addLog(`Clash 启动失败: ${err.message}`, 'error');
            reject(err);
        });

        // 等待 Clash 启动
        let attempts = 0;
        const maxAttempts = 60; // 增加到 30 秒超时
        let isResolved = false;

        const checkInterval = setInterval(() => {
            if (isResolved) return;

            attempts++;
            const socket = new net.Socket();
            socket.setTimeout(500);
            socket.on('connect', () => {
                socket.destroy();
                if (!isResolved) {
                    isResolved = true;
                    clearInterval(checkInterval);
                    clashProcess.removeListener('exit', exitHandler); // 移除退出监听，避免误报
                    addLog('Clash 已启动', 'success');
                    resolve(clashProcess);
                }
            }).on('error', () => {
                socket.destroy();
                if (attempts >= maxAttempts) {
                    if (!isResolved) {
                        isResolved = true;
                        clearInterval(checkInterval);
                        reject(new Error('Clash 启动超时 (30s)'));
                    }
                }
            }).on('timeout', () => {
                socket.destroy();
            });
            socket.connect(CLASH_PORT_HTTP, '127.0.0.1');
        }, 500);
    });
}

function stopClash() {
    if (clashProcess) {
        try {
            clashProcess.kill('SIGTERM');
            addLog('Clash 已停止', 'info');
        } catch (e) { }
        clashProcess = null;
    }
}

// --- 节点验证 (使用 Clash External Controller API) ---
async function checkProxyDelay(proxyName, timeout = 10000) {
    // 稍微放宽策略：只要能访问 Google 或 Facebook 之一就算可用
    const testUrls = [
        'http://www.gstatic.com/generate_204',
        'https://www.google.com/generate_204',
        'https://www.facebook.com/'
    ];

    for (const testUrl of testUrls) {
        const delay = await checkSingleUrl(proxyName, timeout, testUrl);
        if (delay > 0) return delay;
    }
    return -1;
}

async function checkSingleUrl(proxyName, timeout, testUrl) {
    return new Promise((resolve) => {
        const encodedName = encodeURIComponent(proxyName);
        const url = `http://${CLASH_EXTERNAL_CONTROLLER}/proxies/${encodedName}/delay?timeout=${timeout}&url=${encodeURIComponent(testUrl)}`;

        const req = http.get(url, { timeout: timeout + 2000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.delay && result.delay > 0 && result.delay <= timeout) {
                        resolve(result.delay);
                    } else {
                        resolve(-1);
                    }
                } catch (e) {
                    resolve(-1);
                }
            });
        });

        req.on('error', () => resolve(-1));
        req.on('timeout', () => { req.destroy(); resolve(-1); });
    });
}

// 并发验证
async function validateProxies(proxies, concurrency = 64, delay = 10000) {
    addLog(`开始验证 ${proxies.length} 个节点 (并发: ${concurrency}, 超时: ${delay}ms)`, 'info');

    let validated = 0;
    let valid = 0;

    // 分批处理
    const batchSize = concurrency;
    for (let i = 0; i < proxies.length; i += batchSize) {
        const batch = proxies.slice(i, i + batchSize);

        const results = await Promise.all(
            batch.map(async (p) => {
                const latency = await checkProxyDelay(p._clashName || p.name, delay);
                validated++;

                if (latency > 0) {
                    valid++;
                    p.latency = latency;
                    return true;
                }
                p.latency = -1;
                return false;
            })
        );

        // 更新进度
        if (validated % 100 === 0 || validated === proxies.length) {
            addLog(`验证进度: ${validated}/${proxies.length}, 有效: ${valid}`, 'info');
            globalState.active = valid;
        }
    }

    const validProxies = proxies.filter(p => p.latency > 0);
    addLog(`验证完成: ${validProxies.length}/${proxies.length} 有效`, 'success');
    return validProxies;
}

// --- 纯净度检测 ---
async function checkPurity(proxy, clashProxyName) {
    // 通过代理访问 ip-api.com 获取 IP 信息
    const testUrl = 'http://ip-api.com/json?fields=status,countryCode,isp,org,hosting,proxy,query';

    return new Promise((resolve) => {
        const encodedName = encodeURIComponent(clashProxyName);
        // 使用 Clash API 先切换到该代理
        const switchUrl = `http://${CLASH_EXTERNAL_CONTROLLER}/proxies/PROXY`;

        const postData = JSON.stringify({ name: clashProxyName });

        const switchReq = http.request(switchUrl, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
            timeout: 3000
        }, (res) => {
            // 切换成功后检测IP
            setTimeout(async () => {
                try {
                    // 通过 Clash 代理发起请求
                    const result = await fetchViaProxy(testUrl, 8000);
                    const data = JSON.parse(result);

                    if (data.status === 'success') {
                        let score = 100;

                        // 扣分规则
                        if (data.hosting === true) score -= 30; // 机房 IP
                        if (data.proxy === true) score -= 20;   // 被标记为代理

                        // ISP 关键词检测
                        const isp = (data.isp || '').toLowerCase();
                        const org = (data.org || '').toLowerCase();
                        const badKeywords = ['datacenter', 'cloud', 'hosting', 'server', 'vps', 'digital ocean', 'amazon', 'google', 'microsoft', 'alibaba', 'tencent'];
                        for (const kw of badKeywords) {
                            if (isp.includes(kw) || org.includes(kw)) {
                                score -= 10;
                                break;
                            }
                        }

                        score = Math.max(0, score);
                        resolve({ score, ip: data.query, isp: data.isp, country: data.countryCode, hosting: data.hosting });
                    } else {
                        resolve({ score: 50, error: 'API failed' }); // 默认中等分数
                    }
                } catch (e) {
                    resolve({ score: 50, error: e.message });
                }
            }, 500);
        });

        switchReq.on('error', () => resolve({ score: 50, error: 'Switch failed' }));
        switchReq.on('timeout', () => { switchReq.destroy(); resolve({ score: 50, error: 'Timeout' }); });
        switchReq.write(postData);
        switchReq.end();
    });
}

// 通过本地 Clash 代理发起 HTTP 请求
function fetchViaProxy(url, timeout = 5000) {
    return new Promise((resolve, reject) => {
        const proxyAgent = `http://127.0.0.1:${CLASH_PORT_HTTP}`;

        const parsedUrl = new URL(url);
        const options = {
            hostname: '127.0.0.1',
            port: CLASH_PORT_HTTP,
            path: url,
            method: 'GET',
            headers: {
                'Host': parsedUrl.hostname,
                'User-Agent': 'Mozilla/5.0'
            },
            timeout: timeout
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
    });
}

// 批量纯净度检测
async function checkPurityBatch(proxies, concurrency = 10) {
    addLog(`开始纯净度检测 (${proxies.length} 个节点)...`, 'info');

    let checked = 0;
    const batchSize = concurrency;

    for (let i = 0; i < proxies.length; i += batchSize) {
        const batch = proxies.slice(i, i + batchSize);

        await Promise.all(batch.map(async (p) => {
            const result = await checkPurity(p, p._clashName || p.name);
            p.purityScore = result.score;
            p.purityInfo = result;
            checked++;
        }));

        if (checked % 20 === 0 || checked === proxies.length) {
            addLog(`纯净度检测进度: ${checked}/${proxies.length}`, 'info');
        }
    }

    addLog(`纯净度检测完成`, 'success');
}

// --- 网页抓取 (针对 NodeFree, ClashNode 等分享站) ---
async function scrapeWebSources() {
    addLog('开始抓取公开分享网站...', 'info');
    const sites = [
        'https://nodefree.org/',
        'https://clashnode.com/',
        'https://v2rayshare.com/'
    ];

    let allProxies = [];

    for (const site of sites) {
        try {
            // 访问首页，找最新文章
            addLog(`正在访问: ${site}`, 'info');
            const homeHtml = await fetchUrl(site, 10000);
            if (!homeHtml) continue;

            // 匹配文章链接
            const linkRegex = /href="(https?:\/\/[^"]+(?:\/202[56]\/[^"]+|node-[^"]+))"/g;
            const links = [];
            let match;
            while ((match = linkRegex.exec(homeHtml)) !== null) {
                if (!links.includes(match[1])) links.push(match[1]);
            }

            // 取前3篇文章
            const targetLinks = links.slice(0, 3);

            for (const link of targetLinks) {
                try {
                    const articleHtml = await fetchUrl(link, 8000);
                    if (!articleHtml) continue;

                    // 提取订阅链接 (yaml/txt)
                    const subLinkRegex = /(https?:\/\/[^"'\s]+\.(yaml|yml|txt))/g;
                    const subMatches = articleHtml.match(subLinkRegex);

                    if (subMatches) {
                        for (const subUrl of subMatches) {
                            if (subUrl.includes(site.split('/')[2])) continue;

                            addLog(`  发现订阅: ${subUrl}`, 'info');
                            const content = await fetchUrl(subUrl);
                            if (content) {
                                const parsed = parseContent(content);
                                if (parsed.length > 0) {
                                    parsed.forEach(p => {
                                        p.isFromWeb = true;
                                        p.webSource = site;
                                    });
                                    allProxies.push(...parsed);
                                }
                            }
                        }
                    }
                } catch (e) { }
            }

        } catch (e) {
            addLog(`抓取网站 ${site} 失败: ${e.message}`, 'warning');
        }
    }

    addLog(`网站抓取完成，共发现 ${allProxies.length} 个节点`, 'success');
    return allProxies;
}

// --- Telegram 频道直接抓取 (无需登录) ---
async function scrapeTelegramChannel(channelName) {
    const url = `https://t.me/s/${channelName}`;
    addLog(`正在抓取 Telegram 频道: ${channelName}`, 'info');

    try {
        const html = await fetchUrl(url, 10000);
        if (!html) return [];

        const proxies = [];
        const regex = /(vmess|vless|trojan|ss|hysteria2):\/\/[a-zA-Z0-9%\-._~:/?#[\]@!$&'()*+,;=]+/g;
        const matches = html.match(regex);

        if (matches) {
            matches.forEach(rawLink => {
                let cleanLink = rawLink.split('<')[0].split('"')[0].split('\'')[0].trim();
                cleanLink = cleanLink.replace(/&amp;/g, '&');
                if (cleanLink.length < 15) return;

                const type = cleanLink.split('://')[0];
                let proxy = null;

                if (type === 'vmess') proxy = parseVmess(cleanLink);
                else if (['vless', 'trojan', 'hysteria2'].includes(type) || cleanLink.startsWith('ss://')) {
                    if (cleanLink.startsWith('ss://')) {
                        try {
                            const u = new URL(cleanLink);
                            proxy = {
                                id: Math.random().toString(36).substr(2, 9),
                                name: decodeURIComponent(u.hash.slice(1)) || 'SS Node',
                                type: 'ss',
                                server: u.hostname,
                                port: parseInt(u.port),
                                raw: cleanLink
                            };
                        } catch (e) { }
                    } else {
                        proxy = parseStandardLink(cleanLink, type);
                    }
                }

                if (proxy) {
                    proxy.isFromTelegram = true;
                    proxy.telegramSource = channelName;
                    proxies.push(proxy);
                }
            });
        }
        return proxies;
    } catch (e) {
        addLog(`抓取频道 ${channelName} 失败: ${e.message}`, 'warning');
        return [];
    }
}

async function fetchFromTelegramChannels() {
    if (typeof TELEGRAM_CHANNELS === 'undefined' || TELEGRAM_CHANNELS.length === 0) return [];

    addLog(`开始从 ${TELEGRAM_CHANNELS.length} 个 Telegram 频道抓取...`, 'info');
    let allProxies = [];

    const batchSize = 3;
    for (let i = 0; i < TELEGRAM_CHANNELS.length; i += batchSize) {
        const batch = TELEGRAM_CHANNELS.slice(i, i + batchSize);
        const results = await Promise.all(batch.map(ch => scrapeTelegramChannel(ch)));
        results.forEach(p => allProxies.push(...p));
    }

    addLog(`Telegram 频道抓取完成，共发现 ${allProxies.length} 个节点`, 'success');
    return allProxies;
}

// --- 分享站挖掘 (Blog/Deep Search) ---
async function scrapeWebSites() {
    const sites = [
        'https://nodefree.org',
        'https://clashnode.com',
        'https://freeclashnode.com',
        'https://v2rayshare.com'
    ];

    addLog(`启动深度全网挖掘 (目标: ${sites.length} 个分享站)...`, 'info');
    let found = [];

    // 获取当前年月 (e.g. 2026/02)
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = (now.getMonth() + 1).toString().padStart(2, '0'); // MM is 01-12

    for (const site of sites) {
        try {
            const html = await fetchUrl(site, 8000); // 8s timeout
            if (!html) continue;

            // 提取所有链接
            const regex = /href=["'](.*?)["']/g;
            const hrefs = [];
            let match;
            while ((match = regex.exec(html)) !== null) hrefs.push(match[1]);

            // 筛选看似是最新文章的链接 (包含当前年份或月份)
            const targets = hrefs
                .filter(u => u.includes(site) || u.startsWith('/')) // 同站链接
                .map(u => u.startsWith('/') ? (site.endsWith('/') ? site.slice(0, -1) + u : site + u) : u)
                .filter(u => (u.includes(YYYY) || u.includes(`/${MM}/`) || u.includes(`-${MM}-`)) && !u.includes('#') && !u.includes('tag') && !u.includes('category'))
                .slice(0, 3); // 只取前3个

            for (const url of [...new Set(targets)]) {
                const pageHtml = await fetchUrl(url, 8000);
                if (pageHtml) {
                    const nodes = parseContent(pageHtml);
                    if (nodes.length > 0) {
                        addLog(`[Web挖矿] ${url} -> 发现 ${nodes.length} 个节点`, 'success');
                        found.push(...nodes);
                    }
                }
            }
        } catch (e) {
            // ignore
        }
    }
    return found;
}

// --- Linux.do 论坛抓取 (精简版，用于全网获取模式) ---
async function fetchFromLinuxDo() {
    addLog('启动 Linux.do 论坛节点抓取...', 'info');

    const allProxies = [];

    try {
        // 获取 Cookie (如果有)
        const cookie = getLinuxDoCookie();
        if (cookie) {
            addLog('已加载 Linux.do Cookie', 'info');
        }

        // 获取最近的帖子列表 (仅获取前3页，约60个帖子)
        const baseUrl = 'https://linux.do/tag/%E8%AE%A2%E9%98%85%E8%8A%82%E7%82%B9.json';
        let allTopics = [];

        for (let page = 0; page < 3; page++) {
            try {
                const pageUrl = page === 0 ? baseUrl : `${baseUrl}?page=${page}`;
                const listJson = await fetchLinuxDo(pageUrl, cookie);

                if (listJson.includes('<!DOCTYPE') || listJson.includes('login-required')) {
                    addLog(`Linux.do 访问受限 (页${page + 1})，跳过`, 'warning');
                    break;
                }

                const listData = JSON.parse(listJson);
                const topics = listData.topic_list?.topics || [];

                if (topics.length === 0) break;

                // 只取最近7天的帖子
                const now = new Date();
                const recentTopics = topics.filter(t => {
                    const created = new Date(t.created_at);
                    return (now - created) / (1000 * 60 * 60 * 24) <= 7;
                });

                allTopics = allTopics.concat(recentTopics);
                addLog(`Linux.do 第${page + 1}页: 发现 ${recentTopics.length} 个近期帖子`, 'info');

                await new Promise(r => setTimeout(r, 2000)); // Rate limit
            } catch (e) {
                addLog(`Linux.do 第${page + 1}页获取失败: ${e.message}`, 'warning');
            }
        }

        // 去重
        const uniqueTopics = [];
        const seenIds = new Set();
        for (const t of allTopics) {
            if (!seenIds.has(t.id)) {
                seenIds.add(t.id);
                uniqueTopics.push(t);
            }
        }

        addLog(`Linux.do 共发现 ${uniqueTopics.length} 个独立帖子，开始解析...`, 'info');

        // 限制处理数量
        const toProcess = uniqueTopics.slice(0, 30);

        for (let i = 0; i < toProcess.length; i++) {
            const topic = toProcess[i];
            try {
                const topicUrl = `https://linux.do/t/topic/${topic.id}.json`;
                const topicJson = await fetchLinuxDo(topicUrl, cookie);
                const topicData = JSON.parse(topicJson);

                const posts = topicData.post_stream?.posts || [];

                for (const post of posts.slice(0, 5)) { // 读取前5楼
                    const content = post.cooked || '';

                    // 提取节点链接
                    const nodePatterns = [
                        /vmess:\/\/[A-Za-z0-9+\/=_-]+/g,
                        /vless:\/\/[A-Za-z0-9@.:_\-?&=%#\/]+/g,
                        /trojan:\/\/[A-Za-z0-9@.:_\-?&=%#\/]+/g,
                        /ss:\/\/[A-Za-z0-9@.:_\-?&=%#\/]+/g,
                        /hysteria2?:\/\/[A-Za-z0-9@.:_\-?&=%#\/]+/g,
                        /hy2:\/\/[A-Za-z0-9@.:_\-?&=%#\/]+/g
                    ];

                    for (const pattern of nodePatterns) {
                        const matches = content.match(pattern) || [];
                        for (let m of matches) {
                            m = m.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').trim();
                            const parsed = parseContent(m);
                            if (parsed.length > 0) {
                                parsed.forEach(p => {
                                    p.isFromForum = true;
                                    p.forumSource = 'linux.do';
                                });
                                allProxies.push(...parsed);
                            }
                        }
                    }

                    // 提取订阅链接
                    const subPattern = /https?:\/\/[^\s<>"'\)]+(?:subscribe|sub|api|clash|v2ray)[^\s<>"'\)]*/gi;
                    const subMatches = content.match(subPattern) || [];

                    for (let url of subMatches.slice(0, 3)) { // 限制每个帖子最多3个订阅
                        url = url.replace(/&amp;/g, '&').replace(/[,;。，；]+$/, '').trim();
                        if (url.includes('linux.do') || url.includes('github.com')) continue;
                        if (url.length > 500) continue;

                        try {
                            const subContent = await fetchUrl(url, 10000);
                            const subProxies = parseContent(subContent);
                            if (subProxies.length > 0) {
                                subProxies.forEach(p => {
                                    p.isFromForum = true;
                                    p.forumSource = 'linux.do';
                                });
                                allProxies.push(...subProxies);
                                addLog(`  Linux.do 订阅 -> ${subProxies.length} 节点`, 'success');
                            }
                        } catch (e) {
                            // ignore subscription errors
                        }
                    }
                }

                if ((i + 1) % 10 === 0) {
                    addLog(`Linux.do 进度: ${i + 1}/${toProcess.length}, 已获取 ${allProxies.length} 节点`, 'info');
                }

                await new Promise(r => setTimeout(r, 1500)); // Rate limit
            } catch (e) {
                // ignore topic errors
            }
        }

    } catch (e) {
        addLog(`Linux.do 抓取异常: ${e.message}`, 'error');
    }

    // 去重
    const unique = removeDuplicates(allProxies);
    addLog(`Linux.do 抓取完成，共 ${unique.length} 个唯一节点`, 'success');

    return unique;
}

async function runAggregation(mode = 'github', pages = 50) {
    if (globalState.status !== 'idle') {
        addLog('聚合任务已在运行中', 'warning');
        return;
    }

    globalState.status = 'fetching';
    globalState.logs = [];
    globalState.total = 0;
    globalState.active = 0;

    addLog(`开始聚合任务 (模式: ${mode === 'all' ? '全网获取' : 'Github 更新'}, 爬取深度: ${pages})...`, 'info');

    try {
        let proxies = [];

        // 1. 获取 Github 节点 (总是执行)
        try {
            const githubProxies = await fetchSubscriptions(pages);
            proxies.push(...githubProxies);
        } catch (e) {
            addLog(`Github 获取失败: ${e.message}`, 'error');
        }



        // 2. 如果是全网获取模式
        if (mode === 'all') {
            // 网站抓取 (Blog/Deep Search)
            try {
                const webProxies = await scrapeWebSites();
                proxies.push(...webProxies);
            } catch (e) {
                addLog(`网站抓取失败: ${e.message}`, 'error');
            }

            // Linux.do 论坛抓取 (精简版)
            try {
                addLog('========== 开始 Linux.do 论坛抓取 ==========', 'info');
                const linuxDoProxies = await fetchFromLinuxDo();
                if (linuxDoProxies.length > 0) {
                    addLog(`Linux.do 抓取完成，获得 ${linuxDoProxies.length} 个节点`, 'success');
                    proxies.push(...linuxDoProxies);
                }
            } catch (e) {
                addLog(`Linux.do 抓取失败: ${e.message}`, 'error');
            }
        }

        // 深度去重 (基于 Server:Port:Ident)
        addLog(`抓取完成，开始深度去重 (初始: ${proxies.length})...`, 'info');
        proxies = removeDuplicates(proxies);
        addLog(`深度去重完成，剩余 ${proxies.length} 个节点`, 'info');

        addLog(`原始节点获取完成，共 ${proxies.length} 个唯一节点`, 'info');

        if (proxies.length === 0) {
            addLog('未获取到任何节点，任务结束', 'warning');
            globalState.status = 'idle';
            return;
        }

        globalState.status = 'testing';

        // 3. 生成 Clash 配置
        addLog('生成 Clash 测试配置...', 'info');
        generateClashConfig(proxies);

        // 4. 启动 Clash
        await startClash();
        await new Promise(r => setTimeout(r, 3000));

        // 5. 验证节点 (放宽条件: 10秒超时, 50并发)
        addLog('========== 开始节点验证 (并发: 50, 超时: 10000ms) ==========', 'info');
        const validProxies = await validateProxies(proxies, 50, 10000);

        // 6. 纯净度检测 (仅检测有效节点)
        if (validProxies.length > 0) {
            const proxiesNeedPurity = validProxies.filter(p => !p.purityInfo || !p.purityScore);
            if (proxiesNeedPurity.length > 0) {
                // 限制每次最多检测 50 个新节点，避免耗时过长
                const limit = 50;
                const target = proxiesNeedPurity.slice(0, limit);
                addLog(`========== 开始纯净度检测 (抽样 ${target.length} 个新节点) ==========`, 'info');
                await checkPurityBatch(target, 8);
            }

            // 按延迟排序
            validProxies.sort((a, b) => (a.latency || 99999) - (b.latency || 99999));
        }

        // 7. 保存结果
        if (validProxies.length > 0) {
            fs.writeFileSync(path.join(ROOT, 'proxies.json'), JSON.stringify(validProxies, null, 2));
            addLog(`已保存 ${validProxies.length} 个有效节点`, 'success');
        } else {
            addLog('未找到有效节点', 'warning');
        }

        globalState.total = proxies.length;
        globalState.active = validProxies.length;
        globalState.lastUpdated = new Date();
        addLog('========== 聚合完成 ==========', 'success');

    } catch (e) {
        addLog(`聚合任务致命错误: ${e.message}`, 'error');
        console.error(e);
    } finally {
        stopClash();
        globalState.status = 'idle';
    }
}

// --- 导出配置转换 ---
function proxyToClashObj(p) {
    if (!p.type || !p.server || !p.port) {
        return null;
    }

    const base = {
        name: p.name || 'node',
        type: p.type,
        server: p.server,
        port: parseInt(p.port, 10) || 443,
        // 通用优化
        tfo: true,
        'skip-cert-verify': p['skip-cert-verify'] !== undefined ? p['skip-cert-verify'] : true
    };

    if (p.udp) base.udp = true;

    if (p.type === 'vmess') {
        if (!p.uuid) return null;
        base.uuid = p.uuid;
        base.alterId = parseInt(p.alterId || 0, 10);
        base.cipher = p.cipher || 'auto';

        if (p.network) base.network = p.network;
        if (p.tls) base.tls = true;

        if (p.servername) base.servername = p.servername;

        // HTTP Obfuscation (TCP)
        if (p.network === 'tcp' && p.type === 'vmess' && !p.tls && (p.host || p.path)) {
            base['http-opts'] = {
                method: 'GET',
                path: [p.path || '/'],
                headers: p.host ? { Host: [p.host] } : undefined
            };
        }

        // WS 配置
        if (p['ws-opts']) {
            base['ws-opts'] = { ...p['ws-opts'] };
            // 确保 Host 头部存在
            if (p.host && !base['ws-opts'].headers) {
                base['ws-opts'].headers = { Host: p.host };
            }
        } else if (p.network === 'ws' && (p.path || p.host)) {
            base['ws-opts'] = {
                path: p.path || '/',
                headers: p.host ? { Host: p.host } : {}
            };
        }
    } else if (p.type === 'vless') {
        if (!p.uuid) return null;
        base.uuid = p.uuid;
        if (p.flow) base.flow = p.flow;
        if (p.network) base.network = p.network;
        if (p.tls) base.tls = true;

        if (p.servername) base.servername = p.servername;

        // Reality 关键配置
        if (p['reality-opts']) {
            base['reality-opts'] = { ...p['reality-opts'] };
        }

        // 指纹
        if (p['client-fingerprint']) {
            base['client-fingerprint'] = p['client-fingerprint'];
        }

        if (p['ws-opts']) base['ws-opts'] = p['ws-opts'];
        if (p['grpc-opts']) base['grpc-opts'] = p['grpc-opts'];

    } else if (p.type === 'trojan') {
        if (!p.password) return null;
        base.password = p.password;
        if (p.network) base.network = p.network;
        base.tls = true; // Trojan 必须 TLS

        if (p.servername) base.servername = p.servername; // 标准字段
        if (p.sni && !base.servername) base.servername = p.sni; // 兼容

        if (p['ws-opts']) base['ws-opts'] = p['ws-opts'];
        if (p['grpc-opts']) base['grpc-opts'] = p['grpc-opts'];
        if (p['client-fingerprint']) base['client-fingerprint'] = p['client-fingerprint'];

    } else if (p.type === 'ss') {
        if (!p.password) return null;
        base.cipher = p.cipher || 'aes-256-gcm';
        base.password = p.password;
        if (p.plugin) {
            base.plugin = p.plugin;
            base['plugin-opts'] = p['plugin-opts'];
        }

    } else if (p.type === 'hysteria2' || p.type === 'hy2') {
        if (!p.password) return null;
        base.type = 'hysteria2';
        base.password = p.password;
        // 兼容性字段：很多客户端还需要 auth
        base.auth = p.password;

        if (p.sni) base.sni = p.sni;
        if (!base.sni && p.servername) base.sni = p.servername;

        // 混淆
        if (p.obfs) {
            base.obfs = p.obfs;
            if (p['obfs-password']) base['obfs-password'] = p['obfs-password'];
        }

        if (p.up) base.up = parseInt(p.up);
        if (p.down) base.down = parseInt(p.down);

        if (p['client-fingerprint']) base['client-fingerprint'] = p['client-fingerprint'];
    } else {
        return null;
    }

    // 清理 undefined
    Object.keys(base).forEach(key => {
        if (base[key] === undefined) delete base[key];
    });

    return base;
}


// --- HTTP 服务器 ---
const server = http.createServer(async (req, res) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
        'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        return res.end();
    }

    const getBody = () => new Promise(resolve => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); } catch (e) { resolve({}); }
        });
    });

    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    // API: Github 刷新 (原 /api/refresh)
    if (parsedUrl.pathname === '/api/refresh' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            let mode = 'github';
            let pages = 50; // Default pages for manual trigger
            try {
                const data = JSON.parse(body);
                if (data.mode) mode = data.mode;
                if (data.pages) pages = parseInt(data.pages, 10);
            } catch (e) { }

            if (globalState.status === 'idle') {
                runAggregation(mode, pages);
                res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
                res.end(JSON.stringify({ success: true, message: `${mode === 'all' ? '全网' : 'Github'}聚合任务已启动 (深度: ${pages})` }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
                res.end(JSON.stringify({ success: false, message: '任务进行中', status: globalState.status }));
            }
        });
        return;
    }

    // API: 全网抓取 (Github + Telegram + Others)
    if (parsedUrl.pathname === '/api/fetch_all' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            let pages = 50; // Default pages for manual trigger
            try {
                const data = JSON.parse(body);
                if (data.pages) pages = parseInt(data.pages, 10);
            } catch (e) { }

            if (globalState.status === 'idle') {
                runAggregation('all', pages); // Pass mode and pages
                res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
                res.end(JSON.stringify({ success: true, message: `全网抓取任务已启动 (深度: ${pages})` }));
            } else {
                res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
                res.end(JSON.stringify({ success: false, message: '任务进行中', status: globalState.status }));
            }
        });
        return;
    }

    // API: 手动纯净度检查
    if (parsedUrl.pathname === '/api/check_purity' && req.method === 'POST') {
        try {
            const { proxies } = await getBody();
            if (!proxies || !Array.isArray(proxies) || proxies.length === 0) {
                res.writeHead(400, { 'Content-Type': 'application/json', ...headers });
                return res.end(JSON.stringify({ success: false, error: '没有提供节点' }));
            }

            addLog(`开始手动纯净度检查 (${proxies.length} 个节点)...`, 'info');

            const results = [];
            const batchSize = 10;

            for (let i = 0; i < proxies.length; i += batchSize) {
                const batch = proxies.slice(i, i + batchSize);

                await Promise.all(batch.map(async (p) => {
                    const result = await checkPurity(p, p._clashName || p.name);
                    results.push({
                        id: p.id,
                        server: p.server,
                        purityScore: result.score,
                        purityInfo: result
                    });
                }));

                if ((i + batchSize) % 20 === 0 || i + batchSize >= proxies.length) {
                    addLog(`纯净度检查进度: ${Math.min(i + batchSize, proxies.length)}/${proxies.length}`, 'info');
                }
            }

            addLog(`手动纯净度检查完成`, 'success');

            res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify({
                success: true,
                checked: results.length,
                results: results
            }));
        } catch (e) {
            console.error('纯净度检查错误:', e);
            res.writeHead(500, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
        return;
    }

    // API: 状态
    if (parsedUrl.pathname === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify(globalState));
        return;
    }

    // API: 获取节点
    if (parsedUrl.pathname === '/api/proxies' && req.method === 'GET') {
        try {
            const data = fs.readFileSync(path.join(ROOT, 'proxies.json'), 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
            res.end(data);
        } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
            res.end('[]');
        }
        return;
    }

    // API: Telegram 频道任务状态


    // API: 手动添加的节点 - 获取
    if (parsedUrl.pathname === '/api/manual_proxies' && req.method === 'GET') {
        const manualFile = path.join(ROOT, 'manual_proxies.json');
        try {
            const data = fs.readFileSync(manualFile, 'utf8');
            res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
            res.end(data);
        } catch (e) {
            res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
            res.end('[]');
        }
        return;
    }

    // API: 手动添加的节点 - 保存/添加
    if (parsedUrl.pathname === '/api/manual_proxies' && req.method === 'POST') {
        const manualFile = path.join(ROOT, 'manual_proxies.json');
        try {
            const body = await getBody();
            const proxies = body.proxies || [];

            // 读取现有数据
            let existing = [];
            if (fs.existsSync(manualFile)) {
                try {
                    existing = JSON.parse(fs.readFileSync(manualFile, 'utf8'));
                } catch (e) { existing = []; }
            }

            // 标记为手动添加
            proxies.forEach(p => {
                p.isManual = true;
                p.addedAt = new Date().toISOString();
            });

            // 合并去重 (基于 raw 字段)
            const existingRaw = new Set(existing.map(p => p.raw));
            const newProxies = proxies.filter(p => !existingRaw.has(p.raw));
            const merged = [...existing, ...newProxies];

            fs.writeFileSync(manualFile, JSON.stringify(merged, null, 2));

            res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify({ success: true, added: newProxies.length, total: merged.length }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
        return;
    }

    // API: 手动添加的节点 - 删除
    if (parsedUrl.pathname === '/api/manual_proxies' && req.method === 'DELETE') {
        const manualFile = path.join(ROOT, 'manual_proxies.json');
        try {
            const body = await getBody();
            const idsToDelete = body.ids || [];

            let existing = [];
            if (fs.existsSync(manualFile)) {
                try {
                    existing = JSON.parse(fs.readFileSync(manualFile, 'utf8'));
                } catch (e) { existing = []; }
            }

            const deleteSet = new Set(idsToDelete);
            const remaining = existing.filter(p => !deleteSet.has(p.id));

            fs.writeFileSync(manualFile, JSON.stringify(remaining, null, 2));

            res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify({ success: true, deleted: existing.length - remaining.length, remaining: remaining.length }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
        return;
    }

    // API: 清空所有节点
    if (parsedUrl.pathname === '/api/clear_all' && req.method === 'POST') {
        try {
            const proxiesFile = path.join(ROOT, 'proxies.json');
            const manualFile = path.join(ROOT, 'manual_proxies.json');
            const telegramFile = path.join(ROOT, 'telegram_proxies.json');

            // 清空所有节点文件
            fs.writeFileSync(proxiesFile, '[]');
            fs.writeFileSync(manualFile, '[]');
            if (fs.existsSync(telegramFile)) {
                fs.writeFileSync(telegramFile, '[]');
            }

            addLog('已清空所有节点文件', 'info');

            res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify({ success: true, message: '已清空所有节点' }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
        return;
    }

    // API: 从 linux.do 导入节点 (异步后台处理)
    if (parsedUrl.pathname === '/api/import_linuxdo' && req.method === 'POST') {
        if (isLinuxDoImporting) {
            res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify({ success: false, message: '任务已经在运行中，请等待完成' }));
            return;
        }

        // 触发后台任务
        runLinuxDoImportTask();

        res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
        res.end(JSON.stringify({
            success: true,
            message: '导入任务已在后台启动，请查看日志获取进度'
        }));
        return;
    }

    // API: 转换导出
    if (parsedUrl.pathname === '/api/convert' && req.method === 'POST') {
        try {
            const { proxies, type } = await getBody();
            if (!proxies || !Array.isArray(proxies) || proxies.length === 0) {
                res.writeHead(400, headers);
                return res.end('No proxies');
            }

            if (type === 'clash') {
                const uniqueNames = new Set();
                const proxyList = [];

                for (const p of proxies) {
                    const obj = proxyToClashObj(p);
                    if (!obj) continue;

                    // 名称处理：优先保留原名
                    // 仅移除可能导致 YAML 解析错误的字符，不做过度净化
                    let name = (obj.name || 'node').replace(/^\s+|\s+$/g, ''); // Trim only

                    // 解决名称冲突：添加后缀 _1, _2 等
                    let finalName = name;
                    let counter = 1;
                    while (uniqueNames.has(finalName)) {
                        finalName = `${name}_${counter++}`;
                    }
                    uniqueNames.add(finalName);
                    obj.name = finalName;

                    proxyList.push(obj);
                }

                // 基于模板生成配置，确保格式与目标订阅完全一致
                const templatePath = path.join(ROOT, 'clash_template.yaml');
                let config = {};

                if (fs.existsSync(templatePath)) {
                    try {
                        const templateContent = fs.readFileSync(templatePath, 'utf8');
                        config = yaml.load(templateContent);

                        // 1. 识别模板中的旧节点名称
                        const oldNodeNames = new Set((config.proxies || []).map(p => p.name));

                        // 2. 替换 Proxies
                        config.proxies = proxyList;
                        const newProxyNames = proxyList.map(p => p.name);

                        // 3. 智能更新 Proxy Groups
                        if (config['proxy-groups']) {
                            config['proxy-groups'].forEach(group => {
                                const originalProxies = group.proxies || [];
                                // 检查该组是否包含旧节点（如果是纯策略组如"其他流量"，通常没有任何旧节点名）
                                const hasOldNodes = originalProxies.some(p => oldNodeNames.has(p));

                                if (hasOldNodes) {
                                    const newGroupProxies = [];
                                    let nodesInserted = false;

                                    for (const p of originalProxies) {
                                        if (oldNodeNames.has(p)) {
                                            // 遇到第一个旧节点位置，插入所有新节点
                                            if (!nodesInserted) {
                                                newGroupProxies.push(...newProxyNames);
                                                nodesInserted = true;
                                            }
                                            // 后续的旧节点直接跳过（已被新列表替代）
                                        } else {
                                            // 保留特殊项（如 "🔰国外流量", "DIRECT", "🚀直接连接" 等）
                                            newGroupProxies.push(p);
                                        }
                                    }
                                    group.proxies = newGroupProxies;
                                }
                            });
                        }

                    } catch (e) {
                        console.error('Template parse error:', e);
                        // Fallback to simple config if template fails
                        config = { proxies: proxyList };
                    }
                } else {
                    config = { proxies: proxyList };
                }

                // 输出 YAML
                // lineWidth: -1 避免长行换行
                // noRefs: true 避免使用锚点引用
                let yamlStr = yaml.dump(config, {
                    lineWidth: -1,
                    noRefs: true
                });

                // 添加头部注释 (仿照目标格式)
                const nowStr = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
                const header = [
                    '#---------------------------------------------------#',
                    `## 更新：${nowStr}`,
                    '## Generator: Antigravity Aggregator',
                    '#---------------------------------------------------#',
                    ''
                ].join('\n');

                yamlStr = header + yamlStr;

                res.writeHead(200, { ...headers, 'Content-Type': 'text/yaml', 'Content-Disposition': 'attachment; filename="clash_config.yaml"' });
                return res.end(yamlStr);
            }

            res.writeHead(400, headers);
            res.end('Unsupported Type');
        } catch (e) {
            console.error(e);
            res.writeHead(500, headers);
            res.end('Error');
        }
        return;
    }

    // API: 代理中转
    if (parsedUrl.pathname === '/api/proxy') {
        const targetUrl = parsedUrl.searchParams.get('url');
        if (!targetUrl) { res.writeHead(400, headers); res.end('Missing url'); return; }

        try {
            const content = await fetchUrl(targetUrl);

            // 检查是否返回了 HTML 页面（可能是登录页或错误页）
            if (content.includes('<!DOCTYPE') || content.includes('<html')) {
                res.writeHead(400, { 'Content-Type': 'application/json', ...headers });
                res.end(JSON.stringify({ error: '订阅链接返回了网页而非节点数据，请检查链接是否正确或是否需要登录' }));
                return;
            }

            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
            res.end(content);
        } catch (e) {
            console.error('Proxy fetch error:', e.message);
            res.writeHead(500, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify({ error: `获取订阅失败: ${e.message}` }));
        }
        return;
    }

    const MANUAL_PROXIES_FILE = path.join(ROOT, 'manual_proxies.json');

    // Helper: Check TCP Connectivity
    function checkTcpConnectivity(host, port, timeout = 5000) {
        return new Promise((resolve) => {
            const start = Date.now();
            const socket = new net.Socket();
            let status = 'timeout';

            socket.setTimeout(timeout);

            socket.on('connect', () => {
                status = 'success';
                const time = Date.now() - start;
                socket.destroy();
                resolve({ success: true, latency: time });
            });

            socket.on('timeout', () => {
                status = 'timeout';
                socket.destroy();
                resolve({ success: false, error: 'Timeout' });
            });

            socket.on('error', (err) => {
                status = 'error';
                resolve({ success: false, error: err.message });
            });

            try {
                socket.connect(port, host);
            } catch (e) {
                resolve({ success: false, error: e.message });
            }
        });
    }

    // ... existing code ...

    // API: 手动纯净度检查
    if (parsedUrl.pathname === '/api/check_purity' && req.method === 'POST') {
        // ... (keep existing)
    }

    // API: 服务器端连通性测试 (替代本地真连接测试)
    if (parsedUrl.pathname === '/api/check_connectivity' && req.method === 'POST') {
        try {
            const { proxies } = await getBody();
            if (!Array.isArray(proxies)) throw new Error('Invalid proxies array');

            // Limit concurrency
            const results = {};
            const queue = [...proxies];
            const concurrency = 20;
            const activeWorkers = [];

            const worker = async () => {
                while (queue.length > 0) {
                    const p = queue.shift();
                    if (!p || !p.server || !p.port) continue;

                    try {
                        const res = await checkTcpConnectivity(p.server, parseInt(p.port));
                        results[p.id] = res;
                    } catch (e) {
                        results[p.id] = { success: false, error: e.message };
                    }
                }
            };

            for (let i = 0; i < concurrency; i++) activeWorkers.push(worker());
            await Promise.all(activeWorkers);

            res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify({ success: true, results }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json', ...headers });
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
        return;
    }

    // API: IP 检测 (批量) - 带缓存
    if (parsedUrl.pathname === '/api/check_ip_batch' && req.method === 'POST') {
        let body = [];
        req.on('data', chunk => body.push(chunk));
        req.on('end', () => {
            try {
                const rawBody = JSON.parse(Buffer.concat(body).toString());
                let ips = [];
                let forceUpdate = false;

                // 兼容两种参数格式：["ip1", "ip2"] 或 { queries: ["ip1"], force: true }
                if (Array.isArray(rawBody)) {
                    ips = rawBody;
                } else if (rawBody && Array.isArray(rawBody.queries)) {
                    ips = rawBody.queries;
                    forceUpdate = !!rawBody.force;
                } else {
                    res.writeHead(400, headers);
                    return res.end('Invalid input');
                }

                const results = [];
                const toCheck = [];
                const ipToIndex = {}; // 记录需要 check 的 IP 在原始数组中的位置 (如果有序需求)，这里主要用于去重和映射

                ips.forEach(ip => {
                    // 如果不强制，且库里有，且数据较新(这里暂不校验时间)，直接用
                    if (!forceUpdate && purityDB[ip]) {
                        results.push({ query: ip, ...purityDB[ip].info, status: 'success', fromCache: true });
                    } else {
                        toCheck.push(ip);
                    }
                });

                if (toCheck.length === 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
                    return res.end(JSON.stringify(results));
                }

                // 分批请求 ip-api (batch limit 100)
                const batchSize = 100;
                const chunks = [];
                for (let i = 0; i < toCheck.length; i += batchSize) {
                    chunks.push(toCheck.slice(i, i + batchSize));
                }

                // 递归或循环处理 chunks
                let fetchResults = [];

                const processChunks = async () => {
                    const concurrency = 5;
                    const queue = [...toCheck];
                    const activeWorkers = [];

                    const checkIp = async (query) => {
                        return new Promise(async (resolve) => {
                            let ip = query;

                            // 1. Resolve Domain if needed
                            if (net.isIP(query) === 0) {
                                try {
                                    const dns = require('dns');
                                    // Use lookup which uses OS resolver (hosts file, etc)
                                    ip = await new Promise((res, rej) => {
                                        dns.lookup(query, (err, address) => {
                                            if (err) rej(err); else res(address);
                                        });
                                    });
                                } catch (e) {
                                    // DNS failed
                                    return resolve(null);
                                }
                            }

                            // Randomize User-Agent to avoid simple blocks
                            const headers = { 'User-Agent': `Mozilla/5.0 (Node.js) App/1.0` };
                            fetchUrl(`http://ipwho.is/${ip}`, 10000, headers)
                                .then(raw => {
                                    try {
                                        const data = JSON.parse(raw);
                                        if (data.success) {
                                            resolve({
                                                query: query, // Return original query (domain) as key
                                                status: 'success',
                                                countryCode: data.country_code,
                                                isp: data.connection?.isp || data.isp || 'Unknown',
                                                org: data.connection?.org || data.org || '',
                                                hosting: false
                                            });
                                        } else {
                                            resolve(null);
                                        }
                                    } catch (e) { resolve(null); }
                                })
                                .catch(() => resolve(null));
                        });
                    };

                    const worker = async () => {
                        while (queue.length > 0) {
                            const ip = queue.shift();
                            if (!ip) continue;
                            const res = await checkIp(ip);
                            if (res) {
                                fetchResults.push(res);
                            }
                            // Small delay to be nice
                            await new Promise(r => setTimeout(r, 200));
                        }
                    };

                    for (let i = 0; i < concurrency; i++) {
                        activeWorkers.push(worker());
                    }
                    await Promise.all(activeWorkers);

                    // 更新 DB
                    fetchResults.forEach(item => {
                        if (item && item.query && item.status === 'success') {
                            // Purity Score Calculation
                            let score = 100;
                            const isp = (item.isp || '').toLowerCase();
                            const org = (item.org || '').toLowerCase();

                            // Keywords indicating Data Center / Cloud / Hosting
                            const dcKeywords = ['cloud', 'data', 'hosting', 'server', 'network', 'alibaba', 'tencent', 'amazon', 'google', 'microsoft', 'azure', 'digitalocean', 'vultr', 'linode', 'oracle', 'ovh', 'cdn', 'rackspace'];

                            // Guess 'hosting' bool
                            if (dcKeywords.some(k => isp.includes(k) || org.includes(k))) {
                                item.hosting = true;
                                score -= 40;
                            } else {
                                score += 5;
                            }

                            // Specific punishments
                            if (isp.includes('google') || isp.includes('amazon') || isp.includes('cloud') || isp.includes('microsoft')) {
                                score -= 10;
                            }

                            score = Math.max(0, Math.min(100, score));

                            purityDB[item.query] = {
                                score: score,
                                info: {
                                    countryCode: item.countryCode,
                                    isp: item.isp,
                                    hosting: item.hosting
                                },
                                updatedAt: Date.now()
                            };
                            // 合并到最终结果
                            results.push(item);
                        }
                    });
                    savePurityDB();

                    res.writeHead(200, { 'Content-Type': 'application/json', ...headers });
                    res.end(JSON.stringify(results));
                };


                processChunks();

            } catch (e) {
                res.writeHead(500, headers);
                res.end('[]');
            }
        });
        return;
    }

    // 静态文件服务
    let filePath = path.join(ROOT, parsedUrl.pathname);

    // 处理目录访问：自动返回 index.html
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    // 根路径处理
    if (parsedUrl.pathname === '/') {
        filePath = path.join(ROOT, 'Projects', 'Aggregator', 'index.html');
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, { 'Content-Type': mimeType, ...headers });
        fs.createReadStream(filePath).pipe(res);
    } else {
        res.writeHead(404, headers);
        res.end('Not Found');
    }
});

// --- 自动更新任务 ---
const AUTO_UPDATE_INTERVAL = 6 * 60 * 60 * 1000; // 6 Hours
let autoUpdateTimer = null;

function startAutoUpdateJob() {
    if (autoUpdateTimer) clearInterval(autoUpdateTimer);

    // Set first next update time
    globalState.nextAutoUpdate = new Date(Date.now() + AUTO_UPDATE_INTERVAL).toISOString();

    autoUpdateTimer = setInterval(() => {
        addLog('⏰ 触发定时任务: 全网节点更新 (深度爬取 200 页)', 'info');
        runAggregation('all', 200); // Full Fetch with Deep Crawl
        // Update next time
        globalState.nextAutoUpdate = new Date(Date.now() + AUTO_UPDATE_INTERVAL).toISOString();
    }, AUTO_UPDATE_INTERVAL);

    console.log(`  自动更新任务已启动 (每 6 小时)`);
}

server.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  Antigravity Airport Aggregator`);
    console.log(`  服务器运行于 http://localhost:${PORT}`);
    console.log(`  API: /api/refresh, /api/status, /api/proxies`);
    console.log(`========================================\n`);

    // Start the job
    startAutoUpdateJob();
});

// 优雅退出
process.on('SIGINT', () => {
    console.log('\n正在关闭...');
    if (autoUpdateTimer) clearInterval(autoUpdateTimer);
    stopClash();
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    if (autoUpdateTimer) clearInterval(autoUpdateTimer);
    stopClash();
    server.close();
    process.exit(0);
});