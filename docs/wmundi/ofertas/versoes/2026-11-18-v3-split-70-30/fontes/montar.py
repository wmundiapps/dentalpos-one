import base64, pathlib

a = pathlib.Path(__file__).parent
from marca import logo_com_r, reg_html
logo = "data:image/png;base64," + base64.b64encode(logo_com_r().read_bytes()).decode()
EXPIRA = "2026-12-02"   # 15 dias a partir de 17/11/2026
EXP_BR = "02/12/2026"
guard = ('<script>(function(){var f=new Date("%sT23:59:59-03:00");if(new Date()>f){document.documentElement.innerHTML="<meta charset=utf-8><meta name=viewport content=\'width=device-width,initial-scale=1\'><title>WMundi</title><body style=\'font:17px system-ui;padding:40px;max-width:560px;margin:auto;color:#14213d\'><h2>Demonstração encerrada</h2><p>O período de teste terminou em %s. Para ver novamente, fale com a WMundi: info@wmundi.com · (44) 99946-6451.</p></body>"}})()</script>' % (EXPIRA, EXP_BR))
banner = '<div style="background:#ffc94d;color:#0b1b3f;text-align:center;font:600 13px system-ui;padding:6px">Demonstração com dados fictícios · disponível até %s</div>' % EXP_BR
for n in ["ponto", "precificador", "urbanflow"]:
    d = a / "dist" / n
    d.mkdir(parents=True, exist_ok=True)
    (d / "index.html").write_text(reg_html((a / "src" / f"{n}.html").read_text()).replace("__LOGO__", logo).replace("</head><body>", "</head><body>" + banner, 1).replace("</body></html>", guard + "</body></html>"))
print("ok")
