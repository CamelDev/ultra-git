export interface FileHistoryEntry {
  hash: string
  authorName: string
  authorEmail: string
  date: string
  message: string
  status: string
  filePath: string
  oldPath?: string
}

export function filterFileHistoryCommits<T extends Pick<FileHistoryEntry, 'hash' | 'message' | 'authorName' | 'authorEmail'>>(
  commits: T[],
  query: string
): T[] {
  const search = query.trim().toLowerCase()
  if (!search) return commits
  return commits.filter((commit) =>
    [commit.message, commit.authorName, commit.authorEmail, commit.hash].some((value) =>
      (value || '').toLowerCase().includes(search)
    )
  )
}
