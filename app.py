import os
import sqlite3
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from flask import Flask, g, jsonify, render_template, request
from google import genai
from markdown import markdown

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
DATABASE_PATH = BASE_DIR / "instance" / "reports.db"
DATABASE_PATH.parent.mkdir(exist_ok=True)

PROMPT_TEMPLATE = """角色：
扮演顶级投资基金的精英股票研究分析师。
你的任务是从基本面和宏观经济角度分析公司，可以访问 Bloomberg、FactSet 以及 SEC 文件。每一个指标都必须标注数据来源和日期。如果数据不可获取或可能已过期，请明确说明。不要估算或编造任何数字。并按照以下框架组织报告。
股票代码 / 公司名称：{query}
投资论点：[在此输入]
目标：[在此输入目标]
指令：
使用以下结构提供清晰、逻辑严谨的股票研究报告：
1. 基本面分析
公司概览：用通俗易懂的语言解释这家公司是做什么的，分析收入增长、毛利率与净利率趋势、自由现金流，
与行业同类公司比较估值指标（P/E, EV/EBITDA 等）
查看内部持股及近期内部交易
股价变动：1 个月、3 个月、6 个月、1 年、年初至今（附精确百分比变化）
52 周最高价和最低价
与标普 500 同期表现对比
2. 论点验证
提出支持投资论点的 3 个理由
强调 2 个反对论点或关键风险
给出最终结论：看涨 / 看跌 / 中性，并附理由
3. 行业与宏观视角
简述行业概况
概述相关宏观经济趋势
说明公司竞争定位
4. 催化因素观察
列出即将发生的事件（财报、产品发布、监管等）
识别短期和长期催化因素
5. 华尔街一致预期：
→ 覆盖该股票的分析师数量
→ 买入 / 持有 / 卖出评级分布
→ 平均目标价、最高目标价、最低目标价
→ 最近一次分析师上调或下调评级（注明机构名称和日期）
6. 机构资金动向：
→ 前 5 大机构持仓者及其上季度持仓变动情况
→ 是否有值得关注的对冲基金动向（新建仓或清仓）
7. 投资总结
投资论点 5 点总结
最终建议：买入 / 持有 / 卖出
信心等级：高 / 中 / 低
预期时间框架（如 6–12 个月）
✅ 格式要求
使用 Markdown
适当使用项目符号
简洁、专业、有洞察力
不需要解释过程，只需提供分析"""


app = Flask(__name__)

def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DATABASE_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_error=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    db = sqlite3.connect(DATABASE_PATH)
    db.execute(
        """
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            query TEXT NOT NULL,
            report_markdown TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    db.commit()
    db.close()


def generate_report(query: str) -> str:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY 未配置，请在环境变量中设置。")

    client = genai.Client(api_key=api_key)
    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    prompt = PROMPT_TEMPLATE.format(query=query)
    response = client.models.generate_content(model=model, contents=prompt)
    if not response.text:
        raise RuntimeError("Gemini 没有返回内容，请稍后重试。")
    return response.text


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/reports")
def reports_page():
    return render_template("reports.html")


@app.post("/api/analyze")
def analyze():
    payload = request.get_json(silent=True) or {}
    query = (payload.get("query") or "").strip()
    if not query:
        return jsonify({"error": "请输入公司名称或股票代码。"}), 400

    try:
        report_md = generate_report(query)
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    created_at = datetime.utcnow().isoformat(timespec="seconds") + "Z"
    db = get_db()
    cursor = db.execute(
        "INSERT INTO reports (query, report_markdown, created_at) VALUES (?, ?, ?)",
        (query, report_md, created_at),
    )
    db.commit()

    return jsonify(
        {
            "id": cursor.lastrowid,
            "query": query,
            "created_at": created_at,
        }
    )


@app.get("/api/reports")
def list_reports():
    db = get_db()
    rows = db.execute(
        "SELECT id, query, created_at FROM reports ORDER BY id DESC"
    ).fetchall()
    return jsonify([dict(row) for row in rows])


@app.get("/api/reports/<int:report_id>")
def get_report(report_id: int):
    db = get_db()
    row = db.execute(
        "SELECT id, query, report_markdown, created_at FROM reports WHERE id = ?",
        (report_id,),
    ).fetchone()
    if row is None:
        return jsonify({"error": "报告不存在。"}), 404

    return jsonify(
        {
            "id": row["id"],
            "query": row["query"],
            "created_at": row["created_at"],
            "report_markdown": row["report_markdown"],
            "report_html": markdown(row["report_markdown"], extensions=["extra", "tables"]),
        }
    )


init_db()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
