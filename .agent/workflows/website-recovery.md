---
description: 服务器重启后网站恢复检查和修复流程
---

# 服务器重启后网站恢复检查流程

// turbo-all

当服务器重启后，如果 `https://us.liukun.com:8443/Projects/Aggregator/` 无法访问，按以下步骤检查和修复：

## 1. 检查 PM2 服务状态

```bash
systemctl status pm2-Gemini
pm2 status
```

如果 PM2 服务未运行：

```bash
sudo systemctl start pm2-Gemini
```

## 2. 检查 OpenResty/Nginx 容器状态

```bash
docker ps | grep openresty
```

如果容器未运行：

```bash
docker start 1Panel-openresty-5Alj
```

## 3. 检查 nginx 配置

验证代理配置文件存在：

```bash
cat /opt/1panel/apps/openresty/openresty/www/sites/us.liukun.com/proxy/nodejs.conf
```

验证主配置包含 include 语句：

```bash
grep "include /www/sites/us.liukun.com/proxy" /opt/1panel/apps/openresty/openresty/conf/conf.d/us.liukun.com.conf
```

如果 include 语句丢失（被 1panel 覆盖），手动添加：

```bash
sudo sed -i 's|root /usr/share/nginx/html/stop;|include /www/sites/us.liukun.com/proxy/*.conf;\n    root /usr/share/nginx/html/stop;|' /opt/1panel/apps/openresty/openresty/conf/conf.d/us.liukun.com.conf
```

## 4. 重载 nginx 配置

```bash
docker exec 1Panel-openresty-5Alj nginx -t && docker exec 1Panel-openresty-5Alj nginx -s reload
```

## 5. 验证网站访问

```bash
curl -s -o /dev/null -w "%{http_code}" --insecure https://localhost:8443/Projects/Aggregator/
```

应该返回 `200`。

---

## 关键配置文件位置

| 配置项 | 路径 |
|--------|------|
| PM2 应用配置 | `/opt/1panel/apps/my-node-site/ecosystem.config.js` |
| PM2 服务文件 | `/etc/systemd/system/pm2-Gemini.service` |
| PM2 进程备份 | `/home/Gemini/.pm2/dump.pm2` |
| Nginx 主配置 | `/opt/1panel/apps/openresty/openresty/conf/conf.d/us.liukun.com.conf` |
| 代理配置 | `/opt/1panel/apps/openresty/openresty/www/sites/us.liukun.com/proxy/nodejs.conf` |

## 注意事项

1. **1panel 会覆盖 nginx 配置**：通过 1panel 界面修改网站设置时，`us.liukun.com.conf` 文件会被重新生成，可能会丢失 `include` 语句。
2. **代理配置独立存放**：反向代理规则存放在 `proxy/nodejs.conf` 中，不会被 1panel 覆盖。
3. **PM2 通过 systemd 管理**：PM2 现在由 systemd `pm2-Gemini` 服务管理，开机自动启动。
