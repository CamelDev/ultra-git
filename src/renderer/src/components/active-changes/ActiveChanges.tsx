import React, { useState, useEffect, useMemo } from 'react'
import { FileText, Folder, ChevronRight, ChevronDown, ArrowRight, ArrowLeft, AlertTriangle, RotateCcw, Trash2, EyeOff, MoreVertical, ListTree } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'
import { useUndoStore } from '../../store/useUndoStore'
import { useToaster } from '../toaster/ToasterContext'
import { DiffModal } from '../details/DiffModal'
import { AppDialog } from '../dialogs/AppDialog'

type ChangeFile = { path: string; index: string; working_dir: string; [key: string]: any }

type FileTreeFolder = {
  name: string
  path: string
  folders: Map<string, FileTreeFolder>
  files: ChangeFile[]
}

const buildFileTree = (files: ChangeFile[]): FileTreeFolder => {
  const root: FileTreeFolder = { name: '', path: '', folders: new Map(), files: [] }

  for (const file of files) {
    const segments = file.path.split('/').filter(Boolean)
    const fileName = segments.pop()
    if (!fileName) continue

    let folder = root
    for (const segment of segments) {
      let child = folder.folders.get(segment)
      if (!child) {
        child = {
          name: segment,
          path: folder.path ? `${folder.path}/${segment}` : segment,
          folders: new Map(),
          files: []
        }
        folder.folders.set(segment, child)
      }
      folder = child
    }
    folder.files.push(file)
  }

  return root
}

const getFolderFiles = (folder: FileTreeFolder): ChangeFile[] => [
  ...folder.files,
  ...Array.from(folder.folders.values()).flatMap(getFolderFiles)
]

type FileTreeProps = {
  files: ChangeFile[]
  selectedPaths: Set<string>
  treeMode: boolean
  panel: 'staged' | 'unstaged'
  collapsedFolders: Set<string>
  onToggleFolder: (folderId: string) => void
  onToggleFolderSelection: (files: ChangeFile[]) => void
  renderFile: (file: ChangeFile, index: number) => React.ReactNode
}

const FileTree: React.FC<FileTreeProps> = ({
  files,
  selectedPaths,
  treeMode,
  panel,
  collapsedFolders,
  onToggleFolder,
  onToggleFolderSelection,
  renderFile
}) => {
  if (!treeMode) return <>{files.map((file, index) => renderFile(file, index))}</>

  const tree = buildFileTree(files)

  const renderFolder = (folder: FileTreeFolder, depth: number): React.ReactNode => {
    const folderFiles = getFolderFiles(folder)
    const selectedCount = folderFiles.filter((file) => selectedPaths.has(file.path)).length
    const folderId = `${panel}:${folder.path}`
    const isExpanded = !collapsedFolders.has(folderId)

    return (
      <React.Fragment key={folderId}>
        <div className="folder-item" style={{ paddingLeft: `${20 + depth * 16}px` }}>
          <button
            type="button"
            className="folder-expand-button"
            onClick={() => onToggleFolder(folderId)}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${folder.path}`}
            data-testid={`folder-toggle-${panel}-${folder.path}`}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          <input
            type="checkbox"
            className="file-select-checkbox"
            checked={selectedCount === folderFiles.length}
            ref={(element) => {
              if (element) element.indeterminate = selectedCount > 0 && selectedCount < folderFiles.length
            }}
            onClick={(event) => event.stopPropagation()}
            onChange={() => onToggleFolderSelection(folderFiles)}
            aria-label={`Select ${folder.path}`}
            data-testid={`folder-checkbox-${panel}-${folder.path}`}
          />
          <Folder size={14} className="folder-icon" />
          <button
            type="button"
            className="folder-name"
            onClick={() => onToggleFolder(folderId)}
            data-testid={`folder-name-${panel}-${folder.path}`}
          >
            {folder.name} <span className="folder-file-count">({folderFiles.length})</span>
          </button>
        </div>
        {isExpanded && (
          <>
            {Array.from(folder.folders.values())
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((child) => renderFolder(child, depth + 1))}
            {folder.files
              .slice()
              .sort((a, b) => a.path.localeCompare(b.path))
              .map((file) => (
                <div className="tree-file" style={{ paddingLeft: `${depth * 16}px` }} key={file.path}>
                  {renderFile(file, files.indexOf(file))}
                </div>
              ))}
          </>
        )}
      </React.Fragment>
    )
  }

  return <>{Array.from(tree.folders.values()).sort((a, b) => a.name.localeCompare(b.name)).map((folder) => renderFolder(folder, 0))}{tree.files.slice().sort((a, b) => a.path.localeCompare(b.path)).map((file) => renderFile(file, files.indexOf(file)))}</>
}

function getIgnoreOptions(filePath: string): Array<{ label: string; value: string; desc: string }> {
  const options: Array<{ label: string; value: string; desc: string }> = []

  // 1. Exact file path
  options.push({
    label: 'Exact file path',
    value: filePath,
    desc: `Ignore only "${filePath}"`
  })

  const fileName = filePath.split('/').pop() || filePath

  // 2. File name only (if in subfolder)
  if (filePath.includes('/')) {
    options.push({
      label: 'File name (any directory)',
      value: fileName,
      desc: `Ignore any file named "${fileName}" anywhere`
    })
  }

  // 3. Extension (e.g. *.xml or *.run.xml)
  const parts = fileName.split('.')
  if (parts.length > 1) {
    const ext = parts[parts.length - 1]
    options.push({
      label: `All .${ext} files`,
      value: `*.${ext}`,
      desc: `Ignore all files ending with ".${ext}"`
    })
    if (parts.length > 2) {
      const compoundExt = parts.slice(parts.length - 2).join('.')
      options.push({
        label: `All .${compoundExt} files`,
        value: `*.${compoundExt}`,
        desc: `Ignore all files ending with ".${compoundExt}"`
      })
    }
  }

  // 4. Directory (if in subfolder)
  if (filePath.includes('/')) {
    const segments = filePath.split('/')
    const parentFolder = segments.slice(0, segments.length - 1).join('/') + '/'
    options.push({
      label: 'Parent directory',
      value: parentFolder,
      desc: `Ignore the entire "${parentFolder}" directory`
    })
    if (segments.length > 2) {
      const topFolder = segments[0] + '/'
      options.push({
        label: 'Top-level directory',
        value: topFolder,
        desc: `Ignore the entire "${topFolder}" directory`
      })
    }
  }

  return options
}

export interface ActiveChangesProps {
  viewMode?: 'list' | 'tree'
  initialUnstagedViewMode?: 'list' | 'tree'
  initialStagedViewMode?: 'list' | 'tree'
}

export const resolveViewModePreference = (
  panel: 'unstaged' | 'staged',
  initialMode?: 'list' | 'tree',
  legacyMode?: 'list' | 'tree',
  storage?: Pick<Storage, 'getItem' | 'setItem'>
): 'list' | 'tree' => {
  if (initialMode) return initialMode
  const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null)
  const key = panel === 'unstaged' ? 'unstaged-changes-view-mode' : 'staged-changes-view-mode'
  const saved = s?.getItem(key) ?? legacyMode ?? s?.getItem('changes-view-mode')
  return saved === 'tree' ? 'tree' : 'list'
}

export const saveViewModePreference = (
  panel: 'unstaged' | 'staged',
  mode: 'list' | 'tree',
  storage?: Pick<Storage, 'getItem' | 'setItem'>
): void => {
  const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null)
  const key = panel === 'unstaged' ? 'unstaged-changes-view-mode' : 'staged-changes-view-mode'
  s?.setItem(key, mode)
}

export const ActiveChanges: React.FC<ActiveChangesProps> = ({
  viewMode,
  initialUnstagedViewMode,
  initialStagedViewMode
}) => {
  const { getActiveRepo, refreshRepo, identities } = useRepoStore()
  const { addToast } = useToaster()
  const activeRepo = getActiveRepo()

  const [unstagedViewMode, setUnstagedViewMode] = useState<'list' | 'tree'>(() => {
    return resolveViewModePreference('unstaged', initialUnstagedViewMode, viewMode)
  })

  const [stagedViewMode, setStagedViewMode] = useState<'list' | 'tree'>(() => {
    return resolveViewModePreference('staged', initialStagedViewMode, viewMode)
  })

  const toggleUnstagedViewMode = () => {
    setUnstagedViewMode((prev) => {
      const next = prev === 'list' ? 'tree' : 'list'
      saveViewModePreference('unstaged', next)
      return next
    })
  }

  const toggleStagedViewMode = () => {
    setStagedViewMode((prev) => {
      const next = prev === 'list' ? 'tree' : 'list'
      saveViewModePreference('staged', next)
      return next
    })
  }

  const [selectedUnstaged, setSelectedUnstaged] = useState<Set<string>>(new Set())
  const [selectedStaged, setSelectedStaged] = useState<Set<string>>(new Set())
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set())
  const [lastUnstagedIndex, setLastUnstagedIndex] = useState<number | null>(null)
  const [lastStagedIndex, setLastStagedIndex] = useState<number | null>(null)

  const [selectedFileForDiff, setSelectedFileForDiff] = useState<{
    path: string
    oldPath?: string
    status: string
    isStaged: boolean
  } | null>(null)

  const [discardTarget, setDiscardTarget] = useState<{ filePaths: string[]; isStaged: boolean } | null>(null)

  const [contextMenu, setContextMenu] = useState<{
    x: number
    y: number
    filePath: string
    isStaged: boolean
    isTracked: boolean
    isIgnoredTracked: boolean
  } | null>(null)

  const [ignoreModal, setIgnoreModal] = useState<{
    filePath: string
    isTracked: boolean
    options: Array<{ label: string; value: string; desc: string }>
    selectedPattern: string
    customValue: string
    alsoUntrack: boolean
  } | null>(null)

  const [stagingConflict, setStagingConflict] = useState<{
    files: string[]
  } | null>(null)

  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    const handleContextMenuKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    window.addEventListener('click', handleClickOutside)
    window.addEventListener('keydown', handleContextMenuKeyDown)
    return () => {
      window.removeEventListener('click', handleClickOutside)
      window.removeEventListener('keydown', handleContextMenuKeyDown)
    }
  }, [])

  const files = (activeRepo?.status?.files || []) as any[]
  const ignoredTrackedSet = new Set((activeRepo?.status as any)?.ignoredTrackedFiles || [])

  // Staged files: index is not space (' ') and not untracked ('?')
  const stagedFiles = files.filter((f) => f.index !== ' ' && f.index !== '?')

  // Unstaged files: working_dir is not space (' '), or index is untracked ('?')
  const unstagedFiles = files.filter((f) => f.working_dir !== ' ' || f.index === '?')

  // Clear selections and close open diff modal when active repository switches
  useEffect(() => {
    setSelectedUnstaged(new Set())
    setSelectedStaged(new Set())
    setSelectedFileForDiff(null)
  }, [activeRepo?.id])

  // Sync selection sets whenever files change to prune deleted/staged paths
  useEffect(() => {
    const unstagedPaths = new Set(unstagedFiles.map((f) => f.path))
    setSelectedUnstaged((prev) => {
      const next = new Set<string>()
      prev.forEach((p) => {
        if (unstagedPaths.has(p)) next.add(p)
      })
      return next
    })
  }, [unstagedFiles.map((f) => f.path).join(',')])

  useEffect(() => {
    const stagedPaths = new Set(stagedFiles.map((f) => f.path))
    setSelectedStaged((prev) => {
      const next = new Set<string>()
      prev.forEach((p) => {
        if (stagedPaths.has(p)) next.add(p)
      })
      return next
    })
  }, [stagedFiles.map((f) => f.path).join(',')])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selectedFileForDiff) return
        setSelectedUnstaged(new Set())
        setSelectedStaged(new Set())
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedFileForDiff])

  const handleStageFile = async (filePath: string, force = false) => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.add(activeRepo.path, filePath, force)
      if (res.success) {
        useUndoStore.getState().pushAction({
          type: 'STAGE',
          repoPath: activeRepo.path,
          files: [filePath],
          description: `Stage "${filePath}"`
        })
        setSelectedUnstaged((prev) => {
          const next = new Set(prev)
          next.delete(filePath)
          return next
        })
        await refreshRepo(activeRepo.id)
      } else if (res.isIgnoredTracked) {
        setStagingConflict({
          files: res.files && res.files.length > 0 ? res.files : [filePath]
        })
      } else {
        addToast({ variant: 'error', title: 'Stage Failed', message: res.error || 'Failed to stage file' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Stage Error', message: err.message || 'Error staging file' })
    }
  }

  const handleUnstageFile = async (filePath: string) => {
    if (!activeRepo) return
    try {
      const res = await window.api.git.reset(activeRepo.path, filePath)
      if (res.success) {
        useUndoStore.getState().pushAction({
          type: 'UNSTAGE',
          repoPath: activeRepo.path,
          files: [filePath],
          description: `Unstage "${filePath}"`
        })
        setSelectedStaged((prev) => {
          const next = new Set(prev)
          next.delete(filePath)
          return next
        })
        await refreshRepo(activeRepo.id)
      } else {
        addToast({ variant: 'error', title: 'Unstage Failed', message: res.error || 'Failed to unstage file' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Unstage Error', message: err.message || 'Error unstaging file' })
    }
  }

  const handleBatchStage = async (force = false) => {
    if (!activeRepo) return
    const paths = Array.from(selectedUnstaged)
    if (paths.length === 0) return
    try {
      const res = await window.api.git.add(activeRepo.path, paths, force)
      if (res.success) {
        useUndoStore.getState().pushAction({
          type: 'STAGE',
          repoPath: activeRepo.path,
          files: paths,
          description: `Stage ${paths.length} files`
        })
        setSelectedUnstaged(new Set())
        await refreshRepo(activeRepo.id)
        addToast({ variant: 'success', title: 'Staged', message: `Staged ${paths.length} file(s)` })
      } else if (res.isIgnoredTracked) {
        setStagingConflict({
          files: res.files && res.files.length > 0 ? res.files : paths
        })
      } else {
        addToast({ variant: 'error', title: 'Batch Stage Failed', message: res.error || 'Failed to stage selected files' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Batch Stage Error', message: err.message || 'Error staging selected files' })
    }
  }

  const handleUntrackFile = async (filePath: string | string[]) => {
    if (!activeRepo) return
    const paths = Array.isArray(filePath) ? filePath : [filePath]
    if (paths.length === 0) return
    try {
      const res = await window.api.git.untrack(activeRepo.path, paths)
      if (res.success) {
        useUndoStore.getState().pushAction({
          type: 'UNTRACK',
          repoPath: activeRepo.path,
          files: paths,
          description: paths.length === 1 ? `Untrack "${paths[0]}"` : `Untrack ${paths.length} files`
        })
        setSelectedUnstaged((prev) => {
          const next = new Set(prev)
          paths.forEach((p) => next.delete(p))
          return next
        })
        setSelectedStaged((prev) => {
          const next = new Set(prev)
          paths.forEach((p) => next.delete(p))
          return next
        })
        await refreshRepo(activeRepo.id)
        addToast({
          variant: 'success',
          title: 'Untracked from Git',
          message:
            paths.length === 1
              ? `Untracked "${paths[0]}" (kept on disk)`
              : `Untracked ${paths.length} files (kept on disk)`
        })
      } else {
        addToast({ variant: 'error', title: 'Untrack Failed', message: res.error || 'Failed to untrack file' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Untrack Error', message: err.message || 'Error untracking file' })
    }
  }

  const openIgnoreDialog = (filePath: string, isTracked: boolean) => {
    const options = getIgnoreOptions(filePath)
    setIgnoreModal({
      filePath,
      isTracked,
      options,
      selectedPattern: options[0]?.value || filePath,
      customValue: '',
      alsoUntrack: isTracked
    })
  }

  const handleConfirmAddToGitignore = async () => {
    if (!ignoreModal || !activeRepo) return
    const pattern =
      ignoreModal.selectedPattern === '__custom__'
        ? ignoreModal.customValue.trim()
        : ignoreModal.selectedPattern.trim()

    if (!pattern) {
      addToast({ variant: 'error', title: 'Invalid Pattern', message: 'Please specify a pattern to ignore' })
      return
    }

    try {
      const res = await window.api.git.addToGitignore(activeRepo.path, pattern)
      if (res.success) {
        if (ignoreModal.isTracked && ignoreModal.alsoUntrack) {
          await window.api.git.untrack(activeRepo.path, ignoreModal.filePath)
          useUndoStore.getState().pushAction({
            type: 'UNTRACK',
            repoPath: activeRepo.path,
            files: [ignoreModal.filePath],
            description: `Untrack "${ignoreModal.filePath}"`
          })
        }
        await refreshRepo(activeRepo.id)
        addToast({
          variant: 'success',
          title: 'Added to .gitignore',
          message: res.data?.alreadyExisted
            ? `"${pattern}" was already in .gitignore`
            : `Added "${pattern}" to .gitignore${
                ignoreModal.isTracked && ignoreModal.alsoUntrack ? ' and untracked file' : ''
              }`
        })
        setIgnoreModal(null)
      } else {
        addToast({
          variant: 'error',
          title: 'Failed to Update .gitignore',
          message: res.error || 'Could not update .gitignore'
        })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Error', message: err.message || 'Error updating .gitignore' })
    }
  }

  const handleBatchUnstage = async () => {
    if (!activeRepo) return
    const paths = Array.from(selectedStaged)
    if (paths.length === 0) return
    try {
      const res = await window.api.git.reset(activeRepo.path, paths)
      if (res.success) {
        useUndoStore.getState().pushAction({
          type: 'UNSTAGE',
          repoPath: activeRepo.path,
          files: paths,
          description: `Unstage ${paths.length} files`
        })
        setSelectedStaged(new Set())
        await refreshRepo(activeRepo.id)
        addToast({ variant: 'success', title: 'Unstaged', message: `Unstaged ${paths.length} file(s)` })
      } else {
        addToast({ variant: 'error', title: 'Batch Unstage Failed', message: res.error || 'Failed to unstage selected files' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Batch Unstage Error', message: err.message || 'Error unstaging selected files' })
    }
  }

  const handleDiscardChanges = (filePath: string | string[], isStaged: boolean) => {
    const filePaths = Array.isArray(filePath) ? filePath : [filePath]
    setDiscardTarget({ filePaths, isStaged })
  }

  const toggleUnstagedFile = (path: string, index: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedUnstaged((prev) => {
      const next = new Set(prev)
      if (e?.shiftKey && lastUnstagedIndex !== null) {
        const start = Math.min(lastUnstagedIndex, index)
        const end = Math.max(lastUnstagedIndex, index)
        for (let i = start; i <= end; i++) {
          if (unstagedFiles[i]) next.add(unstagedFiles[i].path)
        }
      } else if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
    setLastUnstagedIndex(index)
  }

  const toggleStagedFile = (path: string, index: number, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setSelectedStaged((prev) => {
      const next = new Set(prev)
      if (e?.shiftKey && lastStagedIndex !== null) {
        const start = Math.min(lastStagedIndex, index)
        const end = Math.max(lastStagedIndex, index)
        for (let i = start; i <= end; i++) {
          if (stagedFiles[i]) next.add(stagedFiles[i].path)
        }
      } else if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
    setLastStagedIndex(index)
  }

  const handleSelectAllUnstaged = () => {
    if (selectedUnstaged.size === unstagedFiles.length) {
      setSelectedUnstaged(new Set())
    } else {
      setSelectedUnstaged(new Set(unstagedFiles.map((f) => f.path)))
    }
  }

  const handleSelectAllStaged = () => {
    if (selectedStaged.size === stagedFiles.length) {
      setSelectedStaged(new Set())
    } else {
      setSelectedStaged(new Set(stagedFiles.map((f) => f.path)))
    }
  }

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((previous) => {
      const next = new Set(previous)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const toggleFolderSelection = (folderFiles: ChangeFile[], isStaged: boolean) => {
    const paths = folderFiles.map((file) => file.path)
    const setSelection = isStaged ? setSelectedStaged : setSelectedUnstaged
    setSelection((previous) => {
      const next = new Set(previous)
      const isFullySelected = paths.every((path) => next.has(path))
      paths.forEach((path) => {
        if (isFullySelected) next.delete(path)
        else next.add(path)
      })
      return next
    })
  }

  const getStatusClass = (status: string) => {
    if (status === '?') return 'status-q'
    return `status-${status.toLowerCase()}`
  }

  const getRenamedOldPath = (filePath: string) => {
    if (!activeRepo?.status?.renamed) return undefined
    const renameInfo = activeRepo.status.renamed.find((r: any) => r.to === filePath)
    return renameInfo ? renameInfo.from : undefined
  }

  const diffModalFiles = useMemo(() => {
    if (!selectedFileForDiff) return []
    return selectedFileForDiff.isStaged
      ? stagedFiles.map((f) => ({
          path: f.path,
          oldPath: getRenamedOldPath(f.path),
          status: f.index,
          isStaged: true
        }))
      : unstagedFiles.map((f) => ({
          path: f.path,
          status: f.working_dir === ' ' && f.index === '?' ? '?' : f.working_dir,
          isStaged: false
        }))
  }, [selectedFileForDiff?.isStaged, stagedFiles, unstagedFiles, activeRepo?.status?.renamed])

  const initialDiffFileIndex = useMemo(() => {
    if (!selectedFileForDiff) return 0
    return selectedFileForDiff.isStaged
      ? Math.max(0, stagedFiles.findIndex((f) => f.path === selectedFileForDiff.path))
      : Math.max(0, unstagedFiles.findIndex((f) => f.path === selectedFileForDiff.path))
  }, [selectedFileForDiff, stagedFiles, unstagedFiles])

  const isIdentityRequiredAndMissing = !!(activeRepo && identities.length > 1 && !activeRepo.identityId)

  const discardMessage = discardTarget
    ? discardTarget.filePaths.length === 1
      ? `Are you sure you want to discard changes in "${discardTarget.filePaths[0]}"? This operation cannot be undone.`
      : `Are you sure you want to discard changes in ${discardTarget.filePaths.length} selected files? This operation cannot be undone.`
    : ''

  if (!activeRepo || !activeRepo.status || !activeRepo.status.files || files.length === 0) {
    return null
  }

  return (
    <div className="active-changes-panel" data-testid="active-changes-panel">
      {isIdentityRequiredAndMissing && (
        <div 
          className="pull-conflict-banner" 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            borderBottom: '1px solid rgba(245, 158, 11, 0.2)',
            fontSize: '12px',
            color: '#f59e0b',
            fontWeight: 500,
            boxSizing: 'border-box'
          }}
          data-testid="identity-required-banner"
        >
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>Multiple Git identities configured. Please select the identity profile you wish to use for this repository from the Sync Panel dropdown above.</span>
        </div>
      )}

      <div className="active-changes-columns">
        {/* Unstaged (Changed files) column */}
        <div className="active-changes-column unstaged-column">
          <div className="column-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="header-view-toggle-btn"
                onClick={toggleUnstagedViewMode}
                aria-pressed={unstagedViewMode === 'tree'}
                data-tooltip={unstagedViewMode === 'tree' ? 'Show changed files as a list' : 'Show changed files as a folder tree'}
                data-testid="changes-view-toggle-unstaged"
                aria-label={unstagedViewMode === 'tree' ? 'Show changed files as a list' : 'Show changed files as a folder tree'}
              >
                <ListTree size={14} />
              </button>
              {unstagedFiles.length > 0 && (
                <input
                  type="checkbox"
                  className="file-select-checkbox header-checkbox"
                  checked={selectedUnstaged.size === unstagedFiles.length}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = selectedUnstaged.size > 0 && selectedUnstaged.size < unstagedFiles.length
                    }
                  }}
                  onChange={handleSelectAllUnstaged}
                  title="Select / Deselect all unstaged files"
                  data-testid="select-all-unstaged-checkbox"
                />
              )}
              <span>
                Changed files ({unstagedFiles.length})
                {selectedUnstaged.size > 0 && ` • ${selectedUnstaged.size} selected`}
              </span>
            </div>
            {selectedUnstaged.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className="action-btn reset-btn"
                  onClick={() => handleDiscardChanges(Array.from(selectedUnstaged), false)}
                  data-tooltip={`Discard ${selectedUnstaged.size} selected changes`}
                  data-testid="batch-discard-unstaged-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px' }}
                >
                  <RotateCcw size={12} />
                  <span>Discard ({selectedUnstaged.size})</span>
                </button>
                <button
                  className="action-btn stage-btn"
                  onClick={() => handleBatchStage()}
                  data-tooltip={`Stage ${selectedUnstaged.size} selected files`}
                  data-testid="batch-stage-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px' }}
                >
                  <span>Stage ({selectedUnstaged.size})</span>
                  <ArrowRight size={12} />
                </button>
              </div>
            )}
          </div>
          <div className="active-file-list">
            {unstagedFiles.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                No unstaged changes
              </div>
            ) : (
              <FileTree
                files={unstagedFiles}
                selectedPaths={selectedUnstaged}
                treeMode={unstagedViewMode === 'tree'}
                panel="unstaged"
                collapsedFolders={collapsedFolders}
                onToggleFolder={toggleFolder}
                onToggleFolderSelection={(folderFiles) => toggleFolderSelection(folderFiles, false)}
                renderFile={(file, index) => {
                const statusChar = file.working_dir === ' ' && file.index === '?' ? '?' : file.working_dir
                const isSelected = selectedUnstaged.has(file.path)
                const isIgnoredTracked = ignoredTrackedSet.has(file.path)
                const isTracked = file.index !== '?'
                return (
                  <div
                    key={`unstaged-${file.path}`}
                    className={`file-item ${isSelected ? 'selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      if (e.shiftKey || e.metaKey || e.ctrlKey) {
                        toggleUnstagedFile(file.path, index, e)
                      } else {
                        setSelectedFileForDiff({
                          path: file.path,
                          status: statusChar,
                          isStaged: false
                        })
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        filePath: file.path,
                        isStaged: false,
                        isTracked,
                        isIgnoredTracked
                      })
                    }}
                  >
                    <input
                      type="checkbox"
                      className="file-select-checkbox"
                      checked={isSelected}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleUnstagedFile(file.path, index, e)
                      }}
                      onChange={() => {}}
                      data-testid={`checkbox-unstaged-${file.path}`}
                    />
                    <FileText size={14} style={{ marginRight: '8px', color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginRight: '8px',
                        flex: 1
                      }}
                      data-tooltip={file.path}
                    >
                      {file.path}
                    </span>

                    {isIgnoredTracked && (
                      <span
                        className="tracked-ignored-badge"
                        data-tooltip="Tracked in Git, but matches .gitignore. Untrack to stop seeing changes."
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(245, 158, 11, 0.15)',
                          color: '#f59e0b',
                          fontSize: '10px',
                          fontWeight: 600,
                          marginRight: '6px',
                          flexShrink: 0
                        }}
                      >
                        <AlertTriangle size={10} />
                        <span>Tracked · Ignored</span>
                      </span>
                    )}

                    <span className={`file-status ${getStatusClass(statusChar)}`}>
                      {statusChar}
                    </span>

                    {isIgnoredTracked && (
                      <button
                        className="action-btn untrack-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUntrackFile(file.path)
                        }}
                        data-tooltip="Untrack file from Git (keep on disk)"
                        data-testid={`untrack-btn-${file.path}`}
                        style={{ display: 'flex', alignItems: 'center', gap: '3px' }}
                      >
                        <EyeOff size={11} />
                        <span>Untrack</span>
                      </button>
                    )}

                    <button
                      className="action-btn ignore-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        openIgnoreDialog(file.path, isTracked)
                      }}
                      data-tooltip="Add to .gitignore"
                      data-testid={`ignore-btn-${file.path}`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <EyeOff size={12} />
                    </button>

                    <button
                      className="action-btn reset-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isSelected && selectedUnstaged.size > 1) {
                          handleDiscardChanges(Array.from(selectedUnstaged), false)
                        } else {
                          handleDiscardChanges(file.path, false)
                        }
                      }}
                      data-tooltip={
                        isSelected && selectedUnstaged.size > 1
                          ? `Discard ${selectedUnstaged.size} selected changes`
                          : "Discard changes"
                      }
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      className="action-btn stage-btn"
                      data-testid={`stage-btn-${file.path}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isSelected && selectedUnstaged.size > 1) {
                          handleBatchStage()
                        } else {
                          handleStageFile(file.path)
                        }
                      }}
                      data-tooltip={
                        isSelected && selectedUnstaged.size > 1
                          ? `Stage ${selectedUnstaged.size} selected files`
                          : "Stage changes"
                      }
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <span>Stage</span>
                      <ArrowRight size={12} />
                    </button>
                  </div>
                )
                }}
              />
            )}
          </div>
        </div>

        {/* Staged column */}
        <div className="active-changes-column staged-column">
          <div className="column-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                className="header-view-toggle-btn"
                onClick={toggleStagedViewMode}
                aria-pressed={stagedViewMode === 'tree'}
                data-tooltip={stagedViewMode === 'tree' ? 'Show staged files as a list' : 'Show staged files as a folder tree'}
                data-testid="changes-view-toggle-staged"
                aria-label={stagedViewMode === 'tree' ? 'Show staged files as a list' : 'Show staged files as a folder tree'}
              >
                <ListTree size={14} />
              </button>
              {stagedFiles.length > 0 && (
                <input
                  type="checkbox"
                  className="file-select-checkbox header-checkbox"
                  checked={selectedStaged.size === stagedFiles.length}
                  ref={(el) => {
                    if (el) {
                      el.indeterminate = selectedStaged.size > 0 && selectedStaged.size < stagedFiles.length
                    }
                  }}
                  onChange={handleSelectAllStaged}
                  title="Select / Deselect all staged files"
                  data-testid="select-all-staged-checkbox"
                />
              )}
              <span>
                Staged ({stagedFiles.length})
                {selectedStaged.size > 0 && ` • ${selectedStaged.size} selected`}
              </span>
            </div>
            {selectedStaged.size > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  className="action-btn reset-btn"
                  onClick={() => handleDiscardChanges(Array.from(selectedStaged), true)}
                  data-tooltip={`Discard ${selectedStaged.size} selected staged changes`}
                  data-testid="batch-discard-staged-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px' }}
                >
                  <RotateCcw size={12} />
                  <span>Discard ({selectedStaged.size})</span>
                </button>
                <button
                  className="action-btn unstage-btn"
                  onClick={handleBatchUnstage}
                  data-tooltip={`Unstage ${selectedStaged.size} selected files`}
                  data-testid="batch-unstage-btn"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 8px' }}
                >
                  <ArrowLeft size={12} />
                  <span>Unstage ({selectedStaged.size})</span>
                </button>
              </div>
            )}
          </div>
          <div className="active-file-list">
            {stagedFiles.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)', fontSize: '12px' }}>
                No staged changes
              </div>
            ) : (
              <FileTree
                files={stagedFiles}
                selectedPaths={selectedStaged}
                treeMode={stagedViewMode === 'tree'}
                panel="staged"
                collapsedFolders={collapsedFolders}
                onToggleFolder={toggleFolder}
                onToggleFolderSelection={(folderFiles) => toggleFolderSelection(folderFiles, true)}
                renderFile={(file, index) => {
                const oldPath = getRenamedOldPath(file.path)
                const isSelected = selectedStaged.has(file.path)
                const isIgnoredTracked = ignoredTrackedSet.has(file.path)
                return (
                  <div
                    key={`staged-${file.path}`}
                    className={`file-item ${isSelected ? 'selected' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      if (e.shiftKey || e.metaKey || e.ctrlKey) {
                        toggleStagedFile(file.path, index, e)
                      } else {
                        setSelectedFileForDiff({
                          path: file.path,
                          oldPath,
                          status: file.index,
                          isStaged: true
                        })
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        filePath: file.path,
                        isStaged: true,
                        isTracked: true,
                        isIgnoredTracked
                      })
                    }}
                  >
                    <input
                      type="checkbox"
                      className="file-select-checkbox"
                      checked={isSelected}
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleStagedFile(file.path, index, e)
                      }}
                      onChange={() => {}}
                      data-testid={`checkbox-staged-${file.path}`}
                    />
                    <FileText size={14} style={{ marginRight: '8px', color: 'var(--text-secondary)', flexShrink: 0 }} />
                    <span
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        marginRight: '8px',
                        flex: 1
                      }}
                      data-tooltip={oldPath ? `${oldPath} -> ${file.path}` : file.path}
                    >
                      {oldPath ? `${oldPath} -> ${file.path}` : file.path}
                    </span>
                    <span className={`file-status ${getStatusClass(file.index)}`}>
                      {file.index}
                    </span>
                    <button
                      className="action-btn ignore-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        openIgnoreDialog(file.path, true)
                      }}
                      data-tooltip="Add to .gitignore"
                      data-testid={`ignore-btn-staged-${file.path}`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <EyeOff size={12} />
                    </button>
                    <button
                      className="action-btn reset-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isSelected && selectedStaged.size > 1) {
                          handleDiscardChanges(Array.from(selectedStaged), true)
                        } else {
                          handleDiscardChanges(file.path, true)
                        }
                      }}
                      data-tooltip={
                        isSelected && selectedStaged.size > 1
                          ? `Discard ${selectedStaged.size} selected staged changes`
                          : "Discard changes"
                      }
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <RotateCcw size={12} />
                    </button>
                    <button
                      className="action-btn unstage-btn"
                      data-testid={`unstage-btn-${file.path}`}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (isSelected && selectedStaged.size > 1) {
                          handleBatchUnstage()
                        } else {
                          handleUnstageFile(file.path)
                        }
                      }}
                      data-tooltip={
                        isSelected && selectedStaged.size > 1
                          ? `Unstage ${selectedStaged.size} selected files`
                          : "Unstage changes"
                      }
                      style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                      <ArrowLeft size={12} />
                      <span>Unstage</span>
                    </button>
                  </div>
                )
                }}
              />
            )}
          </div>
        </div>
      </div>

      {selectedFileForDiff && (
        <DiffModal
          isOpen={!!selectedFileForDiff}
          onClose={() => setSelectedFileForDiff(null)}
          filePath={selectedFileForDiff.path}
          oldPath={selectedFileForDiff.oldPath}
          status={selectedFileForDiff.status}
          repoPath={activeRepo.path}
          isActiveChange={true}
          isStaged={selectedFileForDiff.isStaged}
          files={diffModalFiles}
          initialFileIndex={initialDiffFileIndex}
        />
      )}

      {/* Discard Changes confirmation dialog */}
      <AppDialog
        isOpen={discardTarget !== null}
        title="Discard Changes"
        message={discardMessage}
        variant="warning"
        icon={<Trash2 size={16} />}
        testId="discard-changes-dialog"
        actions={[
          { label: 'Cancel', value: 'cancel', variant: 'secondary' },
          { label: 'Discard', value: 'discard', variant: 'danger', setsBusy: true }
        ]}
        onResolve={async (val) => {
          if (val === 'discard' && discardTarget && activeRepo) {
            const { filePaths, isStaged } = discardTarget
            setDiscardTarget(null)
            try {
              // Create safety snapshot before discarding
              const snapRes = await window.api.git.createSafetySnapshot(activeRepo.path, filePaths)
              const res = await window.api.git.discardChanges(activeRepo.path, filePaths, isStaged)
              if (res.success) {
                if (snapRes.success && snapRes.snapshotId) {
                  useUndoStore.getState().pushAction({
                    type: 'DISCARD',
                    repoPath: activeRepo.path,
                    files: filePaths,
                    isStaged,
                    snapshotId: snapRes.snapshotId,
                    description:
                      filePaths.length === 1
                        ? `Discard "${filePaths[0]}"`
                        : `Discard ${filePaths.length} files`
                  })
                }

                if (isStaged) {
                  setSelectedStaged((prev) => {
                    const next = new Set(prev)
                    filePaths.forEach((p) => next.delete(p))
                    return next
                  })
                } else {
                  setSelectedUnstaged((prev) => {
                    const next = new Set(prev)
                    filePaths.forEach((p) => next.delete(p))
                    return next
                  })
                }
                await refreshRepo(activeRepo.id)
                addToast({
                  variant: 'success',
                  title: 'Changes Discarded',
                  message:
                    filePaths.length === 1
                      ? `Discarded changes in "${filePaths[0]}"`
                      : `Discarded changes in ${filePaths.length} files`
                })
              } else {
                addToast({ variant: 'error', title: 'Discard Failed', message: res.error || 'Failed to discard changes' })
              }
            } catch (err: any) {
              addToast({ variant: 'error', title: 'Discard Error', message: err.message || 'Error discarding changes' })
            }
          } else {
            setDiscardTarget(null)
          }
        }}
        onCancel={() => setDiscardTarget(null)}
      />

      {/* File right-click context menu */}
      {contextMenu && (
        <div
          className="file-context-menu"
          style={{
            top: `${Math.min(contextMenu.y, window.innerHeight - 180)}px`,
            left: `${Math.min(contextMenu.x, window.innerWidth - 220)}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {!contextMenu.isStaged ? (
            <button
              className="file-context-menu-item"
              onClick={() => {
                handleStageFile(contextMenu.filePath)
                setContextMenu(null)
              }}
            >
              <ArrowRight size={13} />
              <span>Stage changes</span>
            </button>
          ) : (
            <button
              className="file-context-menu-item"
              onClick={() => {
                handleUnstageFile(contextMenu.filePath)
                setContextMenu(null)
              }}
            >
              <ArrowLeft size={13} />
              <span>Unstage changes</span>
            </button>
          )}

          <button
            className="file-context-menu-item danger"
            onClick={() => {
              handleDiscardChanges(contextMenu.filePath, contextMenu.isStaged)
              setContextMenu(null)
            }}
          >
            <RotateCcw size={13} />
            <span>Discard changes</span>
          </button>

          <div className="file-context-menu-divider" />

          {contextMenu.isTracked && (
            <button
              className="file-context-menu-item warning"
              onClick={() => {
                handleUntrackFile(contextMenu.filePath)
                setContextMenu(null)
              }}
            >
              <EyeOff size={13} />
              <span>Untrack (keep on disk)</span>
            </button>
          )}

          <button
            className="file-context-menu-item"
            onClick={() => {
              openIgnoreDialog(contextMenu.filePath, contextMenu.isTracked)
              setContextMenu(null)
            }}
          >
            <EyeOff size={13} />
            <span>Add to .gitignore...</span>
          </button>
        </div>
      )}

      {/* Add to .gitignore dialog */}
      <AppDialog
        isOpen={ignoreModal !== null}
        title="Add to .gitignore"
        variant="info"
        icon={<EyeOff size={16} />}
        testId="add-gitignore-dialog"
        actions={[
          { label: 'Cancel', value: 'cancel', variant: 'secondary' },
          { label: 'Add to .gitignore', value: 'add', variant: 'primary', setsBusy: true }
        ]}
        onResolve={async (val) => {
          if (val === 'add') {
            await handleConfirmAddToGitignore()
          } else {
            setIgnoreModal(null)
          }
        }}
        onCancel={() => setIgnoreModal(null)}
        message={
          ignoreModal && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>
                Choose a rule pattern to add to <code>.gitignore</code> for <strong>{ignoreModal.filePath}</strong>:
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {ignoreModal.options.map((opt) => (
                  <label
                    key={opt.value}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      backgroundColor: ignoreModal.selectedPattern === opt.value ? 'var(--hover)' : 'transparent',
                      border: '1px solid',
                      borderColor: ignoreModal.selectedPattern === opt.value ? 'var(--accent)' : 'transparent'
                    }}
                  >
                    <input
                      type="radio"
                      name="ignore-pattern"
                      checked={ignoreModal.selectedPattern === opt.value}
                      onChange={() => setIgnoreModal({ ...ignoreModal, selectedPattern: opt.value })}
                      style={{ marginTop: '3px' }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)' }}>
                        <code>{opt.value}</code>
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {opt.desc}
                      </span>
                    </div>
                  </label>
                ))}

                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '6px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    backgroundColor: ignoreModal.selectedPattern === '__custom__' ? 'var(--hover)' : 'transparent',
                    border: '1px solid',
                    borderColor: ignoreModal.selectedPattern === '__custom__' ? 'var(--accent)' : 'transparent'
                  }}
                >
                  <input
                    type="radio"
                    name="ignore-pattern"
                    checked={ignoreModal.selectedPattern === '__custom__'}
                    onChange={() => setIgnoreModal({ ...ignoreModal, selectedPattern: '__custom__' })}
                    style={{ marginTop: '3px' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      Custom pattern
                    </span>
                    <input
                      type="text"
                      value={ignoreModal.customValue}
                      onChange={(e) =>
                        setIgnoreModal({
                          ...ignoreModal,
                          selectedPattern: '__custom__',
                          customValue: e.target.value
                        })
                      }
                      placeholder="e.g. *.log or /build/"
                      style={{
                        padding: '4px 8px',
                        fontSize: '12px',
                        borderRadius: '4px',
                        border: '1px solid var(--border)',
                        backgroundColor: 'var(--bg-primary)',
                        color: 'var(--text-primary)',
                        outline: 'none',
                        width: '100%',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </label>
              </div>

              {ignoreModal.isTracked && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    cursor: 'pointer',
                    marginTop: '4px'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={ignoreModal.alsoUntrack}
                    onChange={(e) => setIgnoreModal({ ...ignoreModal, alsoUntrack: e.target.checked })}
                    style={{ marginTop: '3px' }}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      Untrack from Git (keep file on disk)
                    </span>
                    <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      This file is already tracked by Git. Untracking stages its removal from repository tracking while preserving your physical file.
                    </span>
                  </div>
                </label>
              )}
            </div>
          )
        }
      />

      {/* Staging Conflict dialog */}
      <AppDialog
        isOpen={stagingConflict !== null}
        title="Tracked File Matches .gitignore"
        variant="warning"
        icon={<AlertTriangle size={16} />}
        testId="staging-conflict-dialog"
        actions={[
          { label: 'Cancel', value: 'cancel', variant: 'secondary' },
          { label: 'Force Stage', value: 'force', variant: 'secondary', setsBusy: true },
          { label: 'Untrack & Keep on Disk', value: 'untrack', variant: 'primary', setsBusy: true }
        ]}
        onResolve={async (val) => {
          if (!stagingConflict) return
          const filesToHandle = stagingConflict.files
          setStagingConflict(null)
          if (val === 'untrack') {
            await handleUntrackFile(filesToHandle)
          } else if (val === 'force') {
            if (filesToHandle.length === 1) {
              await handleStageFile(filesToHandle[0], true)
            } else {
              await handleBatchStage(true)
            }
          }
        }}
        onCancel={() => setStagingConflict(null)}
        message={
          stagingConflict && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p style={{ margin: 0, lineHeight: 1.5, fontSize: '13px' }}>
                {stagingConflict.files.length === 1 ? (
                  <>
                    <strong>{stagingConflict.files[0]}</strong> is tracked in Git history, but matches a pattern in <code>.gitignore</code>.
                  </>
                ) : (
                  <>
                    <strong>{stagingConflict.files.length} selected files</strong> match patterns in <code>.gitignore</code>, but are tracked in Git history.
                  </>
                )}
              </p>
              <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '12px', lineHeight: 1.4 }}>
                Git prevents standard staging of ignored files to avoid accidental commits. You can untrack the file to respect .gitignore without deleting your local copy, or force stage if you really intend to commit it.
              </p>
            </div>
          )
        }
      />
    </div>
  )
}
