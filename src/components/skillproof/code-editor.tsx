"use client";

import { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Settings2, FileCode2, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { codeLanguageMeta, type CodeLanguage } from "@/lib/code-languages";

// Serve Monaco locally from /public/monaco-vs (no CDN dependency)
let configured = false;
function configureLoader() {
  if (configured || typeof window === "undefined") return;
  configured = true;
  loader.config({ paths: { vs: "/monaco-vs" } });
}

// ─── Editor settings (persisted) ────────────────────────────────────────────

export interface EditorSettings {
  fontSize: number;
  minimap: boolean;
  wordWrap: boolean;
}

const SETTINGS_KEY = "skillproof:editor-settings";
const DEFAULT_SETTINGS: EditorSettings = { fontSize: 13.5, minimap: false, wordWrap: false };

function loadSettings(): EditorSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<EditorSettings>;
    return {
      fontSize: typeof parsed.fontSize === "number" ? Math.min(20, Math.max(11, parsed.fontSize)) : DEFAULT_SETTINGS.fontSize,
      minimap: typeof parsed.minimap === "boolean" ? parsed.minimap : DEFAULT_SETTINGS.minimap,
      wordWrap: typeof parsed.wordWrap === "boolean" ? parsed.wordWrap : DEFAULT_SETTINGS.wordWrap,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onPaste?: (chars: number) => void;
  onEditDelta?: (added: number, removed: number) => void;
  height?: string;
  readOnly?: boolean;
  onRun?: () => void;
  onSubmit?: () => void;
  fileName?: string;
  /** Code language id (javascript | python | cpp | java | sql) — drives Monaco highlighting + tab name */
  language?: CodeLanguage | string;
}

export function CodeEditor({
  value,
  onChange,
  onPaste,
  onEditDelta,
  height = "420px",
  readOnly,
  onRun,
  onSubmit,
  fileName,
  language = "javascript",
}: CodeEditorProps) {
  const langMeta = codeLanguageMeta(language) ?? codeLanguageMeta("javascript")!;
  const resolvedFileName = fileName ?? langMeta.file;
  const [monacoFailed, setMonacoFailed] = useState(false);
  const [, setMonacoReady] = useState(false);
  const pasteFlagRef = useRef(0);
  const valueRef = useRef(value);
  const readyRef = useRef(false);
  // keep shortcut callbacks fresh without re-registering commands
  const runRef = useRef(onRun);
  const submitRef = useRef(onSubmit);
  // editor settings (lazy init from localStorage — this component only mounts client-side,
  // after the assessment view is entered, so SSR hydration is not affected)
  const [settings, setSettings] = useState<EditorSettings>(() => loadSettings());
  const [cursor, setCursor] = useState<{ ln: number; col: number } | null>(null);

  const updateSettings = (patch: Partial<EditorSettings>) => {
    setSettings((cur) => {
      const next = { ...cur, ...patch };
      try {
        window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    runRef.current = onRun;
    submitRef.current = onSubmit;
  }, [onRun, onSubmit]);

  const handleShortcutKeys = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) submitRef.current?.();
      else runRef.current?.();
    }
  };

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    configureLoader();
    // worker config for self-hosted monaco
    const w = window as unknown as { MonacoEnvironment?: { getWorkerUrl: () => string } };
    if (!w.MonacoEnvironment) {
      w.MonacoEnvironment = {
        getWorkerUrl: () => {
          const blob = new Blob(
            [`self.MonacoEnvironment={baseUrl:'/monaco-vs/'};importScripts('/monaco-vs/base/worker/workerMain.js');`],
            { type: "text/javascript" }
          );
          return URL.createObjectURL(blob);
        },
      };
    }
    const timer = setTimeout(() => {
      if (!readyRef.current) setMonacoFailed(true);
    }, 9000);
    return () => clearTimeout(timer);
  }, []);

  const handleChange = (v: string | undefined) => {
    const next = v ?? "";
    const prev = valueRef.current;
    // compute delta for behavior tracking (textarea path & monaco fallback)
    let added = next.length - prev.length;
    let removed = 0;
    if (added < 0) {
      removed = -added;
      added = 0;
    }
    onEditDelta?.(added, removed);
    onChange(next);
  };

  // ── settings popover (shared by both editor paths) ──
  const settingsButton = (
    <Popover>
      <PopoverTrigger
        aria-label="Editor settings"
        className={cn(
          "flex h-6 items-center gap-1 rounded px-1.5 text-[10px] font-medium text-zinc-500 dark:text-zinc-400 transition-colors",
          "hover:bg-zinc-950/5 dark:hover:bg-zinc-100/10 hover:text-zinc-800 dark:hover:text-zinc-300 data-[state=open]:bg-zinc-950/5 data-[state=open]:text-zinc-800 dark:data-[state=open]:bg-zinc-100/10 dark:data-[state=open]:text-zinc-300"
        )}
      >
        <Settings2 className="h-3 w-3" /> Settings
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 border-border bg-popover p-3">
        <p className="mb-3 text-xs font-semibold text-zinc-900 dark:text-zinc-100">Editor preferences</p>
        <div className="space-y-3.5">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs text-zinc-600 dark:text-zinc-300">Font size</span>
              <span className="font-mono text-[11px] tabular-nums text-zinc-900 dark:text-zinc-100">{settings.fontSize}px</span>
            </div>
            <Slider
              min={11}
              max={20}
              step={0.5}
              value={[settings.fontSize]}
              onValueChange={([v]) => updateSettings({ fontSize: v })}
              aria-label="Editor font size"
              className="[&_[data-slot=slider-range]]:bg-zinc-950 [&_[data-slot=slider-thumb]]:border-zinc-950 dark:[&_[data-slot=slider-range]]:bg-zinc-100 dark:[&_[data-slot=slider-thumb]]:border-zinc-100"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-600 dark:text-zinc-300">Minimap</span>
            <Switch
              checked={settings.minimap}
              onCheckedChange={(v) => updateSettings({ minimap: v })}
              aria-label="Toggle minimap"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-600 dark:text-zinc-300">Word wrap</span>
            <Switch
              checked={settings.wordWrap}
              onCheckedChange={(v) => updateSettings({ wordWrap: v })}
              aria-label="Toggle word wrap"
            />
          </div>
        </div>
        <p className="mt-3 border-t border-border pt-2 text-[10px] leading-relaxed text-zinc-400 dark:text-zinc-400">
          Saved to this browser. Behavior tracking is unaffected — all settings are cosmetic.
        </p>
      </PopoverContent>
    </Popover>
  );

  const editorHeader = (
    <div className="flex items-center justify-between border-b border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5">
      <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-zinc-600 dark:text-zinc-300">
        <FileCode2 className="h-3 w-3 shrink-0 text-[#5c7250] dark:text-[#a9c29b]" />
        <span className="truncate">{resolvedFileName}</span>
      </span>
      {settingsButton}
    </div>
  );

  const editorFooter = (
    <div className="flex items-center justify-between border-t border-zinc-300 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 px-3 py-1">
      <span className="flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
        <Keyboard className="h-3 w-3" />
        <kbd className="sp-kbd">Ctrl</kbd>
        <span>+</span>
        <kbd className="sp-kbd">↵</kbd>
        <span className="ml-0.5">run</span>
        <span className="mx-1 text-zinc-300">·</span>
        <kbd className="sp-kbd">Ctrl</kbd>
        <span>+</span>
        <kbd className="sp-kbd">⇧↵</kbd>
        <span className="ml-0.5">submit</span>
      </span>
      <span className="flex items-center gap-2 font-mono text-[10px] tabular-nums text-zinc-500 dark:text-zinc-400">
        {cursor && (
          <span>
            Ln {cursor.ln}, Col {cursor.col}
          </span>
        )}
        <span className="rounded bg-zinc-900 px-1.5 py-px font-medium text-zinc-100">{langMeta.label}</span>
      </span>
    </div>
  );

  if (monacoFailed) {
    return (
      <div className="overflow-hidden rounded-md border border-border bg-zinc-950">
        {editorHeader}
        <textarea
          value={value}
          readOnly={readOnly}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleShortcutKeys}
          onPaste={(e) => {
            const chars = e.clipboardData.getData("text").length;
            if (chars > 0) onPaste?.(chars);
          }}
          spellCheck={false}
          className="w-full font-mono leading-relaxed p-4 bg-transparent outline-none resize-none text-zinc-100"
          style={{ height, fontSize: settings.fontSize }}
          aria-label="Code editor"
        />
        {editorFooter}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      {editorHeader}
      <Editor
        height={height}
        defaultLanguage={langMeta.monaco}
        language={langMeta.monaco}
        theme="vs-dark"
        path={resolvedFileName}
        value={value}
        onChange={handleChange}
        loading={
          <div className="flex items-center justify-center h-full bg-zinc-950 text-zinc-500 dark:text-zinc-400 text-sm">
            Loading editor…
          </div>
        }
        onValidate={() => {
          readyRef.current = true;
          setMonacoReady(true);
        }}
        options={{
          readOnly,
          fontSize: settings.fontSize,
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          minimap: { enabled: settings.minimap },
          wordWrap: settings.wordWrap ? "on" : "off",
          scrollBeyondLastLine: false,
          lineNumbersMinChars: 3,
          padding: { top: 12, bottom: 12 },
          renderLineHighlight: "all",
          smoothScrolling: true,
          tabSize: 2,
          automaticLayout: true,
        }}
        onMount={(editor, monaco) => {
          readyRef.current = true;
          setMonacoReady(true);
          monaco.editor.setTheme("vs-dark");
          // keyboard shortcuts: Ctrl/Cmd+Enter = run tests · Ctrl/Cmd+Shift+Enter = submit
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current?.());
          editor.addCommand(
            monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter,
            () => submitRef.current?.()
          );
          editor.onDidPaste(() => {
            pasteFlagRef.current = Date.now();
          });
          editor.onDidChangeCursorPosition((e) => {
            setCursor({ ln: e.position.lineNumber, col: e.position.column });
          });
          editor.onDidChangeModelContent((e) => {
            let added = 0;
            let removed = 0;
            for (const change of e.changes) {
              added += change.text.length;
              removed += change.rangeLength;
            }
            const isPaste = Date.now() - pasteFlagRef.current < 150 && added > 2;
            if (isPaste) {
              onPaste?.(added);
              // don't double count as edit
            } else {
              const netAdded = Math.max(added - removed, 0);
              onEditDelta?.(netAdded || added > 0 ? added : 0, removed);
            }
          });
        }}
      />
      {editorFooter}
    </div>
  );
}
