module.exports = {
    apps: [
        {
            name: 'aggregator',
            script: 'app.js',
            cwd: '/opt/1panel/apps/my-node-site',
            instances: 1,
            autorestart: true,           // 应用崩溃时自动重启
            watch: false,                // 不监听文件变化（生产环境推荐）
            max_memory_restart: '500M',  // 内存超过500M时自动重启
            env: {
                NODE_ENV: 'production',
                PORT: 3000
            },
            error_file: '/opt/1panel/apps/my-node-site/logs/error.log',
            out_file: '/opt/1panel/apps/my-node-site/logs/out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,
            // 重启策略
            exp_backoff_restart_delay: 100,  // 指数退避重启延迟
            max_restarts: 10,                // 15分钟内最大重启次数
            min_uptime: '5s'                 // 最小运行时间，少于此时间视为启动失败
        }
    ]
};
