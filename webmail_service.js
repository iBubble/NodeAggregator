/**
 * 网页邮箱验证码获取服务
 * 使用 Puppeteer 自动登录 126/163 邮箱网页版获取验证码
 * 绕过 IMAP 端口被阻止的问题
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const CHROME_PATH = '/usr/bin/google-chrome';
const CONFIG_FILE = path.join(__dirname, 'email_config.json');

// 加载配置
let emailConfig = null;
try {
    if (fs.existsSync(CONFIG_FILE)) {
        emailConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
} catch (e) {
    console.error('加载邮箱配置失败:', e.message);
}

/**
 * 从邮件内容中提取验证码
 */
function extractVerifyCode(text) {
    if (!text) return null;

    // 常见的验证码模式
    const patterns = [
        /验证码[：:]\s*(\d{4,8})/,
        /验证码[：:]\s*<[^>]*>(\d{4,8})/,
        /code[：:]\s*(\d{4,8})/i,
        /(\d{6})/,  // 6位数字优先
        /(\d{4})/   // 4位数字
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
 * 使用网页版邮箱获取验证码
 * @param {string} fromDomain - 发件人域名（可选）
 * @param {number} timeout - 超时时间（毫秒）
 */
async function getVerifyCodeFromWebmail(fromDomain = null, timeout = 90000) {
    if (!emailConfig || !emailConfig.email) {
        throw new Error('未配置邮箱账号');
    }

    let browser = null;
    const email = emailConfig.email.address;
    const password = emailConfig.email.password;

    console.log(`[WebMail] 开始登录 ${email} 获取验证码...`);

    try {
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1280,800'
            ],
            timeout: 30000
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 访问 126/163 邮箱登录页面
        const is126 = email.includes('@126.com');
        const loginUrl = is126 ? 'https://mail.126.com/' : 'https://mail.163.com/';

        console.log(`[WebMail] 访问: ${loginUrl}`);
        await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(3000);

        // 切换到密码登录（163/126 默认是扫码登录）
        try {
            // 查找切换到密码登录的按钮
            const switchBtns = await page.$$('a, span, div');
            for (const btn of switchBtns) {
                const text = await page.evaluate(el => el.textContent, btn);
                if (text && (text.includes('密码登录') || text.includes('账号登录'))) {
                    await btn.click();
                    await page.waitForTimeout(1500);
                    break;
                }
            }
        } catch (e) {
            // 可能已经是密码登录模式
        }

        // 登录框在 iframe 中
        let loginFrame = page;
        const frames = page.frames();
        for (const frame of frames) {
            const url = frame.url();
            if (url.includes('login') || url.includes('dl.reg')) {
                loginFrame = frame;
                break;
            }
        }

        // 输入用户名（只输入 @ 前面的部分）
        const username = email.split('@')[0];
        console.log(`[WebMail] 输入用户名: ${username}`);

        await loginFrame.waitForSelector('input[name="email"]', { timeout: 10000 }).catch(() => null);
        const usernameInput = await loginFrame.$('input[name="email"]') ||
            await loginFrame.$('input[placeholder*="邮箱"]') ||
            await loginFrame.$('input[type="text"]');

        if (usernameInput) {
            await usernameInput.click({ clickCount: 3 });
            await usernameInput.type(username, { delay: 50 });
        }

        // 输入密码（授权密码）
        console.log('[WebMail] 输入密码');
        const passwordInput = await loginFrame.$('input[name="password"]') ||
            await loginFrame.$('input[type="password"]');

        if (passwordInput) {
            await passwordInput.click({ clickCount: 3 });
            await passwordInput.type(password, { delay: 50 });
        }

        // 点击登录按钮
        await page.waitForTimeout(500);
        const loginBtn = await loginFrame.$('#dologin') ||
            await loginFrame.$('a#dologin') ||
            await loginFrame.$('button[type="submit"]');

        if (loginBtn) {
            await loginBtn.click();
            console.log('[WebMail] 点击登录按钮');
        }

        // 等待登录完成
        await page.waitForTimeout(5000);

        // 检查是否登录成功
        const currentUrl = page.url();
        console.log(`[WebMail] 当前页面: ${currentUrl}`);

        if (currentUrl.includes('errorMsg') || currentUrl.includes('error')) {
            throw new Error('登录失败');
        }

        // 等待邮件列表加载
        await page.waitForTimeout(3000);

        // 查找最新的验证码邮件
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            try {
                // 刷新收件箱
                await page.keyboard.press('F5');
                await page.waitForTimeout(3000);

                // 获取邮件列表
                const pageContent = await page.content();

                // 查找包含验证码关键词的邮件
                if (pageContent.includes('验证码') || pageContent.includes('verification')) {
                    // 尝试点击第一封邮件
                    const mailItem = await page.$('div[id^="mail_"]') ||
                        await page.$('.nui-list-item') ||
                        await page.$('tr.mbox-item');

                    if (mailItem) {
                        await mailItem.click();
                        await page.waitForTimeout(2000);

                        // 获取邮件内容
                        const mailContent = await page.evaluate(() => {
                            const body = document.querySelector('.mail-body') ||
                                document.querySelector('.mail-content') ||
                                document.querySelector('#content_html');
                            return body ? body.textContent : document.body.textContent;
                        });

                        const code = extractVerifyCode(mailContent);
                        if (code) {
                            console.log(`[WebMail] 获取到验证码: ${code}`);
                            return code;
                        }
                    }
                }
            } catch (e) {
                console.error(`[WebMail] 查找邮件失败: ${e.message}`);
            }

            await page.waitForTimeout(5000);
        }

        console.log('[WebMail] 超时，未找到验证码邮件');
        return null;

    } catch (e) {
        console.error(`[WebMail] 错误: ${e.message}`);
        return null;
    } finally {
        if (browser) {
            await browser.close().catch(() => { });
        }
    }
}

/**
 * 获取邮箱地址
 */
function getEmailAddress() {
    return emailConfig?.email?.address || null;
}

/**
 * 获取机场注册密码
 */
function getAirportPassword() {
    return emailConfig?.airport?.password || 'Gl5181081@jc';
}

module.exports = {
    getVerifyCodeFromWebmail,
    getEmailAddress,
    getAirportPassword,
    extractVerifyCode
};
