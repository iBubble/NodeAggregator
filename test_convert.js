const yaml = require('js-yaml');

// 模拟 app.js 中的 proxyToClashObj 函数 (已包含 UDP 修复)
function proxyToClashObj(p) {
    // 验证基本必需字段
    if (!p.type || !p.server || !p.port) {
        return null;
    }

    const base = {
        name: p.name || 'node',
        type: p.type,
        server: p.server,
        port: parseInt(p.port, 10) || 443
    };

    if (p.type === 'vmess') {
        // vmess 必须有 uuid
        if (!p.uuid) return null;
        base.uuid = p.uuid;
        base.alterId = p.alterId || 0;
        base.cipher = p.cipher || 'auto';
        if (p.network) base.network = p.network;
        if (p.tls) base.tls = true;
        base['skip-cert-verify'] = true;

        // --- 刚刚添加的 UDP 修复 ---
        if (p.udp) base.udp = true;

        if (p.servername) base.servername = p.servername;
        if (p['ws-opts']) base['ws-opts'] = p['ws-opts'];
    }

    return base;
}

// 您的原始节点数据 (从订阅链接返回的 JSON 中提取)
const originalNode = {
    "name": "标准|香港01解锁",
    "type": "vmess",
    "server": "ppy-hkv1.kunlun02dns.com",
    "port": 26010,
    "uuid": "f5f26521-6dac-3b14-96b0-f1c7ad47746d",
    "alterId": 0,
    "cipher": "auto",
    "udp": true
};

console.log("=== 原始节点数据 ===");
console.log(JSON.stringify(originalNode, null, 2));

const converted = proxyToClashObj(originalNode);

console.log("\n=== 转换后的 Clash 对象 ===");
console.log(JSON.stringify(converted, null, 2));

console.log("\n=== 转换后的 YAML (Clash) ===");
console.log(yaml.dump({ proxies: [converted] }));
