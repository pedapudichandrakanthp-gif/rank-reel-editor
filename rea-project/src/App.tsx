import React, { useState, useMemo } from 'react';
import type { RankReelProject, Scene } from './types/editor';

export function RankReelEditorApp({ initialProject }: { initialProject: RankReelProject }) {
  const [project, setProject] = useState<RankReelProject>(initialProject);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(initialProject.scenes[0]?.id ?? '');
  const [undoStack, setUndoStack] = useState<RankReelProject[]>([]);
  const [redoStack, setRedoStack] = useState<RankReelProject[]>([]);
  const [exportStatus, setExportStatus] = useState<string>('');

  const orderedScenes = useMemo(
    () => [...project.scenes].sort((a, b) => a.order - b.order),
    [project.scenes]
  );

  const selectedScene = useMemo(
    () => orderedScenes.find(s => s.id === selectedSceneId) ?? orderedScenes[0] ?? null,
    [orderedScenes, selectedSceneId]
  );

  function pushUndo(next: RankReelProject) {
    setUndoStack(prev => [...prev.slice(-39), project]);
    setRedoStack([]);
    setProject(next);
  }

  function updateSelectedScene(patch: Partial<Scene>) {
    if (!selectedScene) return;
    pushUndo({
      ...project,
      updatedAt: new Date().toISOString(),
      scenes: project.scenes.map(s => (s.id === selectedScene.id ? { ...s, ...patch } : s))
    });
  }

  async function handleExportMp4() {
    setExportStatus('Rendering 1080x1920 H.264/AAC MP4 via local FFmpeg...');
    const res = await fetch('/api/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project })
    });
    const data = await res.json();
    if (data.success) {
      setExportStatus(`Exported ${data.fileName} (${data.duration}s, 1080x1920)`);
    } else {
      setExportStatus(`Export failed: ${data.error}`);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="h-14 border-b border-zinc-800 px-4 flex items-center justify-between">
        <h1 className="text-sm font-bold">{project.name}</h1>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={undoStack.length === 0}
            onClick={() => {
              const prev = undoStack[undoStack.length - 1];
              if (!prev) return;
              setRedoStack(r => [...r, project]);
              setUndoStack(u => u.slice(0, -1));
              setProject(prev);
            }}
            className="px-3 py-1 rounded bg-zinc-800 text-xs"
          >
            Undo
          </button>
          <button
            type="button"
            disabled={redoStack.length === 0}
            onClick={() => {
              const next = redoStack[redoStack.length - 1];
              if (!next) return;
              setUndoStack(u => [...u, project]);
              setRedoStack(r => r.slice(0, -1));
              setProject(next);
            }}
            className="px-3 py-1 rounded bg-zinc-800 text-xs"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={handleExportMp4}
            className="px-4 py-1 rounded bg-amber-500 text-zinc-950 font-bold text-xs"
          >
            Export 1080x1920 MP4
          </button>
        </div>
      </header>
      {exportStatus && <div className="p-2 bg-zinc-900 text-xs text-amber-400 px-4">{exportStatus}</div>}
      <main className="flex-1 grid grid-cols-12">
        <aside className="col-span-3 border-r border-zinc-800 p-3 space-y-2">
          {orderedScenes.map(scene => (
            <div
              key={scene.id}
              onClick={() => setSelectedSceneId(scene.id)}
              className={`p-2.5 rounded border cursor-pointer ${
                scene.id === selectedScene?.id ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900'
              }`}
            >
              <div className="text-xs font-bold">
                {scene.overlay.rankPrefix}{scene.overlay.rankNumber} — {scene.label}
              </div>
              <div className="text-[11px] text-zinc-400">{scene.duration.toFixed(1)}s</div>
            </div>
          ))}
        </aside>
        <section className="col-span-5 flex items-center justify-center p-4">
          <div className="text-xs text-zinc-400">9:16 Vertical Preview Stage (1080x1920)</div>
        </section>
        <aside className="col-span-4 border-l border-zinc-800 p-4 space-y-3">
          {selectedScene && (
            <>
              <label className="block text-xs text-zinc-400">
                Scene Label
                <input
                  type="text"
                  value={selectedScene.label}
                  onChange={e => updateSelectedScene({ label: e.target.value })}
                  className="w-full mt-1 bg-zinc-900 border border-zinc-700 rounded px-2 py-1 text-xs"
                />
              </label>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}
export default RankReelEditorApp;
