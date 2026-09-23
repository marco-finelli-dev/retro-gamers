type MemoryState = {
  status: string | null;
  deleted_at?: string | null;
};

// Moderation hides a comment via deleted_at without changing its approval status.
export function getMemoryPresentation(memory: MemoryState) {
  const status = memory.deleted_at ? 'hidden' : memory.status || '';
  return { status, isPublic: status === 'approved' };
}
