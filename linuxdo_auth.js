const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'email_config.json');
const COOKIE_FILE = path.join(__dirname, 'linuxdo_cookie.txt');
const CHROME_PATH = '/usr/bin/google-chrome';

// 获取配置
function getConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            if (config.linuxdo && config.linuxdo.email && config.linuxdo.password) {
                return config.linuxdo;
            }
        }
    } catch (e) { }
    console.error('Config missing or invalid. Please check email_config.json');
    return null;
}

async function loginLinuxDo() {
    const config = getConfig();
    if (!config) process.exit(1);

    console.log('Starting Linux.do login via Google OAuth...');
    let browser = null;

    try {
        browser = await puppeteer.launch({
            executablePath: CHROME_PATH,
            headless: true, // 使用无头模式 (服务器环境)
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-blink-features=AutomationControlled',
                '--window-size=1280,800'
            ]
        });

        const page = await browser.newPage();

        // 设置 User Agent 防止简单的反爬
        await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        // 1. 访问登录页
        console.log('Navigating to login page...');
        await page.goto('https://linux.do/login', { waitUntil: 'networkidle2', timeout: 30000 });

        // 2. 点击 "使用 Google 登录"
        console.log('Clicking Google Login...');
        // 等待登录按钮出现
        try {
            const loginBtn = await page.waitForSelector('.btn-social.google', { timeout: 5000 });
            if (loginBtn) await loginBtn.click();
        } catch (e) {
            // 可能是 Discourse 的另一种布局
            const googleBtn = await page.$('button[title="with Google"]');
            if (googleBtn) await googleBtn.click();
            else {
                // 尝试查找包含 Google 文本的按钮
                await page.evaluate(() => {
                    const btns = document.querySelectorAll('button');
                    for (const btn of btns) {
                        if (btn.innerText.includes('Google')) {
                            btn.click();
                            return;
                        }
                    }
                });
            }
        }

        // 3. 处理 Google 登录流程
        // 注意：Google 自动化登录检测非常严格。
        console.log('Waiting for Google login form...');
        await page.waitForTimeout(3000);

        // 检测是否还在 Linux.do 页面 (如果没跳转)
        if (page.url().includes('linux.do')) {
            console.error('Failed to initiate Google login redirect.');
            // 截图调试
            await page.screenshot({ path: path.join(__dirname, 'logs', 'login_fail_redirect.png') });
            throw new Error('Login redirect failed');
        }

        // 输入邮箱
        const emailSelector = 'input[type="email"]';
        try {
            await page.waitForSelector(emailSelector, { timeout: 10000 });
            console.log('Entering email...');
            await page.type(emailSelector, config.email, { delay: 100 });
            await page.keyboard.press('Enter');
        } catch (e) {
            console.error('Email input not found');
            await page.screenshot({ path: path.join(__dirname, 'logs', 'login_fail_email.png') });
            throw e;
        }

        await page.waitForTimeout(2000);

        // 输入密码
        const passwordSelector = 'input[type="password"]';
        try {
            await page.waitForSelector(passwordSelector, { timeout: 10000 });
            console.log('Entering password...');
            await page.type(passwordSelector, config.password, { delay: 100 });
            await page.keyboard.press('Enter');
        } catch (e) {
            // 可能是 2FA 或者其他验证，或者是账号输入后直接报错
            console.error('Password input not found or previous step failed');
            await page.screenshot({ path: path.join(__dirname, 'logs', 'login_fail_pwd.png') });
            throw e;
        }

        // 等待登录完成重定向回 Linux.do
        console.log('Waiting for login to complete...');
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 });

        if (page.url().includes('linux.do')) {
            console.log('Login successful! Saving cookies...');
            const cookies = await page.cookies();
            // 格式化为 Header 格式 (key=value; key=value)
            const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
            fs.writeFileSync(COOKIE_FILE, cookieString);
            console.log(`Saved ${cookies.length} cookies to ${COOKIE_FILE}`);
        } else {
            console.error('Login finished but not redirected to Linux.do');
            console.log('Current URL:', page.url());
            await page.screenshot({ path: path.join(__dirname, 'logs', 'login_fail_final.png') });
        }

    } catch (e) {
        console.error('Login failed:', e.message);
    } finally {
        if (browser) await browser.close();
    }
}

if (require.main === module) {
    loginLinuxDo();
}

module.exports = { loginLinuxDo };
