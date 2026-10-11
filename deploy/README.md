# 手机游戏服务器部署

这个目录包含 PostgreSQL、游戏 API/WebSocket 服务和 Caddy HTTPS 站点。
手机可直接用浏览器访问配置的域名。服务器需要 Linux、Docker Engine、Docker Compose 插件，以及指向服务器公网 IP 的域名记录。入站开放 TCP 80、443；数据库不对公网开放。

## 首次部署

在服务器上取得项目代码后，在项目根目录运行：

```sh
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
```

编辑 `deploy/.env`：`GAME_DOMAIN` 填实际游戏域名；`DB_PASSWORD` 填 `openssl rand -hex 24` 生成的随机值。请确认该域名没有正在运行的其他网站，或者先为游戏配置专用子域名。确保 DNS 已指向服务器，再运行：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yml ps
curl -fsS https://你的游戏域名/api/health
```

健康检查应返回 `{"ok":true}`。随后在手机浏览器访问 `https://你的游戏域名/`，注册两个测试账号，检查好友邀请、共同进入世界、方块同步、工坊购买。

## 更新和备份

更新代码后再次运行 `docker compose --env-file deploy/.env -f deploy/compose.yml up -d --build`。数据库保存在 Compose 的 `game_db` 卷中；不要用 `down -v` 更新。定期备份：

```sh
docker compose --env-file deploy/.env -f deploy/compose.yml exec -T db pg_dump -U wonder_world -d wonder_world > wonder_world_$(date +%Y%m%d).sql
```

私密的 `.env`、数据库备份和 SSH 私钥不要提交到 Git 仓库。
