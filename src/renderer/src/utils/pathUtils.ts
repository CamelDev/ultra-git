/**
 * Resolves the full path on disk by combining a repository root path and a file path.
 * Handles platform differences (Windows vs POSIX), already-absolute paths,
 * trailing/leading slashes, and edge cases gracefully.
 */
export function getFullFilePath(repoPath?: string, filePath?: string): string {
  if (!filePath || filePath === 'No file selected') {
    return ''
  }

  const trimmedFile = filePath.trim()
  if (!trimmedFile) {
    return ''
  }

  const trimmedRepo = (repoPath || '').trim()
  if (!trimmedRepo) {
    return trimmedFile
  }

  // If the file path already starts with the repo path, it is already absolute
  if (trimmedFile.startsWith(trimmedRepo)) {
    return trimmedFile
  }

  // Check if file path is already an absolute Windows path (drive letter or UNC)
  const isWindowsAbsolute = /^[a-zA-Z]:[/\\]/.test(trimmedFile) || trimmedFile.startsWith('\\\\')
  if (isWindowsAbsolute) {
    return trimmedFile
  }

  // Detect path separator style based on the repoPath
  const isWindows = trimmedRepo.includes('\\')
  const separator = isWindows ? '\\' : '/'

  // Clean trailing slashes from repo path
  const cleanRepo = trimmedRepo.replace(/[/\\]+$/, '')

  // Clean leading slashes from file path
  const cleanFile = trimmedFile.replace(/^[/\\]+/, '')

  // Normalize file path separators to match repo path
  const normalizedFile = isWindows
    ? cleanFile.replace(/\//g, '\\')
    : cleanFile.replace(/\\/g, '/')

  // Special root edge case, e.g. cleanRepo is empty when repo was "/"
  if (!cleanRepo && trimmedRepo.startsWith('/')) {
    return `/${normalizedFile}`
  }

  return `${cleanRepo}${separator}${normalizedFile}`
}
