import { useEffect } from 'react'
import { MATERIAL_TYPES } from './materialRules'

const MATERIAL_LABELS = {
  class_note: 'Class note',
  teacher_material: 'Teacher material',
  homework: 'Homework',
  past_paper: 'Past paper',
  mock_paper: 'Mock paper',
  mark_scheme: 'Mark Scheme',
  ielts_passage: 'IELTS passage',
  writing_speaking: 'Writing / speaking material',
  handwritten_draft: 'Handwritten draft',
  error_photo: 'Error photo',
}

const flattenFolders = (folders, parents = []) => folders.flatMap((folder) => {
  const path = [...parents, folder.name]
  return [
    { id: folder.id, label: path.join(' / '), path: path.join(' / ') },
    ...flattenFolders(folder.children || [], path),
  ]
})

export default function ClassificationForm({ value, folders, onChange, disabled = false }) {
  const folderOptions = flattenFolders(folders)
  const canonicalFolder = folderOptions.find((option) => option.id === value.folderId)
  const hasPrefilledFolder = folderOptions.some((option) => option.id === value.folderId)
  const visibleFolderOptions = hasPrefilledFolder ? folderOptions : [
    { id: value.folderId, label: `${value.folderPath} (suggested)`, path: value.folderPath },
    ...folderOptions,
  ]
  const update = (field, nextValue) => onChange({ ...value, [field]: nextValue })

  useEffect(() => {
    if (canonicalFolder && canonicalFolder.path !== value.folderPath) {
      onChange({ ...value, folderPath: canonicalFolder.path })
    }
  }, [canonicalFolder?.path, onChange, value])

  const updateFolder = (folderId) => {
    const folder = folderOptions.find((option) => option.id === folderId)
    onChange({
      ...value,
      folderId,
      folderPath: folder?.path || value.folderPath,
    })
  }

  return (
    <fieldset disabled={disabled} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="text-xs font-medium text-warm-stone">
        Material type
        <select
          className="zb-input mt-1"
          value={value.materialType}
          onChange={(event) => update('materialType', event.target.value)}
        >
          {MATERIAL_TYPES.map((materialType) => (
            <option key={materialType} value={materialType}>{MATERIAL_LABELS[materialType]}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-warm-stone">
        Exam board
        <input
          className="zb-input mt-1"
          value={value.examBoard}
          onChange={(event) => update('examBoard', event.target.value)}
        />
      </label>
      <label className="text-xs font-medium text-warm-stone">
        Subject
        <input
          className="zb-input mt-1"
          value={value.subject}
          onChange={(event) => update('subject', event.target.value)}
        />
      </label>
      <label className="text-xs font-medium text-warm-stone">
        Chapter
        <input
          className="zb-input mt-1"
          value={value.chapter}
          onChange={(event) => update('chapter', event.target.value)}
        />
      </label>
      <label className="text-xs font-medium text-warm-stone sm:col-span-2">
        Folder
        <select
          className="zb-input mt-1"
          value={value.folderId}
          onChange={(event) => updateFolder(event.target.value)}
        >
          {visibleFolderOptions.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.label}</option>
          ))}
        </select>
      </label>
    </fieldset>
  )
}
