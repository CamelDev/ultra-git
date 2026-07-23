import React, { useState, useEffect, useMemo } from "react"
import { X, Folder, GitBranch, AlertTriangle, Loader, Search, ChevronRight, ChevronDown } from "lucide-react"
import { Repository } from "../../store/useRepoStore"

const normalizePath = (p: string) => (p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

interface TreeBranchNode {
  type: 'branch';
  name: string;
  shortName: string;
  branchInfo: any;
}

interface TreeFolderNode {
  type: 'folder';
  name: string;
  fullName: string;
  children: (TreeFolderNode | TreeBranchNode)[];
}

type TreeNode = TreeFolderNode | TreeBranchNode;

const buildBranchTree = (
  branches: Array<string | { name: string; ahead: number; behind: number }>
): TreeNode[] => {
  const rootChildren: TreeNode[] = [];

  for (const b of branches) {
    const fullName = typeof b === 'string' ? b : b.name;
    const parts = fullName.split('/');
    
    let currentFolderList: TreeNode[] = rootChildren;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      
      if (i === parts.length - 1) {
        currentFolderList.push({
          type: 'branch',
          name: fullName,
          shortName: part,
          branchInfo: b,
        });
      } else {
        let folder = currentFolderList.find(
          (node): node is TreeFolderNode => node.type === 'folder' && node.name === part
        );
        if (!folder) {
          folder = {
            type: 'folder',
            name: part,
            fullName: currentPath,
            children: [],
          };
          currentFolderList.push(folder);
        }
        currentFolderList = folder.children;
      }
    }
  }

  const sortTree = (nodes: TreeNode[]): TreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    }).map(node => {
      if (node.type === 'folder') {
        node.children = sortTree(node.children);
      }
      return node;
    });
  };

  return sortTree(rootChildren);
};

const TriStateCheckbox: React.FC<{
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  onChange: () => void;
  testId?: string;
}> = ({ checked, indeterminate, disabled, onChange, testId }) => {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      type="checkbox"
      ref={ref}
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      data-testid={testId}
      style={{
        cursor: disabled ? 'not-allowed' : 'pointer',
        accentColor: 'var(--accent)',
        width: '14px',
        height: '14px',
        marginRight: '8px',
        flexShrink: 0
      }}
    />
  );
};

interface DeleteBranchesModalProps {
  isOpen: boolean
  onClose: () => void
  activeRepo: Repository
  initialBranchName?: string
  onConfirm: (branches: string[], force: boolean) => Promise<{ success: boolean; errors?: string[] }>
}

export const DeleteBranchesModal: React.FC<DeleteBranchesModalProps> = ({
  isOpen,
  onClose,
  activeRepo,
  initialBranchName,
  onConfirm
}) => {
  const [checkedBranches, setCheckedBranches] = useState<Set<string>>(new Set())
  const [forceDelete, setForceDelete] = useState(false)
  const [searchText, setSearchText] = useState("")
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({})
  const [isDeleting, setIsDeleting] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  const activeBranch = activeRepo?.branch || 'main'
  const mainWtPath = activeRepo?.worktrees?.[0]?.path;

  const isWTBranch = (name: string) => {
    return mainWtPath ? activeRepo?.worktrees?.some(wt => wt.branch === name && normalizePath(wt.path) !== normalizePath(mainWtPath)) : false;
  };

  const isBranchDeletable = (name: string) => {
    return name !== activeBranch && !isWTBranch(name);
  };

  const localBranches = useMemo(() => {
    return activeRepo?.branches?.local ?? [];
  }, [activeRepo?.branches?.local]);

  // Expand folders that have matching branches when searching
  useEffect(() => {
    if (!searchText) return;
    const lowerSearch = searchText.toLowerCase();
    const nextExpanded = { ...expandedFolders };

    localBranches.forEach(b => {
      const name = typeof b === 'string' ? b : b.name;
      if (name.toLowerCase().includes(lowerSearch)) {
        const parts = name.split('/');
        let currentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
          nextExpanded[currentPath] = true;
        }
      }
    });

    setExpandedFolders(nextExpanded);
  }, [searchText, localBranches]);

  // Set initial selected branch when modal opens
  useEffect(() => {
    if (isOpen) {
      const initialSet = new Set<string>();
      if (initialBranchName && isBranchDeletable(initialBranchName)) {
        initialSet.add(initialBranchName);
      }
      setCheckedBranches(initialSet);
      setForceDelete(false);
      setSearchText("");
      setErrors([]);
      setIsDeleting(false);

      // Expand parent folders of the initial pre-selected branch
      const nextExpanded: Record<string, boolean> = {};
      if (initialBranchName) {
        const parts = initialBranchName.split('/');
        let currentPath = '';
        for (let i = 0; i < parts.length - 1; i++) {
          currentPath = currentPath ? `${currentPath}/${parts[i]}` : parts[i];
          nextExpanded[currentPath] = true;
        }
      }
      setExpandedFolders(nextExpanded);
    }
  }, [isOpen, initialBranchName, activeBranch]);

  // Get filtered branch list based on search text
  const filteredBranches = useMemo(() => {
    if (!searchText) return localBranches;
    const lowerSearch = searchText.toLowerCase();
    return localBranches.filter(b => {
      const name = typeof b === 'string' ? b : b.name;
      return name.toLowerCase().includes(lowerSearch);
    });
  }, [localBranches, searchText]);

  const branchTree = useMemo(() => {
    return buildBranchTree(filteredBranches);
  }, [filteredBranches]);

  if (!isOpen) return null;

  // Gather all deletable branches under a tree node
  const getDeletableBranchesUnderNode = (node: TreeNode): string[] => {
    if (node.type === 'branch') {
      return isBranchDeletable(node.name) ? [node.name] : [];
    } else {
      return node.children.flatMap(getDeletableBranchesUnderNode);
    }
  };

  const handleBranchCheckChange = (name: string) => {
    if (!isBranchDeletable(name)) return;
    setCheckedBranches(prev => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  const handleFolderCheckChange = (node: TreeFolderNode) => {
    const selectable = getDeletableBranchesUnderNode(node);
    if (selectable.length === 0) return;

    const allChecked = selectable.every(name => checkedBranches.has(name));
    setCheckedBranches(prev => {
      const next = new Set(prev);
      if (allChecked) {
        selectable.forEach(name => next.delete(name));
      } else {
        selectable.forEach(name => next.add(name));
      }
      return next;
    });
  };

  const toggleFolderExpand = (fullName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedFolders(prev => ({
      ...prev,
      [fullName]: !prev[fullName]
    }));
  };

  const handleConfirmClick = async () => {
    if (checkedBranches.size === 0) return;
    setIsDeleting(true);
    setErrors([]);
    try {
      const result = await onConfirm(Array.from(checkedBranches), forceDelete);
      if (result.success) {
        onClose();
      } else if (result.errors && result.errors.length > 0) {
        setErrors(result.errors);
      }
    } catch (err: any) {
      setErrors([err.message || "An unexpected error occurred during deletion."]);
    } finally {
      setIsDeleting(false);
    }
  };

  const renderTreeNode = (node: TreeNode, depth: number): React.ReactNode => {
    if (node.type === 'folder') {
      const isExpanded = searchText !== "" ? true : (expandedFolders[node.fullName] ?? false);
      const deletableChildren = getDeletableBranchesUnderNode(node);
      
      // If there are no deletable branches under this folder, we disable/grey it out
      const hasDeletable = deletableChildren.length > 0;
      const checkedCount = deletableChildren.filter(b => checkedBranches.has(b)).length;
      
      const isChecked = hasDeletable && checkedCount === deletableChildren.length;
      const isIndeterminate = hasDeletable && checkedCount > 0 && checkedCount < deletableChildren.length;

      return (
        <div key={node.fullName}>
          <div
            className="sidebar-item"
            style={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              paddingLeft: `${12 + depth * 12}px`,
              opacity: hasDeletable ? 1 : 0.5,
              userSelect: 'none'
            }}
            onClick={(e) => toggleFolderExpand(node.fullName, e)}
          >
            <div
              style={{ display: 'flex', alignItems: 'center', marginRight: '4px' }}
              onClick={(e) => {
                e.stopPropagation();
                if (hasDeletable) handleFolderCheckChange(node);
              }}
            >
              {hasDeletable ? (
                <TriStateCheckbox
                  checked={isChecked}
                  indeterminate={isIndeterminate}
                  onChange={() => handleFolderCheckChange(node)}
                  testId={`folder-checkbox-${node.fullName}`}
                />
              ) : (
                <div style={{ width: '22px' }} />
              )}
            </div>
            {isExpanded ? (
              <ChevronDown size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
            ) : (
              <ChevronRight size={14} style={{ marginRight: '6px', flexShrink: 0 }} />
            )}
            <Folder size={14} style={{ marginRight: '8px', color: 'var(--accent-light)', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {node.name}
            </span>
          </div>
          {isExpanded && node.children.map((child) => renderTreeNode(child, depth + 1))}
        </div>
      );
    }

    // Leaf branch node
    const name = node.name;
    const shortName = node.shortName;
    const isDeletable = isBranchDeletable(name);
    const isCurrentActive = name === activeBranch;
    const isWT = isWTBranch(name);

    return (
      <div
        className={`sidebar-item ${checkedBranches.has(name) ? 'active' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          paddingLeft: `${12 + depth * 12}px`,
          cursor: isDeletable ? 'pointer' : 'not-allowed',
          opacity: isDeletable ? 1 : 0.45,
          background: checkedBranches.has(name) ? "rgba(99, 102, 241, 0.1)" : "transparent"
        }}
        key={name}
        onClick={() => isDeletable && handleBranchCheckChange(name)}
        data-testid={`branch-item-${name}`}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginRight: '4px' }} onClick={(e) => e.stopPropagation()}>
          {isDeletable ? (
            <input
              type="checkbox"
              checked={checkedBranches.has(name)}
              onChange={() => handleBranchCheckChange(name)}
              data-testid={`branch-checkbox-${name}`}
              style={{
                cursor: 'pointer',
                accentColor: 'var(--accent)',
                width: '14px',
                height: '14px',
                marginRight: '8px',
                flexShrink: 0
              }}
            />
          ) : (
            <div style={{ width: '22px' }} /> // Spacer instead of checkbox
          )}
        </div>
        {/* Spacer to align leaf branch icons with folder icons by skipping chevron width */}
        <div style={{ width: '20px', flexShrink: 0 }} />
        <GitBranch className="sidebar-item-icon" size={14} style={{ flexShrink: 0, marginRight: '8px' }} />
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}
          data-tooltip={isCurrentActive ? "Active branch (cannot delete)" : isWT ? "Checked out in another worktree (cannot delete)" : undefined}
        >
          {shortName}
          {!isDeletable && (
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginLeft: '6px' }}>
              ({isCurrentActive ? 'active' : 'worktree'})
            </span>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="app-dialog-overlay" style={{ zIndex: 1400 }} onClick={onClose}>
      <div
        className="app-dialog-content"
        style={{
          maxWidth: "480px",
          width: "95%",
          height: "540px",
          display: "flex",
          flexDirection: "column",
          animation: "scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          padding: 0,
          borderRadius: "10px",
          overflow: "hidden",
          border: "1px solid var(--border)"
        }}
        onClick={e => e.stopPropagation()}
        data-testid="delete-branches-modal"
      >
        {/* Header */}
        <div
          style={{
            padding: "16px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--bg-secondary)"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div className="app-dialog-icon error">
              <AlertTriangle size={15} style={{ color: "#f87171" }} />
            </div>
            <h3 style={{ margin: 0, fontSize: "14px", fontWeight: 700, color: "var(--text-primary)" }}>
              Delete Local Branches
            </h3>
          </div>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: "var(--text-secondary)", cursor: "pointer", padding: 4 }}
            data-testid="cancel-delete-branches-btn"
            data-tooltip="Close modal"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search / Filter bar */}
        <div style={{ padding: "12px 20px 8px 20px", background: "var(--bg-secondary)" }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search
              size={13}
              style={{
                position: 'absolute',
                left: '10px',
                color: 'var(--text-secondary)',
                pointerEvents: 'none'
              }}
            />
            <input
              type="text"
              placeholder="Search local branches..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="branch-filter-input"
              data-testid="delete-branches-search-input"
              style={{
                paddingLeft: "30px",
                paddingRight: searchText ? "30px" : "10px",
                width: "100%",
                boxSizing: "border-box"
              }}
            />
            {searchText && (
              <button
                onClick={() => setSearchText("")}
                className="branch-filter-clear-btn"
                data-testid="delete-branches-search-clear-btn"
                style={{
                  position: 'absolute',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  padding: 2
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Branch Tree View */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "10px 10px",
            background: "var(--bg-primary)",
            borderBottom: "1px solid var(--border)"
          }}
          data-testid="delete-branches-tree"
        >
          {branchTree.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-secondary)' }}>
              No branches found matching "{searchText}"
            </div>
          ) : (
            branchTree.map(node => renderTreeNode(node, 0))
          )}
        </div>

        {/* Errors display */}
        {errors.length > 0 && (
          <div style={{
            margin: "12px 20px 0 20px",
            padding: "10px 12px",
            borderRadius: "6px",
            background: "rgba(239, 68, 68, 0.08)",
            border: "1px solid rgba(239, 68, 68, 0.25)",
            color: "#f87171",
            fontSize: "12px",
            maxHeight: "100px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "4px"
          }}
          data-testid="delete-branches-errors"
          >
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "6px" }}>
              <AlertTriangle size={13} />
              <span>Failed to delete some branches:</span>
            </div>
            <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
              {errors.map((err, idx) => <li key={idx}>{err}</li>)}
            </ul>
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            padding: "12px 20px",
            background: "var(--bg-tertiary)",
            borderTop: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          {/* Force delete option checkbox */}
          <label
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              fontSize: "12px",
              color: "var(--text-secondary)",
              cursor: "pointer",
              userSelect: "none"
            }}
            data-testid="force-delete-label"
          >
            <input
              type="checkbox"
              checked={forceDelete}
              onChange={(e) => setForceDelete(e.target.checked)}
              data-testid="force-delete-branches-checkbox"
              style={{
                width: "14px",
                height: "14px",
                accentColor: "var(--accent)",
                cursor: "pointer"
              }}
            />
            <span>Force delete unmerged branches (-D)</span>
          </label>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className="btn-secondary"
              onClick={onClose}
              disabled={isDeleting}
              data-testid="cancel-delete-btn"
              style={{ padding: "6px 14px", fontSize: "12px" }}
            >
              Cancel
            </button>
            <button
              className="app-dialog-btn danger"
              onClick={handleConfirmClick}
              disabled={checkedBranches.size === 0 || isDeleting}
              data-testid="confirm-delete-branches-btn"
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px"
              }}
            >
              {isDeleting && <Loader size={12} style={{ animation: "spin 1s linear infinite" }} />}
              {isDeleting ? "Deleting..." : `Delete Selected (${checkedBranches.size})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
