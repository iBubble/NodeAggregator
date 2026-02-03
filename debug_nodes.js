const http = require('http');
const net = require('net');
const url = require('url');

// Fetch proxies from local API
const getProxies = () => {
    return new Promise((resolve, reject) => {
        http.get('http://localhost:3000/api/proxies', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
};

const testConnection = (host, port) => {
    return new Promise((resolve) => {
        const start = Date.now();
        const socket = net.createConnection(port, host, () => {
            const time = Date.now() - start;
            socket.end();
            resolve({ success: true, time });
        });
        socket.setTimeout(3000);
        socket.on('error', (err) => resolve({ success: false, error: err.message }));
        socket.on('timeout', () => {
            socket.destroy();
            resolve({ success: false, error: 'Timeout' });
        });
    });
};

(async () => {
    try {
        console.log('Fetching proxies...');
        const proxies = await getProxies();
        console.log(`Got ${proxies.length} proxies.`);

        const vmess = proxies.filter(p => p.type === 'vmess').slice(0, 5);
        console.log(`Testing ${vmess.length} VMess nodes...`);

        for (const p of vmess) {
            console.log(`Testing ${p.name} (${p.server}:${p.port})...`);
            const res = await testConnection(p.server, p.port);
            console.log(`Result: ${res.success ? 'OK ' + res.time + 'ms' : 'FAIL ' + res.error}`);
            // Also print config details to verify
            console.log('Config:', JSON.stringify({
                type: p.type,
                server: p.server,
                port: p.port,
                uuid: p.uuid,
                network: p.network,
                wsOpts: p['ws-opts']
            }));
            console.log('----------------');
        }
    } catch (e) {
        console.error('Error:', e);
    }
})();
