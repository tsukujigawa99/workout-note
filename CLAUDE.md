# WorkOut Note — Claude Code 向けプロジェクトメモ（引継ぎ用）

このファイルは Claude Code がこのフォルダを開いた時に自動で読む。別PCで続きを行う時は、GitHub から clone してこのフォルダを開くだけで文脈が引き継がれる。

## プロジェクト
- 依頼者個人用の筋トレ記録 PWA（筋トレMEMOの代替。広告なし・無料）。将来は友達2〜3人（スマホのみ）にも使わせたい相談あり。
- 公開URL: https://tsukujigawa99.github.io/workout-note/ （main へ push → GitHub Actions が `app/` を Pages へ自動デプロイ、1〜2分）
- リポジトリ: https://github.com/tsukujigawa99/workout-note
- Firebase プロジェクト: `workout-note-b45cd`（Firestore 東京、Google ログイン）。接続情報は `app/js/firebase-config.js`（公開値）。
- 現行版: v1.1.1（2026-09-17 公開）。自動テスト `tests/test.html` 150件 PASS。

## 体制（依頼者指定・必ず維持）
- PM／窓口 = メイン会話。依頼者とのやり取り、仕様決定、報告。
- 開発担当 = サブエージェント。仕様書に沿って実装。
- テスト担当 = 開発とは別のサブエージェント。コードは直さず報告のみ。スマホ幅(320〜430px)とPC幅で実操作。
- 流れ: 仕様書作成 → 開発 → テスト → 修正依頼 → 再テスト → PMが受け入れ確認 → push。

## 技術制約
- ビルドなし。素の HTML/CSS/JS（ES Modules）。外部ライブラリは Firebase JS SDK 12.19.0（gstatic から動的 import）と Google Fonts のみ。相対パス必須（サブパス配信）。
- 見た目の基準は `mock/mock.html`（依頼者承認済み）。勝手に変えない。
- ローカル確認: `python -m http.server 8765 --directory app`。テスト: リポジトリ直下を 8766 で配信し `/tests/test.html` を前面タブで開く。
- リリース時は `app/sw.js` の `CACHE_VERSION` と `app/js/defaults.js` の `APP_VERSION` を両方上げる。新規ファイルは sw.js のシェル一覧にも追加。SDK 版を変える時は `firebase-config.js` と `sw.js` の両方。
- 同期の設計原則「クラウドの記録を絶対に壊さない」（設計書8章）。ready まで保存拒否、切替中は入力停止、一覧は毎回作り直し。
- 日付キーはローカル時刻（toISOString 禁止）。ユーザー入力は必ずエスケープ。入力中に再描画でフォーカスを飛ばさない。

## 依頼者との約束
- パスワード類は受け取らない・入力しない（firebaseConfig は公開値なので可）。Google/GitHub のログインは依頼者本人が行う。
- 報告は結論を先に、専門用語は言い換える。確認できていないことを「確認済み」と書かない。
- 推定1RM = `w × (1 + r/40)`（筋トレMEMOと同一、依頼者確認済み）。

## 未完了・確認待ち（2026-10-08 時点）
1. 依頼者の実ログイン確認（手順書5章）: PC/iPhone の同期、移行、オフライン、**iPhone ホーム画面アプリからの Google ログイン**（最大の懸念。失敗時の代替案 = Google OAuth の ID トークンをリダイレクトで受けて `signInWithCredential`）。
2. Firebase コンソール設定が済んだか未確認: Firestore ルール（`firestore.rules`）の適用、承認済みドメインに `tsukujigawa99.github.io`。
3. 友達利用: 利用者をメールアドレス許可リストで限定するルール案と「友達向けかんたん手順」を提案中。友達のスマホが iPhone か Android か回答待ち。
4. 未判断: 赤テーマのコントラスト（カレンダー記録あり日 3.1:1）は実機確認後に判断。
5. 次版候補: 自己ベストバッジ、CSV/JSON 書き出し、週別バーの数値表示。
6. `capture/` の画像（雲マッチョ等）は依頼者が置いたもの。用途未確認、リポジトリには含めていない。

## 文書
- `docs/01_要件定義書.md`、`02_開発仕様書.md`、`04_フェーズ2仕様_Firebase同期.md`（開発担当への指示の本体）
- `docs/03`/`05` 手順書（ご本人作業）、`docs/html/` に構成図・手順書・設計書の HTML 版（依頼者向け、最新）
- `mock/mock.html` 承認済みモック、`firestore.rules`、`scripts/make_icons.py`
