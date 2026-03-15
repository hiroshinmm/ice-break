# タスクリスト: AI画像生成の廃止と記事画像の採用

- [/] `generateInsights.js` の改修
    - [ ] 選定した記事の `imageUrl` を JSON 出力に含めるように修正
- [ ] `captureSlides.js` の改修
    - [ ] Pollinations.ai 関連コードの削除
    - [ ] `insight.imageUrl` を使用するロジックに変更
    - [ ] 画像がない場合のデフォルト画像（Unsplash等）の指定
    - [ ] タイムアウト設定を標準（30秒程度）へ戻す
- [ ] 要件定義書（`requirements_specification.md`）の更新
- [ ] 動作確認と GitHub への反映
