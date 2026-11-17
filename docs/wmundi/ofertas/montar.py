import base64, pathlib

a = pathlib.Path(__file__).parent
logo = "data:image/png;base64," + base64.b64encode((a.parent / "site-novo/assets/logo-wmundi.png").read_bytes()).decode()
for n in ["ponto", "precificador", "urbanflow"]:
    d = a / "dist" / n
    d.mkdir(parents=True, exist_ok=True)
    (d / "index.html").write_text((a / "src" / f"{n}.html").read_text().replace("__LOGO__", logo))
print("ok")
