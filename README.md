# CLOVER CITY RULES

外部ブラウザ向けのCLOVER CITY公式ルールサイトです。

## できること
- 黒 × 緑 × クローバーテーマ
- PC / スマホ対応
- ルール検索
- 大カテゴリ / サブカテゴリ / ルール管理
- ルールごとの公開ON/OFF
- サイト全体の公開ON/OFF（非公開時はメンテナンス画面）
- 犯罪一覧
- 罰金一覧
- 管理画面
- Discord OAuth2ログイン
- DiscordユーザーID / DiscordロールIDで管理者制限
- 管理画面からテーマ色変更

## 1. 必要環境
- Node.js 20以上
- 公開時はHTTPS対応のWebサーバー / VPS / PaaS等

## 2. 起動
```bash
cp .env.example .env
npm install
npm start
```

ブラウザで `http://localhost:3000` を開きます。

## 3. Discord OAuth2設定
Discord Developer PortalでApplicationを作成し、OAuth2 Redirectsへ以下を登録します。

ローカル:
`http://localhost:3000/auth/discord/callback`

本番:
`https://あなたのドメイン/auth/discord/callback`

`.env` に以下を設定してください。

```env
BASE_URL=https://あなたのドメイン
SESSION_SECRET=十分に長いランダム文字列
DISCORD_CLIENT_ID=Application ID
DISCORD_CLIENT_SECRET=Client Secret
DISCORD_CALLBACK_URL=https://あなたのドメイン/auth/discord/callback
DISCORD_GUILD_ID=CLOVER CITY DiscordサーバーID
ADMIN_USER_IDS=管理者DiscordユーザーID
ADMIN_ROLE_IDS=管理者DiscordロールID
```

複数IDはカンマ区切りです。

例:
```env
ADMIN_USER_IDS=111111111111111111,222222222222222222
ADMIN_ROLE_IDS=333333333333333333
```

## 4. 管理画面
`/admin`

Discord認証後、許可されたユーザー/ロールのみアクセスできます。

## 5. サイト公開ON/OFF
管理画面 > サイト設定 > 公開状態

- 公開: 一般ユーザーが閲覧可能
- 非公開: 一般ユーザーにはメンテナンス画面
- 管理者: 非公開中でもログイン済みならサイト確認可能

## 6. データ
初回起動時に `storage/clover-rules.sqlite` が自動作成されます。
ルール本文がまとまったら管理画面から追加できます。

## 本番運用
必ず以下を実施してください。
- HTTPSを使用
- `.env` を公開しない
- `SESSION_SECRET` を変更
- NodeプロセスをPM2/systemd等で常駐
- `storage/clover-rules.sqlite` を定期バックアップ
