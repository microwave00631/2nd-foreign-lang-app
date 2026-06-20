import { useEffect, useState, type FormEvent, type ReactNode } from 'react';

// 簡易パスコードゲート。
// 注意: これは静的サイト上のクライアント側チェックなので「本物のアクセス制限」ではなく、
// うっかり訪問者を弾くための“やわらかい鍵”です。バンドルを読めば突破できます。
// 本当に制限したい場合は配信側で認証する仕組み(例: Cloudflare Access)が必要です。
const GATE_HASH = import.meta.env.VITE_GATE_HASH as string | undefined;
const STORAGE_KEY = 'gate-unlocked-hash';
// 事前計算テーブルを少しだけ無効化する固定ソルト(気休め程度)。
const SALT = '2flang-gate:';

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function Gate({ children }: { children: ReactNode }) {
  // VITE_GATE_HASH 未設定(ローカル開発など)なら素通しする。
  const enabled = Boolean(GATE_HASH);
  const [unlocked, setUnlocked] = useState(!enabled);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    // 過去に正しいコードを入れた端末は記憶しておき再入力を省く。
    // パスコード(=ハッシュ)が変われば自動的に再要求される。
    if (localStorage.getItem(STORAGE_KEY) === GATE_HASH) setUnlocked(true);
  }, [enabled]);

  if (unlocked) return <>{children}</>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setChecking(true);
    const hash = await sha256Hex(SALT + code.trim());
    if (hash === GATE_HASH) {
      localStorage.setItem(STORAGE_KEY, hash);
      setUnlocked(true);
    } else {
      setError(true);
      setCode('');
    }
    setChecking(false);
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: '2.4rem' }}>🔒</div>
      <h1 style={{ margin: 0 }}>第二外国語アプリ</h1>
      <p style={{ color: 'var(--text-dim)', margin: 0, maxWidth: 320 }}>
        合言葉を入力してください
      </p>
      <form
        onSubmit={submit}
        style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 280 }}
      >
        <input
          type="password"
          inputMode="text"
          autoFocus
          autoComplete="off"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setError(false);
          }}
          placeholder="合言葉"
          style={{
            padding: '12px 14px',
            fontSize: '1rem',
            borderRadius: 'var(--radius)',
            border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
            background: 'var(--bg-input)',
            color: 'var(--text)',
            textAlign: 'center',
          }}
        />
        {error && (
          <span style={{ color: 'var(--red)', fontSize: '0.85rem' }}>合言葉が違います</span>
        )}
        <button
          type="submit"
          disabled={checking || code.trim().length === 0}
          style={{
            padding: '12px 14px',
            fontSize: '1rem',
            borderRadius: 'var(--radius)',
            border: 'none',
            background: 'var(--accent)',
            color: '#fff',
            cursor: 'pointer',
            opacity: checking || code.trim().length === 0 ? 0.6 : 1,
          }}
        >
          {checking ? '確認中…' : '入る'}
        </button>
      </form>
    </main>
  );
}
