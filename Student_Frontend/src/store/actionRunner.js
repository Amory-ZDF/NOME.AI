export async function runRecoverableAction({ snapshot, optimistic, request, commit, rollback, onError, isActive = () => true }) {
  if (isActive()) optimistic()
  try {
    const result = await request()
    if (isActive()) commit(result)
    return result
  } catch (error) {
    if (isActive()) {
      rollback(snapshot)
      onError(error)
    }
    throw error
  }
}
