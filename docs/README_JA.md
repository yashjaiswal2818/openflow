<div align="center">
  <h3>OpenFlow · オープンソースで 100% オフラインのローカル音声 OS</h3>
  <p><strong>スマートディクテーション + ゼロショット声質クローン。ローカルだけで完結。</strong></p>
  <p><a href="../README.md">English</a> • <a href="README_CN.md">简体中文</a> • <strong>日本語</strong> • <a href="README_DE.md">Deutsch</a> • <a href="README_ES.md">Español</a></p>
</div>

---

## OpenFlow とは

OpenFlow は、2 つの定額サービスを 1 つのローカルアプリに置き換えます。

1. **スマートディクテーション（Voice-IN）**: どこでもグローバルショートカットを押しながら話すと、
   フィラー除去・吃音の統合・句読点の整形を経たテキストがカーソル位置に直接入力されます。
2. **ゼロショット声質クローン（Voice-OUT）**: 5〜15 秒の音声サンプルを一度録音するだけで、
   自分の声でオフライン合成し、選択した画面テキストを読み上げられます。

アカウント、API キー、テレメトリは一切ありません。録音・テキスト・声質プロファイル・
モデルはすべて `~/.openflow` に保存され、フォルダを削除すれば完全に消去されます。

## クイックスタート

必要なもの: **Node.js 18+** と **Python 3.10+**。

```bash
git clone https://github.com/yashjaiswal2818/openflow.git
cd openflow
npm install
npm run dev          # エンジン (127.0.0.1:18488) + Studio (localhost:1420)
```

<http://localhost:1420> を開きます。

マイク用依存パッケージや Whisper が無い場合、エンジンは自動的に **デモモード** で起動します。
音声取得と書き起こしはシミュレーションされますが、テキスト整形・履歴保存・WAV アーカイブ・
音声合成は実際に動作します。UI には常に「demo mode」バッジが表示され、API の結果にも
`demo: true` が付きます。

### 実際の音声認識を有効にする（任意）

```bash
pip install -r requirements.txt
npm run dev
```

**設定 → 診断** で、マイク・Whisper バックエンド・TTS バックエンド・クリップボード連携の
検出状況を確認できます。

## 現在の実装状況

| 機能 | 状態 |
| :--- | :--- |
| 決定論的ディクテーション整形（フィラー、吃音、音声句読点、大小文字、技術略語） | ✅ 完了（20 テスト、1 ms 未満） |
| 二重録音保存（生 WAV + 生テキスト + 整形後テキスト） | ✅ 完了（検索・エクスポート対応） |
| 声質プロファイル（ブラウザ録音 → 16 kHz WAV → 検証 → ピッチ解析） | ✅ 完了 |
| オフライン音声合成 | ✅ 動作（プレビュー品質、Kokoro 導入でニューラル化） |
| グローバルホットキー + 自動貼り付け | ✅ 実装済み（`pynput` とクリップボードツールが必要） |
| Whisper 書き起こし | ✅ 実装済み（faster-whisper / whisper） |
| Kokoro-82M / Piper アダプタ | ⏳ 進行中 |
| Tauri デスクトップシェル | ⏳ スキャフォールド |

## モデルティア

| ティア | 音声認識 | 音声合成 | 目標レイテンシ | メモリ |
| :--- | :--- | :--- | :--- | :--- |
| ⚡ Fast | `tiny.en` | Piper VITS | `<150 ms` | `<500 MB` |
| ⚖️ Balanced | `small.en` | Kokoro-82M | `<350 ms` | `~1.5 GB` |
| 💎 Pro Studio | `large-v3-turbo` | F5-TTS | 高忠実度 | `~4 GB` |

## テスト

```bash
npm test        # TypeScript 型チェック + エンジンの 62 テスト
npm run build   # プロダクションビルド
```

アーキテクチャ、API 一覧、ロードマップの詳細は [英語 README](../README.md) を参照してください。

## ライセンス

[MIT](../LICENSE)
