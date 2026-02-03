
const https = require('https');

const SUBSCRIPTION_SOURCES = [
    'https://raw.githubusercontent.com/yebekhe/TelegramV2rayCollector/main/sub/normal/mix',
    'https://raw.githubusercontent.com/mahdibland/V2RayAggregator/master/sub/sub_merge.txt',
    'https://raw.githubusercontent.com/r0ster/v2ray_node/main/v2ray.txt',
    'https://raw.githubusercontent.com/ts-sf/fly/main/v2'
];

async function testFetch() {
    console.log('Node version:', process.version);
    try {
        if (typeof fetch === 'undefined') {
            console.log('fetch is undefined!');
        } else {
            console.log('fetch is defined.');
        }

        for (const url of SUBSCRIPTION_SOURCES) {
            console.log(`Fetching ${url}...`);
            try {
                // simple https get fallback
                const content = await new Promise((resolve, reject) => {
                    https.get(url, (res) => {
                        let data = '';
                        res.on('data', c => data += c);
                        res.on('end', () => resolve(data));
                    }).on('error', reject);
                });
                console.log(`Success! Length: ${content.length}`);
                // Try base64 decode check
                const trimmed = content.trim();
                if (!trimmed.includes('://')) {
                    console.log('Likely base64');
                } else {
                    console.log('Plain text');
                }
            } catch (e) {
                console.error(`Failed: ${e.message}`);
            }
        }
    } catch (e) {
        console.error(e);
    }
}

testFetch();
