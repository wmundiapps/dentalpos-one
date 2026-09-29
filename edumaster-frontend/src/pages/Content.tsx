import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import PageHeader from "../components/PageHeader";
import { listSubjects, type EduSubject } from "../services/EduApi";
import {
  addFlashcard,
  completeContentUpload,
  contentUploadIntent,
  createContentItem,
  createFlashcardDeck,
  createForum,
  createForumTopic,
  createLibrarySubscription,
  generateSummary8020,
  listContentItems,
  listFlashcardDecks,
  listForums,
  listForumTopics,
  listLibrarySubscriptions,
  type ContentItem,
  type FlashcardDeck,
  type Forum,
  type ForumTopic,
  type LibrarySubscription,
} from "../services/ContentApi";

type Secao = "conteudos" | "flashcards" | "forums" | "biblioteca";

const SECOES: { value: Secao; label: string }[] = [
  { value: "conteudos", label: "Conteúdos e aulas" },
  { value: "flashcards", label: "Flashcards" },
  { value: "forums", label: "Fóruns" },
  { value: "biblioteca", label: "Biblioteca" },
];

export default function Content() {
  const navigate = useNavigate();
  const secaoParam = (new URLSearchParams(window.location.search).get("secao") || "conteudos") as Secao;
  const secao = SECOES.some((s) => s.value === secaoParam) ? secaoParam : "conteudos";
  const setSecao = (value: Secao) => navigate(`/conteudo?secao=${value}`);
  const [subjects, setSubjects] = useState<EduSubject[]>([]);

  useEffect(() => { listSubjects().then(setSubjects).catch(() => {}); }, []);

  return (
    <Box>
      <PageHeader title="Conteúdo e Biblioteca" description="Aulas gravadas, materiais, flashcards, fóruns e biblioteca terceirizada." />

      <Tabs value={secao} onChange={(_, value) => setSecao(value)} variant="scrollable" scrollButtons="auto" sx={{ mb: 3, borderBottom: 1, borderColor: "divider" }}>
        {SECOES.map((s) => <Tab key={s.value} value={s.value} label={s.label} />)}
      </Tabs>

      {secao === "conteudos" && <Conteudos subjects={subjects} />}
      {secao === "flashcards" && <Flashcards subjects={subjects} />}
      {secao === "forums" && <Forums subjects={subjects} />}
      {secao === "biblioteca" && <Biblioteca />}
    </Box>
  );
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
}

function Conteudos({ subjects }: { subjects: EduSubject[] }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [linkOpen, setLinkOpen] = useState(false);
  const [linkForm, setLinkForm] = useState({ title: "", type: "PDF", url: "", subjectId: "", description: "", sourceText: "" });
  const [linkError, setLinkError] = useState("");
  const [savingLink, setSavingLink] = useState(false);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadForm, setUploadForm] = useState({ title: "", type: "VIDEO", subjectId: "", description: "" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState("");
  const [uploadStatus, setUploadStatus] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const reload = async () => {
    setLoading(true);
    setError("");
    try {
      setItems(await listContentItems());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar conteúdos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void reload(); }, []);

  const saveLink = async () => {
    if (!linkForm.title.trim() || !linkForm.url.trim()) { setLinkError("Informe título e URL."); return; }
    setSavingLink(true); setLinkError("");
    try {
      await createContentItem({ ...linkForm, subjectId: linkForm.subjectId || undefined });
      setLinkOpen(false);
      setLinkForm({ title: "", type: "PDF", url: "", subjectId: "", description: "", sourceText: "" });
      await reload();
      setToast("Conteúdo publicado.");
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : "Erro ao publicar conteúdo.");
    } finally {
      setSavingLink(false);
    }
  };

  const runUpload = async () => {
    if (!uploadForm.title.trim() || !uploadFile) { setUploadError("Informe o título e escolha um arquivo."); return; }
    setUploading(true); setUploadError(""); setUploadStatus("Preparando upload…");
    try {
      const { item, upload } = await contentUploadIntent({
        title: uploadForm.title, type: uploadForm.type, subjectId: uploadForm.subjectId || undefined,
        description: uploadForm.description || undefined,
        originalName: uploadFile.name, mimeType: uploadFile.type || "application/octet-stream", sizeBytes: uploadFile.size,
      });

      if (!upload.configured || !upload.url) {
        setUploadStatus(`Registro criado, mas o storage da instituição ainda não está configurado (${upload.reason || "sem credenciais"}). O arquivo não foi enviado.`);
        await reload();
        return;
      }

      setUploadStatus("Enviando arquivo…");
      const putResponse = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: uploadFile });
      if (!putResponse.ok) throw new Error(`Falha ao enviar o arquivo (HTTP ${putResponse.status}).`);

      await completeContentUpload(item.id);
      setUploadStatus("Upload concluído.");
      setUploadOpen(false);
      setUploadForm({ title: "", type: "VIDEO", subjectId: "", description: "" });
      setUploadFile(null);
      await reload();
      setToast("Aula enviada com sucesso.");
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Erro ao enviar arquivo.");
    } finally {
      setUploading(false);
    }
  };

  const summarize = async (item: ContentItem) => {
    try {
      await generateSummary8020(item.id);
      await reload();
      setToast("Resumo 80/20 gerado.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao gerar resumo.");
    }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Conteúdos</Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => setUploadOpen(true)}>Enviar arquivo (aula gravada)</Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setLinkOpen(true)}>Adicionar link externo</Button>
        </Box>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Título</TableCell><TableCell>Tipo</TableCell><TableCell>Origem</TableCell><TableCell>Tamanho</TableCell><TableCell>Status</TableCell><TableCell align="right">Ações</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && items.length === 0 && <TableRow><TableCell colSpan={6}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhum conteúdo publicado ainda.</Typography></TableCell></TableRow>}
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.title}</TableCell>
                <TableCell>{item.type}</TableCell>
                <TableCell>{item.storageProvider === "EXTERNAL" ? "Link externo" : "Storage próprio"}</TableCell>
                <TableCell>{formatBytes(item.sizeBytes)}</TableCell>
                <TableCell><Chip size="small" label={item.storageStatus} color={item.storageStatus === "AVAILABLE" ? "success" : "warning"} /></TableCell>
                <TableCell align="right">
                  {item.sourceText && !item.summary8020 && (
                    <Button size="small" startIcon={<AutoAwesomeIcon />} onClick={() => void summarize(item)}>Gerar resumo 80/20</Button>
                  )}
                  {item.summary8020 && <Chip size="small" label="Resumo 80/20 pronto" color="info" />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={linkOpen} onClose={() => setLinkOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Adicionar conteúdo por link externo</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {linkError && <Alert severity="error">{linkError}</Alert>}
          <TextField required label="Título" value={linkForm.title} onChange={(e) => setLinkForm({ ...linkForm, title: e.target.value })} />
          <TextField select label="Tipo" value={linkForm.type} onChange={(e) => setLinkForm({ ...linkForm, type: e.target.value })}>
            <MenuItem value="PDF">PDF</MenuItem>
            <MenuItem value="VIDEO">Vídeo</MenuItem>
            <MenuItem value="RESUMO">Resumo</MenuItem>
            <MenuItem value="MATERIAL_COMPLEMENTAR">Material complementar</MenuItem>
            <MenuItem value="APOSTILA">Apostila</MenuItem>
          </TextField>
          <TextField select label="Disciplina" value={linkForm.subjectId} onChange={(e) => setLinkForm({ ...linkForm, subjectId: e.target.value })}>
            <MenuItem value="">—</MenuItem>
            {subjects.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </TextField>
          <TextField required label="URL" placeholder="https://…" value={linkForm.url} onChange={(e) => setLinkForm({ ...linkForm, url: e.target.value })} />
          <TextField label="Descrição" value={linkForm.description} onChange={(e) => setLinkForm({ ...linkForm, description: e.target.value })} />
          <TextField label="Texto-base (para resumo 80/20 por IA)" multiline minRows={3} value={linkForm.sourceText} onChange={(e) => setLinkForm({ ...linkForm, sourceText: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={savingLink} onClick={() => void saveLink()}>{savingLink ? "Salvando…" : "Publicar"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={uploadOpen} onClose={() => !uploading && setUploadOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Enviar arquivo (aula gravada, PDF etc.)</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {uploadError && <Alert severity="error">{uploadError}</Alert>}
          {uploadStatus && <Alert severity="info">{uploadStatus}</Alert>}
          <TextField required label="Título" value={uploadForm.title} onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })} />
          <TextField select label="Tipo" value={uploadForm.type} onChange={(e) => setUploadForm({ ...uploadForm, type: e.target.value })}>
            <MenuItem value="VIDEO">Vídeo (aula gravada)</MenuItem>
            <MenuItem value="PDF">PDF</MenuItem>
            <MenuItem value="MATERIAL_COMPLEMENTAR">Material complementar</MenuItem>
          </TextField>
          <TextField select label="Disciplina" value={uploadForm.subjectId} onChange={(e) => setUploadForm({ ...uploadForm, subjectId: e.target.value })}>
            <MenuItem value="">—</MenuItem>
            {subjects.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </TextField>
          <TextField label="Descrição" value={uploadForm.description} onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })} />
          <Button variant="outlined" component="label" startIcon={<UploadFileIcon />}>
            {uploadFile ? uploadFile.name : "Escolher arquivo"}
            <input ref={fileInputRef} type="file" hidden onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setUploadOpen(false)} disabled={uploading}>Cancelar</Button>
          <Button variant="contained" disabled={uploading} onClick={() => void runUpload()}>{uploading ? "Enviando…" : "Enviar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Flashcards({ subjects }: { subjects: EduSubject[] }) {
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [deckOpen, setDeckOpen] = useState(false);
  const [deckForm, setDeckForm] = useState({ title: "", subjectId: "", description: "" });
  const [deckError, setDeckError] = useState("");
  const [savingDeck, setSavingDeck] = useState(false);

  const [cardOpen, setCardOpen] = useState(false);
  const [cardDeckId, setCardDeckId] = useState("");
  const [cardForm, setCardForm] = useState({ front: "", back: "" });
  const [cardError, setCardError] = useState("");
  const [savingCard, setSavingCard] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setDecks(await listFlashcardDecks()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar decks."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const saveDeck = async () => {
    if (!deckForm.title.trim()) { setDeckError("Informe o título."); return; }
    setSavingDeck(true); setDeckError("");
    try {
      await createFlashcardDeck({ ...deckForm, subjectId: deckForm.subjectId || undefined });
      setDeckOpen(false);
      setDeckForm({ title: "", subjectId: "", description: "" });
      await reload();
      setToast("Deck criado.");
    } catch (e) { setDeckError(e instanceof Error ? e.message : "Erro ao criar deck."); }
    finally { setSavingDeck(false); }
  };

  const openCard = (deckId: string) => { setCardDeckId(deckId); setCardForm({ front: "", back: "" }); setCardError(""); setCardOpen(true); };

  const saveCard = async () => {
    if (!cardForm.front.trim() || !cardForm.back.trim()) { setCardError("Preencha frente e verso."); return; }
    setSavingCard(true); setCardError("");
    try {
      await addFlashcard(cardDeckId, cardForm);
      setCardOpen(false);
      await reload();
      setToast("Flashcard adicionado.");
    } catch (e) { setCardError(e instanceof Error ? e.message : "Erro ao adicionar flashcard."); }
    finally { setSavingCard(false); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Decks de flashcards (SM-2)</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDeckOpen(true)}>Novo deck</Button>
      </Box>

      <Box sx={{ display: "grid", gap: 2 }}>
        {!loading && decks.length === 0 && <Typography color="text.secondary">Nenhum deck criado ainda.</Typography>}
        {decks.map((d) => (
          <Paper key={d.id} variant="outlined" sx={{ p: 2, borderRadius: 3, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box>
              <Typography sx={{ fontWeight: 700 }}>{d.title}</Typography>
              {d.description && <Typography variant="body2" color="text.secondary">{d.description}</Typography>}
            </Box>
            <Button size="small" onClick={() => openCard(d.id)}>Adicionar flashcard</Button>
          </Paper>
        ))}
      </Box>

      <Dialog open={deckOpen} onClose={() => setDeckOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo deck</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {deckError && <Alert severity="error">{deckError}</Alert>}
          <TextField required label="Título" value={deckForm.title} onChange={(e) => setDeckForm({ ...deckForm, title: e.target.value })} />
          <TextField select label="Disciplina" value={deckForm.subjectId} onChange={(e) => setDeckForm({ ...deckForm, subjectId: e.target.value })}>
            <MenuItem value="">—</MenuItem>
            {subjects.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </TextField>
          <TextField label="Descrição" value={deckForm.description} onChange={(e) => setDeckForm({ ...deckForm, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeckOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={savingDeck} onClick={() => void saveDeck()}>{savingDeck ? "Salvando…" : "Criar deck"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={cardOpen} onClose={() => setCardOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo flashcard</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {cardError && <Alert severity="error">{cardError}</Alert>}
          <TextField required label="Frente" multiline minRows={2} value={cardForm.front} onChange={(e) => setCardForm({ ...cardForm, front: e.target.value })} />
          <TextField required label="Verso" multiline minRows={2} value={cardForm.back} onChange={(e) => setCardForm({ ...cardForm, back: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCardOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={savingCard} onClick={() => void saveCard()}>{savingCard ? "Salvando…" : "Adicionar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Forums({ subjects }: { subjects: EduSubject[] }) {
  const [forums, setForums] = useState<Forum[]>([]);
  const [topics, setTopics] = useState<Record<string, ForumTopic[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [forumOpen, setForumOpen] = useState(false);
  const [forumForm, setForumForm] = useState({ title: "", subjectId: "", description: "" });
  const [forumError, setForumError] = useState("");
  const [savingForum, setSavingForum] = useState(false);

  const [topicOpen, setTopicOpen] = useState(false);
  const [topicForumId, setTopicForumId] = useState("");
  const [topicForm, setTopicForm] = useState({ title: "", body: "" });
  const [topicError, setTopicError] = useState("");
  const [savingTopic, setSavingTopic] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try {
      const rows = await listForums();
      setForums(rows);
      const entries = await Promise.all(rows.map(async (f) => [f.id, await listForumTopics(f.id).catch(() => [])] as const));
      setTopics(Object.fromEntries(entries));
    } catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar fóruns."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const saveForum = async () => {
    if (!forumForm.title.trim()) { setForumError("Informe o título."); return; }
    setSavingForum(true); setForumError("");
    try {
      await createForum({ ...forumForm, subjectId: forumForm.subjectId || undefined });
      setForumOpen(false);
      setForumForm({ title: "", subjectId: "", description: "" });
      await reload();
      setToast("Fórum criado.");
    } catch (e) { setForumError(e instanceof Error ? e.message : "Erro ao criar fórum."); }
    finally { setSavingForum(false); }
  };

  const openTopic = (forumId: string) => { setTopicForumId(forumId); setTopicForm({ title: "", body: "" }); setTopicError(""); setTopicOpen(true); };

  const saveTopic = async () => {
    if (!topicForm.title.trim() || !topicForm.body.trim()) { setTopicError("Preencha título e mensagem."); return; }
    setSavingTopic(true); setTopicError("");
    try {
      await createForumTopic(topicForumId, topicForm);
      setTopicOpen(false);
      await reload();
      setToast("Tópico criado.");
    } catch (e) { setTopicError(e instanceof Error ? e.message : "Erro ao criar tópico."); }
    finally { setSavingTopic(false); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Fóruns de discussão</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setForumOpen(true)}>Novo fórum</Button>
      </Box>

      <Box sx={{ display: "grid", gap: 2 }}>
        {!loading && forums.length === 0 && <Typography color="text.secondary">Nenhum fórum criado ainda.</Typography>}
        {forums.map((f) => (
          <Paper key={f.id} variant="outlined" sx={{ p: 2, borderRadius: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Typography sx={{ fontWeight: 700 }}>{f.title}</Typography>
              <Button size="small" onClick={() => openTopic(f.id)}>Novo tópico</Button>
            </Box>
            {(topics[f.id] || []).map((t) => (
              <Typography key={t.id} variant="body2" color="text.secondary" sx={{ mt: 1 }}>• {t.title}</Typography>
            ))}
          </Paper>
        ))}
      </Box>

      <Dialog open={forumOpen} onClose={() => setForumOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo fórum</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {forumError && <Alert severity="error">{forumError}</Alert>}
          <TextField required label="Título" value={forumForm.title} onChange={(e) => setForumForm({ ...forumForm, title: e.target.value })} />
          <TextField select label="Disciplina" value={forumForm.subjectId} onChange={(e) => setForumForm({ ...forumForm, subjectId: e.target.value })}>
            <MenuItem value="">—</MenuItem>
            {subjects.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </TextField>
          <TextField label="Descrição" value={forumForm.description} onChange={(e) => setForumForm({ ...forumForm, description: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setForumOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={savingForum} onClick={() => void saveForum()}>{savingForum ? "Salvando…" : "Criar fórum"}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={topicOpen} onClose={() => setTopicOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Novo tópico</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {topicError && <Alert severity="error">{topicError}</Alert>}
          <TextField required label="Título" value={topicForm.title} onChange={(e) => setTopicForm({ ...topicForm, title: e.target.value })} />
          <TextField required label="Mensagem" multiline minRows={3} value={topicForm.body} onChange={(e) => setTopicForm({ ...topicForm, body: e.target.value })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTopicOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={savingTopic} onClick={() => void saveTopic()}>{savingTopic ? "Salvando…" : "Publicar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}

function Biblioteca() {
  const [subs, setSubs] = useState<LibrarySubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ scope: "INSTITUCIONAL", provider: "", plan: "", amount: 0 });
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const reload = async () => {
    setLoading(true); setError("");
    try { setSubs(await listLibrarySubscriptions()); }
    catch (e) { setError(e instanceof Error ? e.message : "Erro ao carregar biblioteca."); }
    finally { setLoading(false); }
  };

  useEffect(() => { void reload(); }, []);

  const save = async () => {
    if (!form.provider.trim() || !form.plan.trim()) { setFormError("Informe fornecedor e plano."); return; }
    setSaving(true); setFormError("");
    try {
      await createLibrarySubscription(form);
      setOpen(false);
      setForm({ scope: "INSTITUCIONAL", provider: "", plan: "", amount: 0 });
      await reload();
      setToast("Assinatura cadastrada.");
    } catch (e) { setFormError(e instanceof Error ? e.message : "Erro ao cadastrar assinatura."); }
    finally { setSaving(false); }
  };

  return (
    <Box>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 800 }}>Biblioteca terceirizada</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setOpen(true)}>Nova assinatura</Button>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead><TableRow><TableCell>Fornecedor</TableCell><TableCell>Plano</TableCell><TableCell>Escopo</TableCell><TableCell>Valor</TableCell></TableRow></TableHead>
          <TableBody>
            {!loading && subs.length === 0 && <TableRow><TableCell colSpan={4}><Typography color="text.secondary" sx={{ py: 2 }}>Nenhuma assinatura cadastrada ainda.</Typography></TableCell></TableRow>}
            {subs.map((s) => (
              <TableRow key={s.id}><TableCell>{s.provider}</TableCell><TableCell>{s.plan}</TableCell><TableCell>{s.scope}</TableCell><TableCell>R$ {s.amount.toFixed(2)}</TableCell></TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Nova assinatura de biblioteca</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "12px!important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField select label="Escopo" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
            <MenuItem value="INSTITUCIONAL">Institucional</MenuItem>
            <MenuItem value="INDIVIDUAL">Individual</MenuItem>
          </TextField>
          <TextField required label="Fornecedor" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
          <TextField required label="Plano" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
          <TextField label="Valor (R$)" type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancelar</Button>
          <Button variant="contained" disabled={saving} onClick={() => void save()}>{saving ? "Salvando…" : "Cadastrar"}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={3000} onClose={() => setToast("")} message={toast} />
    </Box>
  );
}
