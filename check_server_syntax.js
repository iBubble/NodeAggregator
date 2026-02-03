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
