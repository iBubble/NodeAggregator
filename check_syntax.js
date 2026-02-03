        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        slate: { 850: '#151e2e' }
                    }
                }
            }
        }
    </script>
    <script>
        const { createApp, ref, computed, onMounted, watch } = Vue;

        createApp({
            setup() {
                const inputUrl = ref('');
                const rawContent = ref('');
                const proxies = ref([]);
                const loading = ref(false);
                const errorMsg = ref('');
                const searchQuery = ref('');
                const filterType = ref('all'); // all, vmess, ss, etc
                const filterCountry = ref('all');
                const sortMode = ref('latency'); // latency, purity, local
                const hideFailed = ref(false);
                const showManualOnly = ref(false); // 只显示手动添加的节点
                const showForumOnly = ref(false); // 只显示论坛导入的节点
                const showTelegramOnly = ref(false); // 只显示 Telegram 导入的节点
                const manualProxies = ref([]);	// 手动添加的节点列表

                const isLocalChecking = ref(false);
                const localCheckProgress = ref('');
                const linuxDoLoading = ref(false); // Linux.do 导入加载状态

                // Telegram 频道抓取状态
                const telegramLoading = ref(false);
                const telegramTaskRunning = ref(false);
                const telegramStatus = ref({
                    isRunning: false,
                    isScheduled: false,
                    lastRun: null,
                    nextRun: null,
                    intervalMinutes: 30,
                    stats: {},
                    currentTask: '',
                    progressLog: []
                });
                let telegramStatusPoller = null;

                const showImportParams = ref(false);
                const showExportModal = ref(false);
                const showClearModal = ref(false);
                const showLogModal = ref(false); // Controls visibility of log window

                const serverLogs = ref([]); // Stores logs from server
                const logWindowRef = ref(null);
                const logWindowEl = ref(null);

                // --- Drag Logic ---
                const modalStyle = ref({
                    top: '15%',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    margin: '0'
                });

                let isDragging = false;
                let dragOffset = { x: 0, y: 0 };

                const startDrag = (e) => {
                    if (!logWindowEl.value) return;
                    isDragging = true;
                    const rect = logWindowEl.value.getBoundingClientRect();
                    dragOffset.x = e.clientX - rect.left;
                    dragOffset.y = e.clientY - rect.top;

                    // Convert to absolute pixels to remove transform dependency during drag
                    modalStyle.value = {
                        top: `${rect.top}px`,
                        left: `${rect.left}px`,
                        width: `${rect.width}px`, // maintain width
                        transform: 'none',
                        margin: '0'
                    };

                    window.addEventListener('mousemove', onDrag);
                    window.addEventListener('mouseup', stopDrag);
                };

                const onDrag = (e) => {
                    if (!isDragging) return;
                    e.preventDefault();
                    const x = e.clientX - dragOffset.x;
                    const y = e.clientY - dragOffset.y;
                    modalStyle.value = {
                        ...modalStyle.value,
                        top: `${y}px`,
                        left: `${x}px`
                    };
                };

                const stopDrag = () => {
                    isDragging = false;
                    window.removeEventListener('mousemove', onDrag);
                    window.removeEventListener('mouseup', stopDrag);
                };

                // Auto-scroll logs
                watch(serverLogs, () => {
                    if (showLogModal.value && logWindowRef.value) {
                        setTimeout(() => {
                            logWindowRef.value.scrollTop = logWindowRef.value.scrollHeight;
                        }, 50);
                    }
                }, { deep: true });




                // Selection
                const selectedIds = ref(new Set());

                const toggleSelection = (id) => {
                    const s = new Set(selectedIds.value);
                    if (s.has(id)) s.delete(id);
                    else s.add(id);
                    selectedIds.value = s;
                };

                const clearSelection = () => selectedIds.value = new Set();

                const selectedCount = computed(() => selectedIds.value.size);

                // 纯净度检查状态
                const purityChecking = ref(false);

                // 手动检查选中节点的纯净度
                const checkSelectedPurity = async () => {
                    if (purityChecking.value || selectedCount.value === 0) return;

                    purityChecking.value = true;
                    const selected = proxies.value.filter(p => selectedIds.value.has(p.id));

                    try {
                        showToast(`正在检查 ${selected.length} 个节点的纯净度...`);

                        const res = await fetch('/api/check_purity', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ proxies: selected })
                        });

                        const data = await res.json();

                        if (data.success && data.results) {
                            // 更新节点的纯净度信息
                            const resultMap = new Map(data.results.map(r => [r.id, r]));

                            proxies.value = proxies.value.map(p => {
                                if (resultMap.has(p.id)) {
                                    const result = resultMap.get(p.id);
                                    return {
                                        ...p,
                                        purityScore: result.purityScore,
                                        purityInfo: result.purityInfo,
                                        purity: {
                                            countryCode: result.purityInfo?.country || result.purityInfo?.countryCode,
                                            isp: result.purityInfo?.isp || '',
                                            hosting: result.purityInfo?.hosting || false
                                        }
                                    };
                                }
                                return p;
                            });

                            showToast(`纯净度检查完成，已更新 ${data.checked} 个节点`);
                        } else {
                            showToast(`检查失败: ${data.error || '未知错误'}`);
                        }
                    } catch (e) {
                        console.error('纯净度检查错误:', e);
                        showToast(`检查失败: ${e.message}`);
                    } finally {
                        purityChecking.value = false;
                    }
                };

                const currentPage = ref(1);
                const pageSize = ref(50); // Render 50 items per page

                // Persistence - 从服务器加载数据
                const loadProxies = async () => {
                    try {
                        // 从服务器加载云端抓取的节点
                        const res = await fetch('/api/proxies');
                        const cloudProxies = await res.json();

                        // 从服务器加载手动添加的节点
                        const manualRes = await fetch('/api/manual_proxies');
                        const manualData = await manualRes.json();
                        manualProxies.value = manualData;

                        // 合并节点（去重）
                        const allProxies = [...cloudProxies];
                        const existingRaw = new Set(allProxies.map(p => p.raw));

                        for (const mp of manualData) {
                            if (!existingRaw.has(mp.raw)) {
                                allProxies.push(mp);
                            }
                        }

                        // 将后端的 purityInfo 映射到前端显示需要的 purity 字段
                        allProxies.forEach(p => {
                            if (p.purityInfo && !p.purity) {
                                p.purity = {
                                    countryCode: p.purityInfo.country || p.purityInfo.countryCode,
                                    isp: p.purityInfo.isp || '',
                                    hosting: p.purityInfo.hosting || false
                                };
                            }
                        });

                        proxies.value = allProxies;
                        console.log(`Loaded ${cloudProxies.length} cloud + ${manualData.length} manual proxies from server`);
                    } catch (e) {
                        console.error('Failed to load proxies from server:', e);
                    }
                };

                const saveProxies = () => {
                    // 不再使用 localStorage，数据已保存在服务器
                    console.log('Proxies synced to server');
                };

                // Watchers - 不再保存到 localStorage
                watch(proxies, () => {
                    // 数据变化由各个操作（手动添加、删除等）自行处理保存
                    // 此处不做任何保存操作
                }, { deep: true });

                // Reset page on search or sort change
                watch([searchQuery, sortMode, filterType, filterCountry], () => currentPage.value = 1);

                // --- Computed ---
                const getCountry = (node) => {
                    if (node.purity && node.purity.countryCode) return node.purity.countryCode;
                    // Heuristic: Check for _CN_, _US_, etc in name
                    const match = node.name.match(/_([A-Z]{2})_/);
                    if (match) return match[1];
                    return 'Other';
                };

                // --- Dynamic Stats Logic ---

                // 1. Base Context: Applies Search & HideFailed (Shared by all views)
                // This represents the "User's current universe of interesting nodes"
                const baseContextProxies = computed(() => {
                    let res = proxies.value;

                    // 手动添加过滤
                    if (showManualOnly.value) {
                        const manualIds = new Set(manualProxies.value.map(p => p.id));
                        res = res.filter(p => p.isManual || manualIds.has(p.id));
                    }

                    // 论坛来源过滤
                    if (showForumOnly.value) {
                        res = res.filter(p => p.isFromForum === true);
                    }

                    // Telegram 来源过滤
                    if (showTelegramOnly.value) {
                        res = res.filter(p => p.isFromTelegram === true);
                    }

                    if (searchQuery.value) {
                        const q = searchQuery.value.toLowerCase();
                        res = res.filter(p =>
                            p.name.toLowerCase().includes(q) ||
                            p.server.toLowerCase().includes(q) ||
                            p.type.toLowerCase().includes(q)
                        );
                    }

                    if (hideFailed.value) {
                        res = res.filter(p => {
                            if (p.localLatency === undefined) return true;
                            return p.localLatency !== -1 && p.localLatency !== 99999;
                        });
                    }
                    return res;
                });

                // 2. For Country Dropdown & Lists:
                // Depends on Base + Protocol Selection (but IGNORES Country Selection)
                const proxiesForCountryStats = computed(() => {
                    if (filterType.value === 'all') return baseContextProxies.value;
                    return baseContextProxies.value.filter(p => p.type === filterType.value);
                });

                // Used by Country Dropdown
                const proxiesByType = proxiesForCountryStats;

                // 3. For Protocol Tabs:
                // Depends on Base + Country Selection (but IGNORES Protocol Selection)
                const proxiesForProtocolStats = computed(() => {
                    if (filterCountry.value === 'all') return baseContextProxies.value;
                    return baseContextProxies.value.filter(p => getCountry(p) === filterCountry.value);
                });

                // 4. Total Visible Count (for "All Protocols" tab)
                const totalVisibleCount = computed(() => proxiesForProtocolStats.value.length);

                const countries = computed(() => {
                    const s = new Set(proxiesByType.value.map(p => getCountry(p)));
                    return [...s].filter(c => c !== 'Other').sort();
                });

                const countryStats = computed(() => {
                    const stats = {};
                    proxiesByType.value.forEach(p => {
                        const c = getCountry(p);
                        stats[c] = (stats[c] || 0) + 1;
                    });
                    return stats;
                });

                const protocols = computed(() => {
                    return [...new Set(proxies.value.map(p => p.type))];
                });

                // 论坛导入节点计数
                const forumProxiesCount = computed(() => {
                    return proxies.value.filter(p => p.isFromForum === true).length;
                });

                // Telegram 导入节点计数
                const telegramProxiesCount = computed(() => {
                    return proxies.value.filter(p => p.isFromTelegram === true).length;
                });

                const protocolStats = computed(() => {
                    const stats = {};
                    // Init with 0
                    protocols.value.forEach(p => stats[p] = 0);
                    // Count based on filtered context
                    proxiesForProtocolStats.value.forEach(p => {
                        stats[p.type] = (stats[p.type] || 0) + 1;
                    });
                    return stats;
                });

                const allFilteredProxies = computed(() => {
                    // Start from Base Context
                    let res = baseContextProxies.value;

                    // Apply Protocol Filter
                    if (filterType.value !== 'all') {
                        res = res.filter(p => p.type === filterType.value);
                    }

                    // Apply Country Filter
                    if (filterCountry.value !== 'all') {
                        res = res.filter(p => getCountry(p) === filterCountry.value);
                    }


                    // hideFailed is already applied in baseContextProxies


                    // Sorting
                    return res.sort((a, b) => {
                        const latA = (typeof a.latency === 'number') ? a.latency : 99999;
                        const latB = (typeof b.latency === 'number') ? b.latency : 99999;

                        if (sortMode.value === 'purity') {
                            const scoreA = (typeof a.purityScore === 'number') ? a.purityScore : -1;
                            const scoreB = (typeof b.purityScore === 'number') ? b.purityScore : -1;

                            if (scoreA !== scoreB) {
                                return scoreB - scoreA; // High score first
                            }
                            // Fallback to latency
                            return latA - latB;
                        }

                        // Sort by Local Latency (New)
                        if (sortMode.value === 'local') {
                            // Fix: Treat -1 (timeout) as Infinity (bottom), and undefined as Infinity
                            const getVal = (v) => (typeof v === 'number' && v >= 0) ? v : 999999;
                            return getVal(a.localLatency) - getVal(b.localLatency);
                        }

                        // Default: Latency
                        return latA - latB;
                    });
                });

                const totalPages = computed(() => Math.ceil(allFilteredProxies.value.length / pageSize.value));

                const filteredProxies = computed(() => {
                    const start = (currentPage.value - 1) * pageSize.value;
                    const end = start + pageSize.value;
                    return allFilteredProxies.value.slice(start, end);
                });

                const pageSelected = computed(() => {
                    if (filteredProxies.value.length === 0) return false;
                    return filteredProxies.value.every(p => selectedIds.value.has(p.id));
                });

                const toggleSelectPage = () => {
                    const s = new Set(selectedIds.value);
                    const allInPage = filteredProxies.value.every(p => s.has(p.id));

                    if (allInPage) {
                        filteredProxies.value.forEach(p => s.delete(p.id));
                    } else {
                        filteredProxies.value.forEach(p => s.add(p.id));
                    }
                    selectedIds.value = s;
                };

                const nextPage = () => { if (currentPage.value < totalPages.value) currentPage.value++; };
                const prevPage = () => { if (currentPage.value > 1) currentPage.value--; };

                const getProtocolColor = (type) => {
                    switch (type) {
                        case 'vmess': return 'border-indigo-500';
                        case 'vless': return 'border-blue-500';
                        case 'ss': return 'border-emerald-500';
                        case 'trojan': return 'border-pink-500';
                        case 'hysteria2': return 'border-amber-500';
                        default: return 'border-slate-500';
                    }
                };
                const getProtocolBadgeColor = (type) => {
                    switch (type) {
                        case 'vmess': return 'bg-indigo-400';
                        case 'vless': return 'bg-blue-400';
                        case 'ss': return 'bg-emerald-400';
                        case 'trojan': return 'bg-pink-400';
                        case 'hysteria2': return 'bg-amber-400';
                        default: return 'bg-slate-400';
                    }
                };

                // --- Parsing Logic ---
                const decodeBase64 = (str) => {
                    try {
                        return decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/"))));
                    } catch (e) {
                        return atob(str);
                    }
                };

                // Helper to parse query string from vmess/vless/trojan raw links if needed
                // But mostly standard is: protocol://uuid@host:port?params#name
                const parseStandardLink = (link, type) => {
                    try {
                        const url = new URL(link);
                        const params = Object.fromEntries(url.searchParams);
                        // Determine TLS status
                        let isTls = false;
                        if (type === 'trojan' || type === 'hysteria2') isTls = true;
                        if (params.security === 'tls' || params.security === 'reality' || params.type === 'grpc') isTls = true;
                        if (type === 'ss') isTls = false; // SS usually no TLS unless plugin

                        const network = params.type || 'tcp';

                        const proxy = {
                            id: Math.random().toString(36).substr(2, 9),
                            name: decodeURIComponent(url.hash.slice(1)) || type + ' Node',
                            type: type,
                            server: url.hostname,
                            port: parseInt(url.port, 10) || 443,
                            uuid: type === 'vless' ? url.username : undefined,
                            password: type === 'trojan' || type === 'hysteria2' ? url.username : undefined,
                            raw: link,
                            tls: isTls,
                            'skip-cert-verify': true,
                            network: network,
                            servername: params.sni || params.host,
                            flow: params.flow
                        };

                        // Reality 配置
                        if (params.security === 'reality') {
                            proxy['reality-opts'] = {
                                'public-key': params.pbk,
                                'short-id': params.sid
                            };
                            proxy['client-fingerprint'] = params.fp || 'chrome';
                        }

                        // WebSocket 传输配置
                        if (network === 'ws') {
                            proxy['ws-opts'] = {
                                path: params.path || '/',
                                headers: params.host ? { Host: params.host } : undefined
                            };
                        }

                        // gRPC 传输配置
                        if (network === 'grpc') {
                            proxy['grpc-opts'] = {
                                'grpc-service-name': params.serviceName || params.service || 'grpc'
                            };
                        }

                        // HTTP/2 传输配置
                        if (network === 'h2') {
                            proxy['h2-opts'] = {
                                host: params.host ? [params.host] : undefined,
                                path: params.path || '/'
                            };
                        }

                        return proxy;
                    } catch (e) { return null; }
                };

                const parseVmess = (link) => {
                    // Try VMess JSON format (vmess://base64-json)
                    if (!link.includes('@')) {
                        try {
                            const b64 = link.replace('vmess://', '');
                            const json = JSON.parse(decodeBase64(b64));
                            const proxy = {
                                id: Math.random().toString(36).substr(2, 9),
                                name: json.ps || 'VMess Node',
                                type: 'vmess',
                                server: json.add,
                                port: parseInt(json.port, 10) || 443,
                                raw: link,
                                uuid: json.id,
                                alterId: parseInt(json.aid, 10) || 0,
                                cipher: json.scy || 'auto',
                                network: json.net || 'tcp',
                                tls: json.tls === 'tls',
                                'skip-cert-verify': true,
                                servername: json.sni || json.host
                            };

                            // 添加 WebSocket 传输配置
                            if (json.net === 'ws') {
                                proxy['ws-opts'] = {
                                    path: json.path || '/',
                                    headers: json.host ? { Host: json.host } : undefined
                                };
                            }

                            // 添加 gRPC 传输配置
                            if (json.net === 'grpc') {
                                proxy['grpc-opts'] = {
                                    'grpc-service-name': json.path || 'grpc'
                                };
                            }

                            // 添加 HTTP/2 传输配置
                            if (json.net === 'h2') {
                                proxy['h2-opts'] = {
                                    host: json.host ? [json.host] : undefined,
                                    path: json.path || '/'
                                };
                            }

                            return proxy;
                        } catch (e) { return null; }
                    }
                    // Fallback to standard link parsing if vmess used that way (rare but possible)
                    return parseStandardLink(link, 'vmess');
                };

                const parseContent = async () => {
                    loading.value = true;
                    errorMsg.value = '';
                    let content = rawContent.value;

                    // Fetch if URL provided
                    if (inputUrl.value && !content) {
                        try {
                            const target = inputUrl.value;
                            // Use our own proxy to bypass CORS
                            const proxyUrl = `/api/proxy?url=${encodeURIComponent(target)}`;
                            const res = await fetch(proxyUrl);
                            if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
                            content = await res.text();

                            // Try to detect if it's base64 encoded response (common for subscription links)
                            if (!content.includes('://') && /^[A-Za-z0-9+/=\-_]+$/.test(content.trim())) {
                                content = decodeBase64(content.trim());
                            }
                        } catch (e) {
                            errorMsg.value = `Error: ${e.message}`;
                            loading.value = false;
                            return;
                        }
                    }

                    if (!content) {
                        errorMsg.value = 'Please provide URL or Content.';
                        loading.value = false;
                        return;
                    }

                    // Attempt Base64 decode again if the whole content looks like one big base64 blob
                    const trimmed = content.trim();
                    if (!trimmed.includes('://') && !trimmed.includes('proxies:') && /^[A-Za-z0-9+/=\-_]+$/.test(trimmed)) {
                        try {
                            content = decodeBase64(trimmed);
                        } catch (e) { }
                    }

                    const newProxies = [];

                    // 检查是否为 Clash YAML 格式 (包含 proxies:)
                    if (content.includes('proxies:')) {
                        try {
                            // 简单的 YAML 解析：提取 proxies 数组中的 JSON 对象
                            const lines = content.split('\n');
                            let inProxies = false;

                            for (const line of lines) {
                                const trimLine = line.trim();

                                if (trimLine === 'proxies:') {
                                    inProxies = true;
                                    continue;
                                }

                                // 如果遇到其他顶级键，停止解析
                                if (inProxies && /^[a-z\-]+:/.test(trimLine) && !trimLine.startsWith('-')) {
                                    inProxies = false;
                                }

                                if (inProxies && trimLine.startsWith('- {')) {
                                    // 提取 JSON 对象
                                    try {
                                        const jsonStr = trimLine.substring(2); // 去掉 "- "
                                        const proxy = JSON.parse(jsonStr);
                                        if (proxy && proxy.server && proxy.type) {
                                            proxy.id = Math.random().toString(36).substr(2, 9);
                                            proxy.raw = jsonStr;
                                            newProxies.push(proxy);
                                        }
                                    } catch (e) { /* 忽略解析失败的行 */ }
                                } else if (inProxies && trimLine.startsWith('-') && trimLine.includes('name:')) {
                                    // 标准 YAML 格式（多行）
                                    // 暂不支持，这种格式较复杂
                                }
                            }

                            if (newProxies.length > 0) {
                                console.log(`Parsed ${newProxies.length} proxies from Clash YAML`);
                            }
                        } catch (e) {
                            console.error('YAML parsing error:', e);
                        }
                    }

                    // 如果 YAML 解析没有结果，尝试逐行解析链接格式
                    if (newProxies.length === 0) {
                        const lines = content.split(/[\r\n]+/);

                        for (const line of lines) {
                            const tLine = line.trim();
                            if (!tLine) continue;

                            let p = null;
                            if (tLine.startsWith('vmess://')) p = parseVmess(tLine);
                            else if (tLine.startsWith('vless://')) p = parseStandardLink(tLine, 'vless');
                            else if (tLine.startsWith('trojan://')) p = parseStandardLink(tLine, 'trojan');
                            else if (tLine.startsWith('ss://')) {
                                // Basic SS parsing (not exhaustive)
                                try {
                                    const url = new URL(tLine);
                                    let tag = url.hash.slice(1);
                                    if (tag) tag = decodeURIComponent(tag);
                                    p = {
                                        id: Math.random().toString(36).substr(2, 9),
                                        name: tag || 'SS Node',
                                        type: 'ss',
                                        server: url.hostname,
                                        port: url.port,
                                        raw: tLine
                                    };
                                } catch (e) {
                                    // Try legacy base64 format ss://BASE64#TAG
                                    if (tLine.includes('#')) {
                                        p = {
                                            id: Math.random().toString(36).substr(2, 9),
                                            name: decodeURIComponent(tLine.split('#')[1]),
                                            type: 'ss',
                                            server: 'Legacy',
                                            port: 0,
                                            raw: tLine,
                                            tls: false
                                        };
                                    }
                                }
                            } else if (tLine.startsWith('hysteria2://') || tLine.startsWith('hy2://')) {
                                p = parseStandardLink(tLine.replace('hysteria2://', 'https://').replace('hy2://', 'https://'), 'hysteria2'); // cheat URL parser
                                if (p) { p.type = 'hysteria2'; p.raw = tLine; }
                            }

                            if (p) newProxies.push(p);
                        }
                    } // End of link parsing if block

                    if (newProxies.length === 0) {
                        errorMsg.value = 'No parsable nodes found.';
                    } else {
                        // 标记为手动添加
                        newProxies.forEach(p => {
                            p.isManual = true;
                        });

                        // Deduplicate based on raw link
                        const existing = new Set(proxies.value.map(x => x.raw));
                        const added = newProxies.filter(x => !existing.has(x.raw));

                        if (added.length > 0) {
                            // 保存到服务器的手动节点文件
                            try {
                                await fetch('/api/manual_proxies', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ proxies: added })
                                });
                                // 重新加载所有节点（包括新添加的）以确保界面同步
                                await loadProxies();
                            } catch (e) {
                                console.error('保存手动节点失败:', e);
                                // 即使保存失败，也先更新本地显示
                                proxies.value = [...proxies.value, ...added];
                            }

                            showToast(`导入 ${added.length} 个节点成功 (已保存为手动节点)`);
                            rawContent.value = '';
                            inputUrl.value = '';
                        } else {
                            showToast('所有节点已存在');
                        }
                    }
                    loading.value = false;
                };

                // 加载手动节点列表
                const loadManualProxies = async () => {
                    try {
                        const res = await fetch('/api/manual_proxies');
                        const data = await res.json();
                        manualProxies.value = data;
                    } catch (e) {
                        console.error('加载手动节点失败:', e);
                    }
                };

                // 删除手动节点
                const deleteManualProxy = async (proxy) => {
                    if (!proxy.id) return;

                    try {
                        await fetch('/api/manual_proxies', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ ids: [proxy.id] })
                        });

                        // 从本地列表中移除
                        proxies.value = proxies.value.filter(p => p.id !== proxy.id);
                        manualProxies.value = manualProxies.value.filter(p => p.id !== proxy.id);

                        showToast('节点已删除');
                    } catch (e) {
                        console.error('删除手动节点失败:', e);
                        showToast('删除失败');
                    }
                };

                // 从 Linux.do 导入节点
                const importFromLinuxDo = async () => {
                    if (linuxDoLoading.value) return;
                    linuxDoLoading.value = true;
                    showLogModal.value = true;
                    serverLogs.value = []; // 清空之前的日志
                    showToast('开始从 Linux.do 抓取节点...');

                    // 启动日志轮询（实时显示进度）
                    const logPoller = setInterval(async () => {
                        try {
                            const statusRes = await fetch('/api/status');
                            const state = await statusRes.json();
                            if (state.logs && Array.isArray(state.logs)) {
                                serverLogs.value = state.logs;
                            }
                            serverStats.value = {
                                total: state.total || 0,
                                active: state.active || 0
                            };
                        } catch (e) {
                            // 忽略轮询错误
                        }
                    }, 500); // 每500ms更新一次

                    try {
                        const res = await fetch('/api/import_linuxdo', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });

                        // 停止轮询
                        clearInterval(logPoller);

                        // 最后获取一次日志
                        try {
                            const finalStatus = await fetch('/api/status');
                            const finalState = await finalStatus.json();
                            if (finalState.logs && Array.isArray(finalState.logs)) {
                                serverLogs.value = finalState.logs;
                            }
                        } catch (e) { }

                        const data = await res.json();

                        if (data.success) {
                            let importedCount = 0;

                            // 直接使用后端解析的节点（已带有论坛标记）
                            if (data.parsedProxies && data.parsedProxies.length > 0) {
                                // 去重并合并
                                const existing = new Set(proxies.value.map(x => x.raw));
                                const newProxies = data.parsedProxies.filter(x => !existing.has(x.raw));

                                if (newProxies.length > 0) {
                                    // 保存到服务器的手动节点文件（带论坛标记）
                                    try {
                                        await fetch('/api/manual_proxies', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ proxies: newProxies })
                                        });
                                    } catch (e) {
                                        console.error('保存论坛节点失败:', e);
                                    }

                                    proxies.value = [...proxies.value, ...newProxies];
                                    importedCount = newProxies.length;
                                }
                            }

                            // 处理订阅链接（逐个解析，也标记为论坛来源）
                            if (data.subscriptions && data.subscriptions.length > 0) {
                                showToast(`发现 ${data.subscriptions.length} 个订阅链接，开始解析...`);

                                for (const subUrl of data.subscriptions.slice(0, 10)) { // 最多处理10个订阅
                                    try {
                                        // 使用代理获取订阅内容
                                        const proxyUrl = `/api/proxy?url=${encodeURIComponent(subUrl)}`;
                                        const subRes = await fetch(proxyUrl);
                                        if (!subRes.ok) continue;

                                        let content = await subRes.text();

                                        // 尝试 Base64 解码
                                        if (!content.includes('://') && /^[A-Za-z0-9+/=\-_]+$/.test(content.trim())) {
                                            try {
                                                content = decodeURIComponent(escape(atob(content.trim().replace(/-/g, "+").replace(/_/g, "/"))));
                                            } catch (e) { }
                                        }

                                        // 简单解析节点链接
                                        const lines = content.split(/[\r\n]+/);
                                        const subProxies = [];

                                        for (const line of lines) {
                                            const tLine = line.trim();
                                            if (!tLine) continue;

                                            let p = null;
                                            if (tLine.startsWith('vmess://')) p = parseVmess(tLine);
                                            else if (tLine.startsWith('vless://')) p = parseStandardLink(tLine, 'vless');
                                            else if (tLine.startsWith('trojan://')) p = parseStandardLink(tLine, 'trojan');
                                            else if (tLine.startsWith('ss://')) {
                                                try {
                                                    const url = new URL(tLine);
                                                    p = {
                                                        id: Math.random().toString(36).substr(2, 9),
                                                        name: decodeURIComponent(url.hash.slice(1)) || 'SS Node',
                                                        type: 'ss',
                                                        server: url.hostname,
                                                        port: url.port,
                                                        raw: tLine
                                                    };
                                                } catch (e) { }
                                            } else if (tLine.startsWith('hysteria2://') || tLine.startsWith('hy2://')) {
                                                p = parseStandardLink(tLine.replace('hysteria2://', 'https://').replace('hy2://', 'https://'), 'hysteria2');
                                                if (p) { p.type = 'hysteria2'; p.raw = tLine; }
                                            }

                                            if (p) {
                                                // 标记为论坛来源
                                                p.isFromForum = true;
                                                p.forumSource = 'linux.do';
                                                p.importedAt = new Date().toISOString();
                                                subProxies.push(p);
                                            }
                                        }

                                        // 去重并添加
                                        const existing = new Set(proxies.value.map(x => x.raw));
                                        const newSubProxies = subProxies.filter(x => !existing.has(x.raw));
                                        if (newSubProxies.length > 0) {
                                            // 保存到服务器
                                            try {
                                                await fetch('/api/manual_proxies', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ proxies: newSubProxies })
                                                });
                                            } catch (e) { }
                                            proxies.value = [...proxies.value, ...newSubProxies];
                                            importedCount += newSubProxies.length;
                                        }
                                    } catch (e) {
                                        console.error('解析订阅失败:', subUrl, e);
                                    }
                                }
                            }

                            showToast(`Linux.do 导入完成！处理了 ${data.topicsProcessed} 个帖子，导入 ${importedCount} 个节点`);
                        } else {
                            showToast('导入失败: ' + (data.error || '未知错误'));
                        }
                    } catch (e) {
                        console.error('Linux.do 导入失败:', e);
                        showToast('导入失败: ' + e.message);
                        // 确保停止轮询
                        if (typeof logPoller !== 'undefined') {
                            clearInterval(logPoller);
                        }
                    } finally {
                        linuxDoLoading.value = false;
                        inputUrl.value = '';
                        rawContent.value = '';
                        // 刷新手动节点列表
                        await loadManualProxies();
                    }
                };

                // Telegram 频道任务相关函数
                const fetchTelegramStatus = async () => {
                    try {
                        const res = await fetch('/api/telegram/status');
                        const data = await res.json();
                        telegramStatus.value = data;
                        telegramTaskRunning.value = data.isScheduled;
                    } catch (e) {
                        console.error('获取 Telegram 状态失败:', e);
                    }
                };

                const toggleTelegramTask = async () => {
                    telegramLoading.value = true;
                    try {
                        if (telegramTaskRunning.value) {
                            // 停止任务
                            await fetch('/api/telegram/stop', { method: 'POST' });
                            showToast('Telegram 任务已停止');
                            if (telegramStatusPoller) {
                                clearInterval(telegramStatusPoller);
                                telegramStatusPoller = null;
                            }
                        } else {
                            // 启动任务
                            await fetch('/api/telegram/start', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ intervalMinutes: 30 })
                            });
                            showToast('Telegram 任务已启动，每30分钟自动更新');
                            // 开始状态轮询
                            telegramStatusPoller = setInterval(fetchTelegramStatus, 2000);
                        }
                        await fetchTelegramStatus();
                        // 加载 Telegram 节点
                        await loadTelegramProxies();
                    } catch (e) {
                        showToast('操作失败: ' + e.message);
                    } finally {
                        telegramLoading.value = false;
                    }
                };

                const loadTelegramProxies = async () => {
                    try {
                        const res = await fetch('/api/telegram/proxies');
                        const data = await res.json();
                        if (Array.isArray(data) && data.length > 0) {
                            // 合并到主节点列表
                            const existingRaws = new Set(proxies.value.map(p => p.raw));
                            const newNodes = data.filter(n => !existingRaws.has(n.raw));
                            if (newNodes.length > 0) {
                                proxies.value = [...proxies.value, ...newNodes];
                                showToast(`已加载 ${newNodes.length} 个 Telegram 节点`);
                            }
                        }
                    } catch (e) {
                        console.error('加载 Telegram 节点失败:', e);
                    }
                };

                const formatTime = (isoString) => {
                    if (!isoString) return '';
                    const date = new Date(isoString);
                    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
                };

                // 初始化时获取 Telegram 状态
                fetchTelegramStatus();

                const checkLocalConnectivity = async () => {
                    if (isLocalChecking.value) return;
                    isLocalChecking.value = true;
                    hideFailed.value = true; // Auto hide invalid immediately when starting
                    showToast('开始本地真连接测试...');
                    // sortMode.value = 'local'; // switch sort to see results

                    const candidates = proxies.value; // check all
                    // Reset status for all before starting, so they appear in list (pending)
                    candidates.forEach(p => p.localLatency = undefined);

                    const total = candidates.length;
                    let done = 0;

                    // Client-side parallelism
                    const concurrency = 20;
                    for (let i = 0; i < total; i += concurrency) {
                        const batch = candidates.slice(i, i + concurrency);
                        localCheckProgress.value = `${done}/${total}`;

                        await Promise.all(batch.map(async (p) => {
                            const start = Date.now();
                            const isTls = p.tls === true || p.port === 443;

                            // Browser limitation: can only test TLS (HTTPS) from HTTPS page
                            if (!isTls) {
                                p.localLatency = 99999; // Skip non-TLS
                                return;
                            }

                            const timeout = 3000;
                            try {
                                const controller = new AbortController();
                                const id = setTimeout(() => controller.abort(), timeout);

                                // fetch with no-cors. 
                                // Successful resolution means server accepted connection + SSL handshake.
                                await fetch(`https://${p.server}:${p.port}/`, {
                                    mode: 'no-cors',
                                    signal: controller.signal,
                                    cache: 'no-store'
                                });
                                clearTimeout(id);
                                p.localLatency = Date.now() - start;
                            } catch (e) {
                                // STRICT MODE: Any network error (RST, Cert Fail, Closed) = Fail
                                // This filters out blocked IPs (RST) and bad nodes.
                                p.localLatency = -1;
                            }
                        }));
                        done += batch.length;
                        // small pause for browser loop
                        if (i % 100 === 0) await new Promise(r => setTimeout(r, 100));
                    }

                    isLocalChecking.value = false;
                    hideFailed.value = true; // Auto hide invalid on completion
                    const validCount = candidates.filter(p => p.localLatency > 0 && p.localLatency < 10000).length;
                    showToast(`测试完成！有效节点: ${validCount} / ${total}`);
                };

                const clearProxies = () => {
                    showClearModal.value = true;
                };

                const confirmClear = async () => {
                    try {
                        // 先调用服务器 API 清空所有节点文件
                        const res = await fetch('/api/clear_all', { method: 'POST' });
                        const data = await res.json();

                        if (data.success) {
                            proxies.value = [];
                            manualProxies.value = [];
                            selectedIds.value = new Set();
                            showClearModal.value = false;
                            showToast('已清空所有节点');
                        } else {
                            showToast('清空失败: ' + (data.error || '未知错误'));
                        }
                    } catch (e) {
                        console.error('清空节点失败:', e);
                        showToast('清空失败: ' + e.message);
                    }
                };

                const deleteProxy = (id) => {
                    proxies.value = proxies.value.filter(p => p.id !== id);
                };

                // --- Export Logic ---
                const exportConfig = async (format) => {
                    // 1. 确定要处理的节点集合 (已选 or 全部)
                    let candidates = [];
                    if (selectedCount.value > 0) {
                        const s = selectedIds.value;
                        candidates = proxies.value.filter(p => s.has(p.id));
                    } else {
                        // 如果有过滤条件（如仅显示TG），则只导出当前视图的节点
                        candidates = filteredProxies.value;
                    }

                    if (candidates.length === 0) return showToast('当前列表没有节点可导出');

                    // 2. 智能过滤逻辑
                    // 检查是否进行过本地测试 (至少有一个节点有 localLatency 状态)
                    const hasTestResults = proxies.value.some(p => typeof p.localLatency !== 'undefined');

                    let nodesToExport = [];

                    if (hasTestResults) {
                        // 如果进行过测试，严格只导出连接成功的节点
                        nodesToExport = candidates.filter(p => p.localLatency > 0 && p.localLatency < 20000);

                        if (nodesToExport.length === 0) {
                            if (confirm('当前选中的节点全部超时或不可用。是否强制导出所有节点？(可能无法连接)')) {
                                nodesToExport = candidates;
                            } else {
                                return;
                            }
                        } else if (nodesToExport.length < candidates.length) {
                            showToast(`已自动过滤 ${candidates.length - nodesToExport.length} 个超时节点`);
                        }
                    } else {
                        // 未测试，直接导出所有
                        nodesToExport = candidates;
                        showToast('建议先运行“服务器直连测试”以过滤无效节点');
                    }

                    if (format === 'base64') {
                        const rawList = nodesToExport.map(p => p.raw).join('\n');
                        const content = btoa(unescape(encodeURIComponent(rawList)));
                        const blob = new Blob([content], { type: 'text/plain' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `aggregator_base64_${new Date().toISOString().slice(0, 10)}.txt`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        return;
                    }

                    // For Clash / Singbox
                    try {
                        let endpoint = '/api/convert';
                        let body = { proxies: nodesToExport, type: format === 'clash' ? 'clash' : 'singbox' };

                        const res = await fetch(endpoint, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(body)
                        });

                        if (!res.ok) {
                            const txt = await res.text();
                            throw new Error(txt || 'Server Error');
                        }

                        const blob = await res.blob();
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        const ext = format === 'clash' ? 'yaml' : 'json';
                        a.download = `config_${format}_${new Date().toISOString().slice(0, 10)}.${ext}`;
                        a.click();
                        window.URL.revokeObjectURL(url);
                        showToast(`已成功导出 ${nodesToExport.length} 个可用节点`);

                    } catch (e) {
                        console.error(e);
                        alert('导出失败: ' + e.message);
                    }
                };




                // --- Toast ---
                const toastMsg = ref('');
                const showToast = (msg) => {
                    toastMsg.value = msg;
                    setTimeout(() => toastMsg.value = '', 3000);
                };

                // --- Cloud Aggregation ---
                const cloudLoading = ref(false);
                const cloudResult = ref('');

                // Show modal automatically when cloud loading starts
                watch(cloudLoading, (newVal) => {
                    if (newVal) showLogModal.value = true;
                });

                const fetchCloudProxies = async () => {
                    try {
                        const res = await fetch('/api/proxies');
                        if (res.ok) {
                            const cloudList = await res.json();
                            if (Array.isArray(cloudList) && cloudList.length > 0) {
                                const existing = new Set(proxies.value.map(x => x.raw));
                                const added = cloudList.filter(x => !existing.has(x.raw));
                                proxies.value = [...proxies.value, ...added];
                            }
                        }
                    } catch (e) { console.error('Silent cloud fetch failed', e); }
                };

                const refreshCloud = async () => {
                    if (cloudLoading.value) return;
                    cloudLoading.value = true;
                    // Reset Logs
                    serverLogs.value = [];

                    try {
                        const res = await fetch('/api/refresh', { method: 'POST' });
                        const json = await res.json();

                        if (!json.success && json.status !== 'fetching' && json.status !== 'testing') {
                            showToast(`Error: ${json.message}`);
                            cloudLoading.value = false;
                            return;
                        }

                        // Use common poller
                        pollStatus();

                    } catch (e) {
                        showToast(`Network Error: ${e.message}`);
                        cloudLoading.value = false;
                    }
                };

                // --- Auto Purity Checker ---
                const autoCheckCount = ref(0);

                const startAutoChecker = async () => {
                    console.log('Auto-checker started (Batch Mode)');

                    while (true) {
                        try {
                            // Find candidates
                            // Priority 1: Current page
                            let pageCandidates = filteredProxies.value.filter(p => !p.purity && !p.checking && !p.failedCheck);
                            let others = proxies.value.filter(p => !p.purity && !p.checking && !p.failedCheck);

                            // Combine candidates, prioritizing pageCandidates
                            let batch = [];
                            const batchSize = 25; // ip-api batch supports up to 100, but let's be conservative to avoid timeouts

                            if (pageCandidates.length > 0) {
                                batch = pageCandidates.slice(0, batchSize);
                            }

                            // Fill remaining slots with others if needed
                            if (batch.length < batchSize) {
                                let needed = batchSize - batch.length;
                                // Filter out already added ones
                                const currentIds = new Set(batch.map(p => p.id));
                                for (let p of others) {
                                    if (!currentIds.has(p.id)) {
                                        batch.push(p);
                                        if (batch.length >= batchSize) break;
                                    }
                                }
                            }

                            if (batch.length > 0) {
                                // Update count
                                autoCheckCount.value = proxies.value.filter(p => !p.purity && !p.failedCheck).length;

                                await checkBatchPurity(batch);

                                // Rate Limit Protection:
                                // Batch endpoint limit: 15 requests per minute.
                                // 60s / 15 = 4s interval.
                                // Increased to 8000ms to be safe and avoid 429
                                await new Promise(r => setTimeout(r, 8000));
                            } else {
                                autoCheckCount.value = 0;
                                await new Promise(r => setTimeout(r, 3000));
                            }
                        } catch (e) {
                            console.error('Checker error', e);
                            await new Promise(r => setTimeout(r, 5000));
                        }
                    }
                };

                const handleGlobalPurityCheck = async () => {
                    let nodesToCheck = [];
                    let isForce = false;

                    if (selectedCount.value > 0) {
                        // 选中节点：强制刷新
                        const ids = selectedIds.value;
                        nodesToCheck = proxies.value.filter(p => ids.has(p.id));
                        isForce = true;
                    } else {
                        // 未选中：默认全量检测（后端会处理缓存逻辑，如果想强制刷新所有，需用户确认）
                        // 根据用户需求：“如一个都不勾选，则对全部节点重新检测并更新” -> 意味着全量强制
                        // 但考虑到全量强制太猛，我们先弹个窗让用户选
                        if (confirm('是否强制刷新全部节点的纯净度数据？\n\n点击“确定”强制重新检测所有节点（耗时较长）。\n点击“取消”仅检测无数据节点 (利用缓存补全)。')) {
                            isForce = true;
                        } else {
                            isForce = false;
                        }
                        nodesToCheck = filteredProxies.value;
                    }

                    if (nodesToCheck.length === 0) return showToast('没有节点可检测');
                    await checkBatchPurity(nodesToCheck, isForce);
                };

                const checkSelectedPurity = handleGlobalPurityCheck; // Alias for safety

                // Single node check (always force)
                const checkNodePurity = async (node) => {
                    await checkBatchPurity([node], true);
                };

                const checkBatchPurity = async (nodes, force = false) => {
                    // Filter out nodes already checking
                    const targets = nodes.filter(n => !n.checking);
                    if (targets.length === 0) return;

                    purityChecking.value = true;
                    const batchSize = 50; // Browser batch size

                    // Helper
                    const checkChunk = async (chunk) => {
                        chunk.forEach(n => { n.checking = true; n.failedCheck = false; });
                        try {
                            const ips = chunk.map(n => n.server);
                            const res = await fetch('/api/check_ip_batch', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ queries: ips, force: force })
                            });

                            if (res.ok) {
                                const list = await res.json();
                                const resultMap = {};
                                list.forEach(item => resultMap[item.query] = item);

                                chunk.forEach(node => {
                                    node.checking = false;
                                    const data = resultMap[node.server];
                                    if (data && data.status === 'success') {
                                        let score = 100;
                                        if (data.hosting) score -= 40; else score += 5;
                                        const isp = (data.isp || '').toLowerCase();
                                        if (isp.includes('google') || isp.includes('amazon') || isp.includes('cloud') || isp.includes('microsoft')) {
                                            score -= 10;
                                        }
                                        score = Math.max(0, Math.min(100, score));

                                        node.purity = {
                                            countryCode: data.countryCode,
                                            isp: data.isp,
                                            hosting: data.hosting
                                        };
                                        node.purityScore = score;
                                    } else {
                                        node.failedCheck = true;
                                    }
                                });
                            } else {
                                chunk.forEach(n => { n.checking = false; n.failedCheck = true; });
                            }
                        } catch (e) {
                            chunk.forEach(n => { n.checking = false; n.failedCheck = true; });
                            console.error(e);
                        }
                    };

                    // Process all chunks
                    for (let i = 0; i < targets.length; i += batchSize) {
                        const chunk = targets.slice(i, i + batchSize);
                        await checkChunk(chunk);
                    }

                    purityChecking.value = false;
                    showToast(force ? '纯净度强制更新完成' : '纯净度检测完成');
                };

                // --- Server Status Sync ---
                const serverStats = ref({ total: 0, active: 0 });

                const checkServerStatus = async () => {
                    try {
                        const res = await fetch('/api/status');
                        const state = await res.json();

                        if (state.status !== 'idle') {
                            // Resume monitoring
                            cloudLoading.value = true;
                            serverLogs.value = state.logs || [];
                            showLogModal.value = true; // Auto-open if running
                            pollStatus();
                        }
                    } catch (e) {
                        console.error('Failed to sync server status', e);
                    }
                };

                const pollStatus = () => {
                    const interval = setInterval(async () => {
                        try {
                            const sRes = await fetch('/api/status');
                            const state = await sRes.json();

                            // Update Logs Real-time
                            if (state.logs && Array.isArray(state.logs)) {
                                serverLogs.value = state.logs;
                            }

                            // Update Stats
                            serverStats.value = {
                                total: state.total || 0,
                                active: state.active || 0
                            };

                            if (state.status === 'idle') {
                                clearInterval(interval);
                                cloudResult.value = 'Complete';
                                showToast('云端聚合完成');
                                await loadProxies(); // Reload all proxies from server
                                cloudLoading.value = false;

                                // Auto-close log window after a short delay
                                setTimeout(() => {
                                    showLogModal.value = false;
                                }, 1500);
                            }
                        } catch (e) {
                            clearInterval(interval);
                            cloudLoading.value = false;
                        }
                    }, 1000);
                };

                onMounted(async () => {
                    // 从服务器加载所有节点（云端 + 手动）
                    await loadProxies();

                    // Sync with potentially running background process
                    checkServerStatus();

                    // Start Background Worker (Purity Check)
                    startAutoChecker();
                });

                return {
                    inputUrl, rawContent, proxies, loading, errorMsg, searchQuery, sortMode,
                    showImportParams, showExportModal, showClearModal, showLogModal, // Added showLogModal
                    toastMsg,
                    parseContent, clearProxies, confirmClear, deleteProxy, exportConfig,
                    filteredProxies, protocols, protocolStats, getProtocolColor, getProtocolBadgeColor,
                    cloudLoading, cloudResult, refreshCloud, checkNodePurity, autoCheckCount, serverLogs, logWindowRef, // Added logs
                    currentPage, totalPages, nextPage, prevPage,
                    getCountry, proxiesByType,
                    selectedIds, toggleSelection, clearSelection, selectedCount, toggleSelectPage, pageSelected,
                    purityChecking, checkSelectedPurity, // 纯净度检查相关
                    filterType, filterCountry, countries, countryStats,
                    isLocalChecking, localCheckProgress, checkLocalConnectivity, hideFailed, totalVisibleCount, pageSize,
                    modalStyle, startDrag, logWindowEl, serverStats, // Export serverStats
                    showManualOnly, manualProxies, loadManualProxies, deleteManualProxy, // 手动节点相关
                    showForumOnly, forumProxiesCount, // 论坛搜索相关
                    showTelegramOnly, telegramProxiesCount, // Telegram 筛选相关
                    linuxDoLoading, importFromLinuxDo, // Linux.do 导入
                    // Telegram 频道抓取相关
                    telegramLoading, telegramTaskRunning, telegramStatus,
                    toggleTelegramTask, fetchTelegramStatus, loadTelegramProxies, formatTime
                };
            }
        }).mount('#app');
