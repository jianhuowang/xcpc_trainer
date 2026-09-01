const PRIVACY_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>XCPC Trainer Coach 隐私政策</title>
  <style>
    :root { color-scheme: light dark; font-family: system-ui, sans-serif; line-height: 1.7; }
    body { margin: 0; background: Canvas; color: CanvasText; }
    main { max-width: 48rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    h1, h2 { line-height: 1.25; }
    h2 { margin-top: 2rem; }
    code { overflow-wrap: anywhere; }
    a { color: LinkText; }
  </style>
</head>
<body>
  <main>
    <h1>XCPC Trainer Coach 隐私政策</h1>
    <p>生效日期：2026-09-01</p>
    <p>XCPC Trainer Coach 是连接 ChatGPT 与个人 XCPC Trainer 的训练工具。Trainer 是排程与训练记录的唯一事实源。</p>

    <h2>处理的数据</h2>
    <p><code>getTrainingContext</code> 只读取盲做安全的训练上下文；<code>setTrainingMode</code> 只保存用户明确选择的训练模式；<code>submitTrainingEvidence</code> 只在用户确认后提交 <code>problemId</code>、<code>evidence</code>、<code>helpLevel</code>、可选 <code>notes</code> 与幂等键。服务端自行计算排程。</p>

    <h2>用途与保存</h2>
    <p>数据仅用于生成个人训练队列、记录真实尝试、安排复习和提供导出。Trainer 不会出售训练数据，也不会将其用于广告。</p>
    <p><code>AGENT_API_KEY</code> 仅用于 Action 鉴权，不写入数据库、导出、notes 或应用日志。</p>

    <h2>追踪与平台数据</h2>
    <p>本应用不额外添加分析追踪或广告脚本。托管与身份平台可能依照其自身政策处理提供服务所必需的技术元数据。</p>

    <h2>访问、导出与删除</h2>
    <p>训练数据由站点所有者管理。所有者可以通过 Trainer 导出数据，并负责处理删除请求。</p>

    <h2>联系</h2>
    <p>技术问题可通过 <a href="https://github.com/jianhuowang/xcpc_trainer/issues">GitHub Issues</a> 联系。请勿在公开 Issue 中粘贴 API key、账号信息或敏感训练内容。</p>
  </main>
</body>
</html>`;

export function GET() {
  return new Response(PRIVACY_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
