const form = document.querySelector('#analyze-form');
const statusEl = document.querySelector('#status');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const query = document.querySelector('#query').value.trim();
  if (!query) {
    statusEl.textContent = '请输入公司名称或股票代码。';
    return;
  }

  statusEl.textContent = '正在调用 Gemini 生成报告，请稍候...';

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || '生成报告失败。');
    }

    statusEl.textContent = `分析完成，报告已保存（ID: ${result.id}）。将在新页面打开。`;
    window.open(`/reports?id=${result.id}`, '_blank', 'noopener');
  } catch (error) {
    statusEl.textContent = error.message;
  }
});
