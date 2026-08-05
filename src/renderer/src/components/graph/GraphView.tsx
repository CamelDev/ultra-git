import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Globe, ArrowDown, ArrowUp, AlertTriangle, ChevronDown, Settings, X, GitBranch, ArrowRight, RotateCcw, Layers, Tag, RefreshCw, Search } from 'lucide-react'
import { useRepoStore } from '../../store/useRepoStore'
import { IdentitiesModal } from '../details/IdentitiesModal'
import { AppDialog, AppDialogAction } from '../dialogs/AppDialog'
import { useToaster } from '../toaster/ToasterContext'

interface GraphViewProps {
  onOpenConflictResolver?: () => void
}

const normalizePath = (p: string) => (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

const extractTags = (refs: string | undefined): string[] => {
  if (!refs) return [];
  return refs
    .split(',')
    .map(ref => ref.trim())
    .filter(ref => ref.startsWith('tag: '))
    .map(ref => ref.substring(5));
};

/** User's choice returned by the Smart Pull dialog. */
interface SmartPullChoice {
  action: 'pull' | 'cancel'
  mode: 'direct' | 'stash' | 'commit'
  strategy: PullStrategy
  includeUntracked: boolean
  prune: boolean
  commitMessage?: string
}

const GraphView: React.FC<GraphViewProps> = ({ onOpenConflictResolver }) => {
  const { getActiveRepo, selectedCommitHash, setSelectedCommitHash, refreshRepo, identities, setRepoIdentity, previewBranch, previewCommits, previewCommitLimit, clearBranchPreview, loadMoreBranchCommits, isLoadingPreview } = useRepoStore()
  const { addToast } = useToaster()
  const activeRepo = getActiveRepo()
  const isPreviewing = !!previewBranch;
  const commits = isPreviewing ? previewCommits : (activeRepo?.commits || []);
  const mainWtPath = activeRepo?.worktrees?.[0]?.path;
  const isCurrentRepoWorktree = mainWtPath ? normalizePath(activeRepo.path) !== normalizePath(mainWtPath) : false;
  const containerRef = useRef<HTMLDivElement>(null)

  const [isFetching, setIsFetching] = useState(false)
  const [isPulling, setIsPulling] = useState(false)
  const [isPushing, setIsPushing] = useState(false)
  const [showPushDropdown, setShowPushDropdown] = useState(false)
  const [identitiesModalOpen, setIdentitiesModalOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const handleFetch = async () => {
    if (!activeRepo || isFetching || isPulling || isPushing) return

    setIsFetching(true)
    try {
      const res = await window.api.git.fetch(activeRepo.path)
      if (res && !res.success) {
        addToast({ title: 'Fetch Failed', message: res.error || 'Failed to fetch from remote repository', type: 'error' })
      } else {
        await refreshRepo(activeRepo.id)
        addToast({ title: 'Fetch Successful', message: 'Remote tracking branches have been updated.', type: 'success' })
      }
    } catch (err: any) {
      addToast({ title: 'Fetch Error', message: err.message || 'An error occurred during fetch', type: 'error' })
    } finally {
      setIsFetching(false)
    }
  }

  const [isRemoteModalOpen, setIsRemoteModalOpen] = useState(false)
  const [remoteName, setRemoteName] = useState('origin')
  const [remoteUrl, setRemoteUrl] = useState('')
  const [remoteBranch, setRemoteBranch] = useState('')
  const [remoteError, setRemoteError] = useState('')
  const [makeRemotePublic, setMakeRemotePublic] = useState(false)
  const [isCreatingRemote, setIsCreatingRemote] = useState(false)

  const [isUpstreamModalOpen, setIsUpstreamModalOpen] = useState(false)
  const [upstreamBranch, setUpstreamBranch] = useState('')
  const [upstreamRemote, setUpstreamRemote] = useState('origin')
  const [upstreamError, setUpstreamError] = useState('')

  // Branch creation from commit state
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [branchStartPoint, setBranchStartPoint] = useState('')

  // Git Reset state
  const [isResetModalOpen, setIsResetModalOpen] = useState(false)
  const [resetTargetCommit, setResetTargetCommit] = useState<any>(null)
  const [resetMode, setResetMode] = useState<'soft' | 'hard'>('soft')
  const [isResetting, setIsResetting] = useState(false)
  const [resetError, setResetError] = useState('')

  // Git Squash state
  const [isSquashModalOpen, setIsSquashModalOpen] = useState(false)
  const [squashTargetCommit, setSquashTargetCommit] = useState<any>(null)
  const [squashMessage, setSquashMessage] = useState('')
  const [isSquashing, setIsSquashing] = useState(false)
  const [squashError, setSquashError] = useState('')

  // Git Tag state
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [tagTargetCommit, setTagTargetCommit] = useState<any>(null)
  const [newTagName, setNewTagName] = useState('')
  const [tagErrorMessage, setTagErrorMessage] = useState('')

  // Push Force Dialog State
  const [pushForceDialog, setPushForceDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    variant: 'info' | 'success' | 'warning' | 'error'
    actions: AppDialogAction[]
    resolve?: (value: string) => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    variant: 'warning',
    actions: []
  })

  const showCustomPushDialog = (
    title: string,
    message: string,
    variant: 'info' | 'success' | 'warning' | 'error',
    actions: AppDialogAction[]
  ): Promise<string> => {
    return new Promise((resolve) => {
      setPushForceDialog({
        isOpen: true,
        title,
        message,
        variant,
        actions,
        resolve: (val) => {
          setPushForceDialog((prev) => ({ ...prev, isOpen: false }))
          resolve(val)
        }
      })
    })
  }

  // Smart Pull dialog state (see docs/smart-pull-design.md)
  const [smartPullDialog, setSmartPullDialog] = useState<{
    isOpen: boolean
    plan: PullPlan | null
    resolve?: (choice: SmartPullChoice) => void
  }>({ isOpen: false, plan: null })

  // Smart Pull dialog form state (reset every time the dialog opens)
  const [pullMode, setPullMode] = useState<'stash' | 'commit'>('stash')
  const [pullStrategy, setPullStrategy] = useState<PullStrategy>('merge')
  const [pullIncludeUntracked, setPullIncludeUntracked] = useState(true)
  const [pullPrune, setPullPrune] = useState(true)
  const [pullCommitMessage, setPullCommitMessage] = useState('')

  // Pull result dialog state — supports action buttons (Resolve/Abort/Later, retries)
  const [pullResultDialog, setPullResultDialog] = useState<{
    isOpen: boolean
    variant: 'info' | 'success' | 'warning' | 'error'
    title: string
    message: string
    actions?: AppDialogAction[]
    resolve?: (value: string) => void
  }>({ isOpen: false, variant: 'info', title: '', message: '' })

  const showSmartPullDialog = (plan: PullPlan): Promise<SmartPullChoice> => {
    return new Promise((resolve) => {
      setPullMode('stash')
      setPullStrategy('merge')
      setPullIncludeUntracked(true)
      setPullPrune(true)
      setPullCommitMessage('')
      setSmartPullDialog({
        isOpen: true,
        plan,
        resolve: (choice) => {
          setSmartPullDialog((prev) => ({ ...prev, isOpen: false }))
          resolve(choice)
        }
      })
    })
  }

  const showPullResultDialog = (
    title: string,
    message: string,
    variant: 'info' | 'success' | 'warning' | 'error',
    actions?: AppDialogAction[]
  ): Promise<string> => {
    return new Promise((resolve) => {
      setPullResultDialog({
        isOpen: true,
        title,
        message,
        variant,
        actions,
        resolve: (value) => {
          setPullResultDialog((prev) => ({ ...prev, isOpen: false }))
          resolve(value)
        }
      })
    })
  }

  // Close Smart Pull dialog on Escape
  useEffect(() => {
    if (!smartPullDialog.isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (smartPullDialog.resolve) {
          smartPullDialog.resolve({ action: 'cancel', mode: 'direct', strategy: 'merge', includeUntracked: true, prune: true })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [smartPullDialog.isOpen, smartPullDialog.resolve])

  // Commit search state
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  // Commit list column widths (author and date columns; message takes remaining flex space)
  const [statusWidth, setStatusWidth] = useState(() => {
    const saved = localStorage.getItem('commit-col-status-width')
    return saved ? parseInt(saved, 10) : 70
  })
  const [authorWidth, setAuthorWidth] = useState(() => {
    const saved = localStorage.getItem('commit-col-author-width')
    return saved ? parseInt(saved, 10) : 160
  })
  const [dateWidth, setDateWidth] = useState(() => {
    const saved = localStorage.getItem('commit-col-date-width')
    return saved ? parseInt(saved, 10) : 150
  })
  const statusWidthRef = useRef(statusWidth)
  const authorWidthRef = useRef(authorWidth)
  const dateWidthRef = useRef(dateWidth)
  useEffect(() => { statusWidthRef.current = statusWidth }, [statusWidth])
  useEffect(() => { authorWidthRef.current = authorWidth }, [authorWidth])
  useEffect(() => { dateWidthRef.current = dateWidth }, [dateWidth])
  useEffect(() => { localStorage.setItem('commit-col-status-width', statusWidth.toString()) }, [statusWidth])
  useEffect(() => { localStorage.setItem('commit-col-author-width', authorWidth.toString()) }, [authorWidth])
  useEffect(() => { localStorage.setItem('commit-col-date-width', dateWidth.toString()) }, [dateWidth])

  const startStatusResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = statusWidthRef.current
    const doResize = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX // dragging right = wider status
      const newWidth = Math.max(50, Math.min(160, startWidth + delta))
      setStatusWidth(newWidth)
    }
    const stopResize = () => {
      document.removeEventListener('pointermove', doResize)
      document.removeEventListener('pointerup', stopResize)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('pointermove', doResize)
    document.addEventListener('pointerup', stopResize)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const startAuthorResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = authorWidthRef.current
    const doResize = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX // dragging left = wider author
      const newWidth = Math.max(80, Math.min(320, startWidth + delta))
      setAuthorWidth(newWidth)
    }
    const stopResize = () => {
      document.removeEventListener('pointermove', doResize)
      document.removeEventListener('pointerup', stopResize)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('pointermove', doResize)
    document.addEventListener('pointerup', stopResize)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const startDateResize = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = dateWidthRef.current
    const doResize = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX // dragging left = wider date
      const newWidth = Math.max(80, Math.min(280, startWidth + delta))
      setDateWidth(newWidth)
    }
    const stopResize = () => {
      document.removeEventListener('pointermove', doResize)
      document.removeEventListener('pointerup', stopResize)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    document.addEventListener('pointermove', doResize)
    document.addEventListener('pointerup', stopResize)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  // Reset search when repo changes
  useEffect(() => {
    setSearchQuery('')
  }, [activeRepo?.id])

  const filteredCommits = commits.filter((c) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    const hashMatches = c.hash.toLowerCase().includes(query)
    const msgMatches = c.message.toLowerCase().includes(query)
    const authorMatches = c.author_name.toLowerCase().includes(query) || (c.author_email && c.author_email.toLowerCase().includes(query))
    const refsMatches = c.refs ? c.refs.toLowerCase().includes(query) : false
    return hashMatches || msgMatches || authorMatches || refsMatches
  })

  const commitsToSquash = squashTargetCommit 
    ? commits.slice(0, commits.findIndex(c => c.hash === squashTargetCommit.hash) + 1)
    : []

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowPushDropdown(false)
      }
    }
    if (showPushDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showPushDropdown])

  // Global keydown event listener for navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't navigate if user is focusing an input, textarea or contenteditable element
      const activeEl = document.activeElement
      if (activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      )) {
        return
      }

      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
        return
      }

      if (filteredCommits.length === 0) return

      // Find current selected index
      const currentIndex = filteredCommits.findIndex((c) => c.hash === selectedCommitHash)
      let nextIndex = currentIndex

      if (e.key === 'ArrowUp') {
        if (currentIndex === -1) {
          nextIndex = 0
        } else {
          nextIndex = Math.max(0, currentIndex - 1)
        }
      } else if (e.key === 'ArrowDown') {
        if (currentIndex === -1) {
          nextIndex = 0
        } else {
          nextIndex = Math.min(filteredCommits.length - 1, currentIndex + 1)
        }
      }

      if (nextIndex !== -1 && nextIndex !== currentIndex) {
        e.preventDefault()
        setSelectedCommitHash(filteredCommits[nextIndex].hash)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [filteredCommits, selectedCommitHash, setSelectedCommitHash])

  // Scroll active commit into view
  useEffect(() => {
    if (selectedCommitHash && containerRef.current) {
      const activeEl = containerRef.current.querySelector('.commit-item.active') as HTMLElement
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedCommitHash, filteredCommits])

  /** Maps a typed pull error code to a friendly message (raw git output as fallback). */
  const friendlyPullError = (result: PullResult): string => {
    switch (result.errorCode) {
      case 'NO_UPSTREAM':
        return 'The current branch is not tracking any remote branch. Set an upstream branch first.'
      case 'UNRELATED_HISTORIES':
        return 'The remote repository has a completely different history than your local repository (unrelated histories). The merge was refused.'
      case 'DIRTY_OVERLAP':
        return 'Your local uncommitted changes would be overwritten by the incoming changes. Please stash or commit them first.'
      case 'AUTH':
        return 'Authentication with the remote repository failed. Check the credentials of the identity configured for this repository.'
      case 'NETWORK':
        return 'Could not connect to the remote repository. Check your network connection and try again.'
      case 'STASH_FAILED':
        return `Failed to stash your local changes before pulling. The pull was not started.\n\n${result.detail || ''}`
      default:
        return result.detail || 'Failed to pull from remote repository.'
    }
  }

  /** Aborts an in-progress merge/rebase left behind by a conflicted pull. */
  const handlePullAbort = async (strategy?: PullStrategy) => {
    if (!activeRepo) return
    try {
      const res = strategy === 'rebase'
        ? await window.api.git.abortRebase(activeRepo.path)
        : await window.api.git.abortMerge(activeRepo.path)
      if (res.success) {
        addToast({
          variant: 'info',
          title: 'Pull Aborted',
          message: 'The pull was rolled back. Your repository is back to its pre-pull state.'
        })
      } else {
        addToast({ variant: 'error', title: 'Abort Failed', message: res.error || 'Failed to abort the operation.' })
      }
    } catch (err: any) {
      addToast({ variant: 'error', title: 'Abort Failed', message: err.message || 'Failed to abort the operation.' })
    } finally {
      await refreshRepo(activeRepo.id)
    }
  }

  /** Routes a typed PullResult to the appropriate UX (toast / dialog / resolver / abort). */
  const presentPullResult = async (result: PullResult, behindCount: number, upstream: string, stashedAndReapplied: boolean, prune: boolean): Promise<void> => {
    if (!activeRepo) return
    switch (result.status) {
      case 'up-to-date':
        addToast({ variant: 'info', title: 'Already Up To Date', message: `No new changes on ${upstream}.` })
        break
      case 'success':
        addToast({
          variant: 'success',
          title: 'Pull Successful',
          message: stashedAndReapplied
            ? `Pulled ${behindCount} commit(s) from ${upstream} and re-applied your uncommitted changes.`
            : `Pulled ${behindCount} commit(s) from ${upstream}.`
        })
        break
      case 'merge-conflicts': {
        const stashNote = result.stashedChanges
          ? '\n\nYour uncommitted changes were stashed beforehand and are safe in the Stashes panel — re-apply them after resolving.'
          : ''
        const action = await showPullResultDialog(
          'Merge Conflicts Detected',
          `Pull stopped with conflicts in ${result.conflictedFiles?.length ?? 0} file(s). Resolve them and commit to complete the pull, or abort to roll back to the pre-pull state.${stashNote}`,
          'warning',
          [
            { label: 'Resolve Conflicts', value: 'resolve', variant: 'primary' },
            { label: 'Abort Pull', value: 'abort', variant: 'danger' },
            { label: 'Later', value: 'later', variant: 'secondary' }
          ]
        )
        if (action === 'resolve' && onOpenConflictResolver) onOpenConflictResolver()
        else if (action === 'abort') await handlePullAbort(result.strategy)
        break
      }
      case 'stash-pop-conflicts': {
        const conflictCount = result.conflictedFiles?.length ?? 0
        const what = conflictCount > 0
          ? `caused conflicts in ${conflictCount} file(s)`
          : 'could not be fully re-applied (some stashed files now exist upstream)'
        const action = await showPullResultDialog(
          'Changes Re-applied With Conflicts',
          `The pull itself succeeded, but re-applying your uncommitted changes ${what}.\n\nNothing is lost — your stash (${result.stashRef || 'stash@{0}'}) was kept and is listed in the Stashes panel. Resolve the conflicts, then drop the stash.`,
          'warning',
          [
            { label: 'Resolve Conflicts', value: 'resolve', variant: 'primary' },
            { label: 'Later', value: 'later', variant: 'secondary' }
          ]
        )
        if (action === 'resolve' && onOpenConflictResolver) onOpenConflictResolver()
        break
      }
      case 'failed': {
        if (result.errorCode === 'FF_ONLY_DIVERGED') {
          const action = await showPullResultDialog(
            'Fast-Forward Not Possible',
            'Your local branch has diverged from the remote, so it cannot be fast-forwarded.\n\nPull again creating a merge commit instead?',
            'warning',
            [
              { label: 'Pull with Merge', value: 'merge', variant: 'primary' },
              { label: 'Cancel', value: 'cancel', variant: 'secondary' }
            ]
          )
          if (action === 'merge') {
            const retryRes = await window.api.git.smartPull(activeRepo.path, { strategy: 'merge', stash: false, prune })
            await refreshRepo(activeRepo.id)
            if (retryRes.success && retryRes.data) {
              await presentPullResult(retryRes.data, behindCount, upstream, false, prune)
            } else {
              await showPullResultDialog('Pull Failed', retryRes.error || 'Failed to pull from remote repository.', 'error')
            }
          }
        } else {
          await showPullResultDialog('Pull Failed', friendlyPullError(result), 'error')
        }
        break
      }
    }
  }

  const handlePull = async () => {
    if (!activeRepo || isPulling || isPushing || smartPullDialog.isOpen || pullResultDialog.isOpen) return

    setIsPulling(true)
    try {
      // Phase 1: preflight — fetch + state/overlap analysis
      const preRes = await window.api.git.pullPreflight(activeRepo.path)
      if (!preRes.success || !preRes.data) {
        setIsPulling(false)
        await showPullResultDialog('Pull Failed', preRes.error || 'Failed to analyze the repository state before pulling.', 'error')
        return
      }
      const plan = preRes.data

      // Blockers: states in which pulling is impossible or unsafe
      if (!plan.ok) {
        setIsPulling(false)
        switch (plan.blocker) {
          case 'NO_UPSTREAM': {
            const action = await showPullResultDialog(
              'No Upstream Branch',
              `The current branch "${activeRepo.branch}" is not tracking any remote branch, so there is nothing to pull from.\n\nSet an upstream branch to enable pulling.`,
              'warning',
              [
                { label: 'Set Upstream...', value: 'set-upstream', variant: 'primary' },
                { label: 'Cancel', value: 'cancel', variant: 'secondary' }
              ]
            )
            if (action === 'set-upstream') {
              let initialRemote = 'origin'
              const initialBranch = activeRepo.branch || 'main'
              try {
                const remotesRes = await window.api.git.getRemotes(activeRepo.path)
                if (remotesRes.success && remotesRes.data && remotesRes.data.length > 0) {
                  initialRemote = remotesRes.data[0].name
                }
              } catch (e) {
                console.error('Failed to load remotes', e)
              }
              setUpstreamRemote(initialRemote)
              setUpstreamBranch(initialBranch)
              setUpstreamError('')
              setIsUpstreamModalOpen(true)
            }
            return
          }
          case 'MERGE_IN_PROGRESS':
            await showPullResultDialog('Merge In Progress', 'A merge is already in progress in this repository. Resolve it (or abort it) before pulling new changes.', 'warning')
            return
          case 'REBASE_IN_PROGRESS':
            await showPullResultDialog('Rebase In Progress', 'A rebase is already in progress in this repository. Finish it (or abort it) before pulling new changes.', 'warning')
            return
          case 'CHERRY_PICK_IN_PROGRESS':
            await showPullResultDialog('Cherry-pick In Progress', 'A cherry-pick is already in progress in this repository. Finish it (or abort it) before pulling new changes.', 'warning')
            return
          case 'FETCH_FAILED':
            await showPullResultDialog('Fetch Failed', `Could not reach the remote repository to check for new changes.\n\n${plan.detail || ''}`, 'error')
            return
          default:
            await showPullResultDialog('Pull Failed', 'The repository is not in a state that allows pulling.', 'error')
            return
        }
      }

      // Nothing to pull
      if (plan.behind === 0) {
        addToast({ variant: 'info', title: 'Already Up To Date', message: `Your branch is up to date with ${plan.upstream}.` })
        await refreshRepo(activeRepo.id)
        return
      }

      // Phase 2: state-aware dialog
      const choice = await showSmartPullDialog(plan)
      if (choice.action !== 'pull') return

      // Commit-first path: commit staged changes before pulling
      if (choice.mode === 'commit' && choice.commitMessage) {
        const commitRes = await window.api.git.commit(activeRepo.path, choice.commitMessage)
        if (!commitRes.success) {
          setIsPulling(false)
          await showPullResultDialog('Commit Failed', `${commitRes.error || 'Failed to commit staged changes.'}\n\nThe pull was not started.`, 'error')
          return
        }
      }

      // Phase 3: orchestrated pull (optional app-managed autostash)
      const res = await window.api.git.smartPull(activeRepo.path, {
        strategy: choice.strategy,
        stash: choice.mode !== 'direct',
        stashIncludeUntracked: choice.includeUntracked,
        prune: choice.prune
      })
      await refreshRepo(activeRepo.id)
      // The git work is done — release the busy state before presenting
      // (potentially long-lived) result dialogs.
      setIsPulling(false)
      if (!res.success || !res.data) {
        await showPullResultDialog('Pull Failed', res.error || 'Failed to pull from remote repository.', 'error')
        return
      }
      await presentPullResult(res.data, plan.behind, plan.upstream || 'the remote', choice.mode !== 'direct', choice.prune)
    } catch (err: any) {
      setIsPulling(false)
      await showPullResultDialog('Error', err.message || 'An unexpected error occurred during pull.', 'error')
    } finally {
      setIsPulling(false)
    }
  }

  const parseGitUrl = (urlStr: string) => {
    const cleanUrl = urlStr.trim().replace(/\.git\/?$/, '')
    
    let provider: 'github' | 'gitlab' | 'bitbucket' | null = null
    if (cleanUrl.includes('github.com')) provider = 'github'
    else if (cleanUrl.includes('gitlab.com')) provider = 'gitlab'
    else if (cleanUrl.includes('bitbucket.org')) provider = 'bitbucket'
    
    let owner = ''
    let repo = ''
    
    if (cleanUrl.includes('://')) {
      try {
        const parsed = new URL(cleanUrl)
        const parts = parsed.pathname.split('/').filter(Boolean)
        if (parts.length >= 2) {
          owner = parts[parts.length - 2]
          repo = parts[parts.length - 1]
        }
      } catch (e) {
        // fallback
      }
    } else if (cleanUrl.includes('@')) {
      const match = cleanUrl.match(/:(.+)$/)
      if (match && match[1]) {
        const parts = match[1].split('/').filter(Boolean)
        if (parts.length >= 2) {
          owner = parts[parts.length - 2]
          repo = parts[parts.length - 1]
        }
      }
    }
    
    return { provider, owner, repo }
  }

  const handleCreateRemoteAndPush = async () => {
    const remote = remoteName.trim()
    const url = remoteUrl.trim()
    const branch = remoteBranch.trim()
    
    if (!remote || !branch || !url || !activeRepo) return

    const parsed = parseGitUrl(url)
    if (!parsed.provider || !parsed.repo) {
      setRemoteError('Could not detect a valid GitHub/GitLab URL structure. Please create the repository manually.')
      return
    }

    const activeIdentity = identities.find(id => id.id === activeRepo.identityId)
    if (!activeIdentity || !activeIdentity.personalAccessToken) {
      setRemoteError('No Personal Access Token configured for the current active Identity.')
      return
    }

    setIsCreatingRemote(true)
    setRemoteError('')
    try {
      // 1. Create remote repository using API
      const createRes = await window.api.git.createRemoteRepo(
        parsed.provider,
        activeIdentity.personalAccessToken,
        parsed.repo,
        makeRemotePublic
      )

      if (!createRes.success) {
        setRemoteError(createRes.error || `Failed to create remote repository on ${parsed.provider}.`)
        setIsCreatingRemote(false)
        return
      }

      // 2. Add remote to local repo if it doesn't already exist
      const remotesRes = await window.api.git.getRemotes(activeRepo.path)
      let remoteExists = false
      if (remotesRes.success && remotesRes.data) {
        remoteExists = remotesRes.data.some(r => r.name === remote)
      }

      if (!remoteExists) {
        const addRes = await window.api.git.addRemote(activeRepo.path, remote, url)
        if (!addRes.success) {
          setRemoteError(addRes.error || 'Failed to add remote repository to local config.')
          setIsCreatingRemote(false)
          return
        }
      }

      // 3. Perform push with upstream option
      const pushRes = await window.api.git.push(activeRepo.path, false, remote, branch, true)
      await refreshRepo(activeRepo.id)
      
      if (pushRes.success) {
        setIsRemoteModalOpen(false)
        setRemoteUrl('')
        setRemoteError('')
      } else {
        setRemoteError(pushRes.error || 'Repository created, but failed to push.')
      }
    } catch (err: any) {
      setRemoteError(err.message || 'An unexpected error occurred.')
    } finally {
      setIsCreatingRemote(false)
    }
  }

  const handleSetRemoteSubmit = async () => {
    const remote = remoteName.trim()
    const url = remoteUrl.trim()
    const branch = remoteBranch.trim()
    
    if (!remote || !branch || !activeRepo) return

    setIsPushing(true)
    setRemoteError('')
    try {
      // 1. If remote URL is entered, configure it
      if (url) {
        const remotesRes = await window.api.git.getRemotes(activeRepo.path)
        if (remotesRes.success && remotesRes.data) {
          const exists = remotesRes.data.some(r => r.name === remote)
          if (!exists) {
            const addRes = await window.api.git.addRemote(activeRepo.path, remote, url)
            if (!addRes.success) {
              setRemoteError(addRes.error || 'Failed to add remote.')
              setIsPushing(false)
              return
            }
          }
        } else if (remotesRes.success) {
          const addRes = await window.api.git.addRemote(activeRepo.path, remote, url)
          if (!addRes.success) {
            setRemoteError(addRes.error || 'Failed to add remote.')
            setIsPushing(false)
            return
          }
        } else {
          setRemoteError(remotesRes.error || 'Failed to read remotes.')
          setIsPushing(false)
          return
        }
      } else {
        const remotesRes = await window.api.git.getRemotes(activeRepo.path)
        if (remotesRes.success && remotesRes.data) {
          const exists = remotesRes.data.some(r => r.name === remote)
          if (!exists) {
            setRemoteError(`Remote "${remote}" does not exist. Please specify a Remote URL to add it.`)
            setIsPushing(false)
            return
          }
        }
      }

      // 2. Perform push with upstream option
      const pushRes = await window.api.git.push(activeRepo.path, false, remote, `${activeRepo.branch}:${branch}`, true)
      await refreshRepo(activeRepo.id)
      
      if (pushRes.success) {
        setIsRemoteModalOpen(false)
        setRemoteUrl('')
        setRemoteError('')
      } else {
        setRemoteError(pushRes.error || 'Failed to push to remote repository.')
      }
    } catch (err: any) {
      setRemoteError(err.message || 'An unexpected error occurred.')
    } finally {
      setIsPushing(false)
    }
  }

  const handleSetUpstreamSubmit = async () => {
    const branch = upstreamBranch.trim()
    if (!branch || !activeRepo) return

    setIsPushing(true)
    setUpstreamError('')
    try {
      const pushRes = await window.api.git.push(activeRepo.path, false, upstreamRemote, `${activeRepo.branch}:${branch}`, true)
      await refreshRepo(activeRepo.id)
      
      if (pushRes.success) {
        setIsUpstreamModalOpen(false)
        setUpstreamError('')
      } else {
        setUpstreamError(pushRes.error || 'Failed to push to remote repository.')
      }
    } catch (err: any) {
      setUpstreamError(err.message || 'An unexpected error occurred.')
    } finally {
      setIsPushing(false)
    }
  }

  const handleBranchModalSubmit = async () => {
    const name = newBranchName.trim()
    if (!name || !activeRepo || !branchStartPoint) return
    try {
      const res = await window.api.git.createBranch(activeRepo.path, name, branchStartPoint)
      if (res.success) {
        setIsBranchModalOpen(false)
        setNewBranchName('')
        setErrorMessage('')
        await refreshRepo(activeRepo.id)
      } else {
        setErrorMessage(res.error || 'Failed to create branch.')
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred.')
    }
  }

  const handleResetSubmit = async () => {
    if (!activeRepo || !resetTargetCommit) return
    setIsResetting(true)
    setResetError('')
    try {
      const res = await window.api.git.resetToCommit(activeRepo.path, resetTargetCommit.hash, resetMode)
      if (res.success) {
        setIsResetModalOpen(false)
        setResetTargetCommit(null)
        await refreshRepo(activeRepo.id)
      } else {
        setResetError(res.error || 'Failed to reset repository.')
      }
    } catch (err: any) {
      setResetError(err.message || 'An error occurred during reset.')
    } finally {
      setIsResetting(false)
    }
  }

  const handleSquashSubmit = async () => {
    if (!activeRepo || !squashTargetCommit) return
    setIsSquashing(true)
    setSquashError('')
    try {
      const res = await window.api.git.squashCommits(activeRepo.path, squashTargetCommit.hash, squashMessage)
      if (res.success) {
        setIsSquashModalOpen(false)
        setSquashTargetCommit(null)
        setSquashMessage('')
        await refreshRepo(activeRepo.id)
      } else {
        setSquashError(res.error || 'Failed to squash commits.')
      }
    } catch (err: any) {
      setSquashError(err.message || 'An error occurred during squash.')
    } finally {
      setIsSquashing(false)
    }
  }

  const handleCreateTagSubmit = async () => {
    const name = newTagName.trim()
    if (!name || !activeRepo || !tagTargetCommit) return
    try {
      const res = await window.api.git.createTag(activeRepo.path, name, tagTargetCommit.hash)
      if (res.success) {
        setIsTagModalOpen(false)
        setNewTagName('')
        setTagErrorMessage('')
        await refreshRepo(activeRepo.id)
      } else {
        setTagErrorMessage(res.error || 'Failed to create tag.')
      }
    } catch (err: any) {
      setTagErrorMessage(err.message || 'An error occurred.')
    }
  }

  useEffect(() => {
    if (!isTagModalOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsTagModalOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isTagModalOpen])

  const handlePush = async (force?: boolean) => {
    if (!activeRepo || isPulling || isPushing) return

    // 1. Beforehand check
    if (!force && activeRepo.status?.behind > 0) {
      const response = await showCustomPushDialog(
        'Remote Changes Detected',
        `Your local branch is behind its remote counterpart by ${activeRepo.status.behind} commit(s). A standard push will be rejected.\n\nWould you like to Pull first or Force Push (overwriting remote changes)?`,
        'warning',
        [
          { label: 'Cancel', value: 'cancel', variant: 'secondary' },
          { label: 'Pull', value: 'pull', variant: 'primary' },
          { label: 'Force Push', value: 'force', variant: 'danger' }
        ]
      )
      if (response === 'pull') {
        await handlePull()
        return
      } else if (response === 'force') {
        await handlePush(true)
        return
      }
      return // Cancel or unknown response
    }

    setIsPushing(true)
    try {
      const res = await window.api.git.push(activeRepo.path, force)
      await refreshRepo(activeRepo.id)
      if (res.success) {
        addToast({
          variant: 'success',
          title: force ? 'Force Push Successful' : 'Push Successful',
          message: force
            ? 'Local changes have been force-pushed to the remote repository.'
            : 'Local commits have been pushed to the remote repository.'
        })
      } else {
        const errorMsg = res.error || ''
        const isRejected = errorMsg.includes('[rejected]') || errorMsg.includes('non-fast-forward') || errorMsg.includes('behind its remote counterpart')
        
        if (isRejected && !force) {
          const response = await showCustomPushDialog(
            'Push Rejected',
            'The push was rejected because the remote branch contains changes that you do not have locally.\n\nWould you like to Force Push (overwriting remote changes)?',
            'warning',
            [
              { label: 'Cancel', value: 'cancel', variant: 'secondary' },
              { label: 'Force Push', value: 'force', variant: 'danger' }
            ]
          )
          if (response === 'force') {
            setIsPushing(false)
            await handlePush(true)
            return
          }
        }

        const noUpstream = errorMsg.includes('no upstream branch') || 
                           errorMsg.includes('No configured push destination') ||
                           errorMsg.includes('no configured upstream') ||
                           (errorMsg.includes('fatal:') && errorMsg.includes('upstream'))

        if (noUpstream) {
          setRemoteName('origin')
          setRemoteBranch(activeRepo.branch || 'main')
          
          try {
            const remotesRes = await window.api.git.getRemotes(activeRepo.path)
            if (remotesRes.success && remotesRes.data && remotesRes.data.length > 0) {
              setRemoteName(remotesRes.data[0].name)
              setRemoteUrl(remotesRes.data[0].refs.push || remotesRes.data[0].refs.fetch || '')
            } else {
              setRemoteUrl('')
            }
          } catch (e) {
            setRemoteUrl('')
          }
          
          setIsRemoteModalOpen(true)
          return
        }

        addToast({
          variant: 'error',
          title: force ? 'Force Push Failed' : 'Push Failed',
          message: res.error || 'Failed to push to remote repository.'
        })
      }
    } catch (err: any) {
      addToast({
        variant: 'error',
        title: 'Error',
        message: err.message || 'An unexpected error occurred during push.'
      })
    } finally {
      setIsPushing(false)
    }
  }

  return (
    <div className="git-log-panel" style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {activeRepo && (
        <div 
          className="sync-actions-panel" 
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 20px',
            backgroundColor: 'var(--bg-secondary)',
            borderBottom: '1px solid var(--border)',
            gap: '12px',
            flexShrink: 0
          }}
          data-testid="sync-actions-panel"
        >
          <button
            className="btn-secondary"
            onClick={handleFetch}
            disabled={isFetching || isPulling || isPushing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              opacity: (isFetching || isPulling || isPushing) ? 0.6 : 1,
              cursor: (isFetching || isPulling || isPushing) ? 'not-allowed' : 'pointer',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: 'rgba(139, 92, 246, 0.15)',
              border: '1px solid rgba(139, 92, 246, 0.4)',
              color: '#a78bfa'
            }}
            data-testid="fetch-btn"
            data-tooltip="Fetch updates and remote branches from remote repository"
          >
            <RefreshCw size={14} className={isFetching ? 'spin-animation' : ''} style={{ color: '#a78bfa' }} />
            <span>{isFetching ? 'Fetching...' : 'Fetch'}</span>
          </button>

          <button
            className="btn-secondary"
            onClick={handlePull}
            disabled={isFetching || isPulling || isPushing}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              opacity: (isPulling || isPushing) ? 0.6 : 1,
              cursor: (isPulling || isPushing) ? 'not-allowed' : 'pointer',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#60a5fa'
            }}
            data-testid="pull-btn"
            data-tooltip="Pull changes from remote repository"
          >
            <ArrowDown size={14} className={isPulling ? 'spin-animation' : ''} style={{ color: '#60a5fa' }} />
            <span>{isPulling ? 'Pulling...' : 'Pull'}</span>
            {activeRepo.status?.behind > 0 && (
              <span 
                style={{
                  backgroundColor: 'rgba(251, 191, 36, 0.2)',
                  color: '#fbbf24',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  fontSize: '10px',
                  fontWeight: 700
                }}
                data-testid="pull-behind-count"
              >
                {activeRepo.status.behind}
              </span>
            )}
          </button>

          <div ref={dropdownRef} style={{ display: 'inline-flex', position: 'relative', alignItems: 'stretch' }}>
            <button
              className="btn-secondary"
              onClick={() => handlePush(false)}
              disabled={isFetching || isPulling || isPushing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                opacity: (isFetching || isPulling || isPushing) ? 0.6 : 1,
                cursor: (isFetching || isPulling || isPushing) ? 'not-allowed' : 'pointer',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                borderTopRightRadius: 0,
                borderBottomRightRadius: 0,
                borderRight: 'none',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                borderLeft: '1px solid rgba(16, 185, 129, 0.4)',
                borderTop: '1px solid rgba(16, 185, 129, 0.4)',
                borderBottom: '1px solid rgba(16, 185, 129, 0.4)',
                color: '#34d399'
              }}
              data-testid="push-btn"
              data-tooltip="Push changes to remote repository"
            >
              <ArrowUp size={14} className={isPushing ? 'spin-animation' : ''} style={{ color: '#34d399' }} />
              <span>{isPushing ? 'Pushing...' : 'Push'}</span>
              {activeRepo.status?.ahead > 0 && (
                <span 
                  style={{
                    backgroundColor: 'rgba(52, 211, 153, 0.2)',
                    color: '#34d399',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    fontSize: '10px',
                    fontWeight: 700
                  }}
                  data-testid="push-ahead-count"
                >
                  {activeRepo.status.ahead}
                </span>
              )}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setShowPushDropdown(!showPushDropdown)}
              disabled={isPulling || isPushing}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 6px',
                opacity: (isPulling || isPushing) ? 0.6 : 1,
                cursor: (isPulling || isPushing) ? 'not-allowed' : 'pointer',
                borderTopLeftRadius: 0,
                borderBottomLeftRadius: 0,
                borderLeft: '1px solid rgba(16, 185, 129, 0.4)',
                borderTop: '1px solid rgba(16, 185, 129, 0.4)',
                borderBottom: '1px solid rgba(16, 185, 129, 0.4)',
                borderRight: '1px solid rgba(16, 185, 129, 0.4)',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                color: '#34d399'
              }}
              data-testid="push-dropdown-btn"
              data-tooltip="Push Options"
            >
              <ChevronDown size={14} />
            </button>
            {showPushDropdown && (
              <div 
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  backgroundColor: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderRadius: '4px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                  zIndex: 100,
                  minWidth: '120px',
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
                data-testid="push-dropdown-menu"
              >
                <button
                  onClick={() => {
                    setShowPushDropdown(false)
                    handlePush(false)
                  }}
                  style={{
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: 600,
                    width: '100%'
                  }}
                  className="dropdown-item-hover"
                  data-testid="push-option"
                  data-tooltip="Push commits to tracking remote branch"
                >
                  Push
                </button>
                <button
                  onClick={() => {
                    setShowPushDropdown(false)
                    handlePush(true)
                  }}
                  style={{
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: 600,
                    width: '100%'
                  }}
                  className="dropdown-item-hover"
                  data-testid="force-push-option"
                  data-tooltip="Force push commits to tracking remote branch (overwrite remote history)"
                >
                  Force Push
                </button>
                <button
                  onClick={async () => {
                    setShowPushDropdown(false)
                    let initialRemote = 'origin'
                    let initialBranch = activeRepo.branch || 'main'
                    
                    const tracking = activeRepo.status?.tracking
                    if (tracking) {
                      const slashIndex = tracking.indexOf('/')
                      if (slashIndex !== -1) {
                        initialRemote = tracking.substring(0, slashIndex)
                        initialBranch = tracking.substring(slashIndex + 1)
                      } else {
                        initialBranch = tracking
                      }
                    } else {
                      try {
                        const remotesRes = await window.api.git.getRemotes(activeRepo.path)
                        if (remotesRes.success && remotesRes.data && remotesRes.data.length > 0) {
                          initialRemote = remotesRes.data[0].name
                        }
                      } catch (e) {
                        console.error('Failed to load remotes', e)
                      }
                    }
                    
                    setUpstreamRemote(initialRemote)
                    setUpstreamBranch(initialBranch)
                    setUpstreamError('')
                    setIsUpstreamModalOpen(true)
                  }}
                  style={{
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: 600,
                    width: '100%',
                    borderTop: '1px solid var(--border)'
                  }}
                  className="dropdown-item-hover"
                  data-testid="set-upstream-option"
                  data-tooltip="Set default remote branch for tracking"
                >
                  Set Upstream...
                </button>
                <button
                  onClick={async () => {
                    setShowPushDropdown(false)
                    setRemoteName('origin')
                    setRemoteBranch(activeRepo.branch || 'main')
                    try {
                      const remotesRes = await window.api.git.getRemotes(activeRepo.path)
                      if (remotesRes.success && remotesRes.data && remotesRes.data.length > 0) {
                        setRemoteName(remotesRes.data[0].name)
                        setRemoteUrl(remotesRes.data[0].refs.push || remotesRes.data[0].refs.fetch || '')
                      } else {
                        setRemoteUrl('')
                      }
                    } catch (e) {
                      setRemoteUrl('')
                    }
                    setIsRemoteModalOpen(true)
                  }}
                  style={{
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: '11px',
                    fontWeight: 600,
                    width: '100%',
                    borderTop: '1px solid var(--border)'
                  }}
                  className="dropdown-item-hover"
                  data-testid="set-remote-option"
                  data-tooltip="Set remote repository URL"
                >
                  Set Remote...
                </button>
              </div>
            )}
          </div>

          {/* Commit Search Filter */}
          <div 
            style={{ 
              marginLeft: 'auto', 
              display: 'flex', 
              alignItems: 'center', 
              position: 'relative', 
              marginRight: '12px' 
            }} 
            data-testid="commit-search-container"
          >
            <Search 
              size={12} 
              style={{ 
                position: 'absolute', 
                left: '8px', 
                color: 'var(--text-secondary)' 
              }} 
            />
            <input
              type="text"
              placeholder="Search commits..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: isSearchFocused ? '1px solid var(--accent)' : '1px solid var(--border)',
                boxShadow: isSearchFocused ? '0 0 0 2px rgba(99, 102, 241, 0.2)' : 'none',
                borderRadius: '4px',
                padding: '4px 24px 4px 26px',
                fontSize: '11px',
                width: '180px',
                height: '24px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 0.2s ease'
              }}
              data-testid="commit-search-input"
            />
            {searchQuery && (
              <X
                size={12}
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer'
                }}
                data-testid="commit-search-clear-btn"
              />
            )}
          </div>

          {/* Identity Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Identity:</span>
            <select
              value={activeRepo.identityId || ''}
              onChange={(e) => setRepoIdentity(activeRepo.id, e.target.value || undefined)}
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: !activeRepo.identityId && identities.length > 1 ? '1px solid #f59e0b' : '1px solid var(--border)',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                outline: 'none',
                cursor: 'pointer'
              }}
              data-testid="repo-identity-select"
            >
              <option value="">None (system default)</option>
              {identities.map(id => (
                <option key={id.id} value={id.id}>{id.label} ({id.name})</option>
              ))}
            </select>
            <Settings 
              size={14} 
              className="settings-cog-log"
              onClick={() => setIdentitiesModalOpen(true)}
              data-tooltip="Manage Git Identities"
              data-testid="log-manage-identities-btn"
              style={{ flexShrink: 0 }}
            />
            {!activeRepo.identityId && identities.length > 1 && (
              <span 
                style={{ 
                  color: '#f59e0b', 
                  fontSize: '10px', 
                  fontWeight: 700 
                }}
                data-testid="identity-warning-badge"
              >
                Required *
              </span>
            )}
          </div>
        </div>
      )}

      {isPreviewing && (
        <div
          className="branch-preview-banner"
          data-testid="branch-preview-banner"
        >
          <GitBranch size={14} style={{ flexShrink: 0 }} />
          <span>
            Viewing commits for branch: <strong>{previewBranch}</strong>
          </span>
          <button
            onClick={clearBranchPreview}
            data-tooltip="Exit branch preview and return to current branch"
            className="exit-branch-preview-btn"
            data-testid="exit-branch-preview-btn"
          >
            Exit Preview <X size={11} />
          </button>
        </div>
      )}
      
      {activeRepo?.status?.conflicted?.length > 0 && (
        <div
          className="pull-conflict-banner"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderBottom: '1px solid rgba(239, 68, 68, 0.2)',
            fontSize: '12px',
            color: '#f87171',
            fontWeight: 500,
            flexShrink: 0
          }}
          data-testid="pull-conflict-banner"
        >
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>
            Merge conflicts detected in {activeRepo?.status?.conflicted?.length} file(s).
          </span>
          {onOpenConflictResolver && (
            <button
              onClick={onOpenConflictResolver}
              data-tooltip="Open the conflict resolution helper"
              style={{
                marginLeft: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 10px',
                backgroundColor: 'rgba(239, 68, 68, 0.2)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '4px',
                color: '#f87171',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
              data-testid="open-conflict-resolver-btn"
            >
              Resolve Conflicts <ArrowRight size={11} />
            </button>
          )}
        </div>
      )}

      {/* Sticky column headers */}
      <div
        className="commit-list-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          height: '28px',
          backgroundColor: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
          userSelect: 'none',
          paddingLeft: '20px',
          paddingRight: '20px',
          position: 'relative',
          zIndex: 1
        }}
      >
        {/* Status icon column */}
        <div style={{ width: `${statusWidth}px`, flexShrink: 0, fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Status
        </div>
        {/* Resizer: status | message */}
        <div
          className="commit-col-resizer"
          onPointerDown={startStatusResize}
          data-tooltip="Drag to resize Status column"
          style={{
            width: '8px',
            cursor: 'col-resize',
            flexShrink: 0,
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            marginLeft: '-4px',
          }}
        >
          <div className="commit-col-resizer-line" />
        </div>
        {/* Message column — flex, takes remaining space */}
        <div style={{ flex: 1, fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', paddingLeft: '15px', minWidth: 0 }}>
          Commit Message
        </div>
        {/* Actions column — fixed, no resize */}
        <div style={{ width: '88px', flexShrink: 0 }} />
        {/* Resizer: message | author */}
        <div
          className="commit-col-resizer"
          onPointerDown={startAuthorResize}
          data-tooltip="Drag to resize Author column"
          style={{
            width: '8px',
            cursor: 'col-resize',
            flexShrink: 0,
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            marginRight: '-4px',
          }}
        >
          <div className="commit-col-resizer-line" />
        </div>
        {/* Author column */}
        <div style={{ width: `${authorWidth}px`, flexShrink: 0, fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', paddingLeft: '12px' }}>
          Author
        </div>
        {/* Resizer: author | date */}
        <div
          className="commit-col-resizer"
          onPointerDown={startDateResize}
          data-tooltip="Drag to resize Date column"
          style={{
            width: '8px',
            cursor: 'col-resize',
            flexShrink: 0,
            alignSelf: 'stretch',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            marginRight: '-4px',
          }}
        >
          <div className="commit-col-resizer-line" />
        </div>
        {/* Date column */}
        <div style={{ width: `${dateWidth}px`, flexShrink: 0, fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right', overflow: 'hidden' }}>
          Date
        </div>
      </div>

      <div 
        ref={containerRef} 
        className="graph-container" 
        tabIndex={0}
        style={{ outline: 'none', flex: 1, overflowY: 'auto' }}
      >
        <div className="commit-list">
          {filteredCommits.map((c) => (
            <div 
              key={c.hash} 
              className={`commit-item ${selectedCommitHash === c.hash ? 'active' : ''}`}
              onClick={() => setSelectedCommitHash(c.hash)}
              style={{ cursor: 'pointer' }}
            >
              <div className="commit-graph-area" style={{ width: `${statusWidth}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                {(() => {
                  const tags = extractTags(c.refs);
                  if (tags.length > 0) {
                    const firstTag = tags[0];
                    const isUnpushed = c.syncStatus === 'local-only' || !!activeRepo?.unpushedTags?.includes(firstTag);
                    return (
                      <div
                        className="commit-tag-badge"
                        data-testid={`commit-tag-badge-${c.hash}`}
                        data-tooltip={tags.join(', ')}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '3px 8px',
                          background: isUnpushed 
                            ? 'transparent' 
                            : 'linear-gradient(135deg, rgba(236, 72, 153, 0.18), rgba(236, 72, 153, 0.06))',
                          border: isUnpushed 
                            ? '1px solid var(--text-secondary)' 
                            : '1px solid rgba(236, 72, 153, 0.4)',
                          borderRadius: '12px',
                          color: isUnpushed 
                            ? 'var(--text-secondary)' 
                            : '#f472b6',
                          fontSize: '11px',
                          fontWeight: 600,
                          maxWidth: '64px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          boxShadow: isUnpushed ? 'none' : '0 2px 4px rgba(0,0,0,0.1)',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        <Tag size={10} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {firstTag}
                        </span>
                      </div>
                    );
                  }
                  return c.syncStatus === 'remote-only' ? (
                    <Globe 
                      className="commit-globe-icon" 
                      size={14} 
                      style={{ color: 'var(--text-secondary)' }}
                      data-testid="commit-globe-icon"
                    />
                  ) : c.syncStatus === 'local-only' ? (
                    <div 
                      data-testid="commit-local-only-circle"
                      style={{ 
                        width: '10px', 
                        height: '10px', 
                        borderRadius: '50%', 
                        border: '2px solid var(--text-secondary)', 
                        backgroundColor: 'transparent',
                        boxSizing: 'border-box'
                      }} 
                    />
                  ) : (
                    <div 
                      data-testid="commit-pushed-circle"
                      style={{ 
                        width: '10px', 
                        height: '10px', 
                        borderRadius: '50%', 
                        backgroundColor: 'var(--accent)'
                      }} 
                    />
                  );
                })()}
              </div>
              <div className="commit-message" data-tooltip={c.message}>{c.message}</div>
              <div className="commit-actions" style={{ minWidth: '112px', display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center', flexShrink: 0 }}>
                <button
                  className="stash-action-btn"
                  style={{ 
                    padding: 0, 
                    height: '24px', 
                    width: '24px', 
                    display: 'inline-flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    ...(isCurrentRepoWorktree ? { opacity: 0.5 } : {}),
                    cursor: isCurrentRepoWorktree ? 'not-allowed' : 'pointer'
                  }}
                  onClick={(e) => {
                    if (isCurrentRepoWorktree) return;
                    e.stopPropagation()
                    setBranchStartPoint(c.hash)
                    setNewBranchName('')
                    setErrorMessage('')
                    setIsBranchModalOpen(true)
                  }}
                  disabled={isCurrentRepoWorktree}
                  data-tooltip={isCurrentRepoWorktree ? "Cannot create branch from a worktree" : `Create branch from ${c.hash.substring(0, 7)}`}
                  data-testid={`commit-branch-btn-${c.hash}`}
                >
                  <GitBranch size={13} />
                </button>
                <button
                  className="stash-action-btn"
                  style={{ padding: 0, height: '24px', width: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    setTagTargetCommit(c)
                    setNewTagName('')
                    setTagErrorMessage('')
                    setIsTagModalOpen(true)
                  }}
                  data-tooltip={`Create tag on ${c.hash.substring(0, 7)}`}
                  data-testid={`commit-tag-btn-${c.hash}`}
                >
                  <Tag size={13} />
                </button>
                {!isPreviewing && commits.length > 0 && commits[0].hash !== c.hash && (
                  <>
                    <button
                      className="stash-action-btn"
                      style={{ padding: 0, height: '24px', width: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setResetTargetCommit(c)
                        setResetMode('soft')
                        setResetError('')
                        setIsResetModalOpen(true)
                      }}
                      data-tooltip={`Reset branch to ${c.hash.substring(0, 7)}`}
                      data-testid={`commit-reset-btn-${c.hash}`}
                    >
                      <RotateCcw size={13} />
                    </button>
                    <button
                      className="stash-action-btn"
                      style={{ padding: 0, height: '24px', width: '24px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                      onClick={(e) => {
                        e.stopPropagation()
                        const idx = commits.findIndex((commit) => commit.hash === c.hash)
                        if (idx === -1) return
                        const commitsToSquash = commits.slice(0, idx + 1)
                        const combinedMessages = commitsToSquash
                          .map((commit) => commit.message)
                          .reverse()
                          .join('\n\n')
                        setSquashTargetCommit(c)
                        setSquashMessage(combinedMessages)
                        setSquashError('')
                        setIsSquashModalOpen(true)
                      }}
                      data-tooltip={`Squash this and newer commits`}
                      data-testid={`commit-squash-btn-${c.hash}`}
                    >
                      <Layers size={13} />
                    </button>
                  </>
                )}
              </div>
              <div className="commit-author" style={{ width: `${authorWidth}px`, paddingLeft: '12px' }}>{c.author_name}</div>
              <div className="commit-date" style={{ width: `${dateWidth}px` }}>
                {new Date(c.date).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
              </div>
            </div>
          ))}
          {commits.length > 0 && (isPreviewing ? isLoadingPreview || commits.length >= (previewCommitLimit || 50) : commits.length >= (activeRepo?.commitLimit || 50)) && (
            <div 
              className={`load-more-commits-btn ${activeRepo?.isLoading ? 'loading' : ''}`}
              onClick={() => {
                if (isPreviewing) {
                  if (!isLoadingPreview) {
                    loadMoreBranchCommits()
                  }
                } else if (activeRepo && !activeRepo.isLoading) {
                  useRepoStore.getState().loadMoreCommits(activeRepo.id)
                }
              }}
              data-testid="load-more-btn"
            >
              {(isPreviewing ? isLoadingPreview : activeRepo?.isLoading) ? (
                <>
                  <RefreshCw size={14} className="spin-animation" style={{ marginRight: '6px' }} />
                  <span>Loading Commits...</span>
                </>
              ) : (
                <span>Load More Commits</span>
              )}
            </div>
          )}
          {filteredCommits.length === 0 && (
            <div 
              style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}
              data-testid="no-commits-message"
            >
              {commits.length === 0 ? 'No commits found or loading...' : 'No commits match search query.'}
            </div>
          )}
        </div>
      </div>
      <IdentitiesModal 
        isOpen={identitiesModalOpen}
        onClose={() => setIdentitiesModalOpen(false)}
      />

      {isRemoteModalOpen && (
        <div 
          className="diff-modal-overlay" 
          style={{ zIndex: 1100 }} 
          onClick={() => setIsRemoteModalOpen(false)}
        >
          <div 
            className="diff-modal-content" 
            style={{ 
              maxWidth: '420px', 
              width: '90%', 
              height: 'auto', 
              display: 'flex', 
              flexDirection: 'column', 
              animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)', 
              padding: 0 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="diff-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ArrowUp size={16} />
                Set Remote & Push
              </h2>
              <button 
                className="diff-modal-close" 
                onClick={() => setIsRemoteModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                data-testid="close-remote-modal-btn"
                data-tooltip="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Configure a remote repository and set the upstream branch for <strong>{activeRepo?.branch}</strong>.
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Remote Name</label>
                <input
                  type="text"
                  placeholder="e.g. origin"
                  value={remoteName}
                  onChange={(e) => {
                    setRemoteName(e.target.value)
                    setRemoteError('')
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                  data-testid="remote-name-input"
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Remote URL</label>
                <input
                  type="text"
                  placeholder="e.g. https://github.com/user/repo.git"
                  value={remoteUrl}
                  onChange={(e) => {
                    setRemoteUrl(e.target.value)
                    setRemoteError('')
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                  data-testid="remote-url-input"
                />
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  Optional if the remote name already exists in this repository.
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>Branch Name</label>
                <input
                  type="text"
                  placeholder="Branch name..."
                  value={remoteBranch}
                  onChange={(e) => {
                    setRemoteBranch(e.target.value)
                    setRemoteError('')
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '4px',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '13px',
                    outline: 'none'
                  }}
                  data-testid="remote-branch-input"
                />
              </div>

              {remoteError && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }} data-testid="remote-error-message">
                    {remoteError}
                  </div>
                  {/* Repo not found helper flow */}
                  {(remoteError.toLowerCase().includes('not found') || 
                    remoteError.toLowerCase().includes('does not exist') || 
                    remoteError.toLowerCase().includes('404')) && (
                    <>
                      {(() => {
                        const parsed = parseGitUrl(remoteUrl)
                        const activeIdentity = identities.find(id => id.id === activeRepo?.identityId)
                        const canCreateAutomatically = !!(parsed.provider && activeIdentity?.personalAccessToken && (parsed.provider === 'github' || parsed.provider === 'gitlab'))
                        
                        if (canCreateAutomatically) {
                          return (
                            <div style={{ marginTop: '4px', padding: '12px', border: '1px dashed var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Automatic Remote Repository Creation
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                Would you like to automatically create the <strong>{parsed.repo}</strong> repository on {parsed.provider === 'github' ? 'GitHub' : 'GitLab'} using your selected identity?
                              </div>
                              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={makeRemotePublic}
                                  onChange={(e) => setMakeRemotePublic(e.target.checked)}
                                  style={{ cursor: 'pointer' }}
                                />
                                Make Repository Public
                              </label>
                              <button
                                className="btn-primary"
                                onClick={handleCreateRemoteAndPush}
                                disabled={isCreatingRemote || isPushing}
                                style={{ 
                                  fontSize: '11px', 
                                  padding: '6px 12px', 
                                  marginTop: '4px',
                                  display: 'inline-flex', 
                                  alignItems: 'center', 
                                  justifyContent: 'center',
                                  gap: '4px',
                                  alignSelf: 'flex-start',
                                  opacity: (isCreatingRemote || isPushing) ? 0.5 : 1,
                                  cursor: (isCreatingRemote || isPushing) ? 'not-allowed' : 'pointer'
                                }}
                                data-testid="create-remote-and-push-btn"
                              >
                                {isCreatingRemote ? 'Creating & Pushing...' : 'Create Remote & Push'}
                              </button>
                            </div>
                          )
                        } else {
                          return (
                            <div style={{ marginTop: '4px', padding: '12px', border: '1px dashed var(--border)', borderRadius: '6px', backgroundColor: 'var(--bg-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                                Create Remote Repository
                              </div>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                To create it automatically, configure an Identity with a Personal Access Token in the toolbar. Alternatively, create it manually on the platform:
                              </div>
                              <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                {(!parsed.provider || parsed.provider === 'github') && (
                                  <a
                                    href="https://github.com/new"
                                    target="_blank"
                                    className="btn-secondary"
                                    style={{ fontSize: '11px', padding: '4px 8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    data-testid="create-on-github-link"
                                  >
                                    Create on GitHub
                                  </a>
                                )}
                                {(!parsed.provider || parsed.provider === 'gitlab') && (
                                  <a
                                    href="https://gitlab.com/projects/new"
                                    target="_blank"
                                    className="btn-secondary"
                                    style={{ fontSize: '11px', padding: '4px 8px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    data-testid="create-on-gitlab-link"
                                  >
                                    Create on GitLab
                                  </a>
                                )}
                              </div>
                            </div>
                          )
                        }
                      })()}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: 'var(--bg-secondary)' }}>
              <button
                className="btn-secondary"
                onClick={() => setIsRemoteModalOpen(false)}
                data-testid="remote-cancel-btn"
                data-tooltip="Cancel and close modal"
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSetRemoteSubmit}
                disabled={!remoteName.trim() || !remoteBranch.trim() || isPushing}
                style={{ 
                  opacity: (!remoteName.trim() || !remoteBranch.trim() || isPushing) ? 0.5 : 1, 
                  cursor: (!remoteName.trim() || !remoteBranch.trim() || isPushing) ? 'not-allowed' : 'pointer' 
                }}
                data-testid="remote-submit-btn"
                data-tooltip="Set Remote & Push"
              >
                {isPushing ? 'Pushing...' : 'Set Remote & Push'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isUpstreamModalOpen && (
        <div 
          className="diff-modal-overlay" 
          style={{ zIndex: 1100 }} 
          onClick={() => setIsUpstreamModalOpen(false)}
        >
          <div 
            className="diff-modal-content" 
            style={{ 
              maxWidth: '400px', 
              width: '90%', 
              height: 'auto', 
              display: 'flex', 
              flexDirection: 'column', 
              animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)', 
              padding: 0 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="diff-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitBranch size={16} />
                Set Upstream Branch
              </h2>
              <button 
                className="diff-modal-close" 
                onClick={() => setIsUpstreamModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                data-testid="close-upstream-modal-btn"
                data-tooltip="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Set the remote tracking branch name for <strong>{activeRepo?.branch}</strong>.
              </div>
              <input
                type="text"
                placeholder="Remote branch name..."
                value={upstreamBranch}
                onChange={(e) => {
                  setUpstreamBranch(e.target.value)
                  setUpstreamError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSetUpstreamSubmit()
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none'
                }}
                autoFocus
                data-testid="upstream-branch-input"
              />
              {upstreamError && (
                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }} data-testid="upstream-error-message">
                  {upstreamError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: 'var(--bg-secondary)' }}>
              <button
                className="btn-secondary"
                onClick={() => setIsUpstreamModalOpen(false)}
                data-testid="cancel-upstream-btn"
                data-tooltip="Cancel and close modal"
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSetUpstreamSubmit}
                disabled={!upstreamBranch.trim() || isPushing}
                style={{ opacity: (!upstreamBranch.trim() || isPushing) ? 0.5 : 1, cursor: (!upstreamBranch.trim() || isPushing) ? 'not-allowed' : 'pointer' }}
                data-testid="upstream-submit-btn"
                data-tooltip="Set Upstream & Push"
              >
                {isPushing ? 'Pushing...' : 'Set Upstream & Push'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isBranchModalOpen && (
        <div 
          className="diff-modal-overlay" 
          style={{ zIndex: 1100 }} 
          onClick={() => setIsBranchModalOpen(false)}
        >
          <div 
            className="diff-modal-content" 
            style={{ 
              maxWidth: '400px', 
              width: '90%', 
              height: 'auto', 
              display: 'flex', 
              flexDirection: 'column', 
              animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)', 
              padding: 0 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="diff-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <GitBranch size={16} />
                Create Branch from Commit
              </h2>
              <button 
                className="diff-modal-close" 
                onClick={() => setIsBranchModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                data-testid="close-branch-modal-btn"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Create a new local branch starting from commit <strong>{branchStartPoint.substring(0, 7)}</strong>.
              </div>
              <input
                type="text"
                placeholder="Branch name..."
                value={newBranchName}
                onChange={(e) => {
                  setNewBranchName(e.target.value)
                  setErrorMessage('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleBranchModalSubmit()
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none'
                }}
                autoFocus
                data-testid="new-branch-name-input"
              />
              {errorMessage && (
                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }} data-testid="branch-error-message">
                  {errorMessage}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: 'var(--bg-secondary)' }}>
              <button
                className="btn-secondary"
                onClick={() => setIsBranchModalOpen(false)}
                data-testid="cancel-branch-btn"
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleBranchModalSubmit}
                disabled={!newBranchName.trim()}
                style={{ opacity: !newBranchName.trim() ? 0.5 : 1, cursor: !newBranchName.trim() ? 'not-allowed' : 'pointer' }}
                data-testid="create-branch-submit-btn"
              >
                Create Branch
              </button>
            </div>
          </div>
        </div>
      )}
      {isResetModalOpen && resetTargetCommit && (
        <div 
          className="diff-modal-overlay" 
          style={{ zIndex: 1100 }} 
          onClick={() => setIsResetModalOpen(false)}
        >
          <div 
            className="diff-modal-content" 
            style={{ 
              maxWidth: '450px', 
              width: '90%', 
              height: 'auto', 
              display: 'flex', 
              flexDirection: 'column', 
              animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)', 
              padding: 0 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="diff-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RotateCcw size={16} />
                Reset Branch to Commit
              </h2>
              <button 
                className="diff-modal-close" 
                onClick={() => setIsResetModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                data-testid="close-reset-modal-btn"
                data-tooltip="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Commit info details */}
              <div 
                style={{ 
                  backgroundColor: 'var(--bg-secondary)', 
                  border: '1px solid var(--border)', 
                  borderRadius: '6px', 
                  padding: '12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>TARGET COMMIT</span>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                    {resetTargetCommit.hash.substring(0, 8)}
                  </span>
                </div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {resetTargetCommit.message}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  By {resetTargetCommit.author_name} &bull; {new Date(resetTargetCommit.date).toLocaleString()}
                </div>
              </div>

              {/* Selection cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div 
                  onClick={() => setResetMode('soft')}
                  style={{
                    border: resetMode === 'soft' ? '2px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '12px',
                    cursor: 'pointer',
                    backgroundColor: resetMode === 'soft' ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
                    transition: 'all 0.15s ease'
                  }}
                  data-testid="reset-mode-soft-card"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <input 
                      type="radio" 
                      name="resetMode" 
                      checked={resetMode === 'soft'} 
                      onChange={() => setResetMode('soft')}
                      style={{ cursor: 'pointer' }}
                    />
                    <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>Soft Reset (--soft)</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', paddingLeft: '22px' }}>
                    Keeps all your files intact. Changes between target commit and HEAD are kept in the staging area (marked as staged changes).
                  </div>
                </div>

                <div 
                  onClick={() => setResetMode('hard')}
                  style={{
                    border: resetMode === 'hard' ? '2px solid #ef4444' : '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '12px',
                    cursor: 'pointer',
                    backgroundColor: resetMode === 'hard' ? 'rgba(239, 68, 68, 0.05)' : 'transparent',
                    transition: 'all 0.15s ease'
                  }}
                  data-testid="reset-mode-hard-card"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <input 
                      type="radio" 
                      name="resetMode" 
                      checked={resetMode === 'hard'} 
                      onChange={() => setResetMode('hard')}
                      style={{ cursor: 'pointer' }}
                    />
                    <strong style={{ fontSize: '13px', color: '#ef4444' }}>Hard Reset (--hard)</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', paddingLeft: '22px' }}>
                    Discards all modifications to tracked files. Your working tree and index will be reset to match the target commit exactly. 
                    <span style={{ color: '#f87171', fontWeight: 600 }}> Warning: Any uncommitted changes will be permanently lost!</span>
                  </div>
                </div>
              </div>

              {resetError && (
                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }} data-testid="reset-error-message">
                  {resetError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: 'var(--bg-secondary)' }}>
              <button
                className="btn-secondary"
                onClick={() => setIsResetModalOpen(false)}
                disabled={isResetting}
                data-testid="cancel-reset-btn"
                data-tooltip="Cancel and close modal"
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleResetSubmit}
                disabled={isResetting}
                style={{ 
                  backgroundColor: resetMode === 'hard' ? '#ef4444' : undefined,
                  borderColor: resetMode === 'hard' ? '#ef4444' : undefined,
                  opacity: isResetting ? 0.5 : 1, 
                  cursor: isResetting ? 'not-allowed' : 'pointer' 
                }}
                data-testid="confirm-reset-btn"
                data-tooltip={`Reset branch (${resetMode === 'hard' ? 'Hard' : 'Soft'})`}
              >
                {isResetting ? 'Resetting...' : `Reset Branch (${resetMode === 'hard' ? 'Hard' : 'Soft'})`}
              </button>
            </div>
          </div>
        </div>
      )}
      {isSquashModalOpen && squashTargetCommit && (
        <div 
          className="diff-modal-overlay" 
          style={{ zIndex: 1100 }} 
          onClick={() => setIsSquashModalOpen(false)}
        >
          <div 
            className="diff-modal-content" 
            style={{ 
              maxWidth: '500px', 
              width: '90%', 
              height: 'auto', 
              display: 'flex', 
              flexDirection: 'column', 
              animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)', 
              padding: 0 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="diff-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} />
                Squash Commits (This and Newer)
              </h2>
              <button 
                className="diff-modal-close" 
                onClick={() => setIsSquashModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                data-testid="close-squash-modal-btn"
                data-tooltip="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto' }}>
              
              {/* Safety Warning */}
              {activeRepo?.status?.files && activeRepo.status.files.length > 0 && (
                <div 
                  style={{ 
                    backgroundColor: 'rgba(239, 68, 68, 0.1)', 
                    border: '1px solid #ef4444', 
                    borderRadius: '6px', 
                    padding: '12px',
                    color: '#ef4444',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                  data-testid="squash-dirty-warning"
                >
                  <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={14} />
                    Uncommitted Changes Detected
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    You have uncommitted modifications. Please stash or commit your changes before squashing commits.
                  </div>
                </div>
              )}

              {/* Already Pushed Commits Warning */}
              {commitsToSquash.some(c => c.syncStatus === 'pushed') && (
                <div 
                  style={{ 
                    backgroundColor: 'rgba(245, 158, 11, 0.1)', 
                    border: '1px solid #f59e0b', 
                    borderRadius: '6px', 
                    padding: '12px',
                    color: '#f59e0b',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                  data-testid="squash-pushed-warning"
                >
                  <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Globe size={14} />
                    Pushed Commits Selected
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    You are squashing commits that have already been pushed to the remote. You will need to force-push after squashing to update the remote branch and tags.
                  </div>
                </div>
              )}

              {/* Targets Summary */}
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                This will combine <strong>{commitsToSquash.length}</strong> commits (from the selected commit up to HEAD) into a single commit on top of <strong>{commits[commitsToSquash.length]?.hash ? commits[commitsToSquash.length].hash.substring(0, 7) : 'the parent'}</strong>.
              </div>

              {/* Commits List */}
              <div 
                style={{ 
                  backgroundColor: 'var(--bg-secondary)', 
                  border: '1px solid var(--border)', 
                  borderRadius: '6px', 
                  maxHeight: '150px',
                  overflowY: 'auto',
                  padding: '8px'
                }}
              >
                <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px', paddingLeft: '4px' }}>
                  COMMITS TO BE SQUASHED (NEWEST FIRST)
                </div>
                {commitsToSquash.map((commit, idx) => (
                  <div 
                    key={commit.hash} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      padding: '6px 4px',
                      borderBottom: idx === commitsToSquash.length - 1 ? 'none' : '1px solid var(--border)',
                      fontSize: '11px'
                    }}
                  >
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '320px', color: 'var(--text-primary)' }}>
                      {commit.message}
                    </span>
                    <span style={{ fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                      {commit.hash.substring(0, 7)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Message text area */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                  SQUASHED COMMIT MESSAGE
                </label>
                <textarea 
                  rows={6}
                  value={squashMessage}
                  onChange={(e) => setSquashMessage(e.target.value)}
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    borderRadius: '6px',
                    padding: '10px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                    fontFamily: 'inherit',
                    resize: 'vertical'
                  }}
                  data-testid="squash-message-input"
                  placeholder="Enter commit message for the squashed commit..."
                />
              </div>

              {squashError && (
                <div style={{ color: '#ef4444', fontSize: '12px' }} data-testid="squash-error-message">
                  {squashError}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: 'var(--bg-secondary)' }}>
              <button
                className="btn-secondary"
                onClick={() => setIsSquashModalOpen(false)}
                disabled={isSquashing}
                data-testid="cancel-squash-btn"
                data-tooltip="Cancel and close modal"
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleSquashSubmit}
                disabled={isSquashing || (activeRepo?.status?.files && activeRepo.status.files.length > 0)}
                style={{ 
                  opacity: (isSquashing || (activeRepo?.status?.files && activeRepo.status.files.length > 0)) ? 0.5 : 1, 
                  cursor: (isSquashing || (activeRepo?.status?.files && activeRepo.status.files.length > 0)) ? 'not-allowed' : 'pointer' 
                }}
                data-testid="confirm-squash-btn"
                data-tooltip="Confirm Squash"
              >
                {isSquashing ? 'Squashing...' : 'Confirm Squash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isTagModalOpen && tagTargetCommit && (
        <div 
          className="diff-modal-overlay" 
          style={{ zIndex: 1100 }} 
          onClick={() => setIsTagModalOpen(false)}
        >
          <div 
            className="diff-modal-content" 
            style={{ 
              maxWidth: '400px', 
              width: '90%', 
              height: 'auto', 
              display: 'flex', 
              flexDirection: 'column', 
              animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)', 
              padding: 0 
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="diff-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Tag size={16} />
                Create New Tag
              </h2>
              <button 
                className="diff-modal-close" 
                onClick={() => setIsTagModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                data-testid="close-tag-modal-btn"
                data-tooltip="Close modal"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Create a new tag at commit <strong>{tagTargetCommit.hash.substring(0, 8)}</strong>.
              </div>

              {/* Target Commit Info */}
              <div 
                style={{ 
                  backgroundColor: 'var(--bg-secondary)', 
                  border: '1px solid var(--border)', 
                  borderRadius: '6px', 
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px'
                }}
                data-testid="tag-target-commit-info"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)' }}>TAGGING COMMIT</span>
                  <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                    {tagTargetCommit.hash.substring(0, 8)}
                  </span>
                </div>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {tagTargetCommit.message}
                </div>
                {tagTargetCommit.author_name && (
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    By {tagTargetCommit.author_name} &bull; {new Date(tagTargetCommit.date).toLocaleString()}
                  </div>
                )}
              </div>

              <input
                type="text"
                placeholder="Tag name (e.g. v1.0.0)..."
                value={newTagName}
                onChange={(e) => {
                  setNewTagName(e.target.value)
                  setTagErrorMessage('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateTagSubmit()
                  }
                }}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: '13px',
                  outline: 'none'
                }}
                autoFocus
                data-testid="new-tag-name-input"
              />
              {tagErrorMessage && (
                <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '4px' }} data-testid="tag-error-message">
                  {tagErrorMessage}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: 'var(--bg-secondary)' }}>
              <button
                className="btn-secondary"
                onClick={() => setIsTagModalOpen(false)}
                data-testid="cancel-tag-btn"
                data-tooltip="Cancel and close modal"
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleCreateTagSubmit}
                disabled={!newTagName.trim()}
                style={{ opacity: !newTagName.trim() ? 0.5 : 1, cursor: !newTagName.trim() ? 'not-allowed' : 'pointer' }}
                data-testid="create-tag-submit-btn"
                data-tooltip="Create tag"
              >
                Create Tag
              </button>
            </div>
          </div>
        </div>
      )}

      <AppDialog
        isOpen={pushForceDialog.isOpen}
        title={pushForceDialog.title}
        message={pushForceDialog.message}
        variant={pushForceDialog.variant}
        actions={pushForceDialog.actions}
        onResolve={(value) => {
          if (pushForceDialog.resolve) pushForceDialog.resolve(value)
        }}
        onCancel={() => {
          if (pushForceDialog.resolve) pushForceDialog.resolve('cancel')
        }}
        testId="push-force-custom-dialog"
      />

      {/* Smart Pull dialog — state-aware options driven by the preflight PullPlan */}
      {smartPullDialog.isOpen && smartPullDialog.plan && (() => {
        const plan = smartPullDialog.plan
        const untrackedOverlap = plan.overlappingFiles.filter((f) => plan.untrackedFiles.includes(f))
        const forceIncludeUntracked = untrackedOverlap.length > 0
        const showStashOptions = plan.needsStash
        const commitInvalid = showStashOptions && pullMode === 'commit' && pullCommitMessage.trim().length <= 2

        const resolveWith = (action: 'pull' | 'cancel') => {
          if (!smartPullDialog.resolve) return
          smartPullDialog.resolve({
            action,
            mode: showStashOptions ? pullMode : 'direct',
            strategy: plan.diverged ? pullStrategy : 'merge',
            includeUntracked: forceIncludeUntracked ? true : pullIncludeUntracked,
            prune: pullPrune,
            commitMessage: showStashOptions && pullMode === 'commit' ? pullCommitMessage.trim() : undefined
          })
        }

        const radioCardStyle = (active: boolean, accent = 'var(--accent)') => ({
          border: active ? `2px solid ${accent}` : '1px solid var(--border)',
          borderRadius: '6px',
          padding: '10px 12px',
          cursor: 'pointer',
          backgroundColor: active ? 'rgba(99, 102, 241, 0.05)' : 'transparent',
          transition: 'all 0.15s ease'
        }) as React.CSSProperties

        return (
          <div
            className="diff-modal-overlay"
            style={{ zIndex: 1100 }}
            onClick={() => resolveWith('cancel')}
          >
            <div
              className="diff-modal-content"
              style={{
                maxWidth: '500px',
                width: '90%',
                height: 'auto',
                display: 'flex',
                flexDirection: 'column',
                animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                padding: 0
              }}
              onClick={(e) => e.stopPropagation()}
              data-testid="pull-custom-dialog"
            >
              {/* Header */}
              <div className="diff-modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
                <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ArrowDown size={16} />
                  Pull Changes
                </h2>
                <button
                  className="diff-modal-close"
                  onClick={() => resolveWith('cancel')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 4 }}
                  data-testid="pull-custom-dialog-close"
                  data-tooltip="Close dialog"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '70vh', overflowY: 'auto' }}>
                {/* Sync summary */}
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }} data-testid="pull-dialog-summary">
                  <strong>{plan.behind}</strong> new commit(s) on <strong>{plan.upstream}</strong>.
                  {plan.diverged
                    ? <> Your branch has <strong>{plan.ahead}</strong> local commit(s) that are not on the remote.</>
                    : plan.canFastForward
                      ? <> Your branch will be fast-forwarded.</>
                      : null}
                </div>

                {/* Overlap warning + handling options */}
                {showStashOptions && (
                  <>
                    <div
                      style={{
                        backgroundColor: 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid rgba(245, 158, 11, 0.4)',
                        borderRadius: '6px',
                        padding: '12px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px'
                      }}
                      data-testid="pull-overlap-warning"
                    >
                      <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b', fontSize: '12px' }}>
                        <AlertTriangle size={14} />
                        Uncommitted changes overlap with incoming commits
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {plan.overlappingFiles.length} file(s) have local changes and are also changed upstream — a plain pull would fail:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '110px', overflowY: 'auto' }}>
                        {plan.overlappingFiles.slice(0, 8).map((f) => (
                          <code key={f} style={{ fontSize: '11px', color: 'var(--text-primary)', backgroundColor: 'var(--bg-primary)', borderRadius: '3px', padding: '2px 6px' }}>
                            {f}
                          </code>
                        ))}
                        {plan.overlappingFiles.length > 8 && (
                          <span style={{ fontSize: '10px', color: 'var(--text-secondary)', paddingLeft: '4px' }}>
                            +{plan.overlappingFiles.length - 8} more…
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div
                        onClick={() => setPullMode('stash')}
                        style={radioCardStyle(pullMode === 'stash')}
                        data-testid="pull-mode-stash-card"
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                          <input type="radio" name="pullMode" checked={pullMode === 'stash'} onChange={() => setPullMode('stash')} style={{ cursor: 'pointer' }} />
                          <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Stash, pull, and re-apply</strong>
                          <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recommended</span>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', paddingLeft: '22px' }}>
                          Your changes are safely stashed, the incoming commits are pulled, then your changes are re-applied on top.
                        </div>
                      </div>

                      {plan.hasStaged && (
                        <div
                          onClick={() => setPullMode('commit')}
                          style={radioCardStyle(pullMode === 'commit')}
                          data-testid="pull-mode-commit-card"
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                            <input type="radio" name="pullMode" checked={pullMode === 'commit'} onChange={() => setPullMode('commit')} style={{ cursor: 'pointer' }} />
                            <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Commit staged changes first</strong>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', paddingLeft: '22px' }}>
                            Turns your staged changes into a local commit, then pulls. Remaining uncommitted changes are stashed and re-applied.
                          </div>
                        </div>
                      )}
                    </div>

                    {pullMode === 'commit' && plan.hasStaged && (
                      <input
                        type="text"
                        placeholder="Commit message for staged changes..."
                        value={pullCommitMessage}
                        onChange={(e) => setPullCommitMessage(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: '4px',
                          border: commitInvalid ? '1px solid rgba(245, 158, 11, 0.6)' : '1px solid var(--border)',
                          backgroundColor: 'var(--bg-primary)',
                          color: 'var(--text-primary)',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box'
                        }}
                        data-testid="pull-commit-message-input"
                      />
                    )}
                  </>
                )}

                {/* Non-overlapping dirty tree notice */}
                {!showStashOptions && plan.dirtyKind !== 'clean' && (
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }} data-testid="pull-safe-dirty-note">
                    <AlertTriangle size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                    Your uncommitted changes do not overlap with the incoming commits and will be preserved.
                  </div>
                )}

                {/* Integration strategy (only when histories diverged) */}
                {plan.diverged && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} data-testid="pull-strategy-section">
                    <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      INTEGRATION STRATEGY
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      <input type="radio" name="pullStrategy" checked={pullStrategy === 'merge'} onChange={() => setPullStrategy('merge')} data-testid="pull-strategy-merge" />
                      Merge commit <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>— combines both histories (default)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      <input type="radio" name="pullStrategy" checked={pullStrategy === 'rebase'} onChange={() => setPullStrategy('rebase')} data-testid="pull-strategy-rebase" />
                      Rebase <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>— replays your {plan.ahead} commit(s) on top, linear history</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                      <input type="radio" name="pullStrategy" checked={pullStrategy === 'ff-only'} onChange={() => setPullStrategy('ff-only')} data-testid="pull-strategy-ff-only" />
                      Fast-forward only <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>— fails instead of merging (safest)</span>
                    </label>
                  </div>
                )}

                {/* Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {(showStashOptions || plan.dirtyKind !== 'clean') && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '12px',
                        color: 'var(--text-primary)',
                        cursor: forceIncludeUntracked ? 'not-allowed' : 'pointer',
                        opacity: forceIncludeUntracked ? 0.7 : 1
                      }}
                      data-tooltip={forceIncludeUntracked ? 'Required: an untracked file collides with an incoming file' : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={forceIncludeUntracked ? true : pullIncludeUntracked}
                        disabled={forceIncludeUntracked}
                        onChange={(e) => setPullIncludeUntracked(e.target.checked)}
                        style={{ cursor: forceIncludeUntracked ? 'not-allowed' : 'pointer' }}
                        data-testid="pull-include-untracked-checkbox"
                      />
                      Include untracked files in stash
                    </label>
                  )}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-primary)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={pullPrune}
                      onChange={(e) => setPullPrune(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                      data-testid="pull-prune-checkbox"
                    />
                    Prune deleted remote branches
                  </label>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '8px', backgroundColor: 'var(--bg-secondary)' }}>
                <button
                  className="btn-secondary"
                  onClick={() => resolveWith('cancel')}
                  data-testid="pull-custom-dialog-action-cancel"
                  data-tooltip="Cancel and close dialog"
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={() => resolveWith('pull')}
                  disabled={commitInvalid}
                  style={{ opacity: commitInvalid ? 0.5 : 1, cursor: commitInvalid ? 'not-allowed' : 'pointer' }}
                  data-testid="pull-custom-dialog-action-pull"
                  data-tooltip={commitInvalid ? 'Enter a commit message (3+ characters) for your staged changes' : 'Pull changes from the remote repository'}
                >
                  {showStashOptions && pullMode === 'commit' ? 'Commit & Pull' : 'Pull'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      <AppDialog
        isOpen={pullResultDialog.isOpen}
        title={pullResultDialog.title}
        message={pullResultDialog.message}
        variant={pullResultDialog.variant}
        actions={pullResultDialog.actions}
        onResolve={(value) => {
          if (pullResultDialog.resolve) pullResultDialog.resolve(value)
        }}
        onCancel={() => {
          if (pullResultDialog.resolve) pullResultDialog.resolve('cancel')
          else setPullResultDialog((prev) => ({ ...prev, isOpen: false }))
        }}
        testId="pull-result-dialog"
      />
    </div>
  )
}

export default GraphView

