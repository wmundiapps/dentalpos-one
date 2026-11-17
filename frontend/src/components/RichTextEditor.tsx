import { useEffect, useRef } from "react";
import { Box, Divider, IconButton, MenuItem, Select, Tooltip, Typography } from "@mui/material";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import FormatAlignCenterIcon from "@mui/icons-material/FormatAlignCenter";
import FormatAlignRightIcon from "@mui/icons-material/FormatAlignRight";
import FormatAlignJustifyIcon from "@mui/icons-material/FormatAlignJustify";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import { RICH_FONTS, RICH_SIZES, sanitizeRich, toRichHtml } from "../utils/richText";

// Editor de texto estilo Word para o conteúdo dos documentos.
export default function RichTextEditor({ value, onChange, label, helperText, minHeight = 260 }: { value: string; onChange: (html: string) => void; label?: string; helperText?: string; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || last.current === value) return;
    el.innerHTML = toRichHtml(value || "");
    last.current = value;
  }, [value]);

  const emit = () => {
    const el = ref.current; if (!el) return;
    // converte <font size=7> (marcador do tamanho escolhido) em estilo antes de limpar
    const html = sanitizeRich(el.innerHTML);
    last.current = html;
    onChange(html);
  };
  const exec = (cmd: string, arg?: string) => { ref.current?.focus(); document.execCommand("styleWithCSS", false, "true"); document.execCommand(cmd, false, arg); emit(); };
  const keep = (e: React.MouseEvent) => e.preventDefault(); // não perde a seleção ao clicar na barra

  const btn = (title: string, icon: React.ReactNode, cmd: string) => (
    <Tooltip title={title}><IconButton size="small" onMouseDown={keep} onClick={() => exec(cmd)}>{icon}</IconButton></Tooltip>
  );

  return (
    <Box>
      {label && <Typography variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>{label}</Typography>}
      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.5, p: 0.75, bgcolor: "action.hover", borderBottom: "1px solid", borderColor: "divider" }}>
          <Select size="small" defaultValue="Arial" onMouseDown={keep} onChange={(e) => exec("fontName", String(e.target.value))} sx={{ minWidth: 150, height: 32, fontSize: 13 }} aria-label="Fonte">
            {RICH_FONTS.map((f) => <MenuItem key={f} value={f} sx={{ fontFamily: f }}>{f}</MenuItem>)}
          </Select>
          <Select size="small" defaultValue={12} onMouseDown={keep} onChange={(e) => {
            ref.current?.focus(); document.execCommand("styleWithCSS", false, "false"); document.execCommand("fontSize", false, "7");
            ref.current?.querySelectorAll('font[size="7"]').forEach((f) => { f.removeAttribute("size"); (f as HTMLElement).style.fontSize = `${e.target.value}pt`; });
            emit();
          }} sx={{ width: 78, height: 32, fontSize: 13 }} aria-label="Tamanho da fonte">
            {RICH_SIZES.map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </Select>
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          {btn("Negrito", <FormatBoldIcon fontSize="small" />, "bold")}
          {btn("Itálico", <FormatItalicIcon fontSize="small" />, "italic")}
          {btn("Sublinhado", <FormatUnderlinedIcon fontSize="small" />, "underline")}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          {btn("Alinhar à esquerda", <FormatAlignLeftIcon fontSize="small" />, "justifyLeft")}
          {btn("Centralizar", <FormatAlignCenterIcon fontSize="small" />, "justifyCenter")}
          {btn("Alinhar à direita", <FormatAlignRightIcon fontSize="small" />, "justifyRight")}
          {btn("Justificar", <FormatAlignJustifyIcon fontSize="small" />, "justifyFull")}
          <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
          {btn("Lista com marcadores", <FormatListBulletedIcon fontSize="small" />, "insertUnorderedList")}
          {btn("Lista numerada", <FormatListNumberedIcon fontSize="small" />, "insertOrderedList")}
        </Box>
        <Box
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label || "Conteúdo"}
          onInput={emit}
          onBlur={emit}
          onPaste={(e) => { e.preventDefault(); document.execCommand("insertText", false, e.clipboardData.getData("text/plain")); }}
          sx={{ minHeight, maxHeight: 460, overflowY: "auto", p: 2, outline: "none", textAlign: "center", fontSize: "12pt", lineHeight: 1.6, bgcolor: "background.paper", "&:focus": { boxShadow: "inset 0 0 0 2px", color: "inherit" }, "& ul,& ol": { textAlign: "left", display: "block", pl: 3 } }}
        />
      </Box>
      {helperText && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5, ml: 0.5 }}>{helperText}</Typography>}
    </Box>
  );
}
