"use client";

import { ArrowLeft, ArrowRight, Check, ChevronDown, CodeXml, Download, FileJson, FileSpreadsheet, FileUp, Flag, FolderOpen, HardDriveDownload, House, Languages, LockKeyhole, MessageSquareText, Monitor, Moon, Pencil, Plus, RotateCcw, Save, Settings2, ShieldCheck, SkipForward, Sun, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getLlmCopy, llmLocales, llmModes } from "../lib/llm-i18n";
import type { LlmCopy } from "../lib/llm-i18n";
import { exportLlm, fieldsOf, LlmDataError, openLlmProject, parseDataset, saveLlmProject, suggestedField, textValue } from "../lib/llm";
import type { DatasetRow, LlmAnnotation, LlmProject, LlmSchema, RecordStatus } from "../lib/llm";
import { SOURCE_URL, fill, getCopy, storedLanguage, storedTheme } from "../lib/i18n";
import type { Language, ThemeMode } from "../lib/i18n";

function BrandLockup({ height = 30 }: { height?: number }) {
  return <span className="brand-lockup" role="img" aria-label="Poligome">
    <svg viewBox="0 0 40 40" height={height} aria-hidden="true">
      <path d="M20 2 35 11v18L20 38 5 29V11z" fill="currentColor" />
      <path d="m14 13 12 7-12 7z" fill="var(--surface)" />
    </svg>
    <strong>Poligome</strong>
  </span>;
}

function blankSchema(copy: LlmCopy): LlmSchema {
  return {
    mode: "classification", taskName: copy.defaultTask, instruction: copy.defaultInstruction,
    promptField: "", responseField: "", contextFields: [], labels: [copy.defaultPositive, copy.defaultNegative],
    multiLabel: false, criteria: [{ id: "correctness", name: copy.defaultCriterion, description: copy.defaultCriterionDetail, min: 1, max: 5, required: true }],
    responseAField: "", responseBField: "", randomize: true, strongPreference: false, requireComment: false,
  };
}

function FieldSelect({ label, value, fields, onChange }: { label: string; value: string; fields: string[]; onChange: (value: string) => void }) {
  return <label className="llm-field"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}>{fields.map((field) => <option key={field} value={field}>{field}</option>)}</select></label>;
}

function TextBlock({ title, value }: { title: string; value: unknown }) {
  const text = textValue(value);
  return text ? <section className="llm-text-block"><b>{title}</b><pre>{text}</pre></section> : null;
}

function translatedError(error: unknown, copy: LlmCopy, fallback: string) {
  if (!(error instanceof LlmDataError)) return fallback;
  if (error.code === "invalid-json-line") return fill(copy.invalidJsonLine, { n: error.index ?? "" });
  if (error.code === "invalid-json-list") return copy.invalidJsonList;
  if (error.code === "invalid-record") return fill(copy.invalidRecord, { n: error.index ?? "" });
  if (error.code === "invalid-project") return copy.invalidProject;
  return copy.unsupportedProject;
}

export default function TextAnnotationPage() {
  const input = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const projectNameInput = useRef<HTMLInputElement>(null);
  const fileMenuRef = useRef<HTMLDivElement>(null);
  const [language, setLanguage] = useState<Language>("pt");
  const copy = getLlmCopy(language);
  const platformCopy = getCopy(language);
  const modes = llmModes(copy);
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [preferencesTab, setPreferencesTab] = useState<"appearance" | "language">("appearance");
  const [projectEditing, setProjectEditing] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [rows, setRows] = useState<DatasetRow[]>([]);
  const [schema, setSchema] = useState<LlmSchema>(() => blankSchema(getLlmCopy("pt")));
  const [step, setStep] = useState<"import" | "setup" | "work">("import");
  const [annotations, setAnnotations] = useState<Record<string, LlmAnnotation>>({});
  const [orders, setOrders] = useState<Record<string, boolean>>({});
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [annotatedOnly, setAnnotatedOnly] = useState(false);
  const fields = useMemo(() => fieldsOf(rows), [rows]);
  const row = rows[index];
  const rowId = row?.internalId;
  const note = row ? annotations[row.internalId] : undefined;
  const done = Object.values(annotations).filter((item) => item.status === "annotated").length;
  const locale = llmLocales[language];

  // A rota pode ser aberta diretamente; tema e idioma continuam seguindo a plataforma.
  useEffect(() => {
    const storedThemeMode = storedTheme();
    document.documentElement.dataset.theme = storedThemeMode;
    const stored = storedLanguage();
    const frame = window.requestAnimationFrame(() => {
      setThemeMode(storedThemeMode);
      if (stored === "pt") return;
      setLanguage(stored);
      setSchema(blankSchema(getLlmCopy(stored)));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.lang = llmLocales[language];
    document.title = copy.pageTitle;
  }, [copy.pageTitle, language]);

  useEffect(() => {
    if (!fileMenuOpen) return;
    const closeMenu = (event: PointerEvent) => { if (!fileMenuRef.current?.contains(event.target as Node)) setFileMenuOpen(false); };
    document.addEventListener("pointerdown", closeMenu);
    return () => document.removeEventListener("pointerdown", closeMenu);
  }, [fileMenuOpen]);

  useEffect(() => {
    if (rows.length) localStorage.setItem("poligome-llm-draft", JSON.stringify({ annotations, orders, index }));
  }, [annotations, orders, index, rows.length]);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (step !== "work" || ["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) return;
      if (event.key === "ArrowRight") { event.preventDefault(); setIndex((value) => Math.min(rows.length - 1, value + 1)); }
      if (event.key === "ArrowLeft") { event.preventDefault(); setIndex((value) => Math.max(0, value - 1)); }
      if (schema.mode === "preference" && ["1", "2", "3"].includes(event.key)) choosePreference(event.key === "1" ? "A" : event.key === "3" ? "B" : "tie");
    };
    addEventListener("keydown", keydown);
    return () => removeEventListener("keydown", keydown);
  });

  function chooseLanguage(next: Language) {
    setLanguage(next);
    localStorage.setItem("poligome-language", next);
    if (step === "import" && !rows.length) setSchema(blankSchema(getLlmCopy(next)));
  }

  function chooseTheme(next: ThemeMode) {
    setThemeMode(next);
    document.documentElement.dataset.theme = next;
    localStorage.setItem("poligome-theme", next);
  }

  async function openDataset(file: File) {
    try {
      const parsed = await parseDataset(file);
      if (!parsed.length) throw new Error(copy.emptyDataset);
      const detected = fieldsOf(parsed);
      const prompt = suggestedField(detected, ["prompt", "question", "instruction", "input", "query"]);
      const response = suggestedField(detected, ["response", "answer", "output", "completion"]);
      const responseA = suggestedField(detected, ["response_a", "answer_a", "candidate_1"]);
      const responseB = suggestedField(detected, ["response_b", "answer_b", "candidate_2"]);
      setRows(parsed);
      setAnnotations({}); setOrders({}); setIndex(0);
      localStorage.removeItem("poligome-llm-draft");
      setSchema((current) => ({ ...current, promptField: prompt, responseField: response, responseAField: responseA, responseBField: responseB }));
      setStep("setup");
      setMessage(fill(copy.datasetLoadedMessage, { n: parsed.length.toLocaleString(locale) }));
    } catch (error) {
      setMessage(error instanceof Error && error.message === copy.emptyDataset ? copy.emptyDataset : translatedError(error, copy, copy.datasetReadError));
    }
  }

  async function openProject(file: File) {
    try {
      const project = await openLlmProject(file);
      setRows(project.rows); setSchema(project.schema); setAnnotations(project.annotations); setOrders(project.orders);
      setIndex(project.currentIndex); setStep("work"); setProjectEditing(false); setMessage(copy.projectOpened);
    } catch (error) {
      setMessage(translatedError(error, copy, copy.projectOpenError));
    }
  }

  function start() {
    if (!schema.promptField || (schema.mode !== "preference" && !schema.responseField) || (schema.mode === "preference" && (!schema.responseAField || !schema.responseBField))) return setMessage(copy.confirmFields);
    const draft = localStorage.getItem("poligome-llm-draft");
    if (draft) {
      try {
        const saved = JSON.parse(draft) as Pick<LlmProject, "annotations" | "orders" | "currentIndex">;
        setAnnotations(saved.annotations ?? {}); setOrders(saved.orders ?? {}); setIndex(Math.min(saved.currentIndex ?? 0, rows.length - 1));
      } catch { /* rascunho inválido é ignorado */ }
    }
    setStep("work");
  }

  function updateNote(patch: Partial<LlmAnnotation>) {
    if (!row) return;
    setAnnotations((current) => ({ ...current, [row.internalId]: { status: "annotated", ...current[row.internalId], ...patch } }));
  }

  function setStatus(status: RecordStatus) {
    if (!row) return;
    setAnnotations((current) => ({ ...current, [row.internalId]: { status, ...current[row.internalId] } }));
  }

  function choosePreference(choice: "A" | "B" | "tie") {
    if (!row) return;
    const swapped = orders[row.internalId] ?? false;
    const field = choice === "tie" ? null : choice === "A" ? (swapped ? schema.responseBField : schema.responseAField) : (swapped ? schema.responseAField : schema.responseBField);
    updateNote({ winner: field, displayedAs: choice === "tie" ? undefined : choice, strength: choice === "tie" ? "tie" : "better" });
  }

  useEffect(() => {
    if (!rowId || orders[rowId] !== undefined) return;
    const randomizedOrder = schema.randomize ? Math.random() >= .5 : false;
    const timer = window.setTimeout(() => setOrders((current) => current[rowId] !== undefined ? current : { ...current, [rowId]: randomizedOrder }), 0);
    return () => window.clearTimeout(timer);
  }, [orders, rowId, schema.randomize]);

  function save() {
    void saveLlmProject({ format: "poligome-llm-project", version: 1, name: schema.taskName, rows, schema, annotations, orders, currentIndex: index });
  }

  function reset() {
    setRows([]); setAnnotations({}); setOrders({}); setSchema(blankSchema(copy)); setIndex(0); setStep("import");
    setMessage(""); setExportOpen(false); setFileMenuOpen(false); setProjectEditing(false); setProjectNameDraft("");
    localStorage.removeItem("poligome-llm-draft");
  }

  function requestNewProject() {
    setFileMenuOpen(false);
    if ((rows.length || Object.keys(annotations).length) && !window.confirm(copy.confirmNewProject)) return;
    reset();
  }

  function requestOpenDataset() {
    setFileMenuOpen(false);
    if ((rows.length || Object.keys(annotations).length) && !window.confirm(copy.confirmNewProject)) return;
    input.current?.click();
  }

  function requestOpenProject() {
    setFileMenuOpen(false);
    if ((rows.length || Object.keys(annotations).length) && !window.confirm(copy.confirmNewProject)) return;
    projectInput.current?.click();
  }

  function requestHomeNavigation() {
    setFileMenuOpen(false);
    if ((rows.length || Object.keys(annotations).length) && !window.confirm(platformCopy.confirmLeaveHome)) return;
    window.location.assign("/");
  }

  function beginProjectRename() {
    setProjectNameDraft(schema.taskName);
    setProjectEditing(true);
    window.requestAnimationFrame(() => { projectNameInput.current?.focus(); projectNameInput.current?.select(); });
  }

  function saveProjectName() {
    const name = projectNameDraft.trim();
    if (name) setSchema((current) => ({ ...current, taskName: name }));
    setProjectEditing(false);
  }

  function cancelProjectRename() {
    setProjectNameDraft("");
    setProjectEditing(false);
  }

  function addLabel() {
    const value = window.prompt(copy.categoryPrompt)?.trim();
    if (value) setSchema((current) => ({ ...current, labels: [...current.labels, value] }));
  }

  function addCriterion() {
    setSchema((current) => ({ ...current, criteria: [...current.criteria, { id: `criterion-${Date.now()}`, name: copy.newCriterion, description: "", min: 1, max: 5, required: true }] }));
  }

  const activeMode = modes.find((mode) => mode.id === schema.mode);
  const platformHeader = <>
    <header className="topbar llm-platform-header">
      <div className="topbar-main">
        <div className="brand-side">
          <span className="brand-static"><BrandLockup height={28} /></span><i />
          <button className="home-return" title={platformCopy.homeHint} aria-label={platformCopy.home} onClick={requestHomeNavigation}><House size={15} /><span>{platformCopy.home}</span></button>
          {projectEditing
            ? <input className="project-name-input" ref={projectNameInput} value={projectNameDraft} aria-label={platformCopy.renameProject} maxLength={80} onChange={(event) => setProjectNameDraft(event.target.value)} onBlur={saveProjectName} onKeyDown={(event) => { if (event.key === "Enter") saveProjectName(); if (event.key === "Escape") cancelProjectRename(); }} />
            : <button className="project-name" title={platformCopy.renameProject} onClick={beginProjectRename}><em /><span>{schema.taskName}</span><Pencil size={13} /></button>
          }
        </div>
        <div className="head-actions">
          <button className="new-project-main" title={platformCopy.newProjectHint} onClick={requestNewProject}><Plus size={15} /><span>{platformCopy.newProject}</span></button>
          <span className="save done" title={copy.localSessionHint}><HardDriveDownload size={14} />{copy.localSession}</span>
          <span className="local-mode" title={platformCopy.localOnlyHint}><ShieldCheck size={14} />{platformCopy.localOnly}</span>
          <a className="source-link" href={SOURCE_URL} target="_blank" rel="noreferrer" title={platformCopy.sourceCode}><CodeXml size={14} /><span>{platformCopy.sourceCode}</span></a>
          {step === "work" && rows.length > 0 && <button className="llm-head-export" onClick={() => setExportOpen(true)}><Download size={15} />{copy.export}</button>}
        </div>
      </div>
      <nav className="menubar llm-menubar" aria-label={platformCopy.fileMenu}>
        <div className="menu" ref={fileMenuRef}>
          <button className={`menu-trigger ${fileMenuOpen ? "open" : ""}`} aria-haspopup="menu" aria-expanded={fileMenuOpen} onClick={() => setFileMenuOpen((value) => !value)}>{platformCopy.fileMenu}<ChevronDown size={13} /></button>
          {fileMenuOpen && <div className="project-pop menu-pop llm-file-menu" role="menu" aria-label={platformCopy.fileMenu}>
            <div className="project-summary"><span><em />{schema.taskName}</span><small>{rows.length} {copy.records} · {done} {copy.annotated}</small></div>
            <button role="menuitem" onClick={requestNewProject}><Plus size={14} /><span><b>{platformCopy.newProject}</b><small>{platformCopy.newProjectHint}</small></span></button>
            <button role="menuitem" onClick={requestOpenDataset}><FileUp size={14} /><span><b>{copy.openDataset}</b><small>{copy.openDatasetHint}</small></span></button>
            <button role="menuitem" onClick={requestOpenProject}><FolderOpen size={14} /><span><b>{copy.openProject}</b><small>{copy.openProjectHint}</small></span></button>
            <button role="menuitem" disabled={!rows.length} onClick={() => { setFileMenuOpen(false); save(); }}><Save size={14} /><span><b>{copy.saveProject}</b><small>{copy.saveProjectHint}</small></span></button>
            <i className="menu-separator" />
            <p>{platformCopy.exportFormat}</p>
            <button role="menuitem" disabled={!rows.length} onClick={() => { setFileMenuOpen(false); exportLlm(rows, schema, annotations, "json", false); }}><FileJson size={14} /><span><b>JSON</b><small>{copy.jsonHint}</small></span></button>
            <button role="menuitem" disabled={!rows.length} onClick={() => { setFileMenuOpen(false); exportLlm(rows, schema, annotations, "jsonl", false); }}><FileJson size={14} /><span><b>JSONL</b><small>{copy.jsonlHint}</small></span></button>
            <button role="menuitem" disabled={!rows.length} onClick={() => { setFileMenuOpen(false); exportLlm(rows, schema, annotations, "csv", false); }}><FileSpreadsheet size={14} /><span><b>CSV</b><small>{copy.csvHint}</small></span></button>
            <i className="menu-separator" />
            <button role="menuitem" onClick={() => { setFileMenuOpen(false); setPreferencesOpen(true); }}><Settings2 size={14} /><span><b>{platformCopy.preferences}</b><small>{platformCopy.appearance} · {platformCopy.language}</small></span></button>
          </div>}
        </div>
        {rows.length > 0 && <div className="llm-context-tools"><span><MessageSquareText size={13} />{activeMode?.title}</span><i /><b>{done}/{rows.length} {copy.annotated}</b></div>}
      </nav>
      <input ref={input} hidden type="file" accept=".csv,.json,.jsonl,application/json,text/csv" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void openDataset(file); }} />
      <input ref={projectInput} hidden type="file" accept=".pllm" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (file) void openProject(file); }} />
    </header>
    {preferencesOpen && <div className="modal-backdrop"><section className="sam-modal preferences-modal" role="dialog" aria-modal="true" aria-labelledby="llm-preferences-title">
      <header><div><span><Settings2 size={18} /></span><div><h2 id="llm-preferences-title">{platformCopy.preferences}</h2><p>poligome.com</p></div></div><button onClick={() => setPreferencesOpen(false)} aria-label={platformCopy.close}><X size={19} /></button></header>
      <div className="preferences-tabs"><button className={preferencesTab === "appearance" ? "active" : ""} onClick={() => setPreferencesTab("appearance")}><Sun size={14} />{platformCopy.appearance}</button><button className={preferencesTab === "language" ? "active" : ""} onClick={() => setPreferencesTab("language")}><Languages size={14} />{platformCopy.language}</button></div>
      {preferencesTab === "appearance" ? <div className="preference-options"><button className={themeMode === "system" ? "active" : ""} onClick={() => chooseTheme("system")}><Monitor size={20} /><b>{platformCopy.system}</b></button><button className={themeMode === "light" ? "active" : ""} onClick={() => chooseTheme("light")}><Sun size={20} /><b>{platformCopy.light}</b></button><button className={themeMode === "dark" ? "active" : ""} onClick={() => chooseTheme("dark")}><Moon size={20} /><b>{platformCopy.dark}</b></button></div> : <div className="language-options"><button className={language === "pt" ? "active" : ""} onClick={() => chooseLanguage("pt")}><b>Português</b><span>PT-BR</span></button><button className={language === "en" ? "active" : ""} onClick={() => chooseLanguage("en")}><b>English</b><span>EN</span></button><button className={language === "fr" ? "active" : ""} onClick={() => chooseLanguage("fr")}><b>Français</b><span>FR</span></button><button className={language === "es" ? "active" : ""} onClick={() => chooseLanguage("es")}><b>Español</b><span>ES</span></button></div>}
      <footer><button className="connect" onClick={() => setPreferencesOpen(false)}><Check size={15} /> {platformCopy.close}</button></footer>
    </section></div>}
  </>;

  if (step === "import") return <main className="llm-shell">
    {platformHeader}
    <section className="llm-welcome">
      <p className="llm-eyebrow"><LockKeyhole size={14} /> {copy.privacy}</p>
      <h1>{copy.welcomeTitle}</h1><p>{copy.welcomeIntro}</p>
      <button className="llm-primary" onClick={requestOpenDataset}><FileUp size={18} /> {copy.openDataset}</button>
      <div className="llm-drop" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void openDataset(file); }}>{copy.dropDataset}</div>
      {message && <p className="llm-message">{message}</p>}
      <div className="llm-mode-grid">{modes.map((mode) => <article key={mode.id}><b>{mode.title}</b><span>{mode.detail}</span></article>)}</div>
    </section>
  </main>;

  if (step === "setup") return <main className="llm-shell">
    {platformHeader}
    <section className="llm-setup">
      <div className="llm-dataset-summary"><b>{copy.datasetLoaded}</b><strong>{rows.length.toLocaleString(locale)} {copy.records}</strong><span>{copy.fields}: {fields.join(", ")}</span></div>
      <h1>{copy.chooseMode}</h1>
      <div className="llm-mode-grid selectable">{modes.map((mode) => <button key={mode.id} className={schema.mode === mode.id ? "selected" : ""} onClick={() => setSchema((current) => ({ ...current, mode: mode.id }))}><b>{mode.title}</b><span>{mode.detail}</span></button>)}</div>
      <section className="llm-config">
        <label className="llm-field full"><span>{copy.taskName}</span><input value={schema.taskName} onChange={(event) => setSchema({ ...schema, taskName: event.target.value })} /></label>
        <label className="llm-field full"><span>{copy.annotatorInstruction}</span><textarea value={schema.instruction} onChange={(event) => setSchema({ ...schema, instruction: event.target.value })} /></label>
        <FieldSelect label={copy.promptField} value={schema.promptField} fields={fields} onChange={(value) => setSchema({ ...schema, promptField: value })} />
        {schema.mode === "preference" ? <>
          <FieldSelect label={copy.responseAField} value={schema.responseAField} fields={fields} onChange={(value) => setSchema({ ...schema, responseAField: value })} />
          <FieldSelect label={copy.responseBField} value={schema.responseBField} fields={fields} onChange={(value) => setSchema({ ...schema, responseBField: value })} />
          <label className="llm-check"><input type="checkbox" checked={schema.randomize} onChange={(event) => setSchema({ ...schema, randomize: event.target.checked })} /> {copy.randomizeResponses}</label>
          <label className="llm-check"><input type="checkbox" checked={schema.strongPreference} onChange={(event) => setSchema({ ...schema, strongPreference: event.target.checked })} /> {copy.strongPreference}</label>
        </> : <FieldSelect label={copy.responseField} value={schema.responseField} fields={fields} onChange={(value) => setSchema({ ...schema, responseField: value })} />}
        {schema.mode === "classification" && <div className="llm-config-full">
          <label className="llm-check"><input type="checkbox" checked={schema.multiLabel} onChange={(event) => setSchema({ ...schema, multiLabel: event.target.checked })} /> {copy.multipleCategories}</label>
          <div className="llm-tags">{schema.labels.map((label, labelIndex) => <button key={`${label}-${labelIndex}`} onClick={() => setSchema((current) => ({ ...current, labels: current.labels.filter((_, itemIndex) => itemIndex !== labelIndex) }))}>{label}<X size={13} /></button>)}<button className="add" onClick={addLabel}>+ {copy.addCategory}</button></div>
        </div>}
        {schema.mode === "rating" && <div className="llm-config-full">
          <div className="llm-criteria">{schema.criteria.map((criterion, criterionIndex) => <div key={criterion.id}>
            <input value={criterion.name} onChange={(event) => setSchema((current) => ({ ...current, criteria: current.criteria.map((item, itemIndex) => itemIndex === criterionIndex ? { ...item, name: event.target.value } : item) }))} />
            <input type="number" value={criterion.min} onChange={(event) => setSchema((current) => ({ ...current, criteria: current.criteria.map((item, itemIndex) => itemIndex === criterionIndex ? { ...item, min: Number(event.target.value) } : item) }))} />
            <span>{copy.to}</span>
            <input type="number" value={criterion.max} onChange={(event) => setSchema((current) => ({ ...current, criteria: current.criteria.map((item, itemIndex) => itemIndex === criterionIndex ? { ...item, max: Number(event.target.value) } : item) }))} />
            <button onClick={() => setSchema((current) => ({ ...current, criteria: current.criteria.filter((_, itemIndex) => itemIndex !== criterionIndex) }))}><X size={14} /></button>
          </div>)}</div>
          <button className="llm-secondary" onClick={addCriterion}>+ {copy.addCriterion}</button>
        </div>}
      </section>
      {message && <p className="llm-message">{message}</p>}
      <footer className="llm-footer"><button className="llm-secondary" onClick={reset}>{copy.back}</button><button className="llm-primary" onClick={start}>{copy.start} <ArrowRight size={16} /></button></footer>
    </section>
  </main>;

  if (!row) return null;
  const swapped = orders[row.internalId] ?? false;
  const displayA = swapped ? schema.responseBField : schema.responseAField;
  const displayB = swapped ? schema.responseAField : schema.responseBField;

  return <main className="llm-shell llm-work">
    {platformHeader}
    <aside className="llm-sidebar"><b>{copy.records}</b><div>{rows.slice(Math.max(0, index - 30), index + 31).map((item, offset) => {
      const actual = Math.max(0, index - 30) + offset; const status = annotations[item.internalId]?.status ?? "unannotated";
      return <button key={item.internalId} className={`${actual === index ? "active" : ""} ${status}`} onClick={() => setIndex(actual)}>{actual + 1}<i /></button>;
    })}</div></aside>
    <section className="llm-record">
      <div className="llm-nav"><button disabled={index === 0} onClick={() => setIndex(index - 1)}><ArrowLeft size={16} /> {copy.previous}</button><label>{copy.goTo} <input type="number" min="1" max={rows.length} value={index + 1} onChange={(event) => setIndex(Math.max(0, Math.min(rows.length - 1, Number(event.target.value) - 1)))} /></label><button disabled={index === rows.length - 1} onClick={() => setIndex(index + 1)}>{copy.next} <ArrowRight size={16} /></button></div>
      {schema.contextFields.map((field) => <TextBlock key={field} title={field.toUpperCase()} value={row.original[field]} />)}
      <TextBlock title={copy.prompt} value={row.original[schema.promptField]} />
      {schema.mode === "preference" ? <div className="llm-responses"><TextBlock title={copy.responseA} value={row.original[displayA]} /><TextBlock title={copy.responseB} value={row.original[displayB]} /></div> : <TextBlock title={copy.originalResponse} value={row.original[schema.responseField]} />}
      <section className="llm-annotation">
        <header><div><b>{copy.annotation}</b><span>{schema.instruction}</span></div><div><button className={note?.status === "review" ? "active" : ""} onClick={() => setStatus("review")}><Flag size={14} /> {copy.review}</button><button className={note?.status === "skipped" ? "active" : ""} onClick={() => setStatus("skipped")}><SkipForward size={14} /> {copy.skip}</button></div></header>
        {schema.mode === "classification" && <div className="llm-options">{schema.labels.map((label) => {
          const selected = note?.labels?.includes(label) ?? false;
          return <button key={label} className={selected ? "selected" : ""} onClick={() => updateNote({ labels: schema.multiLabel ? (selected ? note?.labels?.filter((item) => item !== label) : [...(note?.labels ?? []), label]) : [label] })}><i>{selected && <Check size={13} />}</i>{label}</button>;
        })}</div>}
        {schema.mode === "rating" && <div className="llm-ratings">{schema.criteria.map((criterion) => <div key={criterion.id}><b>{criterion.name}</b><span>{criterion.description}</span><section>{Array.from({ length: criterion.max - criterion.min + 1 }, (_, value) => criterion.min + value).map((value) => <button key={value} className={note?.ratings?.[criterion.id] === value ? "selected" : ""} onClick={() => updateNote({ ratings: { ...note?.ratings, [criterion.id]: value } })}>{value}</button>)}</section></div>)}</div>}
        {schema.mode === "preference" && <div className="llm-preference"><b>{copy.bestResponse}</b><section>
          {schema.strongPreference && <button className={note?.strength === "A much better" ? "selected" : ""} onClick={() => { choosePreference("A"); updateNote({ strength: "A much better" }); }}>{copy.aMuchBetter}</button>}
          <button className={note?.displayedAs === "A" && note.strength === "better" ? "selected" : ""} onClick={() => choosePreference("A")}>{copy.aBetter} <small>1</small></button>
          <button className={note?.strength === "tie" ? "selected" : ""} onClick={() => choosePreference("tie")}>{copy.tie} <small>2</small></button>
          <button className={note?.displayedAs === "B" && note.strength === "better" ? "selected" : ""} onClick={() => choosePreference("B")}>{copy.bBetter} <small>3</small></button>
          {schema.strongPreference && <button className={note?.strength === "B much better" ? "selected" : ""} onClick={() => { choosePreference("B"); updateNote({ strength: "B much better" }); }}>{copy.bMuchBetter}</button>}
        </section></div>}
        {schema.mode === "correction" && <div className="llm-correction"><div><b>{copy.correctedResponse}</b><button onClick={() => updateNote({ correctedResponse: textValue(row.original[schema.responseField]), changed: false })}><RotateCcw size={14} /> {copy.restoreOriginal}</button></div><textarea value={note?.correctedResponse ?? textValue(row.original[schema.responseField])} onChange={(event) => updateNote({ correctedResponse: event.target.value, changed: event.target.value !== textValue(row.original[schema.responseField]) })} /><label className="llm-check"><input type="checkbox" checked={note?.changed === false} onChange={(event) => updateNote({ correctedResponse: textValue(row.original[schema.responseField]), changed: !event.target.checked })} /> {copy.originalCorrect}</label></div>}
        <label className="llm-comment"><span>{copy.optionalComment}</span><textarea value={note?.comment ?? ""} onChange={(event) => updateNote({ comment: event.target.value })} /></label>
      </section>
    </section>
    {exportOpen && <div className="llm-modal"><section><button className="close" onClick={() => setExportOpen(false)}><X size={18} /></button><h2>{copy.exportTitle}</h2><p>{copy.exportDescription}</p><label className="llm-check"><input type="checkbox" checked={annotatedOnly} onChange={(event) => setAnnotatedOnly(event.target.checked)} /> {copy.annotatedOnly}</label><div><button className="llm-primary" onClick={() => exportLlm(rows, schema, annotations, "json", annotatedOnly)}>JSON</button><button className="llm-primary" onClick={() => exportLlm(rows, schema, annotations, "jsonl", annotatedOnly)}>JSONL</button><button className="llm-primary" onClick={() => exportLlm(rows, schema, annotations, "csv", annotatedOnly)}>CSV</button></div></section></div>}
  </main>;
}
