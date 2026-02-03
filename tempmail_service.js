/**
 * 临时邮箱服务 - 使用 Mail.tm API
 * 通过 HTTP API 获取邮件，无需 IMAP 连接
 */

const https = require('https');

const API_BASE = 'https://api.mail.tm';

// 当前会话的临时邮箱信息
let currentAccount = null;

/**
 * 发起 HTTPS 请求
 */
function apiRequest(method, path, data = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(API_BASE + path);
        const options = {
            hostname: url.hostname,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };

        if (token) {
            options.headers['Authorization'] = `Bearer ${token}`;
        }

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const json = body ? JSON.parse(body) : {};
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(json);
                    } else {
                        reject(new Error(`API错误 ${res.statusCode}: ${json.message || body}`));
                    }
                } catch (e) {
                    reject(new Error(`解析响应失败: ${body}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(15000, () => {
            req.destroy();
            reject(new Error('请求超时'));
        });

        if (data) {
            req.write(JSON.stringify(data));
        }
        req.end();
    });
}

/**
 * 获取可用的邮箱域名
 */
async function getDomains() {
    const result = await apiRequest('GET', '/domains');

    // 兼容两种响应格式
    let members = result;
    if (result['hydra:member']) {
        members = result['hydra:member'];
    }

    if (Array.isArray(members) && members.length > 0) {
        return members.map(d => d.domain);
    }

    throw new Error('没有可用的邮箱域名');
}


/**
 * 生成随机字符串
 */
function randomString(length = 10) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * 创建临时邮箱账户
 * @returns {Promise<{address: string, password: string, token: string, id: string}>}
 */
async function createTempMailAccount() {
    try {
        // 获取可用域名
        const domains = await getDomains();
        const domain = domains[0];

        // 生成账户信息
        const username = 'ag' + randomString(8);
        const email = `${username}@${domain}`;
        const password = randomString(16);

        console.log(`[TempMail] 创建临时邮箱: ${email}`);

        // 创建账户
        const account = await apiRequest('POST', '/accounts', {
            address: email,
            password: password
        });

        // 登录获取 token
        const auth = await apiRequest('POST', '/token', {
            address: email,
            password: password
        });

        currentAccount = {
            id: account.id,
            address: email,
            password: password,
            token: auth.token
        };

        console.log(`[TempMail] 临时邮箱已创建: ${email}`);
        return currentAccount;
    } catch (e) {
        console.error(`[TempMail] 创建邮箱失败: ${e.message}`);
        throw e;
    }
}

/**
 * 获取当前临时邮箱的邮件列表
 */
async function getMessages() {
    if (!currentAccount || !currentAccount.token) {
        throw new Error('请先创建临时邮箱账户');
    }

    const result = await apiRequest('GET', '/messages', null, currentAccount.token);
    // 兼容两种响应格式
    if (Array.isArray(result)) {
        return result;
    }
    return result['hydra:member'] || [];
}


/**
 * 获取单封邮件的详细内容
 */
async function getMessage(messageId) {
    if (!currentAccount || !currentAccount.token) {
        throw new Error('请先创建临时邮箱账户');
    }

    return await apiRequest('GET', `/messages/${messageId}`, null, currentAccount.token);
}

/**
 * 从邮件内容中提取验证码
 */
function extractVerifyCode(text) {
    if (!text) return null;

    // 常见的验证码模式
    const patterns = [
        /验证码[：:]\s*(\d{4,8})/,
        /code[：:]\s*(\d{4,8})/i,
        /verification[：:]\s*(\d{4,8})/i,
        /\b(\d{6})\b/,  // 6位数字
        /\b(\d{4})\b/   // 4位数字
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return match[1];
        }
    }

    return null;
}

/**
 * 等待并获取验证码
 * @param {number} timeout - 超时时间（毫秒）
 * @param {number} interval - 轮询间隔（毫秒）
 * @returns {Promise<string|null>}
 */
async function waitForVerifyCode(timeout = 60000, interval = 3000) {
    if (!currentAccount) {
        throw new Error('请先创建临时邮箱账户');
    }

    console.log(`[TempMail] 等待验证码邮件 (${currentAccount.address})...`);

    const startTime = Date.now();
    let lastMessageCount = 0;

    while (Date.now() - startTime < timeout) {
        try {
            const messages = await getMessages();

            if (messages.length > lastMessageCount) {
                // 有新邮件
                for (let i = lastMessageCount; i < messages.length; i++) {
                    const msg = messages[i];
                    console.log(`[TempMail] 收到邮件: ${msg.subject}`);

                    // 获取邮件详细内容
                    const detail = await getMessage(msg.id);
                    const content = detail.text || detail.html || '';

                    const code = extractVerifyCode(content);
                    if (code) {
                        console.log(`[TempMail] 提取到验证码: ${code}`);
                        return code;
                    }
                }
                lastMessageCount = messages.length;
            }
        } catch (e) {
            console.error(`[TempMail] 检查邮件失败: ${e.message}`);
        }

        // 等待下一次轮询
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    console.log('[TempMail] 等待验证码超时');
    return null;
}

/**
 * 获取当前临时邮箱地址
 */
function getCurrentAddress() {
    return currentAccount ? currentAccount.address : null;
}

/**
 * 重置（创建新的临时邮箱）
 */
function reset() {
    currentAccount = null;
}

module.exports = {
    createTempMailAccount,
    getMessages,
    getMessage,
    waitForVerifyCode,
    getCurrentAddress,
    reset,
    getDomains
};
