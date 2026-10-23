# ZEVANT アカウント（ログイン）と Cloudflare Workers 配信

ゲームアカウントのログイン機能と、本番配信用の Cloudflare Worker です。1 つの Worker が次の 2 つを担当します。

- `dist/` に生成したゲーム本体を Workers Static Assets として配信する
- `/api/account/*` でアカウント API を提供し、データを D1 に保存する

ゲームとアカウント API を同じオリジンで配信するので、ログイン状態は HttpOnly の Cookie で保持されます。オンライン対戦のリレー（`server/`）は別の Worker のまま変わりません。

## 構成

| パス | 内容 |
| --- | --- |
| `client/src/entry.js` | 起動時に読み込む小さなエントリ（gzip 約 7.5 KB）。メインメニューのアカウントカード、タイトル画面のログインボタン、`window.zevantAccount` |
| `client/src/panel.js` | ログイン／新規登録／アカウント管理ダイアログ。初回に開く前（メインメニュー表示の 1.5 秒後）に別チャンクとして先読みする |
| `client/src/styles/` | カード（`chip.css`）とダイアログ（`panel.css`）のスタイル。JS に埋め込み、追加の CSS リクエストは発生しない |
| `client/dev.html` | 開発用のハーネス。ゲームを起動せずに UI を確認できる |
| `shared/rules.js` | ユーザー ID・プレイヤー名・パスワードの検証ルール。UI と Worker で同じものを使う |
| `worker/` | Worker 本体（API、パスワードハッシュ、セッション、試行回数制限） |
| `migrations/` | D1 のスキーマ |
| `tests/` | API の回帰テスト。`node:sqlite` で D1 を代替する |
| `dev/vite-plugins.mjs` | Vite の開発サーバーと本番ビルドの拡張 |
| `wrangler.toml` | Worker・D1・Static Assets・定期実行の設定 |

## できること

- 新規登録：ユーザー ID（3〜20 文字の英数字と `_`、大文字小文字を区別しない）、プレイヤー名（16 文字まで）、パスワード（8〜128 文字）。メールアドレスは不要
- ログイン／ログアウト、「ログインしたままにする」（オン: 30 日、オフ: ブラウザを閉じるまで。サーバー側でも 1 日操作がなければ失効）
- アイコンの変更（イカ・タコ・クラゲ・サカナ・カニ・ヒトデの6種類と、背景の色8色）。アカウントに保存され、メニューのカードとダイアログに表示される
- プレイヤー名の変更。設定がオンのとき、ゲーム内の名前（メニュー表示とオンラインロビー）をアカウントのプレイヤー名にそろえる
- パスワードの変更（変更すると、この端末以外はすべてログアウト）
- ログイン中の端末一覧と、ほかの端末のログアウト
- アカウントの削除（ユーザー ID の入力とパスワードで確認）
- 任意で Cloudflare Turnstile による新規登録時のボット対策

ゲストのままでもすべてのモードで遊べます。ログインしなくてもゲームの動作は変わりません。

### UI の操作

- マウス・タッチ・キーボード・ゲームパッドで操作できます。メインメニューのカードは既存メニューのフォーカス移動に参加し、十字キーや矢印キーで選べます。
- ダイアログを開いている間、キー入力とパッド操作はダイアログだけが受け取ります。`Esc` / B ボタンで戻る・閉じる、LB / RB でログインと新規登録を切り替えます。
- PC の横画面、スマートフォンの縦画面と横画面のそれぞれに合わせたレイアウトになります。タッチ端末では、入力欄をタップするまでソフトウェアキーボードを出しません。
- 日本語と英語に対応し、ゲームの言語設定（`inkwave.settings.lang`）に従います。動きを減らす設定（`prefers-reduced-motion`）ではアニメーションを止めます。

## セキュリティ

- パスワードは PBKDF2-SHA256（100,000 回、ソルト 16 バイト）でハッシュ化して保存します。回数はハッシュごとに記録し、設定より少ない回数で作られたハッシュはログイン時に作り直します。
- セッショントークンは 32 バイトの乱数です。D1 には SHA-256 だけを保存し、Cookie は `HttpOnly`・`SameSite=Lax`・HTTPS では `Secure` と `__Host-` 接頭辞を付けます。
- 状態を変更するリクエストは、`X-Zevant-Request: 1` ヘッダー（クロスオリジンでは事前確認が必要になる）と `Origin` の許可リストを確認します。
- 試行回数制限：同じユーザー ID へのログイン失敗 8 回 / 15 分、同じ接続元からの失敗 40 回 / 15 分、同じ接続元からの新規登録 5 件 / 日。IP アドレスはハッシュ化して保存します。
- 存在しないユーザー ID でも同じ計算量のハッシュ処理を行い、エラーも同じ内容を返します。

## 開発

Node.js 22.12 以上を使います（Vite 8 の要件）。リポジトリのルートで実行します。

```sh
npm install --no-save --no-package-lock --no-audit --no-fund esbuild@0.28.2 vite@8.3.3
npm run build        # 初回のみ: ゲーム本体を _site/ に生成（実際のゲーム画面で確認するため）
npm run dev          # http://localhost:5173/
```

- `http://localhost:5173/` … `_site/` のゲームに、ソースのアカウント UI を読み込んで起動します。UI の変更はそのまま反映されます。
- `http://localhost:5173/dev.html` … ゲームを起動しない UI ハーネスです。下部のボタンでタイトル／メイン、タッチ表示、言語を切り替えられます。
- `/api/*` には実際の Worker のコードがメモリ上の D1 で動きます。データは開発サーバーを止めると消えます。

API のテスト：

```sh
npm run test:account
```

## 本番ビルド

```sh
npm install --no-save --no-package-lock --no-audit --no-fund esbuild@0.28.2 vite@8.3.3
npm run build:prod   # = vite build
node scripts/check-inkwave-startup-budget.mjs dist
```

`vite build` は次の順に処理します。

1. アカウント UI をバンドル・圧縮し、内容ハッシュ付きのファイル名で `.account-build/` に出力する
2. 既存のゲームビルド（`scripts/build-inkwave.mjs`）を `INKWAVE_ACCOUNT_BUILD=.account-build` で実行し、パッチ適用済みのゲームを `dist/` に生成する。アカウント UI は `_versions/<revision>/account/` に入り、`index.html` に優先度の低いモジュールとして追加される
3. `dist/_headers` を書き出す。`_versions/*` は 1 年間の不変キャッシュ、`index.html` と `sw.js` は毎回再検証

ゲーム本体のモジュールは、これまでどおり既存のパイプライン（パッチ適用、ファイルごとの最小化、modulepreload、オフライン用 Service Worker）で処理します。ゲームの読み込み時間を短くしている主な要素は、内容が変わらないファイルをブラウザと Cloudflare のエッジに長期キャッシュさせる設定です。

`INKWAVE_ACCOUNT_BUILD` を指定しない `npm run build`（GitHub Pages 用）の出力は、これまでと同じです。

## Cloudflare へのデプロイ

`account/` で実行します。

```sh
cd account
npm install
npx wrangler login
npx wrangler d1 create zevant-accounts
```

表示された `database_id` を `wrangler.toml` の `[[d1_databases]]` に設定し、スキーマを適用してからデプロイします。

```sh
npm run db:migrate:remote
cd .. && npm run build:prod && cd account
npm run deploy
```

ローカルの Workers ランタイムで確認する場合：

```sh
npm run db:migrate:local
npm run dev          # http://127.0.0.1:8787/
```

### 設定（`wrangler.toml` の `[vars]` とシークレット）

| 名前 | 既定値 | 内容 |
| --- | --- | --- |
| `REGISTRATION_OPEN` | `"true"` | `"false"` で新規登録を停止する（既存アカウントはログインできる） |
| `ALLOWED_ORIGINS` | `""` | ゲームを別のオリジンから配信する場合に、そのオリジンをカンマ区切りで指定する |
| `COOKIE_SAMESITE` | `"Lax"` | 別サイトから API を呼ぶ場合だけ `"None"`（HTTPS 必須） |
| `TURNSTILE_SITE_KEY` | `""` | Turnstile のサイトキー。シークレット `TURNSTILE_SECRET_KEY` と両方そろったときだけ有効 |
| `TURNSTILE_SECRET_KEY` | なし | `npx wrangler secret put TURNSTILE_SECRET_KEY` で設定する |
| `PBKDF2_ITERATIONS` | `100000` | 通常は変更しない。Workers の上限は 100,000 |

ゲームと API を別のオリジンにする場合は、ビルド時に `VITE_ACCOUNT_API=https://<api の origin>/api/account` を指定し、API 側の `ALLOWED_ORIGINS` にゲームのオリジンを、`COOKIE_SAMESITE` に `"None"` を設定します。

### 運用

- 期限切れのセッションと古い試行回数の記録は、毎日 03:17 UTC の定期実行で削除します。
- アカウントの確認・削除は D1 のコンソールか `wrangler d1 execute zevant-accounts --remote --command "..."` で行えます。パスワードとセッショントークンは復元できない形でしか保存していません。

## JavaScript から使う

```js
window.zevantAccount.open();             // 状態に応じたダイアログを開く（'login' | 'register' | 'account' も指定可）
window.zevantAccount.user;               // { id, loginId, displayName, createdAt, passwordChangedAt } | null
window.zevantAccount.subscribe(({ status, user }) => { /* 'loading' | 'guest' | 'user' | 'offline' */ });
```

## 制約と未対応

- パスワードを忘れた場合の再設定はありません（メールアドレスを登録しないため）。必要になった場合は、メール送信手段と合わせて設計します。
- ゲームの進行状況（レベル・ブキ・設定）は従来どおり端末の `localStorage` に保存し、アカウントには保存しません。
- オンライン対戦のリレーは、まだアカウントを確認していません。部屋に参加するときの名前はゲーム内の名前です。
- メニューとの連携には、ゲームが公開している `window.__G.menus` の内部メソッド（`_bind`、`_sfx`、`nav`、`api.setProfileName`）を使います。存在しない場合は通常のボタンとして動作します。
