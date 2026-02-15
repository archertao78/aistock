const reportList = document.querySelector('#report-list');
const reportTitle = document.querySelector('#report-title');
const reportMeta = document.querySelector('#report-meta');
const reportContent = document.querySelector('#report-content');

async function fetchReports() {
  const response = await fetch('/api/reports');
  const reports = await response.json();
  reportList.innerHTML = '';

  if (!reports.length) {
    reportList.innerHTML = '<li>暂无报告</li>';
    return;
  }

  reports.forEach((item) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'list-btn';
    button.textContent = `${item.query} (${new Date(item.created_at).toLocaleString()})`;
    button.addEventListener('click', () => loadReport(item.id));
    li.appendChild(button);
    reportList.appendChild(li);
  });

  const params = new URLSearchParams(window.location.search);
  const initialId = Number(params.get('id')) || reports[0].id;
  loadReport(initialId);
}

async function loadReport(id) {
  const response = await fetch(`/api/reports/${id}`);
  const result = await response.json();
  if (!response.ok) {
    reportTitle.textContent = '加载失败';
    reportMeta.textContent = result.error || '未知错误';
    reportContent.innerHTML = '';
    return;
  }

  reportTitle.textContent = `${result.query} 分析报告`;
  reportMeta.textContent = `创建时间（UTC）：${result.created_at}`;
  reportContent.innerHTML = result.report_html;
}

fetchReports();
