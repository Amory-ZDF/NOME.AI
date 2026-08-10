const REASON_LABELS = {
  edit: 'Edited',
  title_edit: 'Title edited',
  ai_organize: 'AI organised',
  undo: 'Undo checkpoint',
}

export default function VersionHistory({ versions = [], currentVersion }) {
  return (
    <details className="border-t border-whisper-line pt-3 mt-4 text-xs text-warm-stone">
      <summary className="cursor-pointer font-medium text-deep-ink select-none">
        Version history ({versions.length})
      </summary>
      <ol className="mt-2 flex flex-col gap-1.5">
        {[...versions].reverse().map((snapshot) => (
          <li key={`${snapshot.version}-${snapshot.changedAt}-${snapshot.reason}`} className="flex items-start justify-between gap-3 rounded-comp bg-warm-paper px-2.5 py-2">
            <span>
              <span className="font-medium text-deep-ink">Version {snapshot.version}</span>
              <span className="ml-1">· {REASON_LABELS[snapshot.reason] || snapshot.reason}</span>
            </span>
            <time className="font-mono text-[10px] text-right" dateTime={snapshot.changedAt}>{snapshot.changedAt}</time>
          </li>
        ))}
        <li className="flex items-center justify-between rounded-comp bg-teal-tint px-2.5 py-2">
          <span className="font-medium text-deep-teal">Version {currentVersion}</span>
          <span>Current</span>
        </li>
      </ol>
    </details>
  )
}
