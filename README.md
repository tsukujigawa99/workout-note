# WorkOut Note

個人用の筋トレ記録 PWA（広告なし）。iPhone のホーム画面に追加して使い、PC のブラウザからも同じ記録を見られます。

- 公開URL: https://tsukujigawa99.github.io/workout-note/
- 構成: ビルドなしの HTML / CSS / JavaScript（ES Modules）＋ Firebase（Firestore・Google ログイン）
- `app/` が公開される本体。`main` に push すると GitHub Actions が `app/` を GitHub Pages にデプロイします。

## ローカルで動かす

```bash
python -m http.server 8765 --directory app
```

テストは、リポジトリ直下を配信して `tests/test.html` を開きます。

```bash
python -m http.server 8766
```

## ドキュメント

`docs/` に要件定義書・開発仕様書・手順書があります。リリース時は `app/sw.js` の `CACHE_VERSION` と `app/js/defaults.js` の `APP_VERSION` を上げてください。
